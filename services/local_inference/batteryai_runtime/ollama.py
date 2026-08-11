from __future__ import annotations

import asyncio
import json
import math
import os
import re
import time
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator


OLLAMA_MODEL = "llama3.2:3b"
OLLAMA_PULL_COMMAND = f"ollama pull {OLLAMA_MODEL}"
SYSTEM_PROMPT = """You are a battery-health decision-support assistant.

You receive only:
1. a predicted State of Health percentage;
2. the predictive uncertainty in percentage points.

Provide concise customer-facing interpretation and practical follow-up suggestions based only on those values.

State of Health means SOH.

Do not discuss State of Charge or SOC.

Do not evaluate, criticize, rank, diagnose, or speculate about the prediction model.

Do not mention model accuracy, model performance, training, calibration, software versions, datasets, architecture, checkpoints, providers, infrastructure, input quality, bias, or implementation details.

Do not invent battery measurements that were not supplied.

Do not estimate RUL.

Do not claim safety certification.

Do not claim that maintenance is mandatory based on the prediction alone.

Focus on:
- what the predicted SOH means operationally;
- whether continued monitoring would be appropriate;
- whether closer inspection or follow-up measurement may be sensible;
- how the stated predictive uncertainty should affect interpretation.

Treat predictive uncertainty as uncertainty around the estimate, not evidence that the model is good or bad.

Use calm, practical language.

Write every sentence directly about battery SOH, predictive uncertainty, monitoring, follow-up measurement, inspection, operating context, or planning. Do not add disclaimers about excluded topics.

Return only the requested structured JSON. The summary must be one concise non-empty paragraph. Provide 2 to 4 non-empty actions and 1 to 3 non-empty cautions."""

PROMPT_PAYLOAD_FIELDS = frozenset({"predicted_soh_percent", "predictive_uncertainty_pp"})

RETRY_CORRECTION = """Discuss only State of Health and its predictive uncertainty. Do not discuss State of Charge, model performance, input quality, software, calibration, or implementation details.
Rewrite from scratch using only battery-health interpretation, monitoring, follow-up measurement, inspection, operating context, and planning. Return one concise non-empty summary paragraph, 2 to 4 non-empty actions, and 1 to 3 non-empty cautions.
If unsure, stay within this safe writing pattern:
- Summary: The estimated battery State of Health should be interpreted together with its stated predictive uncertainty.
- Actions: Continue monitoring State of Health as new measurements become available. Compare the next analysis with the current result to identify any trend.
- Caution: Use repeated measurements and operating context before making major maintenance decisions.
Do not add other subjects."""


