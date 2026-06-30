from __future__ import annotations

import torch
from torch import nn


class ExpertTokenizer(nn.Module):
    def __init__(self, d_model: int, max_experts: int = 64) -> None:
        super().__init__()
        self.expert_embedding = nn.Embedding(max_experts, d_model)
        self.availability_embedding = nn.Embedding(2, d_model)
        self.quality_projection = nn.Linear(1, d_model)

    def forward(self, tokens: torch.Tensor, expert_ids: torch.Tensor, availability: torch.Tensor, quality: torch.Tensor | None = None) -> torch.Tensor:
        quality_value = quality if quality is not None else torch.ones(tokens.shape[:2], device=tokens.device)
        return (
            tokens
            + self.expert_embedding(expert_ids).unsqueeze(0)
            + self.availability_embedding(availability.long())
            + self.quality_projection(quality_value.unsqueeze(-1))
        )
