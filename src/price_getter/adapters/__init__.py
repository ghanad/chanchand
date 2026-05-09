from __future__ import annotations

from price_getter.adapters.base import AdapterError, PriceAdapter
from price_getter.adapters.digikala import DigikalaAdapter
from price_getter.adapters.generic_html import GenericHtmlAdapter

ADAPTERS: dict[str, PriceAdapter] = {
    GenericHtmlAdapter.name: GenericHtmlAdapter(),
    DigikalaAdapter.name: DigikalaAdapter(),
}


def get_adapter(name: str) -> PriceAdapter:
    try:
        return ADAPTERS[name]
    except KeyError as exc:
        raise AdapterError(f"unknown adapter: {name}") from exc
