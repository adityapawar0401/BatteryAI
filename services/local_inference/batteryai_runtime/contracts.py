from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ACTIVE_EXPERTS = ["core_operational", "diagnostic_curve", "usage_aging", "residual"]
ALLOWED_MODALITIES = {"C1ch", "C1dc", "OCVch", "OCVdc"}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CurveRow(StrictModel):
    sequence_id: str = Field(min_length=1, max_length=128)
    cell_id: str = Field(min_length=1, max_length=128)
    source_checkpoint: str = Field(min_length=1, max_length=128)
    target_checkpoint: str = Field(min_length=1, max_length=128)
    modality: Literal["C1ch", "C1dc", "OCVch", "OCVdc"] = "C1ch"
    point_index: int = Field(ge=0)
    time_s: float
    voltage_V: float
    capacity_Ah: float
    temperature_K: float
    actual_soh: float | None = Field(default=None, ge=0, le=150)

    @field_validator("time_s", "voltage_V", "capacity_Ah", "temperature_K", "actual_soh")
    @classmethod
    def finite(cls, value: float | None) -> float | None:
        import math

        if value is not None and not math.isfinite(value):
            raise ValueError("must be finite")
        return value


class InferenceRequest(StrictModel):
    rows: list[CurveRow] = Field(min_length=2, max_length=20000)

    @model_validator(mode="after")
    def validate_sequences(self) -> "InferenceRequest":
        groups: dict[str, list[CurveRow]] = {}
        for row in self.rows:
            groups.setdefault(row.sequence_id, []).append(row)
        if len(groups) > 64:
            raise ValueError("at most 64 sequences are allowed")
        for sequence_id, rows in groups.items():
            rows.sort(key=lambda row: row.point_index)
            indices = [row.point_index for row in rows]
            if indices != list(range(len(rows))):
                raise ValueError(f"{sequence_id}: point_index must be contiguous from zero")
            identity = {(r.cell_id, r.source_checkpoint, r.target_checkpoint, r.modality) for r in rows}
            if len(identity) != 1:
                raise ValueError(f"{sequence_id}: identity and modality fields must be constant")
            if any(b.time_s < a.time_s for a, b in zip(rows, rows[1:])):
                raise ValueError(f"{sequence_id}: time_s must be nondecreasing")
            actual = {r.actual_soh for r in rows if r.actual_soh is not None}
            if len(actual) > 1:
                raise ValueError(f"{sequence_id}: actual_soh must be constant when supplied")
        return self


class Timing(StrictModel):
    preprocessing_ms: float
    inference_ms: float
    total_ms: float


class PredictionResult(StrictModel):
    request_id: str
    model_profile: str
    model_sha256: str
    backend: Literal["local-pytorch", "browser-onnx"]
    runtime_device: str
    cell_id: str
    sequence_id: str
    source_checkpoint: str
    target_checkpoint: str
    predicted_soh: float
    predictive_std: float
    actual_soh: float | None
    absolute_error: float | None
    active_experts: list[str]
    warnings: list[str]
    timing: Timing


class InferenceResponse(StrictModel):
    results: list[PredictionResult]
    fallback_occurred: bool = False


class ErrorDetail(StrictModel):
    code: str
    message: str
    details: object | None = None
