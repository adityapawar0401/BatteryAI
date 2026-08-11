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
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


OLLAMA_MODEL = "llama3.2:3b"
OLLAMA_PULL_COMMAND = f"ollama pull {OLLAMA_MODEL}"
SYSTEM_PROMPT = """You are a battery-health usage advisor.

You receive only:
1. predicted battery State of Health in percent;
2. predictive uncertainty in percentage points.

Translate the health estimate into concise, practical battery-usage guidance.

Focus on:
- whether normal use appears reasonable;
- whether more conservative use may be appropriate;
- whether monitoring should become more frequent;
- whether a follow-up health assessment should be considered;
- whether service or replacement planning may be worth considering;
- what practical actions the user can take next.

Choose exactly one usage_guidance value:
- normal_use: ordinary usage with routine monitoring;
- monitor_more_closely: continued use with closer health monitoring;
- conservative_use: more conservative operation and more frequent follow-up;
- service_or_replacement_review: service or replacement planning and review.

The usage_guidance value is decision-support interpretation, not another numerical prediction and not a safety certification. No authoritative operational thresholds were supplied, so do not invent or cite thresholds.

The predicted State of Health is the primary battery-health signal. Use predictive uncertainty only to moderate confidence in the State of Health interpretation. Do not automatically escalate the usage_guidance category solely because the uncertainty value is relatively large.

Uncertainty may temper the confidence and caution of the language, monitoring recommendations, and need for a follow-up measurement. By itself, uncertainty does not imply that the battery is unhealthy or that the prediction system is poor. Do not describe uncertainty as prediction error, model accuracy, or a probability that the prediction is wrong.

Never say that uncertainty indicates battery degradation, capacity loss, declining performance, performance fluctuations, or particular usage conditions. It only limits confidence in the SOH interpretation. When the SOH interpretation supports ordinary use, keep normal_use and express uncertainty through cautious wording, routine trend comparison, or a follow-up measurement instead of automatically changing the category. Do not suggest service or replacement because of uncertainty alone.

Without inventing numerical thresholds: a very strong SOH estimate may support ordinary use, routine monitoring, and future trend comparison; a moderately degraded estimate may support closer monitoring, conservative operation, and earlier follow-up; a substantially degraded estimate may support conservative operation, service review, or replacement planning.

Describe predictive uncertainty qualitatively rather than quoting its number. If quoting it is truly needed, use percentage points, never percent. Only the predicted SOH may be quoted as a percent.

Never discuss State of Charge or SOC, prediction-system accuracy or performance, training, datasets, calibration, software versions, algorithms, architecture, checkpoints, providers, infrastructure, implementation, RUL, or Remaining Useful Life.

Do not invent battery measurements that were not supplied. Do not invent quantitative operating limits, charge or discharge percentages, temperature limits, schedules, or follow-up dates. Do not discuss a reference or actual SOH value because none was supplied.

The only numerical values you may write are the supplied predicted SOH and supplied predictive uncertainty. Never invent another percentage, threshold, interval, temperature, measurement, or numerical trigger.

Do not claim that the battery is safe or unsafe. Do not issue safety certification. Do not make an unconditional replacement command from one estimate.

Use calm customer-facing language such as normal use is reasonable, continue routine monitoring, use more conservatively, increase monitoring frequency, arrange a follow-up assessment, consider service planning, or consider replacement planning.

Return only the requested structured JSON. The summary must be one concise non-empty paragraph. Provide 2 to 4 non-empty actions and 1 to 3 non-empty cautions."""

PROMPT_PAYLOAD_FIELDS = frozenset({"predicted_soh_percent", "predictive_uncertainty_pp"})

