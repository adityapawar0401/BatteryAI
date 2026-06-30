from __future__ import annotations

from abc import ABC, abstractmethod

import torch
from torch import nn

from .outputs import ExpertOutput


class BaseBatteryExpert(nn.Module, ABC):
    expert_name: str
    expert_type: str
    required_modalities: tuple[str, ...]
    optional_modalities: tuple[str, ...]
    consumed_features: tuple[str, ...]
    output_token_count: int
    d_model: int
    auxiliary_outputs: tuple[str, ...]
    supported_missingness: bool
    expert_version: str

    @abstractmethod
    def forward(self, inputs: dict[str, torch.Tensor], masks: dict[str, torch.Tensor], metadata: dict[str, torch.Tensor] | None = None) -> ExpertOutput:
        raise RuntimeError("abstract expert forward was called directly")


class SequenceExpert(BaseBatteryExpert):
    def __init__(
        self,
        name: str,
        expert_type: str,
        input_dim: int,
        d_model: int,
        token_count: int,
        required_modalities: tuple[str, ...] = (),
        optional_modalities: tuple[str, ...] = (),
        consumed_features: tuple[str, ...] = (),
        version: str = "1.0",
    ) -> None:
        super().__init__()
        self.expert_name = name
        self.expert_type = expert_type
        self.required_modalities = required_modalities
        self.optional_modalities = optional_modalities
        self.consumed_features = consumed_features
        self.output_token_count = token_count
        self.d_model = d_model
        self.auxiliary_outputs = ()
        self.supported_missingness = True
        self.expert_version = version
        self.input_projection = nn.Linear(input_dim, d_model)
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=max(1, min(8, d_model // 32)), batch_first=True, dropout=0.0)
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=1)
        self.query = nn.Parameter(torch.randn(token_count, d_model) * 0.02)
        self.residual = nn.Linear(d_model, d_model)

    def _availability(self, masks: dict[str, torch.Tensor], batch_size: int, device: torch.device) -> torch.Tensor:
        if "modality_available" in masks:
            return masks["modality_available"].to(device).bool()
        return torch.ones(batch_size, dtype=torch.bool, device=device)

    def forward(self, inputs: dict[str, torch.Tensor], masks: dict[str, torch.Tensor], metadata: dict[str, torch.Tensor] | None = None) -> ExpertOutput:
        if "x" not in inputs:
            raise KeyError(f"{self.expert_name} requires input tensor 'x'")
        x = inputs["x"].float()
        if x.ndim != 3:
            raise ValueError(f"{self.expert_name} expects [batch, sequence, feature] input")
        batch_size = x.shape[0]
        if "feature_valid_mask" in masks:
            feature_mask = masks["feature_valid_mask"].to(x.device).bool()
            if feature_mask.shape != x.shape:
                raise ValueError(f"{self.expert_name} feature_valid_mask must match input tensor shape")
            x = torch.where(feature_mask, x, torch.zeros_like(x))
        valid_mask = masks.get("valid_value_mask", torch.ones(x.shape[:2], dtype=torch.bool, device=x.device)).bool()
        encoded = self.encoder(self.input_projection(x), src_key_padding_mask=~valid_mask)
        denom = valid_mask.sum(dim=1).clamp_min(1).unsqueeze(-1)
        pooled = (encoded * valid_mask.unsqueeze(-1)).sum(dim=1) / denom
        tokens = pooled.unsqueeze(1) + self.query.unsqueeze(0)
        available = self._availability(masks, batch_size, x.device)
        tokens = tokens * available.view(batch_size, 1, 1)
        residual = self.residual(pooled) * available.unsqueeze(-1)
        return ExpertOutput(name=self.expert_name, tokens=tokens, available=available, residual=residual)
