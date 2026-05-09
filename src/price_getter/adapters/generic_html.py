from __future__ import annotations

from typing import Any

from bs4 import BeautifulSoup

from price_getter.adapters.base import AdapterError, FetchContext, PriceObservation, request_text
from price_getter.config import SourceConfig, TargetConfig
from price_getter.pricing import detect_availability, parse_price_to_irr


class GenericHtmlAdapter:
    name = "generic_html"

    def fetch(self, context: FetchContext) -> PriceObservation:
        html, status_code = request_text(context)
        return self.parse(html, context.source, context.target, status_code=status_code)

    def parse(
        self,
        html: str,
        source: SourceConfig,
        target: TargetConfig,
        *,
        status_code: int | None = None,
    ) -> PriceObservation:
        settings = source.settings | target.adapter_settings
        selectors = settings.get("selectors", settings)
        price_selector = selectors.get("price") or settings.get("price_selector")
        if not price_selector:
            raise AdapterError("generic_html requires a price selector")

        soup = BeautifulSoup(html, "html.parser")
        title = _extract(soup, selectors.get("title") or settings.get("title_selector"))
        seller = _extract(soup, selectors.get("seller") or settings.get("seller_selector"))
        price_text = _extract(soup, price_selector)
        availability_text = _extract(soup, selectors.get("availability") or settings.get("availability_selector"))
        price_irr = parse_price_to_irr(price_text, multiplier=source.price_multiplier)
        availability = _detect_availability(availability_text, settings)

        if price_irr is None and availability == "unknown":
            raise AdapterError("could not extract a price from HTML")

        return PriceObservation(
            title=title,
            seller=seller,
            price_irr=price_irr,
            availability=availability,
            raw_observation={
                "adapter": self.name,
                "status_code": status_code,
                "extracted": {
                    "title": title,
                    "seller": seller,
                    "price_text": price_text,
                    "availability_text": availability_text,
                },
            },
        )


def _extract(soup: BeautifulSoup, selector: Any) -> str | None:
    if not selector:
        return None

    attr = None
    if isinstance(selector, dict):
        css = selector.get("css")
        attr = selector.get("attr")
    else:
        css = str(selector)
        if "@" in css:
            css, attr = css.rsplit("@", 1)

    if not css:
        return None
    node = soup.select_one(css)
    if node is None:
        return None
    if attr:
        value = node.get(attr)
        return str(value).strip() if value is not None else None
    text = node.get_text(" ", strip=True)
    return text or None


def _detect_availability(value: str | None, settings: dict[str, Any]) -> str:
    if value:
        normalized = value.casefold()
        for token in settings.get("availability_out_of_stock_text", []):
            if str(token).casefold() in normalized:
                return "out_of_stock"
        for token in settings.get("availability_in_stock_text", []):
            if str(token).casefold() in normalized:
                return "in_stock"
    return detect_availability(value)
