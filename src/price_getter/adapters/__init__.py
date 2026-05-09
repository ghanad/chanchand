from __future__ import annotations

from price_getter.adapters.base import AdapterError, PriceAdapter
from price_getter.adapters.digikala import DigikalaApiAdapter, DigikalaWebAdapter
from price_getter.adapters.generic_html import GenericHtmlAdapter

digikala_api_adapter = DigikalaApiAdapter()

ADAPTERS: dict[str, PriceAdapter] = {
    GenericHtmlAdapter.name: GenericHtmlAdapter(),
    DigikalaApiAdapter.name: digikala_api_adapter,
    DigikalaWebAdapter.name: DigikalaWebAdapter(),
    "digikala": digikala_api_adapter,
}


def get_adapter(name: str) -> PriceAdapter:
    try:
        return ADAPTERS[name]
    except KeyError as exc:
        raise AdapterError(f"unknown adapter: {name}") from exc
