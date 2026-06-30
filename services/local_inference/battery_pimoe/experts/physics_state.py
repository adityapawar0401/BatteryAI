from .base import SequenceExpert


class PhysicsStateExpert(SequenceExpert):
    def __init__(self, d_model: int = 256, token_count: int = 1) -> None:
        super().__init__("physics_state", "physics", 3, d_model, token_count, (), ("physics_state",), ())
        self.auxiliary_outputs = ("latent_degradation_state",)
