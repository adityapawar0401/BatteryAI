from __future__ import annotations

from battery_pimoe.config.schemas import ModelConfig

from .pimoe_transformer import BatteryPIMoETransformer


def build_model(
    config: ModelConfig,
    *,
    universal_superset: bool = False,
    runtime_active_experts: list[str] | tuple[str, ...] | set[str] | None = None,
) -> BatteryPIMoETransformer:
    return BatteryPIMoETransformer(
        config,
        universal_superset=universal_superset,
        runtime_active_experts=runtime_active_experts,
    )


