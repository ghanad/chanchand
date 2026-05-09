from __future__ import annotations

import re

PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

OUT_OF_STOCK_TOKENS = (
    "out of stock",
    "outofstock",
    "unavailable",
    "sold out",
    "ناموجود",
    "اتمام موجودی",
    "موجود نیست",
)
IN_STOCK_TOKENS = (
    "in stock",
    "instock",
    "available",
    "موجود",
    "آماده ارسال",
)


def normalize_digits(value: str) -> str:
    return value.translate(PERSIAN_DIGITS)


def parse_price_to_irr(value: str | int | float | None, multiplier: int = 1) -> int | None:
    """Extract the largest integer-looking amount and normalize it to IRR."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        amount = int(value)
        return amount * multiplier if amount > 0 else None

    normalized = normalize_digits(value)
    candidates = re.findall(r"\d[\d\s,._٬،]*\d|\d+", normalized)
    amounts: list[int] = []
    for candidate in candidates:
        digits = re.sub(r"\D", "", candidate)
        if digits:
            amounts.append(int(digits))

    if not amounts:
        return None
    return max(amounts) * multiplier


def detect_availability(value: str | None) -> str:
    if not value:
        return "unknown"
    normalized = normalize_digits(value).casefold()
    if any(token.casefold() in normalized for token in OUT_OF_STOCK_TOKENS):
        return "out_of_stock"
    if any(token.casefold() in normalized for token in IN_STOCK_TOKENS):
        return "in_stock"
    return "unknown"
