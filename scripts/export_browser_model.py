from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from torch import nn


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "local_inference"))

from batteryai_runtime.contracts import CurveRow
from batteryai_runtime.engine import BatteryAIEngine
from batteryai_runtime.preprocessing import build_batch


class ExportWrapper(nn.Module):
    def __init__(self, model: nn.Module) -> None:
        super().__init__()
        self.model = model

    def forward(self, core: torch.Tensor, diagnostic: torch.Tensor, valid: torch.Tensor, diagnostic_valid: torch.Tensor):
        batch_size = core.shape[0]
        expert_inputs: dict[str, dict[str, torch.Tensor]] = {}
        expert_masks: dict[str, dict[str, torch.Tensor]] = {}
        for name in self.model.expert_names:
            if not self.model.is_expert_active(name):
                expert_inputs[name] = {}
                expert_masks[name] = {"valid_value_mask": torch.zeros_like(valid), "modality_available": torch.zeros(batch_size, dtype=torch.bool, device=core.device)}
            else:
                x = diagnostic if name == "diagnostic_curve" else core[:, :, :3] if name in {"usage_aging", "residual"} else core
                expert_inputs[name] = {"x": x, "time": core[:, :, 0]}
                expert_masks[name] = {"valid_value_mask": valid, "modality_available": torch.ones(batch_size, dtype=torch.bool, device=core.device)}
                if name == "diagnostic_curve": expert_masks[name]["feature_valid_mask"] = diagnostic_valid
        output = self.model({"expert_inputs": expert_inputs, "expert_masks": expert_masks, "elapsed_time": torch.zeros(batch_size, 1, device=core.device), "history_mask": torch.ones(batch_size, 1, dtype=torch.bool, device=core.device)})
        return output["soh"]["location"], output["soh"]["scale"]


def main() -> None:
    report_path = ROOT / "docs" / "browser-export-data.json"
    output = ROOT / "apps" / "web" / "public" / "models" / "oxford-v1.onnx"
    report: dict[str, object] = {"available": False, "exporter": "torch.onnx.export(dynamo=True)", "warnings": []}
    try:
        engine = BatteryAIEngine(ROOT / "_inputs" / "artifacts" / "oxford_final", "cpu")
        with (ROOT / "apps" / "web" / "public" / "fixtures" / "oxford-real-example.csv").open(encoding="utf-8") as handle:
            rows = [CurveRow.model_validate(row) for row in csv.DictReader(handle)]
        examples = [rows[:64], rows[64:160]]
        batch = build_batch(engine.model, [examples[0]], engine.scaler, torch.device("cpu"))
        core = batch["expert_inputs"]["core_operational"]["x"]
        diagnostic = batch["expert_inputs"]["diagnostic_curve"]["x"]
        valid = batch["expert_masks"]["core_operational"]["valid_value_mask"]
        diagnostic_valid = batch["expert_masks"]["diagnostic_curve"]["feature_valid_mask"]
        wrapper = ExportWrapper(engine.model).eval()
        output.parent.mkdir(parents=True, exist_ok=True)
        batch_dim = torch.export.Dim("batch", min=1, max=64)
        sequence_dim = torch.export.Dim("sequence", min=2, max=20000)
        torch.onnx.export(
            wrapper,
            (core, diagnostic, valid, diagnostic_valid),
            output,
            input_names=["core", "diagnostic", "valid", "diagnostic_valid"],
            output_names=["soh_location_scaled", "soh_scale_scaled"],
            dynamic_shapes=(
                {0: batch_dim, 1: sequence_dim}, {0: batch_dim, 1: sequence_dim},
                {0: batch_dim, 1: sequence_dim}, {0: batch_dim, 1: sequence_dim},
            ),
            opset_version=18,
            dynamo=True,
        )
        session = ort.InferenceSession(str(output), providers=["CPUExecutionProvider"])
        absolute_errors: list[float] = []
        relative_errors: list[float] = []
        for example in examples:
            tensors = build_batch(engine.model, [example], engine.scaler, torch.device("cpu"))
            inputs = {
                "core": tensors["expert_inputs"]["core_operational"]["x"].numpy(),
                "diagnostic": tensors["expert_inputs"]["diagnostic_curve"]["x"].numpy(),
                "valid": tensors["expert_masks"]["core_operational"]["valid_value_mask"].numpy(),
                "diagnostic_valid": tensors["expert_masks"]["diagnostic_curve"]["feature_valid_mask"].numpy(),
            }
            with torch.inference_mode(): expected = wrapper(*(torch.from_numpy(inputs[name]) for name in ["core", "diagnostic", "valid", "diagnostic_valid"]))
            actual = session.run(None, inputs)
            for expected_value, actual_value in zip(expected, actual):
                expected_array = expected_value.numpy()
                difference = np.abs(expected_array - actual_value)
                absolute_errors.append(float(difference.max()))
                relative_errors.append(float((difference / np.maximum(np.abs(expected_array), 1e-6)).max()))
        report.update({"available": True, "model_size_bytes": output.stat().st_size, "max_absolute_error": max(absolute_errors), "max_relative_error": max(relative_errors), "single_sample_parity": True, "batch_parity": False, "browser_runtime_load": False})
        if max(absolute_errors) > 1e-4 or max(relative_errors) > 1e-3:
            report["available"] = False; report["reason"] = "ONNX parity tolerance failed."
        else:
            report["available"] = False; report["reason"] = "Python ONNX parity passed, but browser runtime load and batch parity remain unverified."
    except Exception as error:
        message = re.sub(r"\x1b\[[0-9;]*m", "", str(error)).replace(str(ROOT), "<workspace>")
        report["reason"] = f"{type(error).__name__}: {message}"
        if output.exists(): output.unlink()
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__": main()
