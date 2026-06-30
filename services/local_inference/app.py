from __future__ import annotations

import asyncio
import os
import secrets
from functools import lru_cache
from pathlib import Path

import torch
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError

from .batteryai_runtime.contracts import ACTIVE_EXPERTS, ErrorDetail, InferenceRequest, InferenceResponse
from .batteryai_runtime.engine import BatteryAIEngine, MODEL_PROFILE
from .batteryai_runtime.ollama import (
    OLLAMA_PULL_COMMAND,
    OllamaCapabilities,
    OllamaClient,
    OllamaConfig,
    SuggestionResponse,
    SuggestionServiceError,
    SuggestionSummary,
    load_ollama_config,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACT_DIR = ROOT / "_inputs" / "artifacts" / "oxford_final"
PAIRING_TOKEN = os.environ.get("BATTERYAI_PAIRING_TOKEN") or secrets.token_urlsafe(32)


def artifact_dir_from_environment() -> Path:
    artifact_dir = Path(os.environ.get("BATTERYAI_ARTIFACT_DIR", str(DEFAULT_ARTIFACT_DIR))).resolve()
    try:
        artifact_dir.relative_to(ROOT.resolve())
    except ValueError as error:
        raise ValueError("BATTERYAI_ARTIFACT_DIR must remain inside the deployment repository") from error
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
        raise HTTPException(status_code=401, detail={"code": "pairing_required", "message": "A valid local pairing token is required."})


app = FastAPI(title="BatteryAI Local Inference", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https://[^/]+\.github\.io",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-BatteryAI-Token"],
    allow_credentials=False,
)


@app.exception_handler(ValidationError)
async def validation_exception_handler(_request: Request, exc: ValidationError):
    message = "Suggestion input does not satisfy the bounded local-LLM contract." if _request.url.path == "/v1/suggestions" else "Input does not satisfy the Oxford V1 contract."
    return JSONResponse(status_code=422, content=ErrorDetail(code="validation_error", message=message, details=jsonable_encoder(exc.errors())).model_dump())


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_request: Request, exc: RequestValidationError):
    message = "Suggestion input does not satisfy the bounded local-LLM contract." if _request.url.path == "/v1/suggestions" else "Input does not satisfy the Oxford V1 contract."
    return JSONResponse(status_code=422, content=ErrorDetail(code="validation_error", message=message, details=jsonable_encoder(exc.errors())).model_dump())


@app.exception_handler(SuggestionServiceError)
async def suggestion_service_exception_handler(_request: Request, exc: SuggestionServiceError):
    return JSONResponse(status_code=exc.status_code, content=ErrorDetail(code=exc.code, message=exc.message, details=exc.details).model_dump())


@app.get("/health")
def health() -> dict:
    return {"service": "BatteryAI local inference", "status": "running"}


@app.get("/v1/capabilities", dependencies=[Depends(require_token)])
def capabilities() -> dict:
    engine = get_engine()
    return {
        "ready": True,
        "model_profile": MODEL_PROFILE,
        "model_sha256": engine.model_sha256,
        "device": str(engine.device),
        "cuda_available": torch.cuda.is_available(),
        "active_experts": ACTIVE_EXPERTS,
        "targets": ["next-observed-checkpoint SOH", "predictive uncertainty"],
        "rul_available": False,
    }


@app.get("/v1/model-profile", dependencies=[Depends(require_token)])
def model_profile() -> dict:
    import json

    return json.loads((ROOT / "packages" / "model_profiles" / "oxford-v1.json").read_text(encoding="utf-8"))


@app.get("/v1/input-schema", dependencies=[Depends(require_token)])
def input_schema() -> dict:
    import json

    return json.loads((ROOT / "packages" / "contracts" / "oxford-input-schema.json").read_text(encoding="utf-8"))


@app.post("/v1/infer", response_model=InferenceResponse, dependencies=[Depends(require_token)])
def infer(payload: InferenceRequest) -> InferenceResponse:
    return get_engine().predict(payload)


@app.get("/v1/llm-capabilities", response_model=OllamaCapabilities, dependencies=[Depends(require_token)])
async def llm_capabilities() -> OllamaCapabilities:
    return await get_ollama_client().capabilities()


@app.post("/v1/suggestions", response_model=SuggestionResponse, dependencies=[Depends(require_token)])
async def suggestions(payload: SuggestionSummary) -> SuggestionResponse:
    return await get_ollama_client().generate(payload)


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
    return (
        f"BatteryAI local engine\nEndpoint: http://{host}:{port}\nPairing token: {PAIRING_TOKEN}"
        f"\nNumerical device: {engine.device}\nNumerical model SHA-256: {engine.model_sha256}"
        f"\nOllama endpoint: {llm.endpoint}\nOllama model: {llm.model}\nOllama ready: {llm.ready}"
        f"\nOllama status: {llm.reason or 'ready'}{correction}"
    )
