from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from price_getter.adapters.base import AdapterError, FetchContext, PriceObservation
from price_getter.config import SourceConfig
from price_getter.pricing import detect_availability, parse_price_to_irr


class DigikalaApiAdapter:
    name = "digikala_api"

    def fetch(self, context: FetchContext) -> PriceObservation:
        product_id = _extract_product_id(context.target.url)
        if product_id is None:
            raise AdapterError("could not extract Digikala product ID from target URL")

        variant_id = _extract_variant_id(context.target.url)
        return self.fetch_api(context, product_id, variant_id=variant_id)

    def fetch_api(self, context: FetchContext, product_id: str, *, variant_id: str | None = None) -> PriceObservation:
        api_url = f"https://api.digikala.com/v2/product/{product_id}/"
        headers = {
            "User-Agent": "price-getter/0.1",
            "Accept": "application/json",
        } | context.source.headers
        try:
            response = context.client.get(api_url, headers=headers)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            raise AdapterError(f"Digikala API request failed: {exc}") from exc

        try:
            product = payload["data"]["product"]
        except (KeyError, TypeError) as exc:
            raise AdapterError("Digikala API response did not include product data") from exc

        return self.parse_api_product(
            product,
            context.source,
            variant_id=variant_id,
            api_url=api_url,
            status_code=response.status_code,
        )

    def parse_api_product(
        self,
        product: dict[str, Any],
        source: SourceConfig,
        *,
        variant_id: str | None = None,
        api_url: str | None = None,
        status_code: int | None = None,
    ) -> PriceObservation:
        variant = _best_variant(product, variant_id=variant_id)
        if variant_id is not None and variant is None:
            raise AdapterError(f"Digikala API response did not include requested variant {variant_id}")

        price_irr = _variant_price_irr(variant, source)
        seller = _seller_name(variant.get("seller") if variant else None)
        availability = _api_availability(product, variant)

        if price_irr is None and availability == "unknown":
            raise AdapterError("could not extract Digikala API price data")

        title = product.get("title_fa") or product.get("title_en") or product.get("test_title_fa")
        return PriceObservation(
            title=title,
            seller=seller,
            price_irr=price_irr,
            availability=availability,
            raw_observation={
                "adapter": self.name,
                "status_code": status_code,
                "parse_method": "digikala_api",
                "api_url": api_url,
                "product_id": product.get("id"),
                "requested_variant_id": variant_id,
                "variant_id": variant.get("id") if variant else None,
                "extracted": {
                    "title": title,
                    "seller": seller,
                    "availability": availability,
                },
            },
        )


def _extract_product_id(url: str) -> str | None:
    match = re.search(r"(?:dkp-|/product/)(\d+)", url)
    return match.group(1) if match else None


def _extract_variant_id(url: str) -> str | None:
    values = parse_qs(urlparse(url).query).get("variant_id", [])
    if not values:
        return None
    value = values[0].strip()
    return value if re.fullmatch(r"\d+", value) else None


def _best_variant(product: dict[str, Any], *, variant_id: str | None = None) -> dict[str, Any] | None:
    default_variant = product.get("default_variant")
    if variant_id is not None:
        if isinstance(default_variant, dict) and _variant_id_matches(default_variant, variant_id):
            return default_variant
        variants = product.get("variants")
        if isinstance(variants, list):
            for variant in variants:
                if isinstance(variant, dict) and _variant_id_matches(variant, variant_id):
                    return variant
        return None

    if isinstance(default_variant, dict):
        return default_variant

    variants = product.get("variants")
    if isinstance(variants, list):
        for variant in variants:
            if isinstance(variant, dict) and str(variant.get("status", "")).casefold() == "marketable":
                return variant
        for variant in variants:
            if isinstance(variant, dict):
                return variant
    return None


def _variant_price_irr(variant: dict[str, Any] | None, source: SourceConfig) -> int | None:
    if not variant:
        return None
    price = variant.get("price")
    if isinstance(price, dict):
        for key in ("selling_price", "final_price", "rrp_price"):
            parsed = parse_price_to_irr(price.get(key), multiplier=source.price_multiplier)
            if parsed is not None:
                return parsed
    return parse_price_to_irr(variant.get("price"), multiplier=source.price_multiplier)


def _api_availability(product: dict[str, Any], variant: dict[str, Any] | None) -> str:
    for value in (
        variant.get("status") if variant else None,
        product.get("status"),
        product.get("data_layer", {}).get("dimension20") if isinstance(product.get("data_layer"), dict) else None,
    ):
        if not isinstance(value, str):
            continue
        normalized = value.casefold()
        if normalized in {"marketable", "available", "active"}:
            return "in_stock"
        if normalized in {"not_marketable", "out_of_stock", "unavailable", "inactive"}:
            return "out_of_stock"
        detected = detect_availability(value)
        if detected != "unknown":
            return detected
    return "unknown"


def _seller_name(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        for key in ("title", "name", "title_fa"):
            if isinstance(value.get(key), str) and value[key].strip():
                return value[key].strip()
    return None


def _variant_id_matches(variant: dict[str, Any], variant_id: str) -> bool:
    return str(variant.get("id")) == variant_id
