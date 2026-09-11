from __future__ import annotations

import hashlib
import json
import threading
import time
import uuid
from pathlib import Path

import torch
import numpy as np

from battery_pimoe.config.schemas import ModelConfig
from battery_pimoe.model.factory import build_model

from .contracts import (
    ACTIVE_EXPERTS,
    EV_ACTIVE_EXPERTS,
    FailurePrediction,
    FailureSnapshot,
    InferenceRequest,
    InferenceResponse,
    PredictionResult,
    Timing,
)
from .failure import EVFailurePreprocessor
from .preprocessing import ScalerState, build_batch


MODEL_PROFILE = "oxford-ev-failure-v1-full"
MODEL_VERSION = "oxford_ev_failure_v1_full"
EXPECTED_MODEL_SHA256 = "24f985e578fb8db4610a4019e0e894a4e151e1f888622057c4ef6b356f1647e2"


class BatteryAIEngine:
    def __init__(self, artifact_dir: Path, device: str = "auto", cpu_fallback: bool = True) -> None:
        self.artifact_dir = artifact_dir.resolve()
        self.checkpoint_path = self.artifact_dir / "model.pt"
        self.cpu_fallback = cpu_fallback
        self.model_sha256 = self._verify_checksum()
        checkpoint = torch.load(self.checkpoint_path, map_location="cpu", weights_only=False)
        if set(checkpoint) != {"model_state", "optimizer_state", "scheduler_state", "preprocessing_state", "config", "metrics", "metadata"}:
            raise ValueError("checkpoint structure does not match the finalized artifact contract")
        metadata = checkpoint["metadata"]
        policies = metadata.get("dataset_runtime_policies", {})
        if policies.get("oxford") != ACTIVE_EXPERTS or policies.get("ev_failure_200k") != EV_ACTIVE_EXPERTS:
            raise ValueError("checkpoint task-specific expert policies do not match production")
        self.decision_threshold = float(metadata.get("threshold"))
        if not 0 <= self.decision_threshold <= 1:
            raise ValueError("checkpoint failure threshold is invalid")
        config = ModelConfig.model_validate(checkpoint["config"])
        rul_target = next(target for target in config.targets if target.name == "rul")
        if rul_target.construction.get("enabled") is not False:
            raise ValueError("checkpoint incorrectly reports an operational RUL target")
        if not config.failure_task or not config.ev_input_spec:
            raise ValueError("checkpoint is missing the EV failure head or input adapter")
        self.model = build_model(config, universal_superset=True, runtime_active_experts=ACTIVE_EXPERTS)
        self.model.load_state_dict(checkpoint["model_state"], strict=True)
        self.model.eval()
        for parameter in self.model.parameters():
            parameter.requires_grad_(False)
        scaler_path = self.artifact_dir / "dataset_preprocessing" / "oxford.json"
        if not scaler_path.is_file():
            scaler_path = self.artifact_dir / "dataset_preprocessing" / "oxford_scaler_state"
        scaler_data = json.loads(scaler_path.read_text(encoding="utf-8"))
        self.scaler = ScalerState.from_dict(scaler_data)
        checkpoint_scaler = metadata.get("dataset_preprocessing", {}).get("oxford")
        if not checkpoint_scaler:
            raise ValueError("checkpoint is missing the Oxford preprocessing contract")
        self._verify_scaler_contract(scaler_data, checkpoint_scaler)
        self.failure_preprocessor = EVFailurePreprocessor(metadata["dataset_preprocessing"]["ev_failure_200k"])
        self.requested_device = device
        self.device = self._resolve_device(device)
        self.model.to(self.device)
        self.parameter_count = sum(parameter.numel() for parameter in self.model.parameters())
        self._model_lock = threading.Lock()

    @staticmethod
    def _verify_scaler_contract(file_state: dict, checkpoint_state: dict) -> None:
        for key in ("feature_mean", "feature_std"):
            if not np.array_equal(np.asarray(file_state[key]), np.asarray(checkpoint_state[key])):
                raise ValueError(f"Oxford scaler {key} does not match checkpoint metadata")
        for key in ("diagnostic_mean", "diagnostic_std"):
            if file_state[key] != checkpoint_state[key]:
                raise ValueError(f"Oxford scaler {key} does not match checkpoint metadata")
        for key in ("target_mean", "target_std"):
            if float(file_state[key]) != float(checkpoint_state[key]):
                raise ValueError(f"Oxford scaler {key} does not match checkpoint metadata")

    def _verify_checksum(self) -> str:
        if not self.checkpoint_path.is_file():
            raise FileNotFoundError(f"checkpoint is missing: {self.checkpoint_path}")
        checksum_file = self.artifact_dir / "model.pt.sha256"
        if checksum_file.is_file():
            expected = checksum_file.read_text(encoding="utf-8").split()[0].lower()
        else:
            checksums = json.loads((self.artifact_dir / "checksums.json").read_text(encoding="utf-8"))
            expected = checksums["files"]["model.pt"].lower()
        if expected != EXPECTED_MODEL_SHA256:
            raise ValueError("artifact manifest does not select the approved production model")
        digest = hashlib.sha256()
        with self.checkpoint_path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        actual = digest.hexdigest()
        if actual != expected:
            raise ValueError(f"checkpoint checksum mismatch: expected {expected}, got {actual}")
        return actual

    @staticmethod
    def _resolve_device(device: str) -> torch.device:
        if device not in {"auto", "cuda", "cpu"}:
            raise ValueError("device must be auto, cuda, or cpu")
        if device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but is unavailable")
        return torch.device("cuda" if device == "cuda" or (device == "auto" and torch.cuda.is_available()) else "cpu")

    def _run(self, request: InferenceRequest, device: torch.device) -> InferenceResponse:
        started = time.perf_counter()
        grouped: dict[str, list] = {}
        for row in request.rows:
            grouped.setdefault(row.sequence_id, []).append(row)
        ordered_groups = [sorted(rows, key=lambda row: row.point_index) for rows in grouped.values()]
        batch = build_batch(self.model, ordered_groups, self.scaler, device)
        preprocessed = time.perf_counter()
        with self._model_lock, torch.inference_mode():
            self.model.runtime_active_experts = tuple(ACTIVE_EXPERTS)
            output = self.model(batch)
        inferred = time.perf_counter()
        location = self.scaler.inverse_location(output["soh"]["location"])
        scale = self.scaler.inverse_scale(output["soh"]["scale"])
        if not torch.isfinite(location).all() or not torch.isfinite(scale).all() or (scale < 0).any():
            raise FloatingPointError("model returned invalid SOH or uncertainty")
        request_id = str(uuid.uuid4())
        results = []
        total_ms = (time.perf_counter() - started) * 1000
        for index, rows in enumerate(ordered_groups):
            actual = next((row.actual_soh for row in rows if row.actual_soh is not None), None)
            predicted = float(location[index].cpu())
            uncertainty = float(scale[index].cpu())
            results.append(
                PredictionResult(
                    request_id=request_id,
                    model_profile=MODEL_PROFILE,
                    model_sha256=self.model_sha256,
                    backend="local-pytorch",
                    runtime_device=str(device),
                    cell_id=rows[0].cell_id,
                    sequence_id=rows[0].sequence_id,
                    source_checkpoint=rows[0].source_checkpoint,
                    target_checkpoint=rows[0].target_checkpoint,
                    predicted_soh=predicted,
                    predictive_std=uncertainty,
                    actual_soh=actual,
                    absolute_error=abs(predicted - actual) if actual is not None else None,
                    active_experts=ACTIVE_EXPERTS,
                    warnings=["Final-training-cell examples are software fixtures, not unbiased performance estimates."],
                    timing=Timing(
                        preprocessing_ms=(preprocessed - started) * 1000,
                        inference_ms=(inferred - preprocessed) * 1000,
                        total_ms=total_ms,
                    ),
                )
            )
        return InferenceResponse(results=results)

    def predict(self, request: InferenceRequest) -> InferenceResponse:
        try:
            return self._run(request, self.device)
        except torch.cuda.OutOfMemoryError:
            if self.device.type != "cuda" or not self.cpu_fallback:
                raise
            torch.cuda.empty_cache()
            self.device = torch.device("cpu")
            self.model.to(self.device)
            response = self._run(request, self.device)
            response.fallback_occurred = True
            for result in response.results:
                result.warnings.append("CUDA memory was exhausted; inference retried once on CPU.")
            return response

    def _predict_failure(self, snapshots: list[FailureSnapshot], device: torch.device) -> list[FailurePrediction]:
        batch = self.failure_preprocessor.batch(snapshots, device)
        started = time.perf_counter()
        with self._model_lock, torch.inference_mode():
            self.model.runtime_active_experts = tuple(EV_ACTIVE_EXPERTS)
            output = self.model(batch)
        elapsed_ms = (time.perf_counter() - started) * 1000
        probabilities = output["failure"]["probability"]
        if not torch.isfinite(probabilities).all():
            raise FloatingPointError("model returned an invalid failure probability")
        return [
            FailurePrediction(
                failure_probability=float(probability.cpu()),
                failure_flag=bool(float(probability) >= self.decision_threshold),
                decision_threshold=self.decision_threshold,
                model_version=MODEL_VERSION,
                model_sha256=self.model_sha256,
                runtime_device=str(device),
                inference_ms=elapsed_ms,
            )
            for probability in probabilities
        ]

    def predict_failure(self, snapshots: list[FailureSnapshot]) -> list[FailurePrediction]:
        try:
            return self._predict_failure(snapshots, self.device)
        except torch.cuda.OutOfMemoryError:
            if self.device.type != "cuda" or not self.cpu_fallback:
                raise
            torch.cuda.empty_cache()
            self.device = torch.device("cpu")
            self.model.to(self.device)
            return self._predict_failure(snapshots, self.device)
