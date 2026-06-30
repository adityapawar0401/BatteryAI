from __future__ import annotations

import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


LOCAL_FRONTEND_ORIGINS = ("http://127.0.0.1:5173", "http://localhost:5173")


def parse_boolean(value: object, name: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in {"1", "true"}:
        return True
    if isinstance(value, str) and value.strip().lower() in {"0", "false"}:
        return False
    raise ValueError(f"{name} must be true, false, 1, or 0")


def validate_remote_api_url(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme != "https":
        raise ValueError("remote_api_url must use HTTPS")
    if parsed.username or parsed.password:
        raise ValueError("remote_api_url must not contain credentials")
    if parsed.query or parsed.fragment:
        raise ValueError("remote_api_url must not contain a query string or fragment")
    if parsed.path not in {"", "/"}:
        raise ValueError("remote_api_url must not contain an API path")
    hostname = (parsed.hostname or "").lower()
    if not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net", hostname):
        raise ValueError("remote_api_url hostname must end in .ts.net")
    if parsed.port not in {None, 443}:
        raise ValueError("remote_api_url must use the standard HTTPS port")
    return f"https://{hostname}"


def validate_frontend_origin(value: str) -> str:
    parsed = urlsplit(value)
    if value == "*" or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("allowed frontend origins must be exact origins without credentials, query, or fragment")
    if parsed.path not in {"", "/"}:
        raise ValueError("allowed frontend origins must not contain paths")
    if parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"} and parsed.port == 5173:
        return f"http://{parsed.hostname}:5173"
    if parsed.scheme == "https" and parsed.port is None and parsed.hostname and parsed.hostname.endswith(".github.io"):
        return f"https://{parsed.hostname.lower()}"
    raise ValueError("allowed frontend origins must be Vite loopback or an exact HTTPS github.io origin")


class DeploymentConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    remote_enabled: bool = False
    remote_api_url: str | None = None
    allowed_frontend_origins: tuple[str, ...] = LOCAL_FRONTEND_ORIGINS
    request_timeout_seconds: float = Field(default=180, ge=1, le=600)
    maximum_concurrent_inference_requests: int = Field(default=1, ge=1, le=16)
    maximum_concurrent_suggestion_requests: int = Field(default=1, ge=1, le=16)
    rate_limit_requests: int = Field(default=60, ge=1, le=10_000)
    rate_limit_window_seconds: int = Field(default=60, ge=1, le=3600)

    @field_validator("remote_api_url")
    @classmethod
    def remote_url_is_exact_funnel(cls, value: str | None) -> str | None:
        return validate_remote_api_url(value) if value else None

    @field_validator("allowed_frontend_origins")
    @classmethod
    def origins_are_exact(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        normalized = tuple(validate_frontend_origin(value) for value in values)
        if not normalized or len(set(normalized)) != len(normalized):
            raise ValueError("allowed_frontend_origins must contain unique exact origins")
        return normalized

    @model_validator(mode="after")
    def remote_requires_public_configuration(self) -> "DeploymentConfig":
        if self.remote_enabled and not self.remote_api_url:
            raise ValueError("remote_api_url is required when remote_enabled is true")
        if self.remote_enabled and not any(origin.startswith("https://") for origin in self.allowed_frontend_origins):
            raise ValueError("remote mode requires an exact HTTPS GitHub Pages origin")
        return self


def load_deployment_config(root: Path) -> DeploymentConfig:
    path = root / "configs" / "deployment.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    mapping = {
        "remote_enabled": "BATTERYAI_REMOTE_MODE",
        "remote_api_url": "BATTERYAI_REMOTE_API_URL",
        "request_timeout_seconds": "BATTERYAI_REQUEST_TIMEOUT_SECONDS",
        "maximum_concurrent_inference_requests": "BATTERYAI_MAXIMUM_CONCURRENT_INFERENCE_REQUESTS",
        "maximum_concurrent_suggestion_requests": "BATTERYAI_MAXIMUM_CONCURRENT_SUGGESTION_REQUESTS",
        "rate_limit_requests": "BATTERYAI_RATE_LIMIT_REQUESTS",
        "rate_limit_window_seconds": "BATTERYAI_RATE_LIMIT_WINDOW_SECONDS",
    }
    for key, environment_name in mapping.items():
        if environment_name in os.environ:
            data[key] = os.environ[environment_name]
    if "BATTERYAI_ALLOWED_FRONTEND_ORIGINS" in os.environ:
        configured = [part.strip() for part in os.environ["BATTERYAI_ALLOWED_FRONTEND_ORIGINS"].split(",") if part.strip()]
        data["allowed_frontend_origins"] = list(dict.fromkeys([*LOCAL_FRONTEND_ORIGINS, *configured]))
    if "remote_enabled" in data:
        data["remote_enabled"] = parse_boolean(data["remote_enabled"], "BATTERYAI_REMOTE_MODE")
    return DeploymentConfig.model_validate(data)
