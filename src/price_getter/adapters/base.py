from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from price_getter.config import SourceConfig, TargetConfig

DEFAULT_HEADERS = {
    "User-Agent": "price-getter/0.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.6,en;q=0.5",
}


class AdapterError(RuntimeError):
    """Raised when an adapter cannot fetch or parse a target."""


@dataclass(frozen=True)
class PriceObservation:
    title: str | None = None
    seller: str | None = None
    price_irr: int | None = None
    availability: str = "unknown"
    raw_observation: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class FetchContext:
    source: SourceConfig
    target: TargetConfig
    client: httpx.Client


class PriceAdapter(Protocol):
    name: str

    def fetch(self, context: FetchContext) -> PriceObservation:
        ...


def request_text(context: FetchContext) -> tuple[str, int]:
    headers = DEFAULT_HEADERS | context.source.headers
    try:
        response = context.client.get(context.target.url, headers=headers)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise AdapterError(f"HTTP request failed: {exc}") from exc
    return response.text, response.status_code
