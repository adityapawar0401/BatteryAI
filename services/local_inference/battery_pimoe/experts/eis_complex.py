from __future__ import annotations

import torch

from .base import SequenceExpert


class ComplexEISExpert(SequenceExpert):
    def __init__(self, d_model: int = 256, token_count: int = 1) -> None:
        super().__init__("eis_complex", "eis", 5, d_model, token_count, (), ("eis",), ("eis_impedance",))

    def forward(self, inputs: dict[str, torch.Tensor], masks: dict[str, torch.Tensor], metadata: dict[str, torch.Tensor] | None = None):
        x = inputs["x"]
        if x.is_complex():
            channels = torch.stack([x.real, x.imag, torch.abs(x), torch.angle(x), inputs.get("frequency", torch.zeros_like(x.real))], dim=-1)
            inputs = {"x": channels}
        return super().forward(inputs, masks, metadata)
