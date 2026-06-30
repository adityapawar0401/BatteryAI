from .base import SequenceExpert


class PackContextExpert(SequenceExpert):
    def __init__(self, d_model: int = 256, token_count: int = 1) -> None:
        super().__init__("pack_context", "pack", 3, d_model, token_count, (), ("pack_context",), ())
