from __future__ import annotations

import hashlib
import copy

import pytest
import torch
from pydantic import ValidationError

from batteryai_runtime.contracts import ACTIVE_EXPERTS, InferenceRequest
from batteryai_runtime.preprocessing import build_batch


def test_artifact_checksum(root):
    checkpoint = root / "_inputs" / "artifacts" / "oxford_final" / "model.pt"
    expected = checkpoint.with_suffix(".pt.sha256").read_text(encoding="utf-8").split()[0]
    assert hashlib.sha256(checkpoint.read_bytes()).hexdigest() == expected


def test_strict_model_and_active_experts(cpu_engine):
    assert list(cpu_engine.model.runtime_active_experts) == ACTIVE_EXPERTS
    assert len(cpu_engine.model.state_dict()) == 273
    assert not cpu_engine.model.training
    assert all(not parameter.requires_grad for parameter in cpu_engine.model.parameters())
    assert sum(parameter.numel() for parameter in cpu_engine.model.parameters()) == 19_508_239


def test_cpu_prediction_is_finite_stable_and_physical(cpu_engine, inference_request):
    before = {name: parameter.detach().clone() for name, parameter in cpu_engine.model.named_parameters()}
    first = cpu_engine.predict(inference_request)
    second = cpu_engine.predict(inference_request)
    a, b = first.results[0], second.results[0]
    assert a.runtime_device == "cpu"
    assert a.predicted_soh == pytest.approx(97.06190490722656, abs=2e-4)
    assert a.predictive_std == pytest.approx(8.065762519836426, abs=2e-4)
    assert a.predictive_std >= 0
    assert a.predicted_soh == pytest.approx(b.predicted_soh, abs=1e-6)
    assert a.active_experts == ACTIVE_EXPERTS
    assert a.absolute_error == pytest.approx(abs(a.predicted_soh - a.actual_soh))
    assert all(torch.equal(before[name], parameter) for name, parameter in cpu_engine.model.named_parameters())


def test_masked_experts_have_zero_routing_weight(cpu_engine, inference_request):
    rows = sorted(inference_request.rows, key=lambda row: row.point_index)
    batch = build_batch(cpu_engine.model, [rows], cpu_engine.scaler, torch.device("cpu"))
    with torch.inference_mode():
        output = cpu_engine.model(batch)
    active = set(ACTIVE_EXPERTS)
    for index, name in enumerate(cpu_engine.model.expert_names):
        if name not in active:
            assert output["routing_weights"][0, index].item() == 0.0
            assert not output["expert_availability"][0, index].item()


def test_single_and_batch_parity(cpu_engine, inference_request):
    single = cpu_engine.predict(inference_request).results[0]
    rows = []
    for suffix in ("a", "b"):
        rows.extend([{**row.model_dump(), "sequence_id": f"{row.sequence_id}-{suffix}"} for row in inference_request.rows])
    batch = cpu_engine.predict(InferenceRequest.model_validate({"rows": rows})).results
    assert len(batch) == 2
    assert batch[0].predicted_soh == pytest.approx(single.predicted_soh, abs=2e-5)
    assert batch[1].predicted_soh == pytest.approx(single.predicted_soh, abs=2e-5)


@pytest.mark.skipif(not torch.cuda.is_available(), reason="CUDA is unavailable")
def test_cuda_prediction(root, inference_request):
    from batteryai_runtime.engine import BatteryAIEngine

    engine = BatteryAIEngine(root / "_inputs" / "artifacts" / "oxford_final", "cuda")
    result = engine.predict(inference_request).results[0]
    assert result.runtime_device == "cuda"
    assert result.predictive_std >= 0
    assert result.predicted_soh == pytest.approx(97.0619, abs=0.03)


def test_auto_device(root):
    from batteryai_runtime.engine import BatteryAIEngine

    engine = BatteryAIEngine(root / "_inputs" / "artifacts" / "oxford_final", "auto")
    assert engine.device.type == ("cuda" if torch.cuda.is_available() else "cpu")


def test_cuda_out_of_memory_retries_once_on_cpu(cpu_engine, inference_request):
    from batteryai_runtime.engine import BatteryAIEngine

    response = cpu_engine.predict(inference_request)
    engine = object.__new__(BatteryAIEngine)
    engine.device = torch.device("cuda")
    engine.cpu_fallback = True
    moved = []
    engine.model = type("Movable", (), {"to": lambda self, device: moved.append(str(device))})()
    calls = []

    def run(_request, device):
        calls.append(str(device))
        if len(calls) == 1:
            raise torch.cuda.OutOfMemoryError("test exhaustion")
        return response

    engine._run = run
    retried = engine.predict(inference_request)
    assert calls == ["cuda", "cpu"]
    assert moved == ["cpu"]
    assert retried.fallback_occurred
    assert "retried once on CPU" in retried.results[0].warnings[-1]


def test_malformed_order_and_units_rejected(inference_request):
    rows = [row.model_dump() for row in inference_request.rows[:3]]
    rows[1]["point_index"] = 9
    with pytest.raises(ValidationError, match="contiguous"):
        InferenceRequest.model_validate({"rows": rows})
    wrong_unit = inference_request.rows[0].model_dump()
    wrong_unit["temperature_C"] = wrong_unit.pop("temperature_K")
    with pytest.raises(ValidationError):
        InferenceRequest.model_validate({"rows": [wrong_unit, inference_request.rows[1].model_dump()]})
    for field, malformed in (("temperature_K", 40), ("capacity_Ah", 724), ("voltage_V", 4200), ("time_s", -1)):
        bad_rows = [row.model_dump() for row in inference_request.rows[:2]]
        bad_rows[0][field] = malformed
        with pytest.raises(ValidationError, match=field):
            InferenceRequest.model_validate({"rows": bad_rows})


def test_scaler_contract_is_strict(cpu_engine):
    from batteryai_runtime.preprocessing import ScalerState

    metadata = torch.load(cpu_engine.checkpoint_path, map_location="cpu", weights_only=False)["metadata"]["dataset_preprocessing"]["oxford"]
    file_state = {
        "feature_mean": cpu_engine.scaler.feature_mean.tolist(), "feature_std": cpu_engine.scaler.feature_std.tolist(),
        "diagnostic_mean": cpu_engine.scaler.diagnostic_mean, "diagnostic_std": cpu_engine.scaler.diagnostic_std,
        "target_mean": cpu_engine.scaler.target_mean, "target_std": cpu_engine.scaler.target_std,
    }
    cpu_engine._verify_scaler_contract(file_state, metadata)
    invalid = copy.deepcopy(file_state); invalid["target_std"] = 0
    with pytest.raises(ValueError, match="positive"):
        ScalerState.from_dict(invalid)
    mismatched = copy.deepcopy(file_state); mismatched["target_mean"] += 1
    with pytest.raises(ValueError, match="checkpoint metadata"):
        cpu_engine._verify_scaler_contract(mismatched, metadata)


def test_row_and_sequence_limits(inference_request):
    with pytest.raises(ValidationError):
        InferenceRequest.model_validate({"rows": [inference_request.rows[0].model_dump()]})
    rows = []
    for index in range(65):
        for point in range(2):
            row = inference_request.rows[point].model_dump()
            row.update(sequence_id=f"s{index}", point_index=point)
            rows.append(row)
    with pytest.raises(ValidationError, match="64"):
        InferenceRequest.model_validate({"rows": rows})
