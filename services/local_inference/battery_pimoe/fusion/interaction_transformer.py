from __future__ import annotations

import torch
from torch import nn


class CrossExpertInteractionTransformer(nn.Module):
    def __init__(self, d_model: int, layers: int, heads: int, ff_multiplier: int, dropout: float) -> None:
        super().__init__()
        layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=heads,
            dim_feedforward=d_model * ff_multiplier,
            dropout=dropout,
            batch_first=True,
        )
        self.encoder = nn.TransformerEncoder(layer, num_layers=layers)

    def forward(self, tokens: torch.Tensor, available_token_mask: torch.Tensor) -> torch.Tensor:
        return self.encoder(tokens, src_key_padding_mask=~available_token_mask.bool())
