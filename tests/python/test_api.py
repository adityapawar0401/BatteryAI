from __future__ import annotations

from fastapi.testclient import TestClient

from services.local_inference import app as app_module


def test_health_is_minimal():
    response = TestClient(app_module.app).get("/health")
    assert response.status_code == 200
    assert set(response.json()) == {"service", "status"}


def test_model_details_require_pairing():
    client = TestClient(app_module.app)
    assert client.get("/v1/capabilities").status_code == 401
    assert client.get("/v1/input-schema").status_code == 401
    assert client.get("/v1/capabilities", headers={"X-BatteryAI-Token": "invalid"}).status_code == 401


def test_pairing_token_is_high_entropy():
    assert len(app_module.PAIRING_TOKEN) >= 32


def test_capabilities_and_inference(monkeypatch, cpu_engine, inference_request):
    monkeypatch.setattr(app_module, "get_engine", lambda: cpu_engine)
    client = TestClient(app_module.app)
    headers = {"X-BatteryAI-Token": app_module.PAIRING_TOKEN}
    capabilities = client.get("/v1/capabilities", headers=headers)
    assert capabilities.status_code == 200
    assert capabilities.json()["active_experts"] == ["core_operational", "diagnostic_curve", "usage_aging", "residual"]
    response = client.post("/v1/infer", headers=headers, json=inference_request.model_dump())
    assert response.status_code == 200
    assert response.json()["results"][0]["model_sha256"] == cpu_engine.model_sha256


def test_bad_payload_has_structured_422():
    client = TestClient(app_module.app)
    response = client.post("/v1/infer", headers={"X-BatteryAI-Token": app_module.PAIRING_TOKEN}, json={"rows": []})
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_cors_is_credential_free_and_restricted():
    client = TestClient(app_module.app)
    allowed = client.options(
        "/v1/infer",
        headers={"Origin": "http://127.0.0.1:5173", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "X-BatteryAI-Token,Content-Type"},
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "access-control-allow-credentials" not in allowed.headers
    rejected = client.options("/v1/infer", headers={"Origin": "https://example.com", "Access-Control-Request-Method": "POST"})
    assert rejected.status_code == 400
