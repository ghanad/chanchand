import pytest

from price_getter.config import ConfigLoadError, load_config


def test_load_config_validates_references(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    config_path.write_text(
        """
sources:
  demo:
    adapter: generic_html
    settings:
      selectors:
        price: ".price"
products:
  phone:
    title: Phone
targets:
  - product_key: phone
    source_key: demo
    url: "https://example.com/phone"
""",
        encoding="utf-8",
    )

    config = load_config(config_path)

    assert list(config.sources) == ["demo"]
    assert config.targets[0].enabled is True
    assert len(config.active_targets()) == 1


def test_load_config_rejects_unknown_product(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    config_path.write_text(
        """
sources:
  demo:
    adapter: generic_html
products:
  phone:
    title: Phone
targets:
  - product_key: tablet
    source_key: demo
    url: "https://example.com/tablet"
""",
        encoding="utf-8",
    )

    with pytest.raises(ConfigLoadError, match="unknown products"):
        load_config(config_path)
