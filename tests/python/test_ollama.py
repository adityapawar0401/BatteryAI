from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from services.local_inference import app as app_module
from services.local_inference.batteryai_runtime.ollama import (
    OLLAMA_MODEL,
    OLLAMA_PULL_COMMAND,
    OllamaCapabilities,
    OllamaClient,
    OllamaConfig,
    SuggestionContent,
    SuggestionResponse,
    SuggestionServiceError,
    SuggestionSummary,
    SuggestionTiming,
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


@pytest.mark.parametrize("url", ["https://127.0.0.1:11434", "http://example.com:11434", "http://user:pass@localhost:11434", "http://localhost:11434/api/chat", "http://localhost:11434?x=1"])
def test_ollama_url_is_loopback_http_only(url):
    with pytest.raises(ValidationError):
        OllamaConfig(base_url=url)
    assert OllamaConfig(base_url="http://[::1]:11434").base_url == "http://[::1]:11434"


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
            "message": {"role": "assistant", "content": json.dumps({"summary": "Review uncertainty.", "actions": ["Inspect trends"], "cautions": ["Decision support only"]})},
            "total_duration": 2_000_000, "load_duration": 1_000_000, "prompt_eval_count": 40, "eval_count": 20, "done_reason": "stop",
        })

    source = summary()
    response = run(client_for(handler).generate(source))
    assert response.suggestions.summary == "Review uncertainty."
    assert captured["model"] == OLLAMA_MODEL and captured["stream"] is False and "format" in captured
    assert captured["options"] == {"temperature": 0.1, "num_predict": 300, "num_ctx": 2048}
    assert "tools" not in captured and "images" not in captured
    user_data = captured["messages"][1]["content"]
    assert "BEGIN BATTERYAI_PREDICTION_DATA" in user_data
    assert str(source.predicted_soh) in user_data
    assert source.predicted_soh == 97.06190490722656
    assert "predicted_soh" not in response.suggestions.model_dump()
    assert response.timing.ollama_total_ms == 2.0


@pytest.mark.parametrize(
    "content",
    [
        {"summary": "Review", "actions": [], "cautions": ["Uncertain"]},
        {"summary": "Review", "actions": ["Inspect"], "cautions": []},
        {"summary": "   ", "actions": ["Inspect"], "cautions": ["Uncertain"]},
        {"summary": "Review", "actions": ["   "], "cautions": ["Uncertain"]},
        {"summary": "Review", "actions": ["Inspect"], "cautions": ["   "]},
        {"summary": "Review", "actions": ["1", "2", "3", "4", "5"], "cautions": ["Uncertain"]},
        {"summary": "Review", "actions": ["Inspect"], "cautions": [1]},
    ],
)
def test_incomplete_suggestion_content_is_rejected(content):
    with pytest.raises(ValidationError):
        SuggestionContent.model_validate(content)


def test_valid_suggestion_content_is_trimmed_and_schema_matches_runtime_contract():
    content = SuggestionContent.model_validate({"summary": "  Review  ", "actions": ["  Inspect trend  "], "cautions": ["  Decision support only  "]})
    assert content.model_dump() == {"summary": "Review", "actions": ["Inspect trend"], "cautions": ["Decision support only"]}
    schema = SuggestionContent.model_json_schema()
    assert schema["properties"]["actions"]["minItems"] == 1 and schema["properties"]["actions"]["maxItems"] == 4
    assert schema["properties"]["cautions"]["minItems"] == 1 and schema["properties"]["cautions"]["maxItems"] == 4
    assert schema["properties"]["actions"]["items"]["minLength"] == 1
    assert schema["properties"]["cautions"]["items"]["minLength"] == 1
    assert schema["additionalProperties"] is False


def test_invalid_first_completion_retries_once_with_same_bounded_summary_then_succeeds():
    requests = []
    completions = [
        {"summary": "Review", "actions": [], "cautions": ["Uncertain"]},
        {"summary": "Review", "actions": ["Inspect the trend"], "cautions": ["Decision support only"]},
    ]

    def handler(request):
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        if request.url.path == "/api/tags": return httpx.Response(200, json={"models": [{"name": OLLAMA_MODEL}]})
        body = json.loads(request.content); requests.append(body)
        return httpx.Response(200, json={"message": {"content": json.dumps(completions[len(requests) - 1])}})

    source = summary()
    before = source.model_dump()
    response = run(client_for(handler).generate(source))
    assert response.suggestions.actions == ["Inspect the trend"]
    assert source.model_dump() == before
    assert len(requests) == 2
    assert requests[0]["messages"][1]["content"] == requests[1]["messages"][1]["content"]
    assert "BEGIN BATTERYAI_PREDICTION_DATA" in requests[1]["messages"][1]["content"]
    assert "rows" not in requests[1]["messages"][1]["content"]
    assert app_module.PAIRING_TOKEN not in json.dumps(requests[1])
    assert "at least one non-empty" in requests[1]["messages"][-1]["content"]


def test_two_incomplete_completions_stop_after_one_retry_with_structured_error():
    chat_calls = 0

    def handler(request):
        nonlocal chat_calls
        if request.url.path == "/api/version": return httpx.Response(200, json={"version": "0.30.11"})
        if request.url.path == "/api/tags": return httpx.Response(200, json={"models": [{"name": OLLAMA_MODEL}]})
        chat_calls += 1
        return httpx.Response(200, json={"message": {"content": json.dumps({"summary": "Review", "actions": [], "cautions": ["Uncertain"]})}})

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
            return SuggestionResponse(suggestions=SuggestionContent(summary="Review", actions=["Inspect"], cautions=["Uncertain"]), timing=SuggestionTiming(total_ms=1))

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
