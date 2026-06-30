from __future__ import annotations

import torch


def normal_interval(location: torch.Tensor, scale: torch.Tensor, z: float = 1.96) -> tuple[torch.Tensor, torch.Tensor]:
    return location - z * scale, location + z * scale
