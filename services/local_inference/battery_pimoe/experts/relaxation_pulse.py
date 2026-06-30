from .base import SequenceExpert


class RelaxationPulseExpert(SequenceExpert):
    def __init__(self, d_model: int = 256, token_count: int = 1) -> None:
        super().__init__("relaxation_pulse", "relaxation", 3, d_model, token_count, (), ("pulse", "relaxation"), ())
