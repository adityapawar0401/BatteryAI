from __future__ import annotations

import asyncio
import hashlib
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from functools import lru_cache
from pathlib import Path

import torch
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .batteryai_runtime.contracts import (
    ACTIVE_EXPERTS,
    EV_ACTIVE_EXPERTS,
    ErrorDetail,
    FailureBatchRequest,
    FailureBatchResponse,
    FailurePrediction,
    FailureRequest,
    InferenceRequest,
    InferenceResponse,
)
from .batteryai_runtime.engine import BatteryAIEngine, MODEL_PROFILE, MODEL_VERSION
from .batteryai_runtime.ollama import (
    OllamaCapabilities,
    OllamaClient,
    OllamaConfig,
    SuggestionResponse,
    SuggestionServiceError,
    SuggestionSummary,
    load_ollama_config,
)
from .deployment import DeploymentConfig, load_deployment_config


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACT_DIR = ROOT / "_inputs" / "artifacts" / MODEL_VERSION
DEVELOPMENT_ARTIFACT_DIR = ROOT.parent / "battery-pimoe" / "artifacts" / MODEL_VERSION
PAIRING_TOKEN = os.environ.get("BATTERYAI_PAIRING_TOKEN") or secrets.token_urlsafe(32)


def artifact_dir_from_environment() -> Path:
    configured = os.environ.get("BATTERYAI_ARTIFACT_DIR")
    artifact_dir = Path(configured).resolve() if configured else (
        DEFAULT_ARTIFACT_DIR if DEFAULT_ARTIFACT_DIR.is_dir() else DEVELOPMENT_ARTIFACT_DIR
    ).resolve()
    if artifact_dir.name != MODEL_VERSION:
        raise ValueError(f"BATTERYAI_ARTIFACT_DIR must select {MODEL_VERSION}")
    return artifact_dir


@lru_cache(maxsize=1)
def get_engine() -> BatteryAIEngine:
    return BatteryAIEngine(artifact_dir_from_environment(), os.environ.get("BATTERYAI_DEVICE", "auto"))


@lru_cache(maxsize=1)
def get_ollama_config() -> OllamaConfig:
    return load_ollama_config(ROOT)


@lru_cache(maxsize=1)
def get_ollama_client() -> OllamaClient:
    return OllamaClient(get_ollama_config())


def require_token(x_batteryai_token: str | None = Header(default=None)) -> None:
    if not x_batteryai_token or not secrets.compare_digest(x_batteryai_token, PAIRING_TOKEN):
        raise HTTPException(status_code=401, detail={"code": "pairing_required", "message": "A valid pairing token is required."})


class CapacityGate:
    def __init__(self, capacity: int) -> None:
        self.capacity = capacity
        self._active = 0
        self._lock = threading.Lock()

    def try_acquire(self) -> bool:
        with self._lock:
            if self._active >= self.capacity:
                return False
            self._active += 1
            return True

    def release(self) -> None:
        with self._lock:
            self._active -= 1


class SlidingWindowRateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            events = self._requests[key]
            while events and events[0] <= now - self.window_seconds:
                events.popleft()
            if len(events) >= self.limit:
                return False
            events.append(now)
            return True


