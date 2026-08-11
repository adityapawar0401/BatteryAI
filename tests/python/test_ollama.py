from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from services.local_inference import app as app_module
from services.local_inference.batteryai_runtime.ollama import (
    OLLAMA_MODEL,
    OLLAMA_PULL_COMMAND,
    PROMPT_PAYLOAD_FIELDS,
    RETRY_CORRECTION,
    SYSTEM_PROMPT,
    OllamaCapabilities,
    OllamaClient,
    OllamaConfig,
    SuggestionContent,
    SuggestionContentError,
    SuggestionResponse,
    SuggestionServiceError,
    SuggestionSummary,
    SuggestionTiming,
    UsageGuidance,
    _parse_suggestion_content,
    load_ollama_config,
)


def summary(**updates) -> SuggestionSummary:
    values = {
        "model_profile": "oxford-v1",
        "model_sha256": "a" * 64,
        "predicted_soh": 97.06190490722656,
        "predictive_std": 8.065762519836426,
        "actual_soh": 98.67620878772155,
        "absolute_error": 1.61430388049499,
        "input_quality": ["software fixture"],
        "active_experts": ["core_operational", "diagnostic_curve", "usage_aging", "residual"],
        "limitations": ["RUL unavailable", "not a safety certification"],
        "backend": "local-pytorch",
        "runtime_device": "cuda",
    }
    values.update(updates)
    return SuggestionSummary.model_validate(values)


def run(awaitable):
    return asyncio.run(awaitable)


def client_for(handler, config: OllamaConfig | None = None) -> OllamaClient:
    resolved = config or OllamaConfig()
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url=resolved.base_url, timeout=resolved.timeout_seconds)
    return OllamaClient(resolved, http)


def insight_content(
    *,
    summary_text: str = "The estimated State of Health supports continued use with routine monitoring.",
    usage_guidance: UsageGuidance = "normal_use",
    actions: list[str] | None = None,
    cautions: list[str] | None = None,
) -> dict:
    return {
        "summary": summary_text,
        "usage_guidance": usage_guidance,
        "actions": actions or ["Continue routine monitoring.", "Compare a future health measurement with this estimate."],
        "cautions": cautions or ["Use operating context before major service decisions."],
    }


def parse_generated(content: dict) -> SuggestionContent:
    return _parse_suggestion_content({"message": {"content": json.dumps(content)}})


@pytest.mark.parametrize("url", ["https://127.0.0.1:11434", "http://example.com:11434", "http://user:pass@localhost:11434", "http://localhost:11434/api/chat", "http://localhost:11434?x=1"])
def test_ollama_url_is_loopback_http_only(url):
    with pytest.raises(ValidationError):
        OllamaConfig(base_url=url)
    assert OllamaConfig(base_url="http://[::1]:11434").base_url == "http://[::1]:11434"


def test_checked_in_ollama_config_uses_fixed_deterministic_sampling(monkeypatch):
    monkeypatch.delenv("BATTERYAI_OLLAMA_TEMPERATURE", raising=False)
    monkeypatch.delenv("BATTERYAI_OLLAMA_SEED", raising=False)
    config = load_ollama_config(Path(__file__).resolve().parents[2])
    assert config.temperature == 0.0
    assert config.seed == 123


def test_ollama_unavailable_is_nonfatal_capability():
    def unavailable(request):
        raise httpx.ConnectError("stopped", request=request)

    capabilities = run(client_for(unavailable).capabilities())
    assert not capabilities.ready
    assert not capabilities.reachable
    assert "unavailable" in (capabilities.reason or "").lower()


def test_capability_recovers_after_local_ollama_returns():
    state = {"running": False}

    def handler(request):
        if not state["running"]:
            raise httpx.ConnectError("stopped", request=request)
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        return httpx.Response(200, json={"models": [{"name": OLLAMA_MODEL}]})

    client = client_for(handler)

    async def exercise():
        stopped = await client.capabilities()
        state["running"] = True
        restarted = await client.capabilities()
        return stopped, restarted

    stopped, restarted = run(exercise())
    assert not stopped.ready
    assert restarted.ready


