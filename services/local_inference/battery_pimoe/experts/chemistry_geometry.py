from .base import SequenceExpert


class ChemistryGeometryExpert(SequenceExpert):
    def __init__(self, d_model: int = 256, token_count: int = 1) -> None:
        super().__init__("chemistry_geometry", "metadata", 3, d_model, token_count, (), ("metadata",), ())
