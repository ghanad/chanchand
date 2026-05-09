from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx

from price_getter.adapters.base import AdapterError, FetchContext, PriceObservation
from price_getter.config import SourceConfig, TargetConfig
from price_getter.pricing import parse_price_to_irr

BRSAPI_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.6,en;q=0.5",
}

DEFAULT_API_KEY_ENV = "brsapi_api"
DEFAULT_CACHE_TTL_SECONDS = 30.0


class BrsapiMarketAdapter:
    name = "brsapi_market"

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, dict[str, Any], int]] = {}

    def fetch(self, context: FetchContext) -> PriceObservation:
        settings = context.source.settings | context.target.adapter_settings
        api_key_env = str(settings.get("api_key_env") or DEFAULT_API_KEY_ENV)
        api_key = _resolve_api_key(api_key_env, env_file=settings.get("env_file"))
        if not api_key:
            raise AdapterError(f"missing BRSAPI API key; set {api_key_env} in environment or .env")

        api_url = _url_with_api_key(context.target.url, api_key)
        payload, status_code = self._fetch_payload(context, api_url, settings)
        return self.parse_market_payload(
            payload,
            context.source,
            context.target,
            api_url=api_url,
            status_code=status_code,
        )

    def parse_market_payload(
        self,
        payload: dict[str, Any],
        source: SourceConfig,
        target: TargetConfig,
        *,
        api_url: str | None = None,
        status_code: int | None = None,
    ) -> PriceObservation:
        settings = source.settings | target.adapter_settings
        requested_symbol = _clean(settings.get("symbol"))
        requested_name = _clean(settings.get("name") or settings.get("market_name"))
        if not requested_symbol and not requested_name:
            raise AdapterError("brsapi_market requires target adapter_settings.symbol or name")

        item, category = _find_market_item(payload, symbol=requested_symbol, name=requested_name)
        if item is None:
            requested = requested_symbol or requested_name
            raise AdapterError(f"BRSAPI response did not include requested market item {requested}")

        price_irr = parse_price_to_irr(item.get("price"), multiplier=source.price_multiplier)
        if price_irr is None:
            item_name = item.get("name") or item.get("symbol") or requested_name or requested_symbol
            raise AdapterError(f"BRSAPI item {item_name} did not include a usable price")

        title = _clean(item.get("name")) or _clean(item.get("name_en")) or _clean(item.get("symbol"))
        return PriceObservation(
            title=title,
            seller="BRS API",
            price_irr=price_irr,
            availability="in_stock",
            raw_observation={
                "adapter": self.name,
                "status_code": status_code,
                "parse_method": "brsapi_market",
                "api_url": _redact_query_param(api_url, "key") if api_url else None,
                "category": category,
                "symbol": item.get("symbol"),
                "name_en": item.get("name_en"),
                "name": item.get("name"),
                "unit": item.get("unit"),
                "date": item.get("date"),
                "time": item.get("time"),
                "time_unix": item.get("time_unix"),
                "change_value": item.get("change_value"),
                "change_percent": item.get("change_percent"),
                "extracted": {
                    "title": title,
                    "price": item.get("price"),
                    "unit": item.get("unit"),
                },
            },
        )

    def _fetch_payload(
        self,
        context: FetchContext,
        api_url: str,
        settings: dict[str, Any],
    ) -> tuple[dict[str, Any], int]:
        cache_ttl_seconds = _cache_ttl_seconds(settings.get("cache_ttl_seconds"))
        now = time.monotonic()
        cached = self._cache.get(api_url)
        if cached and cache_ttl_seconds > 0 and now - cached[0] <= cache_ttl_seconds:
            return cached[1], cached[2]

        headers = BRSAPI_BROWSER_HEADERS | context.source.headers
        try:
            response = context.client.get(api_url, headers=headers)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPStatusError as exc:
            raise AdapterError(f"BRSAPI request failed with status {exc.response.status_code}") from exc
        except httpx.HTTPError as exc:
            raise AdapterError(f"BRSAPI request failed: {type(exc).__name__}") from exc
        except json.JSONDecodeError as exc:
            raise AdapterError("BRSAPI response was not valid JSON") from exc

        if not isinstance(payload, dict):
            raise AdapterError("BRSAPI response was not a JSON object")

        self._cache[api_url] = (now, payload, response.status_code)
        return payload, response.status_code


def _find_market_item(
    payload: dict[str, Any],
    *,
    symbol: str | None,
    name: str | None,
) -> tuple[dict[str, Any], str] | tuple[None, None]:
    for category in ("gold", "currency"):
        values = payload.get(category)
        if not isinstance(values, list):
            continue
        for item in values:
            if not isinstance(item, dict):
                continue
            if symbol and _clean(item.get("symbol")) == symbol:
                return item, category
            if name and _clean(item.get("name")) == name:
                return item, category
    return None, None


def _resolve_api_key(env_name: str, *, env_file: Any = None) -> str | None:
    value = os.environ.get(env_name)
    if value:
        return value.strip()

    path = Path(str(env_file or ".env")).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    return _read_env_value(path, env_name)


def _read_env_value(path: Path, key: str) -> str | None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped[len("export ") :].strip()
        name, separator, value = stripped.partition("=")
        if separator and name.strip() == key:
            return _unquote(value.strip())
    return None


def _url_with_api_key(url: str, api_key: str) -> str:
    parsed = urlparse(url)
    query = [(name, value) for name, value in parse_qsl(parsed.query, keep_blank_values=True) if name != "key"]
    query.append(("key", api_key))
    return urlunparse(parsed._replace(query=urlencode(query)))


def _redact_query_param(url: str, param: str) -> str:
    parsed = urlparse(url)
    query = [
        f"{name}={'<redacted>' if name == param else value}"
        for name, value in parse_qsl(parsed.query, keep_blank_values=True)
    ]
    return urlunparse(parsed._replace(query="&".join(query)))


def _cache_ttl_seconds(value: Any) -> float:
    if value is None:
        return DEFAULT_CACHE_TTL_SECONDS
    try:
        return max(float(value), 0.0)
    except (TypeError, ValueError):
        return DEFAULT_CACHE_TTL_SECONDS


def _clean(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value
