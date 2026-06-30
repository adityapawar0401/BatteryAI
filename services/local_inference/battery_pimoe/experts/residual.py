from .base import SequenceExpert


class GeneralResidualExpert(SequenceExpert):
    def __init__(self, d_model: int = 256, token_count: int = 1) -> None:
        super().__init__("residual", "residual", 3, d_model, token_count, (), ("residual_context",), ())
