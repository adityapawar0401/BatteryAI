from .base import SequenceExpert


class DiagnosticCurveExpert(SequenceExpert):
    def __init__(self, d_model: int = 256, token_count: int = 1, input_dim: int = 4, channel_names: tuple[str, ...] | None = None) -> None:
        super().__init__(
            "diagnostic_curve",
            "diagnostic_curve",
            input_dim,
            d_model,
            token_count,
            (),
            ("charge_curve", "discharge_curve", "ica", "dva"),
            channel_names or ("time_s", "voltage_V", "capacity_Ah", "temperature_K"),
        )
        self.channel_names = tuple(channel_names or self.consumed_features)
