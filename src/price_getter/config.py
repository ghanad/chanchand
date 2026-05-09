from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, PositiveInt, ValidationError, field_validator, model_validator

AdapterName = Literal["generic_html", "digikala"]

KEY_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


class ConfigLoadError(ValueError):
    """Raised when a config file cannot be loaded or validated."""


class SourceConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    adapter: AdapterName
    timeout_seconds: float = Field(default=15.0, gt=0)
    rate_limit_seconds: float = Field(default=2.0, ge=0)
    currency: str = "IRR"
    price_multiplier: PositiveInt = 1
    headers: dict[str, str] = Field(default_factory=dict)
    settings: dict[str, Any] = Field(default_factory=dict)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("currency cannot be empty")
        return value


class ProductConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value


class TargetConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_key: str
    source_key: str
    url: str
    enabled: bool = True
    adapter_settings: dict[str, Any] = Field(default_factory=dict)

    @field_validator("product_key", "source_key")
    @classmethod
    def key_shape(cls, value: str) -> str:
        if not KEY_RE.match(value):
            raise ValueError("keys may contain only letters, numbers, dots, underscores, and dashes")
        return value

    @field_validator("url")
    @classmethod
    def public_http_url(cls, value: str) -> str:
        value = value.strip()
        if not value.startswith(("http://", "https://")):
            raise ValueError("url must be an http(s) URL")
        return value


class AppConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sources: dict[str, SourceConfig]
    products: dict[str, ProductConfig]
    targets: list[TargetConfig]

    @model_validator(mode="after")
    def validate_references(self) -> "AppConfig":
        _validate_mapping_keys("sources", self.sources)
        _validate_mapping_keys("products", self.products)

        if not self.sources:
            raise ValueError("at least one source is required")
        if not self.products:
            raise ValueError("at least one product is required")

        missing_products = sorted({target.product_key for target in self.targets} - set(self.products))
        missing_sources = sorted({target.source_key for target in self.targets} - set(self.sources))

        if missing_products:
            raise ValueError(f"targets reference unknown products: {', '.join(missing_products)}")
        if missing_sources:
            raise ValueError(f"targets reference unknown sources: {', '.join(missing_sources)}")
        return self

    def active_targets(self) -> list[TargetConfig]:
        return [target for target in self.targets if target.enabled]


def _validate_mapping_keys(name: str, values: dict[str, Any]) -> None:
    invalid = sorted(key for key in values if not KEY_RE.match(key))
    if invalid:
        raise ValueError(f"{name} contain invalid keys: {', '.join(invalid)}")


def load_config(path: str | Path) -> AppConfig:
    path = Path(path)
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ConfigLoadError(f"cannot read config {path}: {exc}") from exc
    except yaml.YAMLError as exc:
        raise ConfigLoadError(f"invalid YAML in {path}: {exc}") from exc

    if raw is None:
        raise ConfigLoadError(f"config {path} is empty")
    if not isinstance(raw, dict):
        raise ConfigLoadError(f"config {path} must be a YAML mapping")

    try:
        return AppConfig.model_validate(raw)
    except ValidationError as exc:
        raise ConfigLoadError(str(exc)) from exc
