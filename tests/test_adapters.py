import pytest

from price_getter.adapters import get_adapter
from price_getter.adapters.base import AdapterError, FetchContext
from price_getter.adapters.brsapi_market import BrsapiMarketAdapter, _resolve_api_key
from price_getter.adapters.digikala import DigikalaAdapter, DigikalaApiAdapter, DigikalaWebAdapter
from price_getter.adapters.generic_html import GenericHtmlAdapter
from price_getter.config import SourceConfig, TargetConfig


class _FakeJsonResponse:
    status_code = 200

    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


class _FakeJsonClient:
    def __init__(self, responses: dict[str, dict]) -> None:
        self.responses = responses
        self.requested_urls: list[str] = []

    def get(self, url: str, **_: object) -> _FakeJsonResponse:
        self.requested_urls.append(url)
        return _FakeJsonResponse(self.responses[url])


def test_generic_html_adapter_parses_configured_selectors() -> None:
    source = SourceConfig(
        adapter="generic_html",
        price_multiplier=10,
        settings={
            "selectors": {
                "title": "h1",
                "seller": ".seller",
                "price": ".price",
                "availability": ".stock",
            }
        },
    )
    target = TargetConfig(product_key="phone", source_key="demo", url="https://example.com/phone")
    html = """
    <h1>Example Phone</h1>
    <span class="seller">Example Seller</span>
    <span class="price">۱۲۳,۰۰۰ تومان</span>
    <span class="stock">موجود</span>
    """

    observation = GenericHtmlAdapter().parse(html, source, target)

    assert observation.title == "Example Phone"
    assert observation.seller == "Example Seller"
    assert observation.price_irr == 1_230_000
    assert observation.availability == "in_stock"


def test_digikala_web_adapter_parses_next_data_fixture() -> None:
    source = SourceConfig(adapter="digikala_web")
    target = TargetConfig(product_key="phone", source_key="digikala_web", url="https://www.digikala.com/product/1")
    html = """
    <script id="__NEXT_DATA__" type="application/json">
    {
      "props": {
        "pageProps": {
          "product": {
            "title_fa": "گوشی نمونه",
            "default_variant": {
              "price": {"selling_price": 12340000},
              "seller": {"title": "دیجی‌کالا"},
              "marketable": true
            }
          }
        }
      }
    }
    </script>
    """

    observation = DigikalaWebAdapter().parse(html, source, target)

    assert observation.title == "گوشی نمونه"
    assert observation.seller == "دیجی‌کالا"
    assert observation.price_irr == 12_340_000
    assert observation.availability == "in_stock"


def test_digikala_web_adapter_parses_json_ld_fixture() -> None:
    source = SourceConfig(adapter="digikala_web")
    target = TargetConfig(product_key="phone", source_key="digikala_web", url="https://www.digikala.com/product/1")
    html = """
    <script type="application/ld+json">
    {
      "@type": "Product",
      "name": "Sample Phone",
      "offers": {
        "price": "3450000",
        "availability": "https://schema.org/InStock",
        "seller": {"name": "Sample Seller"}
      }
    }
    </script>
    """

    observation = DigikalaWebAdapter().parse(html, source, target)

    assert observation.title == "Sample Phone"
    assert observation.seller == "Sample Seller"
    assert observation.price_irr == 3_450_000
    assert observation.availability == "in_stock"


def test_digikala_api_adapter_parses_api_product_payload() -> None:
    source = SourceConfig(adapter="digikala_api")
    product = {
        "id": 3271540,
        "title_fa": "صندلی اداری نیلپر مدل OCT 515o",
        "status": "marketable",
        "default_variant": {
            "id": 50557025,
            "status": "marketable",
            "price": {"selling_price": 97000000, "rrp_price": 121220000},
            "seller": {"title": "دیجی‌کالا"},
        },
    }

    observation = DigikalaApiAdapter().parse_api_product(product, source)

    assert observation.title == "صندلی اداری نیلپر مدل OCT 515o"
    assert observation.seller == "دیجی‌کالا"
    assert observation.price_irr == 97_000_000
    assert observation.availability == "in_stock"
    assert observation.raw_observation["parse_method"] == "digikala_api"