def api_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def create_app(config: DeploymentConfig | None = None) -> FastAPI:
    deployment = config or load_deployment_config(ROOT)
    api = FastAPI(
        title="BatteryAI Local Inference",
        version="1.0.0",
        docs_url=None if deployment.remote_enabled else "/docs",
        redoc_url=None if deployment.remote_enabled else "/redoc",
        openapi_url=None if deployment.remote_enabled else "/openapi.json",
    )
    api.state.deployment_config = deployment
    inference_gate = CapacityGate(deployment.maximum_concurrent_inference_requests)
    suggestion_gate = CapacityGate(deployment.maximum_concurrent_suggestion_requests)
    limiter = SlidingWindowRateLimiter(deployment.rate_limit_requests, deployment.rate_limit_window_seconds)

    api.add_middleware(
        CORSMiddleware,
        allow_origins=list(deployment.allowed_frontend_origins),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-BatteryAI-Token"],
        allow_credentials=False,
    )

    @api.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        if request.url.path.startswith("/v1/") and request.headers.get("X-BatteryAI-Token"):
            response.headers["Cache-Control"] = "no-store"
        return response

    async def enforce_rate_limit(request: Request, x_batteryai_token: str | None = Header(default=None)) -> None:
        client = request.client.host if request.client else "unknown"
        token_digest = hashlib.sha256((x_batteryai_token or "").encode("utf-8")).hexdigest()
        if not limiter.allow(f"{client}:{token_digest}"):
            raise api_error(429, "rate_limit_exceeded", "Too many requests. Retry after the configured rate-limit window.")

    protected = [Depends(require_token), Depends(enforce_rate_limit)]

    @api.exception_handler(ValidationError)
    async def validation_exception_handler(request: Request, exc: ValidationError):
        message = "Suggestion input does not satisfy the bounded local-LLM contract." if request.url.path == "/v1/suggestions" else "Input does not satisfy the selected task contract."
        return JSONResponse(status_code=422, content=ErrorDetail(code="validation_error", message=message, details=jsonable_encoder(exc.errors())).model_dump())

    @api.exception_handler(RequestValidationError)
    async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
        message = "Suggestion input does not satisfy the bounded local-LLM contract." if request.url.path == "/v1/suggestions" else "Input does not satisfy the selected task contract."
        return JSONResponse(status_code=422, content=ErrorDetail(code="validation_error", message=message, details=jsonable_encoder(exc.errors())).model_dump())

    @api.exception_handler(SuggestionServiceError)
    async def suggestion_service_exception_handler(_request: Request, exc: SuggestionServiceError):
        return JSONResponse(status_code=exc.status_code, content=ErrorDetail(code=exc.code, message=exc.message, details=exc.details).model_dump())

    @api.get("/health")
    def health() -> dict:
        engine = get_engine()
        return {
            "service": "BatteryAI inference",
            "status": "running",
            "model_loaded": True,
            "model_version": MODEL_VERSION,
            "model_sha256": engine.model_sha256,
            "tasks": {"ev_failure": True, "oxford_soh": True, "rul": False},
            "device": str(engine.device),
        }

    @api.get("/v1/capabilities", dependencies=protected)
    def capabilities() -> dict:
        engine = get_engine()
        return {
            "ready": True,
            "model_loaded": True,
            "model_version": MODEL_VERSION,
            "model_profile": MODEL_PROFILE,
            "model_sha256": engine.model_sha256,
            "device": str(engine.device),
            "cuda_available": torch.cuda.is_available(),
            "active_experts": {"oxford_soh": ACTIVE_EXPERTS, "ev_failure": EV_ACTIVE_EXPERTS},
            "tasks": {"ev_failure": True, "oxford_soh": True, "rul": False},
            "targets": ["snapshot EV failure classification", "next-observed-checkpoint SOH", "predictive uncertainty"],
            "rul_available": False,
        }

    @api.get("/v1/model-profile", dependencies=protected)
    def model_profile() -> dict:
        import json
        return json.loads((ROOT / "packages" / "model_profiles" / "oxford-v1.json").read_text(encoding="utf-8"))

    @api.get("/v1/input-schema", dependencies=protected)
    def input_schema() -> dict:
        import json
        return json.loads((ROOT / "packages" / "contracts" / "oxford-input-schema.json").read_text(encoding="utf-8"))

    @api.post("/v1/infer", response_model=InferenceResponse, dependencies=protected)
    async def infer(payload: InferenceRequest) -> InferenceResponse:
        if not inference_gate.try_acquire():
            raise api_error(429, "inference_capacity_exceeded", "The numerical inference slot is busy. Retry later.")

        def run_prediction() -> InferenceResponse:
            try:
                return get_engine().predict(payload)
            finally:
                inference_gate.release()

        try:
            return await asyncio.wait_for(asyncio.to_thread(run_prediction), timeout=deployment.request_timeout_seconds)
        except TimeoutError as error:
            raise api_error(504, "inference_timeout", "Numerical inference exceeded the configured request timeout.") from error

    @api.post("/api/predict/failure", response_model=FailurePrediction, dependencies=protected)
    async def predict_failure(payload: FailureRequest) -> FailurePrediction:
        if not inference_gate.try_acquire():
            raise api_error(429, "inference_capacity_exceeded", "The numerical inference slot is busy. Retry later.")

        def run_prediction() -> FailurePrediction:
            try:
                return get_engine().predict_failure([payload.snapshot])[0]
            finally:
                inference_gate.release()

        try:
            return await asyncio.wait_for(asyncio.to_thread(run_prediction), timeout=deployment.request_timeout_seconds)
        except TimeoutError as error:
            raise api_error(504, "inference_timeout", "Failure inference exceeded the configured request timeout.") from error

    @api.post("/api/predict/failure/batch", response_model=FailureBatchResponse, dependencies=protected)
    async def predict_failure_batch(payload: FailureBatchRequest) -> FailureBatchResponse:
        if not inference_gate.try_acquire():
            raise api_error(429, "inference_capacity_exceeded", "The numerical inference slot is busy. Retry later.")

        def run_prediction() -> FailureBatchResponse:
            try:
                return FailureBatchResponse(results=get_engine().predict_failure(payload.snapshots))
            finally:
                inference_gate.release()

        try:
            return await asyncio.wait_for(asyncio.to_thread(run_prediction), timeout=deployment.request_timeout_seconds)
        except TimeoutError as error:
            raise api_error(504, "inference_timeout", "Batch failure inference exceeded the configured request timeout.") from error

    @api.get("/v1/llm-capabilities", response_model=OllamaCapabilities, dependencies=protected)
    async def llm_capabilities() -> OllamaCapabilities:
        return await get_ollama_client().capabilities()

    @api.post("/v1/suggestions", response_model=SuggestionResponse, dependencies=protected)
    async def suggestions(payload: SuggestionSummary) -> SuggestionResponse:
        if not suggestion_gate.try_acquire():
            raise api_error(429, "suggestion_capacity_exceeded", "The suggestion generation slot is busy. Retry later.")
        try:
            return await asyncio.wait_for(get_ollama_client().generate(payload), timeout=deployment.request_timeout_seconds)
        except TimeoutError as error:
            raise api_error(504, "suggestion_timeout", "Suggestion generation exceeded the configured request timeout.") from error
        finally:
            suggestion_gate.release()

    return api


