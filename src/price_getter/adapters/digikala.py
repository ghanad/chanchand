from __future__ import annotations

import json
import re
from collections.abc import Iterable
from typing import Any

import httpx
from bs4 import BeautifulSoup

from price_getter.adapters.base import AdapterError, FetchContext, PriceObservation, request_text
from price_getter.config import SourceConfig, TargetConfig
from price_getter.pricing import detect_availability, parse_price_to_irr


class DigikalaAdapter:
    name = "digikala"

    def fetch(self, context: FetchContext) -> PriceObservation:
        product_id = _extract_product_id(context.target.url)
        if product_id:
            return self.fetch_api(context, product_id)

        html, status_code = request_text(context)
        return self.parse(html, context.source, context.target, status_code=status_code)

    def fetch_api(self, context: FetchContext, product_id: str) -> PriceObservation:
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
            api_url=api_url,
            status_code=response.status_code,
        )

    def parse_api_product(
        self,
        product: dict[str, Any],
        source: SourceConfig,
        *,
        api_url: str | None = None,
        status_code: int | None = None,
    ) -> PriceObservation:
        variant = _best_variant(product)
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
                "variant_id": variant.get("id") if variant else None,
                "extracted": {
                    "title": title,
                    "seller": seller,
                    "availability": availability,
                },
            },
        )

    def parse(
        self,
        html: str,
        source: SourceConfig,
        target: TargetConfig,
        *,
        status_code: int | None = None,
    ) -> PriceObservation:
        soup = BeautifulSoup(html, "html.parser")
        parsed = _parse_json_ld(soup, source) or _parse_next_data(soup, source) or {}

        title = parsed.get("title") or _meta(soup, "og:title") or _first_text(soup, "h1")
        seller = parsed.get("seller")
        price_irr = parsed.get("price_irr")
        if price_irr is None:
            price_irr = parse_price_to_irr(_meta(soup, "product:price:amount"), multiplier=source.price_multiplier)
        availability = parsed.get("availability") or detect_availability(_meta(soup, "product:availability"))
        if availability == "unknown" and price_irr is not None:
            availability = "in_stock"

        if price_irr is None and availability == "unknown":
            raise AdapterError("could not extract Digikala price data")

        return PriceObservation(
            title=title,
            seller=seller,
            price_irr=price_irr,
            availability=availability,
            raw_observation={
                "adapter": self.name,
                "status_code": status_code,
                "parse_method": parsed.get("parse_method", "html_meta"),
                "extracted": {
                    "title": title,
                    "seller": seller,
                    "availability": availability,
                },
            },
        )


def _parse_json_ld(soup: BeautifulSoup, source: SourceConfig) -> dict[str, Any] | None:
    for script in soup.select('script[type="application/ld+json"]'):
        text = script.string or script.get_text(strip=True)
        if not text:
            continue
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        for item in _jsonld_items(data):
            item_type = item.get("@type")
            if isinstance(item_type, list):
                is_product = "Product" in item_type
            else:
                is_product = item_type == "Product"
            if not is_product:
                continue

            offers = item.get("offers") or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            availability_text = str(offers.get("availability", ""))
            return {
                "parse_method": "json_ld",
                "title": item.get("name"),
                "seller": _seller_name(offers.get("seller")),
                "price_irr": parse_price_to_irr(offers.get("price"), multiplier=source.price_multiplier),
                "availability": detect_availability(availability_text),
            }
    return None


def _parse_next_data(soup: BeautifulSoup, source: SourceConfig) -> dict[str, Any] | None:
    script = soup.select_one("script#__NEXT_DATA__")
    if script is None:
        return None
    text = script.string or script.get_text(strip=True)
    if not text:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None

    price = _first_numeric_value(data, ("selling_price", "final_price", "rrp_price", "price"), multiplier=source.price_multiplier)
    title = _first_string_value(data, ("title_fa", "title", "name"))
    seller = _first_seller(data)
    availability = _first_availability(data)
    return {
        "parse_method": "next_data",
        "title": title,
        "seller": seller,
        "price_irr": price,
        "availability": availability,
    }


def _extract_product_id(url: str) -> str | None:
    match = re.search(r"(?:dkp-|/product/)(\d+)", url)
    return match.group(1) if match else None


def _best_variant(product: dict[str, Any]) -> dict[str, Any] | None:
    default_variant = product.get("default_variant")
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


def _jsonld_items(data: Any) -> Iterable[dict[str, Any]]:
    if isinstance(data, dict):
        if isinstance(data.get("@graph"), list):
            for item in data["@graph"]:
                if isinstance(item, dict):
                    yield item
        yield data
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                yield from _jsonld_items(item)


def _walk(data: Any) -> Iterable[tuple[str | None, Any]]:
    if isinstance(data, dict):
        for key, value in data.items():
            yield key, value
            yield from _walk(value)
    elif isinstance(data, list):
        for value in data:
            yield None, value
            yield from _walk(value)


def _first_numeric_value(data: Any, keys: tuple[str, ...], *, multiplier: int = 1) -> int | None:
    for expected_key in keys:
        for key, value in _walk(data):
            if key != expected_key:
                continue
            if isinstance(value, (int, float)) and value > 0:
                return int(value) * multiplier
            if isinstance(value, str):
                parsed = parse_price_to_irr(value, multiplier=multiplier)
                if parsed is not None:
                    return parsed
    return None


def _first_string_value(data: Any, keys: tuple[str, ...]) -> str | None:
    for expected_key in keys:
        for key, value in _walk(data):
            if key == expected_key and isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _first_seller(data: Any) -> str | None:
    for key, value in _walk(data):
        if key in {"seller", "seller_title"}:
            seller = _seller_name(value)
            if seller:
                return seller
    return None


def _seller_name(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        for key in ("title", "name", "title_fa"):
            if isinstance(value.get(key), str) and value[key].strip():
                return value[key].strip()
    return None


def _first_availability(data: Any) -> str:
    for key, value in _walk(data):
        if key in {"is_in_stock", "marketable"} and isinstance(value, bool):
            return "in_stock" if value else "out_of_stock"
        if key in {"availability", "status"} and isinstance(value, str):
            detected = detect_availability(value)
            if detected != "unknown":
                return detected
            if "marketable" in value.casefold():
                return "in_stock"
    return "unknown"


def _meta(soup: BeautifulSoup, property_name: str) -> str | None:
    node = soup.select_one(f'meta[property="{property_name}"], meta[name="{property_name}"]')
    if node is None:
        return None
    value = node.get("content")
    return str(value).strip() if value is not None else None


def _first_text(soup: BeautifulSoup, selector: str) -> str | None:
    node = soup.select_one(selector)
    if node is None:
        return None
    text = node.get_text(" ", strip=True)
    return text or None