def test_missing_and_installed_model_detection():
    def missing(request):
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        return httpx.Response(200, json={"models": [{"name": "qwen2.5:3b"}]})

    unavailable = run(client_for(missing).capabilities())
    assert unavailable.reachable and not unavailable.model_installed
    assert unavailable.corrective_command == OLLAMA_PULL_COMMAND

    def installed(request):
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        return httpx.Response(200, json={"models": [{"name": OLLAMA_MODEL}]})

    available = run(client_for(installed).capabilities())
    assert available.ready and available.model_installed and available.version == "0.30.11"


def test_successful_structured_completion_is_bounded_and_preserves_input_numbers():
    captured = {}

    def handler(request):
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        if request.url.path == "/api/tags": return httpx.Response(200, json={"models": [{"name": OLLAMA_MODEL}]})
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={
            "message": {"role": "assistant", "content": json.dumps({
                "summary": "The estimated battery state of health remains relatively strong.",
                "usage_guidance": "normal_use",
                "actions": ["Continue monitoring state of health.", "Compare the next result with this estimate."],
                "cautions": ["Interpret the estimate together with its predictive uncertainty."],
            })},
            "total_duration": 2_000_000, "load_duration": 1_000_000, "prompt_eval_count": 40, "eval_count": 20, "done_reason": "stop",
        })

    source = summary()
    response = run(client_for(handler).generate(source))
    assert response.suggestions.summary == "The estimated battery state of health remains relatively strong."
    assert captured["model"] == OLLAMA_MODEL and captured["stream"] is False and "format" in captured
    assert captured["options"] == {"temperature": 0.0, "seed": 123, "num_predict": 300, "num_ctx": 2048}
    assert "tools" not in captured and "images" not in captured
    user_data = captured["messages"][1]["content"]
    assert "BEGIN BATTERYAI_PREDICTION_DATA" in user_data
    serialized_payload = user_data.split("\n")[1]
    assert json.loads(serialized_payload) == {
        "predicted_soh_percent": source.predicted_soh,
        "predictive_uncertainty_pp": source.predictive_std,
    }
    assert frozenset(json.loads(serialized_payload)) == PROMPT_PAYLOAD_FIELDS
    assert source.predicted_soh == 97.06190490722656
    assert "predicted_soh" not in response.suggestions.model_dump()
    assert response.timing.ollama_total_ms == 2.0