app = create_app()


def startup_ollama_capabilities() -> OllamaCapabilities:
    config = get_ollama_config()
    try:
        return asyncio.run(asyncio.wait_for(OllamaClient(config).capabilities(), timeout=min(config.timeout_seconds, 3.0)))
    except Exception as error:
        return OllamaCapabilities(
            reachable=False,
            model_installed=False,
            ready=False,
            endpoint=config.base_url,
            generation_available=False,
            reason=f"Ollama startup check failed: {type(error).__name__}",
        )


def startup_banner(host: str, port: int) -> str:
    engine = get_engine()
    llm = startup_ollama_capabilities()
    correction = f"\nOllama corrective command: {llm.corrective_command}" if llm.corrective_command else ""
    mode = "remote-ready loopback engine" if app.state.deployment_config.remote_enabled else "local engine"
    return (
        f"BatteryAI {mode}\nEndpoint: http://{host}:{port}\nPairing token: {PAIRING_TOKEN}"
        f"\nNumerical device: {engine.device}\nNumerical model SHA-256: {engine.model_sha256}"
        f"\nOllama endpoint: {llm.endpoint}\nOllama model: {llm.model}\nOllama ready: {llm.ready}"
        f"\nOllama status: {llm.reason or 'ready'}{correction}"
    )
