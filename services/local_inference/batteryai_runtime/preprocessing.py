from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch

from .contracts import CurveRow


DIAGNOSTIC_CHANNELS = ("time_s", "voltage_V", "capacity_Ah", "temperature_K", "ica_dQ_dV", "dva_dV_dQ")


@dataclass
class ScalerState:
    feature_mean: np.ndarray
    feature_std: np.ndarray
    diagnostic_mean: dict[str, float]
    diagnostic_std: dict[str, float]
    target_mean: float
    target_std: float

    @classmethod
    def from_dict(cls, state: dict) -> "ScalerState":
        return cls(
            np.asarray(state["feature_mean"], dtype=np.float32),
            np.asarray(state["feature_std"], dtype=np.float32),
            {k: float(v) for k, v in state["diagnostic_mean"].items()},
            {k: float(v) for k, v in state["diagnostic_std"].items()},
            float(state["target_mean"]),
            float(state["target_std"]),
        )

    def inverse_location(self, value: torch.Tensor) -> torch.Tensor:
        return value * self.target_std + self.target_mean

    def inverse_scale(self, value: torch.Tensor) -> torch.Tensor:
        return value * abs(self.target_std)


def _derived_channels(rows: list[CurveRow]) -> tuple[np.ndarray, np.ndarray]:
    voltage = np.asarray([row.voltage_V for row in rows], dtype=np.float32)
    capacity = np.asarray([row.capacity_Ah for row in rows], dtype=np.float32)
    dv, dq = np.diff(voltage), np.diff(capacity)
    ica = np.zeros(len(rows), dtype=np.float32)
    dva = np.zeros(len(rows), dtype=np.float32)
    valid_ica = np.zeros(len(rows), dtype=bool)
    valid_dva = np.zeros(len(rows), dtype=bool)
    good_ica = np.isfinite(dv) & np.isfinite(dq) & (dv != 0)
    good_dva = np.isfinite(dv) & np.isfinite(dq) & (dq != 0)
    np.divide(dq, dv, out=ica[1:], where=good_ica)
    np.divide(dv, dq, out=dva[1:], where=good_dva)
    valid_ica[1:] = good_ica & np.isfinite(ica[1:])
    valid_dva[1:] = good_dva & np.isfinite(dva[1:])
    return np.stack([ica, dva], axis=-1), np.stack([valid_ica, valid_dva], axis=-1)


def build_batch(model, groups: list[list[CurveRow]], scaler: ScalerState, device: torch.device) -> dict:
    max_len = max(len(rows) for rows in groups)
    batch_size = len(groups)
    core = np.zeros((batch_size, max_len, 4), dtype=np.float32)
    diagnostic = np.zeros((batch_size, max_len, 6), dtype=np.float32)
    valid = np.zeros((batch_size, max_len), dtype=bool)
    diagnostic_valid = np.zeros((batch_size, max_len, 6), dtype=bool)
    for batch_index, rows in enumerate(groups):
        length = len(rows)
        raw = np.stack(
            [
                [row.time_s, row.voltage_V, 0.0, row.temperature_K]
                for row in rows
            ],
            axis=0,
        ).astype(np.float32)
        core[batch_index, :length] = (raw - scaler.feature_mean) / scaler.feature_std
        base = np.stack(
            [[row.time_s, row.voltage_V, row.capacity_Ah, row.temperature_K] for row in rows], axis=0
        ).astype(np.float32)
        derived, derived_valid = _derived_channels(rows)
        all_channels = np.concatenate([base, derived], axis=-1)
        channel_mask = np.concatenate([np.ones((length, 4), dtype=bool), derived_valid], axis=-1)
        for channel_index, name in enumerate(DIAGNOSTIC_CHANNELS):
            diagnostic[batch_index, :length, channel_index] = (
                all_channels[:, channel_index] - scaler.diagnostic_mean[name]
            ) / scaler.diagnostic_std[name]
        diagnostic[batch_index, :length] = np.where(channel_mask, diagnostic[batch_index, :length], 0.0)
        valid[batch_index, :length] = True
        diagnostic_valid[batch_index, :length] = channel_mask
    core_tensor = torch.as_tensor(core, device=device)
    valid_tensor = torch.as_tensor(valid, dtype=torch.bool, device=device)
    diagnostic_tensor = torch.as_tensor(diagnostic, device=device)
    diagnostic_valid_tensor = torch.as_tensor(diagnostic_valid, dtype=torch.bool, device=device)
    expert_inputs: dict[str, dict[str, torch.Tensor]] = {}
    expert_masks: dict[str, dict[str, torch.Tensor]] = {}
    for name in model.expert_names:
        if not model.is_expert_active(name):
            expert_inputs[name] = {}
            expert_masks[name] = {
                "valid_value_mask": torch.zeros_like(valid_tensor),
                "modality_available": torch.zeros(batch_size, dtype=torch.bool, device=device),
            }
        else:
            tensor = diagnostic_tensor if name == "diagnostic_curve" else core_tensor[:, :, :3] if name in {"usage_aging", "residual"} else core_tensor
            expert_inputs[name] = {"x": tensor, "time": core_tensor[:, :, 0]}
            expert_masks[name] = {
                "valid_value_mask": valid_tensor,
                "modality_available": torch.ones(batch_size, dtype=torch.bool, device=device),
            }
            if name == "diagnostic_curve":
                expert_masks[name]["feature_valid_mask"] = diagnostic_valid_tensor
    return {
        "expert_inputs": expert_inputs,
        "expert_masks": expert_masks,
        "elapsed_time": torch.zeros(batch_size, 1, device=device),
        "history_mask": torch.ones(batch_size, 1, dtype=torch.bool, device=device),
    }
