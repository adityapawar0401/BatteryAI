from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, PositiveFloat, PositiveInt, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)


class TargetDefinition(StrictModel):
    name: Literal["soh", "rul"]
    unit: str
    scaler: str = "standard"
    prediction_axis: str | None = None
    construction: dict[str, Any] = Field(default_factory=dict)
    censored: bool = False


class ArchitectureConfig(StrictModel):
    d_model: PositiveInt = 256
    attention_heads: PositiveInt = 8
    feed_forward_multiplier: PositiveInt = 4
    dropout: float = Field(0.10, ge=0.0, lt=1.0)
    core_transformer_layers: PositiveInt = 3
    cross_expert_layers: PositiveInt = 3
    history_transformer_layers: PositiveInt = 4
    maximum_history_length: PositiveInt = 128
    mixed_precision: bool = True
    physics_state_enabled: bool = True

    @model_validator(mode="after")
    def heads_divide_model(self) -> "ArchitectureConfig":
        if self.d_model % self.attention_heads != 0:
            raise ValueError("d_model must be divisible by attention_heads")
        return self


class RouterConfig(StrictModel):
    mode: Literal["masked_dense_soft", "masked_topk"] = "masked_dense_soft"
    learnable_temperature: bool = True
    initial_temperature: PositiveFloat = 1.0
    top_k: PositiveInt | None = None
    log_weights: bool = True
    monitor_collapse: bool = True


class LossConfig(StrictModel):
    weights: dict[str, float] = Field(default_factory=lambda: {"soh_nll": 1.0, "rul_nll": 1.0})
    adaptive_weighting: Literal["homoscedastic", "gradnorm", "none"] = "homoscedastic"

    @field_validator("weights")
    @classmethod
    def positive_weights(cls, value: dict[str, float]) -> dict[str, float]:
        if any(v <= 0 for v in value.values()):
            raise ValueError("loss weights must be positive")
        return value


class TrainingConfig(StrictModel):
    seed: int = 123
    deterministic: bool = True
    epochs: PositiveInt = 2
    batch_size: PositiveInt = 2
    gradient_accumulation_steps: PositiveInt = 1
    gradient_clip_norm: PositiveFloat = 1.0
    optimizer: str = "adamw"
    learning_rate: PositiveFloat = 0.0003
    scheduler: str = "cosine"
    early_stopping_patience: PositiveInt = 5
    distributed: bool = False
    tensorboard: bool = True
    wandb: bool = False
    max_consecutive_amp_overflows: PositiveInt = 8


class FeatureConfig(StrictModel):
    name: str
    modality: str
    physical_meaning: str
    source_fields: list[str]
    unit: str
    canonical_unit: str
    dtype: Literal["float32", "float64", "int64", "category", "complex64", "complex128"]
    shape: Literal["scalar", "sequence"]
    value_type: Literal["real", "complex"]
    measurement_kind: Literal["measured", "derived", "fitted", "simulated"]
    transformation: str = "identity"
    scaler: str = "identity"
    inverse_transformation: str = "identity"
    required_masks: list[str] = Field(default_factory=list)
    expert_consumers: list[str] = Field(default_factory=list)
    allowed_as_input: bool = True
    allowed_as_target: bool = False
    may_cause_target_leakage: bool = False

    @model_validator(mode="after")
    def complex_dtype_matches(self) -> "FeatureConfig":
        if self.value_type == "complex" and not self.dtype.startswith("complex"):
            raise ValueError(f"complex feature {self.name} requires complex dtype")
        return self


class ExpertConfig(StrictModel):
    name: str
    class_path: str
    enabled: bool = True
    mandatory: bool = False
    expert_type: str
    required_modalities: list[str] = Field(default_factory=list)
    optional_modalities: list[str] = Field(default_factory=list)
    consumed_features: list[str] = Field(default_factory=list)
    output_token_count: PositiveInt = 1
    d_model: PositiveInt = 256
    auxiliary_outputs: list[str] = Field(default_factory=list)
    supported_missingness: bool = True
    version: str = "1.0"


class ModelConfig(StrictModel):
    architecture: ArchitectureConfig = Field(default_factory=ArchitectureConfig)
    router: RouterConfig = Field(default_factory=RouterConfig)
    losses: LossConfig = Field(default_factory=LossConfig)
    training: TrainingConfig = Field(default_factory=TrainingConfig)
    targets: list[TargetDefinition]
    features: list[FeatureConfig]
    experts: list[ExpertConfig]
    units: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_targets_and_experts(self) -> "ModelConfig":
        target_names = {target.name for target in self.targets}
        if target_names != {"soh", "rul"}:
            raise ValueError("exactly soh and rul target definitions are required")
        expert_names = [expert.name for expert in self.experts]
        if len(expert_names) != len(set(expert_names)):
            raise ValueError("duplicate expert names are not allowed")
        if "core_operational" not in set(expert_names):
            raise ValueError("core_operational expert is required")
        feature_names = [feature.name for feature in self.features]
        if len(feature_names) != len(set(feature_names)):
            raise ValueError("duplicate feature names are not allowed")
        return self


