from __future__ import annotations

import torch
from torch import nn
import torch.nn.functional as F


class SOHHead(nn.Module):
    def __init__(self, d_model: int, student_t: bool = False) -> None:
        super().__init__()
        out_dim = 3 if student_t else 2
        self.projection = nn.Linear(d_model, out_dim)
        self.student_t = student_t

    def forward(self, state: torch.Tensor) -> dict[str, torch.Tensor]:
        raw = self.projection(state)
        result = {"location": raw[..., 0], "scale": F.softplus(raw[..., 1]) + 1e-6}
        if self.student_t:
            result["df"] = F.softplus(raw[..., 2]) + 2.0
        return result
