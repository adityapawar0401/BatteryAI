from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ACTIVE_EXPERTS = ["core_operational", "diagnostic_curve", "usage_aging", "residual"]
EV_ACTIVE_EXPERTS = ["core_operational", "usage_aging", "chemistry_geometry", "pack_context", "physics_state", "residual"]
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
    time_s: float = Field(ge=0)
    voltage_V: float = Field(ge=0, le=10)
    capacity_Ah: float = Field(ge=-20, le=20)
    temperature_K: float = Field(ge=200, le=500)
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


class FailureSnapshot(StrictModel):
    battery_chemistry: Literal["LFP", "LTO", "NCA", "NMC"]
    cell_voltage_avg: float | None = None
    cell_temperature_avg: float | None = None
    cycle_count: float | None = None
    vehicle_age_years: float | None = None
    odometer_km: float | None = None
    battery_capacity_kwh: float | None = None
    pack_voltage: float | None = None
    cell_voltage_std: float | None = None
    state_of_charge: float | None = None
    depth_of_discharge: float | None = None
    internal_resistance: float | None = None
    charging_cycles_last_month: float | None = None
    fast_charge_ratio: float | None = None
    average_charge_power_kw: float | None = None
    average_charging_time: float | None = None
    overnight_charging_ratio: float | None = None
    home_charging_ratio: float | None = None
    charging_interruptions: float | None = None
    overcharge_events: float | None = None
    average_speed: float | None = None
    average_trip_distance: float | None = None
    regenerative_braking_usage: float | None = None
    highway_driving_ratio: float | None = None
    daily_distance: float | None = None
    average_ambient_temperature: float | None = None
    maximum_temperature: float | None = None
    minimum_temperature: float | None = None
    humidity: float | None = None
    altitude: float | None = None
    last_service_days: float | None = None

    @model_validator(mode="after")
    def validate_measurements(self) -> "FailureSnapshot":
        values = self.model_dump(exclude={"battery_chemistry"})
        observed = {name: value for name, value in values.items() if value is not None}
        if not observed:
            raise ValueError("at least one numeric measurement is required")
        if any(not math.isfinite(value) for value in observed.values()):
            raise ValueError("measurements must be finite or explicitly null")
        if any(value < 0 and "temperature" not in name for name, value in observed.items()):
            raise ValueError("measurements cannot be negative")
        for name in ("fast_charge_ratio", "overnight_charging_ratio", "home_charging_ratio", "highway_driving_ratio"):
            value = observed.get(name)
            if value is not None and value > 1:
                raise ValueError(f"{name} must be a fraction from 0 to 1")
        for name in ("state_of_charge", "depth_of_discharge", "regenerative_braking_usage", "humidity"):
            value = observed.get(name)
            if value is not None and value > 100:
                raise ValueError(f"{name} must be a percentage from 0 to 100")
        return self


class FailureRequest(StrictModel):
    snapshot: FailureSnapshot


class FailureBatchRequest(StrictModel):
    snapshots: list[FailureSnapshot] = Field(min_length=1, max_length=256)


class FailurePrediction(StrictModel):
    task: Literal["ev_failure"] = "ev_failure"
    failure_probability: float = Field(ge=0, le=1)
    failure_flag: bool
    decision_threshold: float = Field(ge=0, le=1)
    model_version: str
    model_sha256: str
    runtime_device: str
    inference_ms: float = Field(ge=0)


class FailureBatchResponse(StrictModel):
    results: list[FailurePrediction]


class ErrorDetail(StrictModel):
    code: str
    message: str
    details: object | None = None
