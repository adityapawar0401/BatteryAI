from __future__ import annotations

import importlib
from dataclasses import dataclass, field
from typing import Type

from torch import nn

from battery_pimoe.config.schemas import ExpertConfig

from .base import BaseBatteryExpert


def import_class(class_path: str) -> Type[BaseBatteryExpert]:
    module_name, class_name = class_path.rsplit(".", 1)
    module = importlib.import_module(module_name)
    cls = getattr(module, class_name)
    if not issubclass(cls, BaseBatteryExpert):
        raise TypeError(f"{class_path} is not a BaseBatteryExpert")
    return cls


@dataclass
class ExpertRegistry:
    configs: dict[str, ExpertConfig] = field(default_factory=dict)
    classes: dict[str, Type[BaseBatteryExpert]] = field(default_factory=dict)

    @classmethod
    def from_configs(cls, configs: list[ExpertConfig]) -> "ExpertRegistry":
        registry = cls()
        for config in configs:
            registry.register(config)
        if "core_operational" not in registry.configs:
            raise ValueError("core_operational expert registration is required")
        return registry

    def register(self, config: ExpertConfig) -> None:
        if config.name in self.configs:
            raise ValueError(f"duplicate expert registration: {config.name}")
        self.configs[config.name] = config
        self.classes[config.name] = import_class(config.class_path)

    def build(self, d_model: int, include_disabled: bool = False) -> nn.ModuleDict:
        modules = nn.ModuleDict()
        for name, config in self.configs.items():
            if config.enabled or include_disabled:
                cls = self.classes[name]
                if name == "diagnostic_curve":
                    channel_names = tuple(config.consumed_features) or ("time_s", "voltage_V", "capacity_Ah", "temperature_K")
                    modules[name] = cls(d_model=d_model, token_count=config.output_token_count, input_dim=len(channel_names), channel_names=channel_names)
                else:
                    modules[name] = cls(d_model=d_model, token_count=config.output_token_count)
        return modules

    def build_enabled(self, d_model: int) -> nn.ModuleDict:
        return self.build(d_model, include_disabled=False)