FORBIDDEN_OUTPUT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (label, re.compile(pattern, re.IGNORECASE))
    for label, pattern in (
        ("State of Charge", r"\bstate[\s-]+of[\s-]+charge\b"),
        ("SOC", r"\bSOC\b"),
        ("model commentary", r"\bmodel(?:s|ing)?\b"),
        ("accuracy", r"\baccurac(?:y|ies)\b"),
        ("error rate", r"\berror[\s-]+rates?\b"),
        ("prediction error", r"\bprediction[\s-]+errors?\b"),
        ("bias", r"\bbias(?:ed|es)?\b"),
        ("input quality", r"\binput[\s-]+quality\b"),
        ("software", r"\bsoftware\b"),
        ("calibration", r"\bcalibrat(?:e|ed|es|ing|ion|ions)\b"),
        ("user manual", r"\buser[\s-]+manual\b"),
        ("training", r"\btraining\b"),
        ("dataset", r"\bdatasets?\b"),
        ("architecture", r"\barchitectures?\b"),
        ("checkpoint", r"\bcheckpoints?\b"),
        ("provider", r"\bproviders?\b"),
        ("infrastructure", r"\binfrastructure\b"),
        ("implementation", r"\bimplementation\b"),
        ("backend", r"\bback[\s-]?ends?\b"),
        ("host machine", r"\bhost[\s-]+machines?\b"),
        ("host computer", r"\bhost[\s-]+computers?\b"),
        ("deployment", r"\bdeployments?\b"),
        ("remaining useful life", r"\bremaining[\s-]+useful[\s-]+life\b"),
        ("end of life", r"\bend[\s-]+of[\s-]+life\b"),
        ("RUL", r"\bRUL\b"),
        ("Ollama", r"\bOllama\b"),
        ("PIMoE", r"\b(?:Battery[\s-]*)?PIMoE\b"),
        ("Oxford", r"\bOxford\b"),
        ("CUDA", r"\bCUDA\b"),
        ("CPU", r"\bCPU\b"),
        ("actual SOH", r"\bactual[\s-]+SOH\b"),
        ("reference SOH", r"\breference[\s-]+SOH\b"),
        ("estimate reliability", r"\breliable[\s-]+(?:prediction|estimate|result|analysis)\b|\b(?:prediction|estimate|result|analysis)[\s-]+is[\s-]+reliable\b"),
        ("mandatory maintenance", r"\bmaintenance[\s-]+is[\s-]+(?:mandatory|required|necessary)\b|\bmust\b[^.!?]{0,80}\bmaintenance\b|\bmaintenance\b[^.!?]{0,80}\bmust\b"),
    )
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OllamaConfig(StrictModel):
    provider: Literal["ollama"] = "ollama"
    enabled: bool = True
    base_url: str = "http://127.0.0.1:11434"
    model: Literal["llama3.2:3b"] = OLLAMA_MODEL
    temperature: float = Field(default=0.1, ge=0, le=0.3)
    num_predict: int = Field(default=300, ge=64, le=512)
    num_ctx: int = Field(default=2048, ge=512, le=4096)
    keep_alive: str = Field(default="5m", min_length=1, max_length=32)
    timeout_seconds: float = Field(default=120, ge=1, le=300)

    @field_validator("base_url")
    @classmethod
    def loopback_http_only(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("Ollama URL must use HTTP on localhost, 127.0.0.1, or ::1")
        if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
            raise ValueError("Ollama URL must not contain credentials, query, fragment, or an API path")
        if parsed.port is not None and not 1 <= parsed.port <= 65535:
            raise ValueError("Ollama URL port is invalid")
        return value.rstrip("/")

    @field_validator("keep_alive")
    @classmethod
    def safe_keep_alive(cls, value: str) -> str:
        if any(character.isspace() or ord(character) < 32 for character in value):
            raise ValueError("Ollama keep_alive must be one compact duration value")
        return value


BoundedText = Annotated[str, Field(min_length=1, max_length=500)]


class SuggestionSummary(StrictModel):
    model_profile: str = Field(min_length=1, max_length=64)
    model_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    predicted_soh: float = Field(ge=-100, le=300)
    predictive_std: float = Field(ge=0, le=200)
    actual_soh: float | None = Field(default=None, ge=0, le=150)
    absolute_error: float | None = Field(default=None, ge=0, le=300)
    input_quality: list[BoundedText] = Field(default_factory=list, max_length=10)
    active_experts: list[BoundedText] = Field(min_length=1, max_length=10)
    limitations: list[BoundedText] = Field(min_length=1, max_length=10)
    backend: Literal["local-pytorch", "browser-onnx"]
    runtime_device: str = Field(min_length=1, max_length=64)

    @field_validator("predicted_soh", "predictive_std", "actual_soh", "absolute_error")
    @classmethod
    def finite_numbers(cls, value: float | None) -> float | None:
        if value is not None and not math.isfinite(value):
            raise ValueError("suggestion summary numbers must be finite")
        return value


class SuggestionContent(StrictModel):
    summary: str = Field(
        min_length=1,
        max_length=1000,
        description="One calm customer-facing paragraph interpreting only the battery's predicted State of Health and predictive uncertainty.",
    )
    actions: list[BoundedText] = Field(
        min_length=2,
        max_length=4,
        description="Two to four practical battery monitoring, follow-up measurement, inspection, or planning suggestions based only on SOH and predictive uncertainty.",
    )
    cautions: list[BoundedText] = Field(
        min_length=1,
        max_length=3,
        description="One to three points about interpreting the SOH estimate with predictive uncertainty and operating context.",
    )

    @field_validator("summary", mode="before")
    @classmethod
    def trim_nonempty_summary(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("summary must be a string")
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("summary must not be blank")
        return trimmed

    @field_validator("actions", "cautions", mode="before")
    @classmethod
    def trim_nonempty_items(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        trimmed: list[str] = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError("suggestion items must be strings")
            normalized = item.strip()
            if not normalized:
                raise ValueError("suggestion items must not be blank")
            trimmed.append(normalized)
        return trimmed

    @field_validator("summary")
    @classmethod
    def no_html_summary(cls, value: str) -> str:
        if "<" in value or ">" in value:
            raise ValueError("generated HTML is not allowed")
        if "\n" in value or "\r" in value:
            raise ValueError("summary must be one paragraph")
        return value

    @field_validator("actions", "cautions")
    @classmethod
    def no_html_items(cls, values: list[str]) -> list[str]:
        if any("<" in value or ">" in value for value in values):
            raise ValueError("generated HTML is not allowed")
        return values

    @model_validator(mode="after")
    def reject_unsupported_subjects(self) -> "SuggestionContent":
        generated_text = "\n".join((self.summary, *self.actions, *self.cautions))
        for label, pattern in FORBIDDEN_OUTPUT_PATTERNS:
            if pattern.search(generated_text):
                raise ValueError(f"unsupported generated subject: {label}")
        return self


class OllamaCapabilities(StrictModel):
    provider: Literal["ollama"] = "ollama"
    model: Literal["llama3.2:3b"] = OLLAMA_MODEL
    reachable: bool
    model_installed: bool
    ready: bool
    endpoint: str
    generation_available: bool
    reason: str | None = None
    corrective_command: str | None = None
    version: str | None = None


class SuggestionTiming(StrictModel):
    total_ms: float = Field(ge=0)
    ollama_total_ms: float | None = Field(default=None, ge=0)
    load_ms: float | None = Field(default=None, ge=0)
    prompt_eval_count: int | None = Field(default=None, ge=0)
    eval_count: int | None = Field(default=None, ge=0)


class SuggestionResponse(StrictModel):
    provider: Literal["ollama"] = "ollama"
    model: Literal["llama3.2:3b"] = OLLAMA_MODEL
    suggestions: SuggestionContent
    timing: SuggestionTiming
    done_reason: str | None = Field(default=None, max_length=64)


class SuggestionServiceError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 503, details: object | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


def load_ollama_config(root: Path) -> OllamaConfig:
    data = json.loads((root / "configs" / "ollama.json").read_text(encoding="utf-8"))
    overrides = {
        "enabled": os.environ.get("BATTERYAI_OLLAMA_ENABLED"),
        "base_url": os.environ.get("BATTERYAI_OLLAMA_URL"),
        "model": os.environ.get("BATTERYAI_OLLAMA_MODEL"),
        "timeout_seconds": os.environ.get("BATTERYAI_OLLAMA_TIMEOUT_SECONDS"),
        "keep_alive": os.environ.get("BATTERYAI_OLLAMA_KEEP_ALIVE"),
        "num_ctx": os.environ.get("BATTERYAI_OLLAMA_NUM_CTX"),
        "num_predict": os.environ.get("BATTERYAI_OLLAMA_NUM_PREDICT"),
        "temperature": os.environ.get("BATTERYAI_OLLAMA_TEMPERATURE"),
    }
    for key, value in overrides.items():
        if value is not None:
            data[key] = value
    if isinstance(data.get("enabled"), str):
        normalized = data["enabled"].strip().lower()
        if normalized not in {"true", "false", "1", "0"}:
            raise ValueError("BATTERYAI_OLLAMA_ENABLED must be true or false")
        data["enabled"] = normalized in {"true", "1"}
    return OllamaConfig.model_validate(data)


class OllamaClient:
    def __init__(self, config: OllamaConfig, client: httpx.AsyncClient | None = None) -> None:
        self.config = config
        self._client = client
        self._generation_lock = asyncio.Lock()

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        try:
            if self._client is not None:
                response = await self._client.request(method, path, **kwargs)
            else:
                async with httpx.AsyncClient(base_url=self.config.base_url, timeout=self.config.timeout_seconds, follow_redirects=False) as client:
                    response = await client.request(method, path, **kwargs)
        except httpx.TimeoutException as error:
            raise SuggestionServiceError("ollama_timeout", f"Ollama did not respond within {self.config.timeout_seconds:g} seconds.", 504) from error
        except httpx.RequestError as error:
            raise SuggestionServiceError("ollama_unavailable", "Ollama is unavailable on the configured loopback endpoint.", 503) from error
        if response.status_code >= 400:
            detail = response.text.strip()[:500]
            message = "Ollama could not complete the local request."
            if "memory" in detail.lower() or "alloc" in detail.lower():
                message = "Ollama could not allocate enough resources for llama3.2:3b."
            raise SuggestionServiceError("ollama_request_failed", message, 503, {"status": response.status_code, "ollama_error": detail})
        return response

    async def _json(self, method: str, path: str, **kwargs) -> dict:
        response = await self._request(method, path, **kwargs)
        try:
            data = response.json()
        except ValueError as error:
            raise SuggestionServiceError("ollama_response_invalid", "Ollama returned malformed JSON.", 502) from error
        if not isinstance(data, dict):
            raise SuggestionServiceError("ollama_response_invalid", "Ollama returned an unexpected response shape.", 502)
        return data

    async def capabilities(self) -> OllamaCapabilities:
        if not self.config.enabled:
            return OllamaCapabilities(reachable=False, model_installed=False, ready=False, endpoint=self.config.base_url, generation_available=False, reason="Local suggestions are disabled by configuration.")
        try:
            version, installed = await self._probe()
        except SuggestionServiceError as error:
            return OllamaCapabilities(reachable=False, model_installed=False, ready=False, endpoint=self.config.base_url, generation_available=False, reason=error.message)
        return OllamaCapabilities(
            reachable=True,
            model_installed=installed,
            ready=installed,
            endpoint=self.config.base_url,
            generation_available=installed,
            reason=None if installed else f"Configured Ollama model {self.config.model} is not installed.",
            corrective_command=None if installed else OLLAMA_PULL_COMMAND,
            version=version,
        )

    async def generate(self, summary: SuggestionSummary) -> SuggestionResponse:
        if not self.config.enabled:
            raise SuggestionServiceError("ollama_disabled", "Local suggestions are disabled by configuration.", 503)
        _version, installed = await self._probe()
        if not installed:
            raise SuggestionServiceError("ollama_model_missing", f"Ollama model {self.config.model} is not installed. Run: {OLLAMA_PULL_COMMAND}", 503, {"corrective_command": OLLAMA_PULL_COMMAND})
        prompt_payload = {
            "predicted_soh_percent": summary.predicted_soh,
            "predictive_uncertainty_pp": summary.predictive_std,
        }
        if frozenset(prompt_payload) != PROMPT_PAYLOAD_FIELDS:
            raise AssertionError("AI Insights prompt payload field boundary changed")
        prompt_data = json.dumps(prompt_payload, separators=(",", ":"), allow_nan=False)
        user_message = "BEGIN BATTERYAI_PREDICTION_DATA\n" + prompt_data + "\nEND BATTERYAI_PREDICTION_DATA"
        request = {
            "model": self.config.model,
            "stream": False,
            "format": SuggestionContent.model_json_schema(),
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_message}],
            "options": {"temperature": self.config.temperature, "num_predict": self.config.num_predict, "num_ctx": self.config.num_ctx},
            "keep_alive": self.config.keep_alive,
        }
        started = time.perf_counter()
        async with self._generation_lock:
            data = await self._json("POST", "/api/chat", json=request)
            try:
                suggestions = _parse_suggestion_content(data)
            except ValidationError:
                retry_request = {
                    **request,
                    "messages": [*request["messages"], {"role": "system", "content": RETRY_CORRECTION}],
                }
                data = await self._json("POST", "/api/chat", json=retry_request)
                try:
                    suggestions = _parse_suggestion_content(data)
                except ValidationError as error:
                    raise SuggestionServiceError("incomplete_suggestions", "The local LLM returned incomplete structured suggestions.", 502) from error
        total_ms = (time.perf_counter() - started) * 1000
        return SuggestionResponse(
            suggestions=suggestions,
            timing=SuggestionTiming(
                total_ms=total_ms,
                ollama_total_ms=_duration_ms(data.get("total_duration")),
                load_ms=_duration_ms(data.get("load_duration")),
                prompt_eval_count=_optional_nonnegative_int(data.get("prompt_eval_count")),
                eval_count=_optional_nonnegative_int(data.get("eval_count")),
            ),
            done_reason=str(data.get("done_reason"))[:64] if data.get("done_reason") is not None else None,
        )

    async def _probe(self) -> tuple[str | None, bool]:
        version_data = await self._json("GET", "/api/version")
        tag_data = await self._json("GET", "/api/tags")
        models = tag_data.get("models", [])
        model_items = models if isinstance(models, list) else []
        installed = any(isinstance(item, dict) and (item.get("name") == self.config.model or item.get("model") == self.config.model) for item in model_items)
        version = str(version_data.get("version")) if version_data.get("version") is not None else None
        return version, installed


def _parse_suggestion_content(data: dict) -> SuggestionContent:
    content = data.get("message", {}).get("content") if isinstance(data.get("message"), dict) else None
    if not isinstance(content, str):
        raise SuggestionServiceError("ollama_response_invalid", "Ollama response did not contain assistant message content.", 502)
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as error:
        raise SuggestionServiceError("ollama_response_invalid", "Ollama assistant content was not valid JSON.", 502) from error
    return SuggestionContent.model_validate(parsed)

def _duration_ms(value: object) -> float | None:
    return float(value) / 1_000_000 if isinstance(value, (int, float)) and value >= 0 else None


def _optional_nonnegative_int(value: object) -> int | None:
    return int(value) if isinstance(value, int) and value >= 0 else None
