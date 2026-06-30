from __future__ import annotations

import torch
from torch import nn

from .base import SequenceExpert
from .outputs import ExpertOutput


class CoreOperationalExpert(SequenceExpert):
    def __init__(self, d_model: int = 256, token_count: int = 2) -> None:
        super().__init__("core_operational", "core", 4, d_model, token_count, ("core",), (), ("voltage", "current", "cell_temperature"))
        self.conv = nn.Conv1d(4, d_model, kernel_size=3, padding=1)
        self.time_projection = nn.Linear(1, d_model)
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=max(1, min(8, d_model // 32)), batch_first=True, dropout=0.0)
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=1)
        self.residual = nn.Linear(d_model, d_model)

    def forward(self, inputs: dict[str, torch.Tensor], masks: dict[str, torch.Tensor], metadata: dict[str, torch.Tensor] | None = None) -> ExpertOutput:
        x = inputs["x"].float()
        if x.shape[-1] != 4:
            raise ValueError("core_operational expects four configured core channels")
        valid_mask = masks.get("valid_value_mask", torch.ones(x.shape[:2], dtype=torch.bool, device=x.device)).bool()
        stem = self.conv(x.transpose(1, 2)).transpose(1, 2)
        if "time" in inputs:
            stem = stem + self.time_projection(inputs["time"].float().unsqueeze(-1))
        encoded = self.encoder(stem, src_key_padding_mask=~valid_mask)
        denom = valid_mask.sum(dim=1).clamp_min(1).unsqueeze(-1)
        pooled = (encoded * valid_mask.unsqueeze(-1)).sum(dim=1) / denom
        tokens = pooled.unsqueeze(1) + self.query.unsqueeze(0)
        available = torch.ones(x.shape[0], dtype=torch.bool, device=x.device)
        return ExpertOutput(name=self.expert_name, tokens=tokens, available=available, residual=self.residual(pooled))
