from __future__ import annotations

from pathlib import Path
from typing import Any

import torch


def save_checkpoint(
    path: str | Path,
    model,
    optimizer=None,
    scheduler=None,
    preprocessing_state=None,
    config: dict[str, Any] | None = None,
    metrics: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "model_state": model.state_dict(),
        "optimizer_state": optimizer.state_dict() if optimizer else None,
        "scheduler_state": scheduler.state_dict() if scheduler else None,
        "preprocessing_state": preprocessing_state.state_dict() if preprocessing_state else None,
        "config": config or {},
        "metrics": metrics or {},
        "metadata": metadata or {},
    }
    torch.save(payload, target)


def load_checkpoint(path: str | Path, model=None, optimizer=None, scheduler=None, map_location: str = "cpu") -> dict[str, Any]:
    payload = torch.load(path, map_location=map_location, weights_only=False)
    if model is not None:
        model.load_state_dict(payload["model_state"])
    if optimizer is not None and payload.get("optimizer_state"):
        optimizer.load_state_dict(payload["optimizer_state"])
    if scheduler is not None and payload.get("scheduler_state"):
        scheduler.load_state_dict(payload["scheduler_state"])
    return payload
