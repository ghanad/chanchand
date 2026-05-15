import pytest

from price_getter.config import load_config
from price_getter.config_editor import (
    ConfigEditError,
    add_product_target,
    delete_product,
    disable_product,
    enable_product,
    make_product_key,
    update_product_target,
)


def write_config(path) -> None:
    path.write_text(
        """
sources:
  generic_demo:
    adapter: generic_html
  digikala_api:
    adapter: digikala_api
products:
  phone:
    title: Phone
targets:
  - product_key: phone
    source_key: generic_demo
    url: "https://example.com/phone"
    enabled: true
""",
        encoding="utf-8",
    )


def write_two_product_config(path) -> None:
    path.write_text(
        """
sources:
  generic_demo:
    adapter: generic_html
  digikala_api:
    adapter: digikala_api
products:
  phone:
    title: Phone
  chair:
    title: Chair
targets:
  - product_key: phone
    source_key: generic_demo
    url: "https://example.com/phone"
    enabled: true
  - product_key: chair
    source_key: digikala_api
    url: "https://www.digikala.com/product/dkp-1/"
    enabled: true
""",
        encoding="utf-8",
    )


def test_make_product_key_uses_ascii_slug_and_suffix() -> None:
    assert make_product_key("Phone 12", {}) == "phone-12"
    assert make_product_key("گوشی", {}) == "product"
    assert make_product_key("Phone", {"phone": {}}) == "phone-2"


def test_add_product_target_writes_backup_and_valid_config(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    write_config(config_path)

    result = add_product_target(
        config_path,
        title="Digikala Chair",
        url="https://www.digikala.com/product/dkp-1/",
    )

    config = load_config(config_path)
    assert result.product_key == "digikala-chair"
    assert result.backup_path.exists()
    assert config.products["digikala-chair"].title == "Digikala Chair"
    assert config.targets[-1].source_key == "digikala_api"
    assert config.targets[-1].enabled is True


def test_disable_product_keeps_history_source_config_but_disables_targets(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    write_config(config_path)

    result = disable_product(config_path, "phone")

    config = load_config(config_path)
    assert result.backup_path.exists()
    assert "phone" in config.products
    assert config.targets[0].enabled is False
    assert config.active_targets() == []


def test_update_product_target_writes_title_url_and_source(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    write_config(config_path)

    result = update_product_target(
        config_path,
        "phone",
        title="Updated Phone",
        url="https://www.digikala.com/product/dkp-22/",
        source_key="digikala_api",
    )

    config = load_config(config_path)
    assert result.backup_path.exists()
    assert config.products["phone"].title == "Updated Phone"
    assert config.targets[0].url == "https://www.digikala.com/product/dkp-22/"
    assert config.targets[0].source_key == "digikala_api"


def test_delete_product_removes_product_and_targets(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    write_two_product_config(config_path)

    result = delete_product(config_path, "phone")

    config = load_config(config_path)
    assert result.product_key == "phone"
    assert result.backup_path.exists()
    assert "phone" not in config.products
    assert [target.product_key for target in config.targets] == ["chair"]


def test_enable_product_reactivates_disabled_targets(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    write_config(config_path)
    disable_product(config_path, "phone")

    result = enable_product(config_path, "phone")

    config = load_config(config_path)
    assert result.backup_path.exists()
    assert config.targets[0].enabled is True
    assert len(config.active_targets()) == 1


def test_invalid_add_rolls_back_config_text(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    write_config(config_path)
    original = config_path.read_text(encoding="utf-8")

    with pytest.raises(ConfigEditError):
        add_product_target(config_path, title="Bad URL", url="ftp://example.com/item")

    assert config_path.read_text(encoding="utf-8") == original
    assert list(tmp_path.glob("config.yml.*.bak"))
