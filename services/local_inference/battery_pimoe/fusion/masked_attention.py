from __future__ import annotations

import torch


def token_padding_mask(availability: torch.Tensor, token_counts: list[int]) -> torch.Tensor:
    masks = [availability[:, i].unsqueeze(1).expand(-1, count) for i, count in enumerate(token_counts)]
    return torch.cat(masks, dim=1)
