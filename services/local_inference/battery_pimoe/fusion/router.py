from __future__ import annotations

import torch
from torch import nn


class MaskedDenseSoftRouter(nn.Module):
    def __init__(self, d_model: int, expert_count: int, initial_temperature: float = 1.0, learnable_temperature: bool = True) -> None:
        super().__init__()
        self.scorer = nn.Linear(d_model, expert_count)
        parameter = torch.tensor(float(initial_temperature)).log()
        self.log_temperature = nn.Parameter(parameter, requires_grad=learnable_temperature)

    def forward(self, core_context: torch.Tensor, availability: torch.Tensor) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
        logits = self.scorer(core_context)
        temperature = self.log_temperature.exp().clamp_min(1e-4)
        scaled_logits = logits / temperature
        masked_logits = scaled_logits.masked_fill(~availability.bool(), torch.finfo(logits.dtype).min)
        weights = torch.softmax(masked_logits, dim=-1)
        weights = torch.where(availability.bool(), weights, torch.zeros_like(weights))
        weights = weights / weights.sum(dim=-1, keepdim=True).clamp_min(1e-8)
        entropy = -(weights.clamp_min(1e-8) * weights.clamp_min(1e-8).log()).sum(dim=-1)
        utilization = weights.mean(dim=0)
        return weights, {"router_entropy": entropy, "expert_utilization": utilization, "routing_temperature": temperature.detach()}