def test_identical_structured_requests_reuse_deterministic_generation_settings():
    chat_requests = []

    def handler(request):
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.32.6"})
        if request.url.path == "/api/tags": return httpx.Response(200, json={"models": [{"name": OLLAMA_MODEL}]})
        chat_requests.append(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": json.dumps(insight_content())}})

    source = summary()
    client = client_for(handler)
    first = run(client.generate(source))
    second = run(client.generate(source))

    assert len(chat_requests) == 2
    expected_options = {"temperature": 0.0, "seed": 123, "num_predict": 300, "num_ctx": 2048}
    assert [request["options"] for request in chat_requests] == [expected_options, expected_options]
    assert chat_requests[0]["messages"] == chat_requests[1]["messages"]
    assert chat_requests[0]["format"] == chat_requests[1]["format"]
    assert first.suggestions.usage_guidance == second.suggestions.usage_guidance == "normal_use"
    assert source.predicted_soh == 97.06190490722656

    with pytest.raises(ValidationError):
        OllamaConfig(temperature=0.1)
    with pytest.raises(ValidationError):
        OllamaConfig(seed=-1)


@pytest.mark.parametrize(
    "content",
    [
        {"summary": "Review", "usage_guidance": "normal_use", "actions": [], "cautions": ["Uncertain"]},
        {"summary": "Review", "usage_guidance": "normal_use", "actions": ["Inspect"], "cautions": ["Uncertain"]},
        {"summary": "Review", "usage_guidance": "normal_use", "actions": ["Inspect"], "cautions": []},
        {"summary": "Review", "usage_guidance": "normal_use", "actions": ["Inspect", "Monitor"], "cautions": ["1", "2", "3", "4"]},
        {"summary": "   ", "usage_guidance": "normal_use", "actions": ["Inspect"], "cautions": ["Uncertain"]},
        {"summary": "First paragraph.\nSecond paragraph.", "usage_guidance": "normal_use", "actions": ["Inspect", "Monitor"], "cautions": ["Uncertain"]},
        {"summary": "Review", "usage_guidance": "normal_use", "actions": ["   "], "cautions": ["Uncertain"]},
        {"summary": "Review", "usage_guidance": "normal_use", "actions": ["Inspect"], "cautions": ["   "]},
        {"summary": "Review", "usage_guidance": "normal_use", "actions": ["1", "2", "3", "4", "5"], "cautions": ["Uncertain"]},
        {"summary": "Review", "usage_guidance": "not_allowed", "actions": ["Inspect", "Monitor"], "cautions": ["Uncertain"]},
        {"summary": "Review", "usage_guidance": "normal_use", "actions": ["Inspect"], "cautions": [1]},
    ],
)
def test_incomplete_suggestion_content_is_rejected(content):
    with pytest.raises(ValidationError):
        SuggestionContent.model_validate(content)


def test_valid_suggestion_content_is_trimmed_and_schema_matches_runtime_contract():
    content = SuggestionContent.model_validate({
        "summary": "  State of health remains relatively strong.  ",
        "usage_guidance": "normal_use",
        "actions": ["  Continue monitoring  ", "  Compare the next result  "],
        "cautions": ["  Consider predictive uncertainty  "],
    })
    assert content.model_dump() == {
        "summary": "State of health remains relatively strong.",
        "usage_guidance": "normal_use",
        "actions": ["Continue monitoring", "Compare the next result"],
        "cautions": ["Consider predictive uncertainty"],
    }
    schema = SuggestionContent.model_json_schema()
    assert schema["properties"]["actions"]["minItems"] == 2 and schema["properties"]["actions"]["maxItems"] == 4
    assert schema["properties"]["cautions"]["minItems"] == 1 and schema["properties"]["cautions"]["maxItems"] == 3
    assert schema["properties"]["actions"]["items"]["minLength"] == 1
    assert schema["properties"]["cautions"]["items"]["minLength"] == 1
    assert set(schema["properties"]["usage_guidance"]["enum"]) == {
        "normal_use", "monitor_more_closely", "conservative_use", "service_or_replacement_review",
    }
    assert schema["additionalProperties"] is False


@pytest.mark.parametrize(
    "unsupported_text",
    [
        "Check the actual SOC before continuing.",
        "Check the battery's State of Charge before continuing.",
        "The prediction model accuracy may be low.",
        "Review the software version and calibration history.",
        "Review the Oxford Battery-PIMoE checkpoint architecture.",
        "The Ollama backend runs through Tailscale Funnel on CUDA or CPU.",
        "Estimate the Remaining Useful Life or RUL.",
        "Arrange a follow-up assessment in 6-12 months.",
        "Arrange a follow-up assessment in about 6-12 months.",
        "Increase usage frequency by no more than 10-20%.",
        "Avoid temperatures above 30°C.",
        "Avoid deep discharging below 10%.",
        "The battery is safe.",
        "Maintenance is necessary based on this result.",
        "The battery must be replaced.",
    ],
)
def test_unsupported_generated_summary_subjects_are_rejected(unsupported_text):
    with pytest.raises(SuggestionContentError, match="unsupported generated summary subject"):
        parse_generated(insight_content(summary_text=unsupported_text))


@pytest.mark.parametrize(
    ("guidance", "advice"),
    [
        ("normal_use", "Normal use is reasonable with routine monitoring."),
        ("monitor_more_closely", "Continue monitoring the health estimate more closely."),
        ("conservative_use", "Use the battery more conservatively and arrange a follow-up measurement."),
        ("service_or_replacement_review", "Consider service planning and replacement planning."),
    ],
)
def test_valid_soh_usage_guidance_is_accepted(guidance, advice):
    result = parse_generated(insight_content(
        usage_guidance=guidance,
        actions=[advice, "Compare a future actual measurement with the current estimate."],
        cautions=["Use measured health trends and operating context before major decisions."],
    ))
    assert result.usage_guidance == guidance
    assert advice in result.actions


def test_generic_actual_soh_wording_is_not_a_false_positive():
    result = parse_generated(insight_content(
        summary_text="Compare the estimated State of Health with actual SOH from a future measurement when available.",
    ))
    assert "actual SOH" in result.summary


def test_invalid_action_and_consideration_are_salvaged_without_retry():
    chat_calls = 0

    def handler(request):
        nonlocal chat_calls
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        if request.url.path == "/api/tags": return httpx.Response(200, json={"models": [{"name": OLLAMA_MODEL}]})
        chat_calls += 1
        content = insight_content(
            actions=["Continue monitoring State of Health.", "Check State of Charge.", "Compare the next health measurement with this result."],
            cautions=["Review software calibration history.", "Use operating context before major decisions."],
        )
        return httpx.Response(200, json={"message": {"content": json.dumps(content)}})

    response = run(client_for(handler).generate(summary()))
    assert chat_calls == 1
    assert response.suggestions.actions == ["Continue monitoring State of Health.", "Compare the next health measurement with this result."]
    assert response.suggestions.cautions == ["Use operating context before major decisions."]


def test_generated_em_dash_is_normalized_before_returning():
    result = parse_generated(insight_content(
        summary_text="Normal use may be reasonable — continue routine monitoring.",
        actions=["Monitor health — compare the next result.", "Arrange a future measurement."],
    ))
    assert "—" not in json.dumps(result.model_dump(), ensure_ascii=False)
    assert result.summary == "Normal use may be reasonable, continue routine monitoring."


def test_generated_percentage_uncertainty_is_normalized_to_percentage_points():
    result = parse_generated(insight_content(
        summary_text="The estimate has predictive uncertainty of ≈8% points and should be interpreted with context.",
    ))
    assert "8%" not in result.summary
    assert "≈" not in result.summary
    assert "8 percentage points" in result.summary
    assert "points points" not in result.summary


def test_soh_percent_followed_by_qualitative_uncertainty_is_not_rewritten_or_rejected():
    result = parse_generated(insight_content(
        summary_text="State of Health is estimated at 97% with moderate predictive uncertainty.",
    ))
    assert result.summary == "State of Health is estimated at 97% with moderate predictive uncertainty."


def test_qualitative_uncertainty_followed_by_soh_percent_is_not_rewritten_or_rejected():
    result = parse_generated(insight_content(
        summary_text="With moderate predictive uncertainty, the State of Health is estimated at 97%.",
    ))
    assert result.summary == "With moderate predictive uncertainty, the State of Health is estimated at 97%."


def test_invalid_first_completion_retries_once_with_same_two_field_payload_then_succeeds():
    requests = []
    completions = [
        {"summary": "Check State of Charge before use.", "usage_guidance": "normal_use", "actions": ["Review SOC.", "Inspect the trend."], "cautions": ["Uncertain"]},
        {
            "summary": "The estimated state of health remains relatively strong.",
            "usage_guidance": "normal_use",
            "actions": ["Continue routine monitoring.", "Compare the next result with this estimate."],
            "cautions": ["Interpret the estimate with its predictive uncertainty."],
        },
    ]

    def handler(request):
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        if request.url.path == "/api/tags": return httpx.Response(200, json={"models": [{"name": OLLAMA_MODEL}]})
        body = json.loads(request.content); requests.append(body)
        return httpx.Response(200, json={"message": {"content": json.dumps(completions[len(requests) - 1])}})

    source = summary()
    before = source.model_dump()
    response = run(client_for(handler).generate(source))
    assert response.suggestions.actions == ["Continue routine monitoring.", "Compare the next result with this estimate."]
    assert source.model_dump() == before
    assert len(requests) == 2
    assert requests[0]["messages"][1]["content"] == requests[1]["messages"][1]["content"]
    assert "BEGIN BATTERYAI_PREDICTION_DATA" in requests[1]["messages"][1]["content"]
    payload = json.loads(requests[1]["messages"][1]["content"].split("\n")[1])
    assert frozenset(payload) == PROMPT_PAYLOAD_FIELDS
    assert app_module.PAIRING_TOKEN not in json.dumps(requests[1])
    assert requests[1]["messages"][-1]["content"] == RETRY_CORRECTION
    assert len(requests[1]["messages"]) == 3


def test_two_invalid_completions_stop_after_exactly_one_retry_with_structured_error():
    chat_calls = 0

    def handler(request):
        nonlocal chat_calls
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        if request.url.path == "/api/tags": return httpx.Response(200, json={"models": [{"name": OLLAMA_MODEL}]})
        chat_calls += 1
        return httpx.Response(200, json={"message": {"content": json.dumps({
            "summary": "The model has a high error rate.",
            "usage_guidance": "normal_use",
            "actions": ["Review model performance.", "Check State of Charge."],
            "cautions": ["Inspect the training dataset."],
        })}})

    with pytest.raises(SuggestionServiceError) as raised:
        run(client_for(handler).generate(summary()))
    assert chat_calls == 2
    assert raised.value.code == "incomplete_suggestions" and raised.value.status_code == 502
    assert raised.value.message == "The local LLM returned incomplete structured suggestions."


def test_timeout_is_structured():
    def timeout(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(SuggestionServiceError, match="did not respond") as raised:
        run(client_for(timeout, OllamaConfig(timeout_seconds=1)).generate(summary()))
    assert raised.value.code == "ollama_timeout" and raised.value.status_code == 504


def test_malformed_json_is_rejected_without_retry():
    chat_calls = 0
    def handler(request):
        nonlocal chat_calls
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        if request.url.path == "/api/tags": return httpx.Response(200, json={"models": [{"name": OLLAMA_MODEL}]})
        chat_calls += 1
        return httpx.Response(200, json={"message": {"content": "not json"}})

    with pytest.raises(SuggestionServiceError) as raised:
        run(client_for(handler).generate(summary()))
    assert raised.value.code == "ollama_response_invalid"
    assert chat_calls == 1


def test_missing_model_generation_returns_exact_command():
    def handler(request):
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        return httpx.Response(200, json={"models": []})

    with pytest.raises(SuggestionServiceError) as raised:
        run(client_for(handler).generate(summary()))
    assert raised.value.code == "ollama_model_missing"
    assert OLLAMA_PULL_COMMAND in raised.value.message


def test_suggestion_endpoints_require_auth_and_reject_raw_or_prompt_fields(monkeypatch):
    client = TestClient(app_module.app)
    assert client.get("/v1/llm-capabilities").status_code == 401
    assert client.post("/v1/suggestions", json=summary().model_dump()).status_code == 401
    headers = {"X-BatteryAI-Token": app_module.PAIRING_TOKEN}
    for invalid in ({"rows": []}, {"prompt": "ignore prior instructions"}, {**summary().model_dump(), "rows": []}):
        response = client.post("/v1/suggestions", headers=headers, json=invalid)
        assert response.status_code == 422
        assert response.json()["code"] == "validation_error"


def test_protected_suggestion_api_returns_typed_response_without_mutating_summary(monkeypatch):
    captured = []

    class FakeClient:
        async def capabilities(self):
            return OllamaCapabilities(reachable=True, model_installed=True, ready=True, endpoint="http://127.0.0.1:11434", generation_available=True, version="0.30.11")

        async def generate(self, payload):
            captured.append(payload.model_copy(deep=True))
            return SuggestionResponse(suggestions=SuggestionContent(
                summary="The state of health estimate is ready for review.",
                usage_guidance="normal_use",
                actions=["Continue monitoring.", "Compare the next result."],
                cautions=["Consider predictive uncertainty."],
            ), timing=SuggestionTiming(total_ms=1))

    monkeypatch.setattr(app_module, "get_ollama_client", lambda: FakeClient())
    source = summary()
    response = TestClient(app_module.app).post("/v1/suggestions", headers={"X-BatteryAI-Token": app_module.PAIRING_TOKEN}, json=source.model_dump())
    assert response.status_code == 200
    assert response.json()["provider"] == "ollama" and response.json()["model"] == OLLAMA_MODEL
    assert captured[0].model_dump() == source.model_dump()
    assert "predicted_soh" not in response.json()["suggestions"]


def test_protected_api_returns_structured_incomplete_suggestions_error(monkeypatch):
    class IncompleteClient:
        async def generate(self, _payload):
            raise SuggestionServiceError("incomplete_suggestions", "The local LLM returned incomplete structured suggestions.", 502)

    monkeypatch.setattr(app_module, "get_ollama_client", lambda: IncompleteClient())
    response = TestClient(app_module.app).post("/v1/suggestions", headers={"X-BatteryAI-Token": app_module.PAIRING_TOKEN}, json=summary().model_dump())
    assert response.status_code == 502
    assert response.json()["code"] == "incomplete_suggestions"
    assert response.json()["message"] == "The local LLM returned incomplete structured suggestions."


def test_health_and_startup_remain_available_without_ollama(monkeypatch):
    assert TestClient(app_module.app).get("/health").status_code == 200
    monkeypatch.setattr(app_module, "get_engine", lambda: SimpleNamespace(device="cuda", model_sha256="a" * 64))
    monkeypatch.setattr(app_module, "startup_ollama_capabilities", lambda: OllamaCapabilities(reachable=False, model_installed=False, ready=False, endpoint="http://127.0.0.1:11434", generation_available=False, reason="Ollama unavailable"))
    banner = app_module.startup_banner("127.0.0.1", 8000)
    assert "Numerical device: cuda" in banner
    assert "Ollama ready: False" in banner


def test_prompt_serializes_only_the_two_customer_interpretation_values():
    """The request contract still carries internal fields; the prompt must not."""
    captured = {}

    def handler(request):
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        if request.url.path == "/api/tags": return httpx.Response(200, json={"models": [{"name": OLLAMA_MODEL}]})
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": json.dumps(
            {
                "summary": "The estimated state of health remains relatively strong.",
                "usage_guidance": "normal_use",
                "actions": ["Continue monitoring.", "Compare the next result."],
                "cautions": ["Consider predictive uncertainty."],
            }
        )}})

    source = summary(
        model_profile="oxford-v1",
        limitations=["next-observed-checkpoint horizon varies", "RUL unavailable"],
        active_experts=["core_operational", "diagnostic_curve"],
        runtime_device="cuda:0",
    )
    before = source.model_dump()
    run(client_for(handler).generate(source))

    user_message = captured["messages"][1]["content"]
    assert "BEGIN BATTERYAI_PREDICTION_DATA" in user_message
    payload = json.loads(user_message.split("\n")[1])
    assert payload == {
        "predicted_soh_percent": source.predicted_soh,
        "predictive_uncertainty_pp": source.predictive_std,
    }
    assert frozenset(payload) == PROMPT_PAYLOAD_FIELDS
    for forbidden_value in [
        source.actual_soh,
        source.absolute_error,
        source.model_profile,
        source.model_sha256,
        source.active_experts[0],
        source.limitations[0],
        source.backend,
        source.runtime_device,
        source.input_quality[0],
    ]:
        assert str(forbidden_value) not in user_message
    for forbidden_key in [
        "actual_soh", "absolute_error", "source_checkpoint", "target_checkpoint",
        "sequence_id", "cell_id", "input_quality", "rows", "model_profile",
        "model_sha256", "active_experts", "limitations", "backend", "runtime_device",
    ]:
        assert forbidden_key not in user_message

    # The accepted request object is unchanged, so the HTTP contract still holds.
    assert source.model_dump() == before
    assert source.model_profile == "oxford-v1" and source.runtime_device == "cuda:0"


def test_system_prompt_defines_soh_only_customer_guidance():
    lowered = SYSTEM_PROMPT.lower()
    for required in [
        "battery-health usage advisor",
        "normal use appears reasonable",
        "service or replacement planning",
        "percentage points, never percent",
        "only the predicted soh may be quoted as a percent",
        "do not invent quantitative operating limits",
        "decision-support interpretation",
        "not a safety certification",
        "2 to 4 non-empty actions and 1 to 3 non-empty cautions",
    ]:
        assert required in lowered, required
    for named_internal in ["oxford", "pimoe", "ollama", "llama", "cuda", "onnx"]:
        assert named_internal not in lowered, named_internal
