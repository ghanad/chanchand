from price_getter.pricing import detect_availability, normalize_digits, parse_price_to_irr


def test_normalize_digits_handles_persian_and_arabic_digits() -> None:
    assert normalize_digits("۱۲۳٤٥") == "12345"


def test_parse_price_to_irr_extracts_persian_toman_price() -> None:
    assert parse_price_to_irr("۱۲۳,۴۵۶ تومان", multiplier=10) == 1_234_560


def test_parse_price_to_irr_uses_largest_amount() -> None:
    assert parse_price_to_irr("old 100 new 250,000 rial") == 250_000


def test_detect_availability_prefers_out_of_stock() -> None:
    assert detect_availability("ناموجود") == "out_of_stock"
    assert detect_availability("موجود در انبار") == "in_stock"
    assert detect_availability("shipping tomorrow") == "unknown"
