from __future__ import annotations

import torch


def causal_attention_mask(length: int, device: torch.device | None = None) -> torch.Tensor:
    return torch.triu(torch.ones(length, length, dtype=torch.bool, device=device), diagonal=1)