def test_digikala_api_adapter_selects_requested_api_variant() -> None:
    source = SourceConfig(adapter="digikala_api")
    product = {
        "id": 14590108,
        "title_fa": "صندلی اداری هوگر مدل KH460",
        "status": "marketable",
        "default_variant": {
            "id": 56432925,
            "status": "marketable",
            "price": {"selling_price": 113700000},
            "seller": {"title": "دیجی‌کالا"},
        },
        "variants": [
            {
                "id": 50179968,
                "status": "marketable",
                "price": {"selling_price": 129492000},
                "seller": {"title": "فروشنده دیگر"},
            }
        ],
    }

    observation = DigikalaApiAdapter().parse_api_product(product, source, variant_id="50179968")

    assert observation.seller == "فروشنده دیگر"
    assert observation.price_irr == 129_492_000
    assert observation.raw_observation["requested_variant_id"] == "50179968"
    assert observation.raw_observation["variant_id"] == 50179968


def test_digikala_api_adapter_rejects_missing_requested_api_variant() -> None:
    source = SourceConfig(adapter="digikala_api")
    product = {
        "id": 14590108,
        "title_fa": "صندلی اداری هوگر مدل KH460",
        "status": "marketable",
        "default_variant": {
            "id": 56432925,
            "status": "marketable",
            "price": {"selling_price": 113700000},
            "seller": {"title": "دیجی‌کالا"},
        },
    }

    with pytest.raises(AdapterError, match="requested variant"):
        DigikalaApiAdapter().parse_api_product(product, source, variant_id="50179968")


def test_digikala_api_adapter_fetches_fresh_product_api_for_fresh_url() -> None:
    source = SourceConfig(adapter="digikala_api")
    target = TargetConfig(
        product_key="apple",
        source_key="digikala_api",
        url="https://www.digikala.com/fresh/product/dkp-856977/apple/",
    )
    client = _FakeJsonClient(
        {
            "https://api.digikala.com/fresh/v1/product/856977/": {
                "data": {
                    "product": {
                        "id": 856977,
                        "title_fa": "سیب زرد دماوند Fresh وزن 1 کیلوگرم",
                        "status": "marketable",
                        "default_variant": {
                            "id": 1711424,
                            "status": "marketable",
                            "price": {"selling_price": 2_200_000},
                            "seller": {"title": "دیجی‌کالا"},
                        },
                    }
                }
            }
        }
    )

    observation = DigikalaApiAdapter().fetch(FetchContext(source=source, target=target, client=client))

    assert client.requested_urls == ["https://api.digikala.com/fresh/v1/product/856977/"]
    assert observation.title == "سیب زرد دماوند Fresh وزن 1 کیلوگرم"
    assert observation.price_irr == 2_200_000
    assert observation.availability == "in_stock"


def test_digikala_api_adapter_follows_fresh_redirect_payload() -> None:
    source = SourceConfig(adapter="digikala_api")
    client = _FakeJsonClient(
        {
            "https://api.digikala.com/v2/product/856977/": {
                "status": 302,
                "redirect_url": {"uri": "/fresh/product/dkp-856977/"},
            },
            "https://api.digikala.com/fresh/v1/product/856977/": {
                "data": {
                    "product": {
                        "id": 856977,
                        "title_fa": "سیب زرد دماوند Fresh وزن 1 کیلوگرم",
                        "status": "marketable",
                        "default_variant": {
                            "id": 1711424,
                            "status": "marketable",
                            "price": {"selling_price": 2_200_000},
                        },
                    }
                }
            },
        }
    )
    target = TargetConfig(
        product_key="apple",
        source_key="digikala_api",
        url="https://www.digikala.com/product/dkp-856977/apple/",
    )

    observation = DigikalaApiAdapter().fetch(FetchContext(source=source, target=target, client=client))

    assert client.requested_urls == [
        "https://api.digikala.com/v2/product/856977/",
        "https://api.digikala.com/fresh/v1/product/856977/",
    ]
    assert observation.raw_observation["api_url"] == "https://api.digikala.com/fresh/v1/product/856977/"
    assert observation.price_irr == 2_200_000


def test_digikala_adapter_name_is_backward_compatible_alias() -> None:
    assert get_adapter("digikala") is get_adapter("digikala_api")
    assert DigikalaAdapter is DigikalaApiAdapter


