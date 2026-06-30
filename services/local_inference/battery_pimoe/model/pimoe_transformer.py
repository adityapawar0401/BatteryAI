from __future__ import annotations

import torch
from torch import nn

from battery_pimoe.config.schemas import ModelConfig
from battery_pimoe.experts.registry import ExpertRegistry
from battery_pimoe.fusion import CrossExpertInteractionTransformer, GatedResidualFusion, MaskedDenseSoftRouter
from battery_pimoe.fusion.expert_tokenizer import ExpertTokenizer
from battery_pimoe.fusion.masked_attention import token_padding_mask
from battery_pimoe.heads import RULHead, SOHHead
from battery_pimoe.history import BatteryHistoryTransformer
from battery_pimoe.experts.outputs import ExpertOutput


class BatteryPIMoETransformer(nn.Module):
    def __init__(
        self,
        config: ModelConfig,
        *,
        universal_superset: bool = False,
        runtime_active_experts: list[str] | tuple[str, ...] | set[str] | None = None,
    ) -> None:
        super().__init__()
        self.config = config
        self.universal_superset = universal_superset
        arch = config.architecture
        self.registry = ExpertRegistry.from_configs(config.experts)
        self.experts = self.registry.build(arch.d_model, include_disabled=universal_superset)
        self.expert_names = list(self.experts.keys())
        configured_active = {expert.name for expert in config.experts if expert.enabled}
        requested_active = set(runtime_active_experts) if runtime_active_experts is not None else configured_active
        unknown = requested_active - set(self.expert_names)
        if unknown:
            raise ValueError(f"runtime policy references experts absent from model: {sorted(unknown)}")
        if "core_operational" not in requested_active:
            raise ValueError("runtime policy requires core_operational")
        self.runtime_active_experts = tuple(name for name in self.expert_names if name in requested_active)
        self.token_counts = [self.registry.configs[name].output_token_count for name in self.expert_names]
        self.tokenizer = ExpertTokenizer(arch.d_model)
        self.cross_expert = CrossExpertInteractionTransformer(arch.d_model, arch.cross_expert_layers, arch.attention_heads, arch.feed_forward_multiplier, arch.dropout)
        self.router = MaskedDenseSoftRouter(arch.d_model, len(self.expert_names), config.router.initial_temperature, config.router.learnable_temperature)
        self.fusion = GatedResidualFusion(arch.d_model)
        self.history = BatteryHistoryTransformer(arch.d_model, arch.history_transformer_layers, arch.attention_heads, arch.feed_forward_multiplier, arch.dropout)
        self.soh_head = SOHHead(arch.d_model)
        self.rul_head = RULHead(arch.d_model)

    def is_expert_active(self, name: str) -> bool:
        return name in self.runtime_active_experts

    def configure_dataset_training(self, *, train_soh: bool, train_rul: bool) -> None:
        for name, expert in self.experts.items():
            expert.requires_grad_(self.is_expert_active(name))
        for module in (self.tokenizer, self.cross_expert, self.router, self.fusion, self.history):
            module.requires_grad_(True)
        self.soh_head.requires_grad_(train_soh)
        self.rul_head.requires_grad_(train_rul)

    def set_module_trainability(self, freeze_modules: list[str] | None = None, unfreeze_modules: list[str] | None = None) -> None:
        modules = dict(self.named_modules())
        for name in freeze_modules or []:
            if name not in modules:
                raise ValueError(f"cannot freeze unknown module: {name}")
            modules[name].requires_grad_(False)
        for name in unfreeze_modules or []:
            if name not in modules:
                raise ValueError(f"cannot unfreeze unknown module: {name}")
            modules[name].requires_grad_(True)

    def _inactive_expert_output(self, name: str, batch_size: int, device: torch.device, dtype: torch.dtype) -> ExpertOutput:
        tokens = torch.zeros(batch_size, self.registry.configs[name].output_token_count, self.config.architecture.d_model, device=device, dtype=dtype)
        residual = torch.zeros(batch_size, self.config.architecture.d_model, device=device, dtype=dtype)
        available = torch.zeros(batch_size, dtype=torch.bool, device=device)
        return ExpertOutput(name=name, tokens=tokens, available=available, residual=residual)

    def forward_event(self, expert_inputs: dict[str, dict[str, torch.Tensor]], expert_masks: dict[str, dict[str, torch.Tensor]]) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
        outputs = []
        core_input = expert_inputs.get("core_operational", {}).get("x")
        if core_input is None:
            raise KeyError("core_operational input is required")
        for name in self.expert_names:
            if self.is_expert_active(name):
                outputs.append(self.experts[name](expert_inputs[name], expert_masks[name]))
            else:
                outputs.append(self._inactive_expert_output(name, core_input.shape[0], core_input.device, core_input.dtype))
        tokens = torch.cat([output.tokens for output in outputs], dim=1)
        availability = torch.stack([output.available for output in outputs], dim=1)
        available_token_mask = token_padding_mask(availability, self.token_counts)
        expert_ids = torch.cat([torch.full((count,), i, device=tokens.device, dtype=torch.long) for i, count in enumerate(self.token_counts)])
        token_availability = available_token_mask.long()
        enriched = self.tokenizer(tokens, expert_ids, token_availability)
        interacted = self.cross_expert(enriched, available_token_mask)
        start = 0
        expert_states = []
        for count in self.token_counts:
            expert_states.append(interacted[:, start : start + count].mean(dim=1))
            start += count
        expert_states_tensor = torch.stack(expert_states, dim=1)
        core_index = self.expert_names.index("core_operational")
        core_state = expert_states_tensor[:, core_index]
        weights, routing_stats = self.router(core_state, availability)
        residuals = torch.stack([output.residual for output in outputs], dim=1)
        interaction_denominator = available_token_mask.sum(dim=1).clamp_min(1).unsqueeze(-1)
        interaction_state = (interacted * available_token_mask.unsqueeze(-1)).sum(dim=1) / interaction_denominator
        event_state = self.fusion(core_state, residuals, weights, interaction_state)
        stats = {"routing_weights": weights, "expert_availability": availability, **routing_stats}
        return event_state, stats

    def forward(self, batch: dict[str, dict[str, dict[str, torch.Tensor]] | torch.Tensor]) -> dict[str, object]:
        event_state, stats = self.forward_event(batch["expert_inputs"], batch["expert_masks"])  # type: ignore[arg-type]
        event_tokens = event_state.unsqueeze(1)
        elapsed = batch.get("elapsed_time", torch.zeros(event_state.shape[0], 1, device=event_state.device))
        padding = batch.get("history_mask", torch.ones(event_state.shape[0], 1, dtype=torch.bool, device=event_state.device))
        history = self.history(event_tokens, elapsed, padding)
        state = history[:, -1]
        return {"soh": self.soh_head(state), "rul": self.rul_head(state), "state": state, **stats}
