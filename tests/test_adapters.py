from price_getter.adapters.digikala import DigikalaAdapter
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


def test_digikala_adapter_parses_next_data_fixture() -> None:
    source = SourceConfig(adapter="digikala")
    target = TargetConfig(product_key="phone", source_key="digikala", url="https://www.digikala.com/product/1")
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

    observation = DigikalaAdapter().parse(html, source, target)

    assert observation.title == "گوشی نمونه"
    assert observation.seller == "دیجی‌کالا"
    assert observation.price_irr == 12_340_000
    assert observation.availability == "in_stock"


def test_digikala_adapter_parses_json_ld_fixture() -> None:
    source = SourceConfig(adapter="digikala")
    target = TargetConfig(product_key="phone", source_key="digikala", url="https://www.digikala.com/product/1")
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

    observation = DigikalaAdapter().parse(html, source, target)

    assert observation.title == "Sample Phone"
    assert observation.seller == "Sample Seller"
    assert observation.price_irr == 3_450_000
    assert observation.availability == "in_stock"


def test_digikala_adapter_parses_api_product_payload() -> None:
    source = SourceConfig(adapter="digikala")
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

    observation = DigikalaAdapter().parse_api_product(product, source)

    assert observation.title == "صندلی اداری نیلپر مدل OCT 515o"
    assert observation.seller == "دیجی‌کالا"
    assert observation.price_irr == 97_000_000
    assert observation.availability == "in_stock"
    assert observation.raw_observation["parse_method"] == "digikala_api"
