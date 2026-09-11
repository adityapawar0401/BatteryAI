from torch import nn


class FailurePredictionHead(nn.Module):
    """Binary logit after the shared MoE/fusion/history representation."""

    def __init__(self, d_model: int):
        super().__init__()
        self.network = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Linear(d_model // 2, 1),
        )

    def forward(self, state):
        logits = self.network(state).squeeze(-1)
        return {"logits": logits, "probability": logits.sigmoid()}
