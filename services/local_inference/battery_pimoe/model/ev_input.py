"""Dataset-specific input adapter preserving the trained expert tensor contract."""
from __future__ import annotations

import torch
from torch import nn

from battery_pimoe.data.ev_failure_schema import GROUPS, NUMERIC_INPUTS


class EVSnapshotInput(nn.Module):
    def __init__(self, chemistry_categories: int, brand_categories: int = 0):
        super().__init__()
        self.chemistry = nn.Embedding(chemistry_categories, 3, padding_idx=0)
        self.brand = nn.Embedding(brand_categories, 3, padding_idx=0) if brand_categories else None
        self.projections = nn.ModuleDict({
            name: nn.Linear(2 * len(columns), 3)
            for name, columns in GROUPS.items()
            if name not in {"core_operational", "chemistry_geometry"}
        })

    def forward(self, features, expert_names):
        values, valid = features["values"], features["valid"]
        values = torch.where(valid, values, torch.zeros_like(values))
        count = len(values)
        inputs, masks = {}, {}
        for name in expert_names:
            if name not in GROUPS:
                inputs[name] = {}
                masks[name] = {"modality_available": torch.zeros(count, dtype=torch.bool, device=values.device)}
                continue
            if name == "chemistry_geometry":
                tensor = self.chemistry(features["chemistry"])
                available = features["chemistry"].ne(0)
                feature_mask = available[:, None].expand(-1, 3)
            else:
                indices = [NUMERIC_INPUTS.index(field) for field in GROUPS[name]]
                selected, observed = values[:, indices], valid[:, indices]
                available = observed.any(dim=1)
                if name == "core_operational":
                    tensor = values.new_zeros(count, 4)
                    tensor[:, 1], tensor[:, 3] = selected[:, 0], selected[:, 1]
                    feature_mask = torch.zeros_like(tensor, dtype=torch.bool)
                    feature_mask[:, 1], feature_mask[:, 3] = observed[:, 0], observed[:, 1]
                    available = torch.ones_like(available)
                else:
                    tensor = self.projections[name](torch.cat([selected, observed.float()], dim=1))
                    feature_mask = available[:, None].expand_as(tensor)
            inputs[name] = {"x": tensor.unsqueeze(1)}
            masks[name] = {
                "feature_valid_mask": feature_mask.unsqueeze(1),
                "valid_value_mask": torch.ones(count, 1, dtype=torch.bool, device=values.device),
                "modality_available": available,
            }
        return inputs, masks
