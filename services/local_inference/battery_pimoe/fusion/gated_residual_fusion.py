from __future__ import annotations

import torch
from torch import nn


class GatedResidualFusion(nn.Module):
    def __init__(self, d_model: int) -> None:
        super().__init__()
        self.gate = nn.Linear(d_model * 2, d_model)

    def forward(self, core_state: torch.Tensor, expert_residuals: torch.Tensor, routing_weights: torch.Tensor, interaction_state: torch.Tensor) -> torch.Tensor:
        weighted = torch.sum(expert_residuals * routing_weights.unsqueeze(-1), dim=1)
        gate = torch.sigmoid(self.gate(torch.cat([core_state, interaction_state], dim=-1)))
        return core_state + gate * weighted + interaction_state
