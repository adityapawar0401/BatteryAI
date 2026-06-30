from __future__ import annotations

from dataclasses import dataclass, field

import torch


@dataclass
class ExpertOutput:
    name: str
    tokens: torch.Tensor
    available: torch.Tensor
    residual: torch.Tensor
    uncertainty: torch.Tensor | None = None
    auxiliary: dict[str, torch.Tensor] = field(default_factory=dict)
