from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "_inputs" / "source"))

from services.local_inference.batteryai_runtime.ollama import OllamaClient, OllamaConfig, SuggestionSummary  # noqa: E402


async def smoke(base_url: str, count: int) -> None:
    fixture = json.loads((ROOT / "apps" / "web" / "public" / "fixtures" / "oxford-expected-output.json").read_text(encoding="utf-8"))["results"][0]
    source = SuggestionSummary(
        model_profile=fixture["model_profile"],
        model_sha256=fixture["model_sha256"],
        predicted_soh=fixture["predicted_soh"],
        predictive_std=fixture["predictive_std"],
        actual_soh=fixture["actual_soh"],
        absolute_error=fixture["absolute_error"],
        input_quality=fixture["warnings"],
        active_experts=fixture["active_experts"],
        limitations=["RUL unavailable", "not a safety certification"],
        backend=fixture["backend"],
        runtime_device=fixture["runtime_device"],
    )
    before = source.model_dump()
    client = OllamaClient(OllamaConfig(base_url=base_url))
    guidance_values: list[str] = []
    for generation in range(1, count + 1):
        response = await client.generate(source)
        if source.model_dump() != before:
            raise RuntimeError("AI Insights generation changed the numerical prediction summary")
        serialized = json.dumps(response.suggestions.model_dump(), ensure_ascii=False)
        if "\u2014" in serialized:
            raise RuntimeError("AI Insights generation retained a customer-facing em dash")
        guidance_values.append(response.suggestions.usage_guidance)

        print(f"generation_{generation}=" + serialized)
        print(f"generation_{generation}_total_ms={response.timing.total_ms:.3f}")

    if len(set(guidance_values)) != 1:
        raise RuntimeError("Identical AI Insights inputs produced different usage guidance values: " + ", ".join(guidance_values))

    print("BATTERYAI_OLLAMA_SMOKE=PASSED")
    print(f"generation_count={count}")
    print("usage_guidance_values=" + json.dumps(guidance_values))
    print(f"model={response.model}")
    print(f"predicted_soh_unchanged={source.predicted_soh}")
    print(f"predictive_uncertainty_unchanged={source.predictive_std}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:11434")
    parser.add_argument("--count", type=int, default=1)
    arguments = parser.parse_args()
    if arguments.count < 1:
        parser.error("--count must be at least 1")
    asyncio.run(smoke(arguments.base_url, arguments.count))


if __name__ == "__main__":
    main()
