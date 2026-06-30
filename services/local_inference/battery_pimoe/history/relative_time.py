from __future__ import annotations

import torch
from torch import nn


class RelativeTimeEncoding(nn.Module):
    def __init__(self, d_model: int) -> None:
        super().__init__()
        self.projection = nn.Linear(1, d_model)

    def forward(self, elapsed_time: torch.Tensor) -> torch.Tensor:
        return self.projection(elapsed_time.float().unsqueeze(-1))
