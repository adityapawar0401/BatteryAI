from __future__ import annotations

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from services.local_inference import app as app_module
from services.local_inference.deployment import DeploymentConfig, load_deployment_config, validate_remote_api_url


def local_config(**updates) -> DeploymentConfig:
    values = {
        "remote_enabled": False,
        "remote_api_url": None,
        "allowed_frontend_origins": ["http://127.0.0.1:5173", "http://localhost:5173"],
        "request_timeout_seconds": 10,
        "maximum_concurrent_inference_requests": 1,
        "maximum_concurrent_suggestion_requests": 1,
        "rate_limit_requests": 60,
        "rate_limit_window_seconds": 60,
    }
    values.update(updates)
    return DeploymentConfig.model_validate(values)


def remote_config(**updates) -> DeploymentConfig:
    return local_config(remote_enabled=True, remote_api_url="https://battery.example.ts.net", allowed_frontend_origins=["http://127.0.0.1:5173", "https://owner.github.io"], **updates)


def headers():
    return {"X-BatteryAI-Token": app_module.PAIRING_TOKEN}


def test_remote_mode_is_disabled_by_default(root, monkeypatch):
    monkeypatch.delenv("BATTERYAI_REMOTE_MODE", raising=False)
    monkeypatch.delenv("BATTERYAI_REMOTE_API_URL", raising=False)
    assert not load_deployment_config(root).remote_enabled
    assert TestClient(app_module.create_app(local_config())).get("/docs").status_code == 200


@pytest.mark.parametrize("url", ["http://battery.ts.net", "https://example.com", "https://user:pass@battery.ts.net", "https://battery.ts.net/api", "https://battery.ts.net?q=1", "https://battery.ts.net#x"])
def test_invalid_remote_urls_are_rejected(url):
    with pytest.raises((ValueError, ValidationError)):
        validate_remote_api_url(url)
    assert validate_remote_api_url("https://battery.example.ts.net") == "https://battery.example.ts.net"


def test_remote_docs_are_disabled_and_cors_is_exact():
    client = TestClient(app_module.create_app(remote_config()))
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
    allowed = client.options("/v1/infer", headers={"Origin": "https://owner.github.io", "Access-Control-Request-Method": "POST"})
    assert allowed.headers["access-control-allow-origin"] == "https://owner.github.io"
    rejected = client.options("/v1/infer", headers={"Origin": "https://other.github.io", "Access-Control-Request-Method": "POST"})
    assert rejected.status_code == 400 and "*" not in rejected.headers.get("access-control-allow-origin", "")


def test_remote_security_headers_and_structured_authentication():
    client = TestClient(app_module.create_app(remote_config()))
    response = client.get("/v1/capabilities")
    assert response.status_code == 401 and response.json()["detail"]["code"] == "pairing_required"
    health = client.get("/health")
    assert health.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in health.headers["content-security-policy"]


def test_private_repository_files_are_not_serveable():
    client = TestClient(app_module.create_app(remote_config()))
    for path in ("/model.pt", "/_inputs/artifacts/oxford_final/model.pt", "/configs/deployment.json", "/docs/remote-deployment.md"):
        assert client.get(path).status_code == 404


def test_rate_limit_returns_structured_429():
    client = TestClient(app_module.create_app(local_config(rate_limit_requests=1)))
    assert client.get("/v1/model-profile", headers=headers()).status_code == 200
    response = client.get("/v1/model-profile", headers=headers())
    assert response.status_code == 429 and response.json()["detail"]["code"] == "rate_limit_exceeded"


def test_inference_concurrency_does_not_queue(monkeypatch, inference_request, cpu_engine):
    entered, release = threading.Event(), threading.Event()
    class BlockingEngine:
        def predict(self, payload):
            entered.set(); release.wait(5)
            return cpu_engine.predict(payload)
    monkeypatch.setattr(app_module, "get_engine", lambda: BlockingEngine())
    client = TestClient(app_module.create_app(local_config()))
    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(client.post, "/v1/infer", headers=headers(), json=inference_request.model_dump())
        assert entered.wait(2)
        second = client.post("/v1/infer", headers=headers(), json=inference_request.model_dump())
        assert second.status_code == 429 and second.json()["detail"]["code"] == "inference_capacity_exceeded"
        release.set()
        assert first.result().status_code == 200


def test_suggestion_concurrency_does_not_queue(monkeypatch):
    entered, release = threading.Event(), threading.Event()
    from services.local_inference.batteryai_runtime.ollama import SuggestionContent, SuggestionResponse, SuggestionTiming
    payload = {
        "model_profile": "oxford-v1", "model_sha256": "a" * 64, "predicted_soh": 97.0, "predictive_std": 8.0,
        "actual_soh": None, "absolute_error": None, "input_quality": [],
        "active_experts": ["core_operational", "diagnostic_curve", "usage_aging", "residual"],
        "limitations": ["RUL unavailable"], "backend": "local-pytorch", "runtime_device": "cpu",
    }
    class BlockingClient:
        async def generate(self, _payload):
            entered.set(); await asyncio.to_thread(release.wait, 5)
            return SuggestionResponse(suggestions=SuggestionContent(summary="ok", actions=[], cautions=[]), timing=SuggestionTiming(total_ms=1))
    monkeypatch.setattr(app_module, "get_ollama_client", lambda: BlockingClient())
    client = TestClient(app_module.create_app(local_config()))
    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(client.post, "/v1/suggestions", headers=headers(), json=payload)
        assert entered.wait(2)
        second = client.post("/v1/suggestions", headers=headers(), json=payload)
        assert second.status_code == 429 and second.json()["detail"]["code"] == "suggestion_capacity_exceeded"
        release.set()
        assert first.result().status_code == 200
