from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from price_getter.config import ConfigLoadError, load_config


class ConfigEditError(ValueError):
    """Raised when a config edit cannot be applied safely."""


@dataclass(frozen=True)
class ConfigEditResult:
    product_key: str
    backup_path: Path


def add_product_target(
    config_path: str | Path,
    *,
    title: str,
    url: str,
    source_key: str | None = None,
) -> ConfigEditResult:
    path = Path(config_path)
    raw = _load_raw_config(path)
    sources = _mapping(raw, "sources")
    products = _mapping(raw, "products")
    targets = _target_list(raw)

    clean_title = title.strip()
    if not clean_title:
        raise ConfigEditError("title cannot be empty")
    if not sources:
        raise ConfigEditError("config must define at least one source")

    selected_source = _select_source(sources, source_key)
    product_key = make_product_key(clean_title, products)
    products[product_key] = {"title": clean_title}
    targets.append(
        {
            "product_key": product_key,
            "source_key": selected_source,
            "url": url.strip(),
            "enabled": True,
        }
    )

    backup_path = _write_validated_config(path, raw)
    return ConfigEditResult(product_key=product_key, backup_path=backup_path)


def disable_product(config_path: str | Path, product_key: str) -> ConfigEditResult:
    path = Path(config_path)
    raw = _load_raw_config(path)
    products = _mapping(raw, "products")
    targets = _target_list(raw)

    if product_key not in products:
        raise ConfigEditError(f"unknown product: {product_key}")

    changed = False
    for target in targets:
        if not isinstance(target, dict):
            raise ConfigEditError("targets must contain YAML mappings")
        if target.get("product_key") == product_key and target.get("enabled", True) is not False:
            target["enabled"] = False
            changed = True

    if not changed:
        raise ConfigEditError(f"product has no enabled targets: {product_key}")

    backup_path = _write_validated_config(path, raw)
    return ConfigEditResult(product_key=product_key, backup_path=backup_path)


def make_product_key(title: str, existing: dict[str, Any]) -> str:
    base = re.sub(r"[^a-z0-9_.-]+", "-", title.strip().lower())
    base = re.sub(r"-+", "-", base).strip("-.")
    if not base:
        base = "product"

    candidate = base
    index = 2
    while candidate in existing:
        candidate = f"{base}-{index}"
        index += 1
    return candidate


def _select_source(sources: dict[str, Any], source_key: str | None) -> str:
    if source_key:
        if source_key not in sources:
            raise ConfigEditError(f"unknown source: {source_key}")
        return source_key
    if "digikala_api" in sources:
        return "digikala_api"
    return next(iter(sources))


def _load_raw_config(path: Path) -> dict[str, Any]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ConfigEditError(f"cannot read config {path}: {exc}") from exc
    except yaml.YAMLError as exc:
        raise ConfigEditError(f"invalid YAML in {path}: {exc}") from exc

    if not isinstance(raw, dict):
        raise ConfigEditError("config must be a YAML mapping")
    return raw


def _mapping(raw: dict[str, Any], key: str) -> dict[str, Any]:
    value = raw.setdefault(key, {})
    if not isinstance(value, dict):
        raise ConfigEditError(f"{key} must be a YAML mapping")
    return value


def _target_list(raw: dict[str, Any]) -> list[Any]:
    value = raw.setdefault("targets", [])
    if not isinstance(value, list):
        raise ConfigEditError("targets must be a YAML list")
    return value


def _write_validated_config(path: Path, raw: dict[str, Any]) -> Path:
    original_text = path.read_text(encoding="utf-8")
    backup_path = _backup_path(path)
    shutil.copy2(path, backup_path)
    path.write_text(yaml.safe_dump(raw, sort_keys=False, allow_unicode=True), encoding="utf-8")
    try:
        load_config(path)
    except ConfigLoadError as exc:
        path.write_text(original_text, encoding="utf-8")
        raise ConfigEditError(str(exc)) from exc
    return backup_path


def _backup_path(path: Path) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    return path.with_name(f"{path.name}.{timestamp}.bak")
