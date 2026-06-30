from __future__ import annotations

import torch
from torch import nn


class EventEmbedding(nn.Module):
    def __init__(self, d_model: int, max_event_types: int = 128, max_sources: int = 128) -> None:
        super().__init__()
        self.event_type = nn.Embedding(max_event_types, d_model)
        self.source = nn.Embedding(max_sources, d_model)

    def forward(self, event_type_ids: torch.Tensor, source_ids: torch.Tensor) -> torch.Tensor:
        return self.event_type(event_type_ids) + self.source(source_ids)