class DatasetConfig(StrictModel):
    dataset_id: str
    root: Path | None = None
    manifest: Path | None = None
    source_format: str = "private_contract_v1"
    battery_id_field: str
    event_id_field: str
    split: dict[str, list[str]] = Field(default_factory=dict)
    allow_architecture_probe: bool = False
    field_map: dict[str, str] = Field(default_factory=dict)
    unit_map: dict[str, str] = Field(default_factory=dict)
    adapter: str | None = None
    derived_current: dict[str, Any] = Field(default_factory=lambda: {"enabled": False})
    event_ontology: dict[str, str] = Field(default_factory=dict)
    target_construction: dict[str, Any] = Field(default_factory=dict)
    split_strategy: dict[str, Any] = Field(default_factory=dict)
    audit: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_dataset_options(self) -> "DatasetConfig":
        if self.adapter == "oxford":
            if self.source_format not in {"oxford_matlab", "oxford_hdf5_matlab"}:
                raise ValueError("Oxford adapter requires source_format oxford_matlab or oxford_hdf5_matlab")
            if "enabled" not in self.derived_current:
                raise ValueError("Oxford derived_current configuration requires an enabled flag")
            if self.target_construction.get("soh", {}).get("enabled", True):
                strategy = self.target_construction.get("soh", {}).get("reference_strategy")
                if not strategy:
                    raise ValueError("Oxford SOH construction requires an explicit reference_strategy")
            if self.target_construction.get("rul", {}).get("enabled", False):
                rul = self.target_construction["rul"]
                required = {"axis", "endpoint_definition", "censoring", "method"}
                missing = sorted(required - set(rul))
                if missing:
                    raise ValueError(f"Oxford RUL construction is missing required keys: {missing}")
        return self


class AuditMode(str, Enum):
    CONFIG_ONLY = "config_only"
    DATA = "data"


class ExperimentConfig(StrictModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True, populate_by_name=True)

    experiment_id: str
    model_config_path: Path = Field(alias="model_config")
    dataset_config: Path | None = None
    target_definition: dict[str, Any] = Field(default_factory=dict)
    loss_masks: dict[str, bool] = Field(default_factory=dict)
    active_feature_families: dict[str, Any] = Field(default_factory=dict)
    active_experts: dict[str, Any] = Field(default_factory=dict)
    unsupported_experts_masked: dict[str, Any] = Field(default_factory=dict)
    split_strategy: dict[str, Any] = Field(default_factory=dict)
    scalers: dict[str, Any] = Field(default_factory=dict)
    random_seed: int | None = None
    model_hyperparameters: dict[str, Any] = Field(default_factory=dict)
    orchestration: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def require_declared_overrides(self) -> "ExperimentConfig":
        if not self.active_experts:
            raise ValueError("experiment config must declare active_experts")
        if not self.target_definition:
            raise ValueError("experiment config must declare target_definition")
        return self


class OxfordCandidateConfig(StrictModel):
    name: str
    config: Path
    role: Literal["benchmark", "primary"]
    expected_experts: list[str]


class OxfordSelectionTrainingConfig(StrictModel):
    seed: int = 123
    maximum_epochs: PositiveInt = 20
    early_stopping_patience: PositiveInt = 5
    learning_rate: PositiveFloat = 0.0003
    scheduler: Literal["cosine"] = "cosine"

    @field_validator("maximum_epochs")
    @classmethod
    def cap_epochs(cls, value: int) -> int:
        if value > 20:
            raise ValueError("Oxford model selection is capped at 20 epochs")
        return value


class OxfordModelSelectionConfig(StrictModel):
    selection_id: str
    development_only_cells: list[str]
    outer_test_cells: list[str]
    all_cells: list[str]
    candidates: list[OxfordCandidateConfig]
    training: OxfordSelectionTrainingConfig = Field(default_factory=OxfordSelectionTrainingConfig)
    selection_metric: Literal["mae", "rmse"] = "mae"
    final_epoch_rule: Literal["median_best_epoch"] = "median_best_epoch"

    @model_validator(mode="after")
    def validate_selection_design(self) -> "OxfordModelSelectionConfig":
        names = [candidate.name for candidate in self.candidates]
        if len(names) != len(set(names)):
            raise ValueError("Oxford candidate names must be unique")
        if not any(candidate.role == "primary" for candidate in self.candidates):
            raise ValueError("Oxford model selection requires at least one primary candidate")
        if set(self.development_only_cells) & set(self.outer_test_cells):
            raise ValueError("development-only cells cannot be clean outer-test cells")
        if set(self.development_only_cells) | set(self.outer_test_cells) != set(self.all_cells):
            raise ValueError("development and clean outer cells must partition all Oxford cells")
        if len(set(self.all_cells)) != len(self.all_cells):
            raise ValueError("Oxford all_cells contains duplicates")
        if len(self.outer_test_cells) < 2:
            raise ValueError("nested Oxford evaluation requires at least two clean outer cells")
        return self
