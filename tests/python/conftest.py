from __future__ import annotations

import csv
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services" / "local_inference"))
sys.path.insert(0, str(ROOT))

from batteryai_runtime.contracts import InferenceRequest


@pytest.fixture(scope="session")
def root() -> Path:
    return ROOT


@pytest.fixture(scope="session")
def inference_request(root: Path) -> InferenceRequest:
    with (root / "apps" / "web" / "public" / "fixtures" / "oxford-real-example.csv").open(encoding="utf-8") as handle:
        return InferenceRequest.model_validate({"rows": list(csv.DictReader(handle))})


@pytest.fixture(scope="session")
def cpu_engine(root: Path):
    from batteryai_runtime.engine import BatteryAIEngine

    return BatteryAIEngine(root / "_inputs" / "artifacts" / "oxford_final", "cpu")