def test_brsapi_market_adapter_parses_requested_gold_item() -> None:
    source = SourceConfig(adapter="brsapi_market", price_multiplier=10)
    target = TargetConfig(
        product_key="gold-18k",
        source_key="brsapi_market",
        url="https://api.brsapi.ir/Market/Gold_Currency.php",
        adapter_settings={"symbol": "IR_GOLD_18K"},
    )
    payload = {
        "gold": [
            {
                "date": "1405/02/19",
                "time": "21:30",
                "time_unix": 1778349655,
                "symbol": "IR_GOLD_18K",
                "name_en": "18K Gold",
                "name": "طلای 18 عیار",
                "price": 19206800,
                "change_value": -92400,
                "change_percent": -0.48,
                "unit": "تومان",
            }
        ],
        "currency": [],
    }

    observation = BrsapiMarketAdapter().parse_market_payload(
        payload,
        source,
        target,
        api_url="https://api.brsapi.ir/Market/Gold_Currency.php?key=secret",
        status_code=200,
    )

    assert observation.title == "طلای 18 عیار"
    assert observation.seller == "BRS API"
    assert observation.price_irr == 192_068_000
    assert observation.availability == "in_stock"
    assert observation.raw_observation["api_url"] == "https://api.brsapi.ir/Market/Gold_Currency.php?key=<redacted>"
    assert observation.raw_observation["category"] == "gold"


def test_brsapi_market_adapter_parses_requested_currency_item_by_name() -> None:
    source = SourceConfig(adapter="brsapi_market", price_multiplier=10)
    target = TargetConfig(
        product_key="usd",
        source_key="brsapi_market",
        url="https://api.brsapi.ir/Market/Gold_Currency.php",
        adapter_settings={"name": "دلار"},
    )
    payload = {
        "gold": [],
        "currency": [
            {
                "symbol": "USD",
                "name_en": "US Dollar",
                "name": "دلار",
                "price": "175790",
                "unit": "تومان",
            }
        ],
    }

    observation = BrsapiMarketAdapter().parse_market_payload(payload, source, target)

    assert observation.title == "دلار"
    assert observation.price_irr == 1_757_900
    assert observation.raw_observation["category"] == "currency"


def test_brsapi_market_adapter_fetch_uses_env_key_and_browser_user_agent(monkeypatch) -> None:
    monkeypatch.setenv("BRSAPI_TEST_KEY", "secret")
    source = SourceConfig(
        adapter="brsapi_market",
        price_multiplier=10,
        settings={"api_key_env": "BRSAPI_TEST_KEY", "cache_ttl_seconds": 0},
    )
    target = TargetConfig(
        product_key="usd",
        source_key="brsapi_market",
        url="https://api.brsapi.ir/Market/Gold_Currency.php?ignored=1&key=ZZZZ",
        adapter_settings={"symbol": "USD"},
    )
    client = FakeJsonClient(
        {
            "currency": [
                {
                    "symbol": "USD",
                    "name": "دلار",
                    "price": 175790,
                    "unit": "تومان",
                }
            ]
        }
    )

    observation = BrsapiMarketAdapter().fetch(FetchContext(source=source, target=target, client=client))

    assert observation.price_irr == 1_757_900
    assert client.calls[0]["url"] == "https://api.brsapi.ir/Market/Gold_Currency.php?ignored=1&key=secret"
    assert client.calls[0]["headers"]["User-Agent"].startswith("Mozilla/5.0")
    assert "Python" not in client.calls[0]["headers"]["User-Agent"]
    assert get_adapter("brsapi_market").name == "brsapi_market"


def test_brsapi_market_adapter_resolves_api_key_from_env_file(monkeypatch, tmp_path) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text("brsapi_api='file-secret'\n", encoding="utf-8")
    monkeypatch.delenv("brsapi_api", raising=False)

    assert _resolve_api_key("brsapi_api", env_file=env_path) == "file-secret"


class FakeJsonResponse:
    status_code = 200

    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self._payload


class FakeJsonClient:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    def get(self, url, headers):
        self.calls.append({"url": url, "headers": headers})
        return FakeJsonResponse(self.payload)
