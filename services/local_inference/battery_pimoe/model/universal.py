from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import torch

from battery_pimoe.config.schemas import ModelConfig

from .factory import build_model


UNIVERSAL_EXPERT_NAMES = (
    "core_operational",
    "diagnostic_curve",
    "eis_complex",
    "relaxation_pulse",
    "thermal_mechanical",
    "usage_aging",
    "chemistry_geometry",
    "pack_context",
    "physics_state",
    "residual",
)
SHARED_MODULE_NAMES = ("tokenizer", "cross_expert", "router", "fusion", "history")
HEAD_MODULE_NAMES = ("soh_head", "rul_head")


@dataclass(frozen=True)
class TransferTrainingPolicy:
    train_soh: bool = True
    train_rul: bool = False
    freeze_modules: list[str] = field(default_factory=list)
    unfreeze_modules: list[str] = field(default_factory=list)


def parameter_count(module) -> int:
    return sum(parameter.numel() for parameter in module.parameters())


def parameter_count_by_expert(model) -> dict[str, int]:
    return {name: parameter_count(model.experts[name]) for name in model.expert_names}


def module_training_status(model) -> dict[str, Any]:
    experts = {
        name: {
            "status": "trained_on_oxford" if model.is_expert_active(name) else "present_untrained_on_oxford",
            "trainable_during_oxford": any(parameter.requires_grad for parameter in model.experts[name].parameters()),
            "trainable_in_new_workflow": True,
        }
        for name in model.expert_names
    }
    shared = {
        name: {"status": "shared_trained_on_oxford", "trainable_during_oxford": True}
        for name in SHARED_MODULE_NAMES
    }
    heads = {
        "soh_head": {"status": "head_trained_on_oxford", "trainable_during_oxford": True},
        "rul_head": {"status": "head_untrained_on_oxford", "trainable_during_oxford": False, "trainable_in_new_workflow": True},
    }
    return {"experts": experts, "shared_modules": shared, "heads": heads}


def model_contract(config: ModelConfig) -> dict[str, Any]:
    return {
        "architecture": config.architecture.model_dump(mode="json"),
        "experts": {
            expert.name: {
                "class_path": expert.class_path,
                "output_token_count": expert.output_token_count,
                "consumed_features": list(expert.consumed_features),
            }
            for expert in config.experts
        },
        "features": {
            feature.name: {
                "modality": feature.modality,
                "canonical_unit": feature.canonical_unit,
                "dtype": feature.dtype,
                "shape": feature.shape,
                "value_type": feature.value_type,
            }
            for feature in config.features
        },
        "units": dict(config.units),
    }


def architecture_manifest(model, requested_device: str, actual_device: str) -> dict[str, Any]:
    expert_counts = parameter_count_by_expert(model)
    shared_counts = {name: parameter_count(getattr(model, name)) for name in SHARED_MODULE_NAMES}
    head_counts = {name: parameter_count(getattr(model, name)) for name in HEAD_MODULE_NAMES}
    total = parameter_count(model)
    oxford_trainable = sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)
    inactive = total - oxford_trainable
    return {
        "schema": "battery_pimoe_universal_superset_v1",
        "universal_experts": list(model.expert_names),
        "runtime_active_experts": list(model.runtime_active_experts),
        "modules": {
            "experts": {name: model.experts[name].__class__.__name__ for name in model.expert_names},
            "cross_expert": model.cross_expert.__class__.__name__,
            "history": model.history.__class__.__name__,
            "soh_head": model.soh_head.__class__.__name__,
            "rul_head": model.rul_head.__class__.__name__,
        },
        "requested_device": requested_device,
        "actual_device": actual_device,
        "total_parameter_count": total,
        "oxford_trainable_parameter_count": oxford_trainable,
        "present_but_oxford_inactive_parameter_count": inactive,
        "parameter_count_by_expert": expert_counts,
        "shared_module_parameter_count": sum(shared_counts.values()),
        "parameter_count_by_shared_module": shared_counts,
        "parameter_count_by_head": head_counts,
        "parameter_count_method": "sum(parameter.numel() for parameter in module.parameters())",
    }


def validate_universal_model(model) -> None:
    if tuple(model.expert_names) != UNIVERSAL_EXPERT_NAMES:
        raise ValueError(f"universal checkpoint expert schema mismatch: {model.expert_names}")
    if not hasattr(model, "soh_head") or not hasattr(model, "rul_head"):
        raise ValueError("universal checkpoint requires both SOH and RUL heads")


def validate_transfer_contract(source: dict[str, Any], target_config: ModelConfig) -> None:
    target = model_contract(target_config)
    source_architecture = source.get("architecture", {})
    if source_architecture != target["architecture"]:
        raise ValueError("incompatible universal architecture contract")
    if source.get("experts", {}) != target["experts"]:
        raise ValueError("incompatible universal expert schema")
    for name, target_feature in target["features"].items():
        source_feature = source.get("features", {}).get(name)
        if source_feature is None:
            continue
        if source_feature != target_feature:
            raise ValueError(f"incompatible feature contract for {name}: {source_feature} != {target_feature}")
    for name, target_unit in target["units"].items():
        source_unit = source.get("units", {}).get(name)
        if source_unit is not None and source_unit != target_unit:
            raise ValueError(f"incompatible unit contract for {name}: {source_unit} != {target_unit}")


def load_universal_checkpoint_for_transfer(
    checkpoint_path: str | Path,
    target_config: ModelConfig,
    runtime_active_experts: list[str],
    *,
    policy: TransferTrainingPolicy | None = None,
    map_location: str = "cpu",
):
    payload = torch.load(checkpoint_path, map_location=map_location, weights_only=False)
    metadata = payload.get("metadata", {})
    if not metadata.get("universal_superset", False):
        raise ValueError("checkpoint is not a universal-superset checkpoint")
    validate_transfer_contract(metadata.get("model_contract", {}), target_config)
    model = build_model(target_config, universal_superset=True, runtime_active_experts=runtime_active_experts)
    validate_universal_model(model)
    source_state = payload.get("model_state", {})
    target_state = model.state_dict()
    incompatible = [name for name, value in source_state.items() if name in target_state and target_state[name].shape != value.shape]
    if incompatible:
        raise ValueError(f"incompatible checkpoint tensor shapes: {incompatible[:5]}")
    matching = {name: value for name, value in source_state.items() if name in target_state and target_state[name].shape == value.shape}
    missing, unexpected = model.load_state_dict(matching, strict=False)
    transfer_policy = policy or TransferTrainingPolicy()
    model.configure_dataset_training(train_soh=transfer_policy.train_soh, train_rul=transfer_policy.train_rul)
    model.set_module_trainability(transfer_policy.freeze_modules, transfer_policy.unfreeze_modules)
    report = {
        "loaded_parameter_tensors": sorted(matching),
        "retained_initialization_tensors": sorted(missing),
        "ignored_checkpoint_tensors": sorted(unexpected),
        "runtime_active_experts": list(model.runtime_active_experts),
        "source_preprocessing_loaded": False,
    }
    return model, report
