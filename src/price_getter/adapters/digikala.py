from __future__ import annotations

from price_getter.adapters.digikala_api import DigikalaApiAdapter
from price_getter.adapters.digikala_web import DigikalaWebAdapter

DigikalaAdapter = DigikalaApiAdapter

__all__ = ["DigikalaAdapter", "DigikalaApiAdapter", "DigikalaWebAdapter"]
