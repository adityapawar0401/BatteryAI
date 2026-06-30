from __future__ import annotations

from torch import nn


class AuxiliaryHead(nn.Module):
    def __init__(self, d_model: int, output_dim: int) -> None:
        super().__init__()
        self.projection = nn.Linear(d_model, output_dim)

    def forward(self, state):
        return self.projection(state)
