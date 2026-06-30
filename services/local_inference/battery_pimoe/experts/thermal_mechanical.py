from .base import SequenceExpert


class ThermalMechanicalExpert(SequenceExpert):
    def __init__(self, d_model: int = 256, token_count: int = 1) -> None:
        super().__init__("thermal_mechanical", "thermal_mechanical", 3, d_model, token_count, (), ("thermal", "mechanical"), ("cell_temperature",))
