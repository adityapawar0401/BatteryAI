from __future__ import annotations


def render_model_card(config_hash: str, enabled_experts: list[str], metrics: dict[str, float]) -> str:
    rows = "\n".join(f"- {name}" for name in enabled_experts)
    metric_rows = "\n".join(f"- {name}: {value}" for name, value in metrics.items())
    return (
        "# Battery PIMoE Model Card\n\n"
        "This model predicts SOH and RUL using a physics-informed mixture-of-experts Transformer.\n\n"
        "Router weights are contribution indicators, not proof of physical causality.\n\n"
        f"Configuration hash: `{config_hash}`\n\n"
        "## Enabled Experts\n"
        f"{rows}\n\n"
        "## Metrics\n"
        f"{metric_rows}\n"
    )