RETRY_CORRECTION = """Use predicted State of Health as the primary battery-health signal. Use predictive uncertainty only to moderate confidence, wording, routine monitoring, or follow-up measurement. Uncertainty alone must not escalate usage_guidance and must not imply degradation, poor battery performance, or poor prediction quality.
Discuss only State of Health, practical battery usage, monitoring, future health comparison, follow-up assessment, and service or replacement planning when supported by SOH. Never use or discuss State of Charge, SOC, model, accuracy, prediction error, probability of being wrong, software, calibration, datasets, RUL, or implementation details.
Return exactly one allowed usage_guidance value, one concise summary paragraph, 2 to 4 non-empty actions, and 1 to 3 non-empty cautions.
Use this safe style if needed: normal use may be reasonable with routine monitoring; compare future health measurements with the current estimate; use operating context before major service or replacement decisions.
Only the supplied predicted SOH and predictive uncertainty may be written as numbers. If uncertainty is quoted, use percentage points, never percent. Do not invent numerical limits, thresholds, schedules, dates, temperatures, or measurements.
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
        ("algorithm", r"\balgorithms?\b"),
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
        ("RUL", r"\bRUL\b"),
        ("Ollama", r"\bOllama\b"),
        ("PIMoE", r"\b(?:Battery[\s-]*)?PIMoE\b"),
        ("Oxford", r"\bOxford\b"),
        ("CUDA", r"\bCUDA\b"),
        ("CPU", r"\bCPU\b"),
        ("Tailscale", r"\bTailscale\b"),
        ("Funnel", r"\bFunnel\b"),
        ("percentage uncertainty", r"\b(?:predictive[\s-]+)?uncertainty\b(?:(?!\b(?:SOH|state[\s-]+of[\s-]+health)\b)[^.!?\r\n]){0,60}\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*%\s+(?:of[\s-]+)?(?:predictive[\s-]+)?uncertainty\b"),
        ("invented quantitative advice", r"\b(?:in|within|every|after)[\s-]+(?:(?:about|approximately|roughly)[\s-]+)?\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?[\s-]*(?:hours?|days?|weeks?|months?|years?)\b|(?:\b(?:above|below|under|over)[\s-]+|[<>]=?\s*)-?\d+(?:\.\d+)?\s*°?\s*[CFK]\b|\b(?:charg(?:e|ed|ing)|discharg(?:e|ed|ing)|usage[\s-]+frequency)\b[^.!?\r\n]{0,80}\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*%"),
        ("safety claim", r"\b(?:battery|it)[\s-]+(?:is|appears|seems)[\s-]+(?:safe|unsafe)\b"),
        ("mandatory maintenance", r"\bmaintenance[\s-]+is[\s-]+(?:mandatory|required|necessary)\b|\bmust\b[^.!?]{0,80}\bmaintenance\b|\bmaintenance\b[^.!?]{0,80}\bmust\b"),
        ("mandatory replacement", r"\bmust[\s-]+be[\s-]+replaced\b|\breplace[\s-]+(?:the[\s-]+battery[\s-]+)?immediately\b|\breplacement[\s-]+is[\s-]+(?:mandatory|required|necessary)\b"),
    )
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OllamaConfig(StrictModel):
    provider: Literal["ollama"] = "ollama"
    enabled: bool = True
    base_url: str = "http://127.0.0.1:11434"
    model: Literal["llama3.2:3b"] = OLLAMA_MODEL
    temperature: float = Field(default=0.2, ge=0, le=0.2)
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

# No authoritative operational SOH thresholds exist in project configuration.
# This enum is customer-facing decision support selected from the two-field LLM
# input, not another numerical prediction or a safety classification.
UsageGuidance = Literal["normal_use", "monitor_more_closely", "conservative_use", "service_or_replacement_review"]


def _normalize_generated_text(value: str) -> str:
    normalized = re.sub(r"\s*\u2014\s*", ", ", value).strip()
    normalized = re.sub(r"\u2248\s*", "about ", normalized)
    normalized = re.sub(
        r"(\b(?:predictive[\s-]+)?uncertainty\b(?:(?!\b(?:SOH|state[\s-]+of[\s-]+health)\b)[^.!?\r\n]){0,60}?)(\d+(?:\.\d+)?)\s*%",
        r"\1\2 percentage points",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"(\d+(?:\.\d+)?)\s*%(\s+(?:of[\s-]+)?(?:predictive[\s-]+)?uncertainty\b)",
        r"\1 percentage points\2",
        normalized,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\bpercentage[\s-]+points?[\s-]+points?\b", "percentage points", normalized, flags=re.IGNORECASE)


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
    usage_guidance: UsageGuidance = Field(
        description="Decision-support usage category selected from SOH and predictive uncertainty without fixed thresholds.",
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
        trimmed = _normalize_generated_text(value)
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
            normalized = _normalize_generated_text(item)
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


class SuggestionContentError(ValueError):
    pass


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
            except (ValidationError, SuggestionContentError):
                retry_request = {
                    **request,
                    "messages": [*request["messages"], {"role": "system", "content": RETRY_CORRECTION}],
                }
                data = await self._json("POST", "/api/chat", json=retry_request)
                try:
                    suggestions = _parse_suggestion_content(data)
                except (ValidationError, SuggestionContentError) as error:
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
    draft = SuggestionContent.model_validate(parsed)
    summary_issue = _unsupported_subject(draft.summary)
    if summary_issue is not None:
        raise SuggestionContentError(f"unsupported generated summary subject: {summary_issue}")

    actions = [item for item in draft.actions if _unsupported_subject(item) is None]
    cautions = [item for item in draft.cautions if _unsupported_subject(item) is None]
    if len(actions) < 2 or len(cautions) < 1:
        raise SuggestionContentError("generated suggestions did not retain the minimum usable items")
    return SuggestionContent.model_validate({
        "summary": draft.summary,
        "usage_guidance": draft.usage_guidance,
        "actions": actions,
        "cautions": cautions,
    })


def _unsupported_subject(value: str) -> str | None:
    for label, pattern in FORBIDDEN_OUTPUT_PATTERNS:
        if pattern.search(value):
            return label
    return None

def _duration_ms(value: object) -> float | None:
    return float(value) / 1_000_000 if isinstance(value, (int, float)) and value >= 0 else None


def _optional_nonnegative_int(value: object) -> int | None:
    return int(value) if isinstance(value, int) and value >= 0 else None
