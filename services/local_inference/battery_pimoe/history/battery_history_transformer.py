from __future__ import annotations

import torch
from torch import nn

from .causal_mask import causal_attention_mask
from .relative_time import RelativeTimeEncoding


class BatteryHistoryTransformer(nn.Module):
    def __init__(self, d_model: int, layers: int, heads: int, ff_multiplier: int, dropout: float) -> None:
        super().__init__()
        self.time_encoding = RelativeTimeEncoding(d_model)
        layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=heads, dim_feedforward=d_model * ff_multiplier, dropout=dropout, batch_first=True)
        self.encoder = nn.TransformerEncoder(layer, num_layers=layers)

    def forward(self, event_tokens: torch.Tensor, elapsed_time: torch.Tensor, padding_mask: torch.Tensor) -> torch.Tensor:
        x = event_tokens + self.time_encoding(elapsed_time)
        mask = causal_attention_mask(event_tokens.shape[1], event_tokens.device)
        return self.encoder(x, mask=mask, src_key_padding_mask=~padding_mask.bool())
