from __future__ import annotations

import numpy as np
import torch

from battery_pimoe.data.ev_failure_schema import NUMERIC_INPUTS, VERSION

from .contracts import FailureSnapshot


class EVFailurePreprocessor:
    """Inference-only implementation of the immutable train-fitted EV adapter."""

    def __init__(self, state: dict):
        if state.get("schema") != VERSION or state.get("numeric_columns") != NUMERIC_INPUTS:
            raise ValueError("incompatible EV failure preprocessing contract")
        if state.get("use_brand_as_feature") is not False:
            raise ValueError("production EV contract must exclude brand")
        self.state = state
        self.lower = np.asarray(state["lower"], dtype=np.float64)
        self.upper = np.asarray(state["upper"], dtype=np.float64)
        self.mean = np.asarray(state["mean"], dtype=np.float64)
        self.std = np.asarray(state["std"], dtype=np.float64)
        if not all(array.shape == (len(NUMERIC_INPUTS),) for array in (self.lower, self.upper, self.mean, self.std)):
            raise ValueError("EV preprocessing arrays do not match the runtime feature registry")
        if not np.isfinite(self.mean).all() or not np.isfinite(self.std).all() or (self.std <= 0).any():
            raise ValueError("EV preprocessing state is not finite and positive")
        vocabulary = state["vocabularies"]["battery_chemistry"]
        self.chemistry = {name: index for index, name in enumerate(vocabulary)}

    def transform(self, snapshots: list[FailureSnapshot]) -> dict[str, np.ndarray]:
        values = np.asarray([
            [getattr(snapshot, field) if getattr(snapshot, field) is not None else np.nan for field in NUMERIC_INPUTS]
            for snapshot in snapshots
        ], dtype=np.float64)
        for index, name in enumerate(NUMERIC_INPUTS):
            if "temperature" in name:
                values[:, index] += 273.15
            elif name == "internal_resistance":
                values[:, index] *= 0.001
            elif name == "average_charging_time":
                values[:, index] *= 60.0
        valid = np.isfinite(values)
        normalized = (np.clip(values, self.lower, self.upper) - self.mean) / self.std
        normalized = np.where(valid, normalized, 0.0).astype(np.float32)
        chemistry = np.asarray([self.chemistry.get(snapshot.battery_chemistry, 0) for snapshot in snapshots], dtype=np.int64)
        return {
            "values": normalized,
            "valid": valid,
            "chemistry": chemistry,
            "brand": np.zeros(len(snapshots), dtype=np.int64),
        }

    def batch(self, snapshots: list[FailureSnapshot], device: torch.device) -> dict:
        arrays = self.transform(snapshots)
        count = len(snapshots)
        return {
            "dataset_id": "ev_failure_200k",
            "ev_features": {name: torch.as_tensor(value, device=device) for name, value in arrays.items()},
            "elapsed_time": torch.zeros(count, 1, device=device),
            "history_mask": torch.ones(count, 1, dtype=torch.bool, device=device),
        }
