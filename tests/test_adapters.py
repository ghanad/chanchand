import pytest

from price_getter.adapters import get_adapter
from price_getter.adapters.base import AdapterError
from price_getter.adapters.digikala import DigikalaAdapter, DigikalaApiAdapter, DigikalaWebAdapter
from price_getter.adapters.generic_html import GenericHtmlAdapter
from price_getter.config import SourceConfig, TargetConfig


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


def test_digikala_adapter_name_is_backward_compatible_alias() -> None:
    assert get_adapter("digikala") is get_adapter("digikala_api")
    assert DigikalaAdapter is DigikalaApiAdapter
