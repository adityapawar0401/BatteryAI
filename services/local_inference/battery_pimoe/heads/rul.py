from __future__ import annotations

import torch
from torch import nn
import torch.nn.functional as F


class RULHead(nn.Module):
    def __init__(self, d_model: int, distribution: str = "lognormal") -> None:
        super().__init__()
        self.distribution = distribution
        self.projection = nn.Linear(d_model, 2)

    def forward(self, state: torch.Tensor) -> dict[str, torch.Tensor]:
        raw = self.projection(state)
        location = raw[..., 0]
        scale = F.softplus(raw[..., 1]) + 1e-6
        mean = torch.exp(location + 0.5 * scale.square()) if self.distribution == "lognormal" else F.softplus(location)
        return {"location": location, "scale": scale, "mean": mean, "distribution": torch.zeros_like(mean)}
