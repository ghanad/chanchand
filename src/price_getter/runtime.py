from __future__ import annotations

import os
from pathlib import Path

from price_getter.db import DEFAULT_DB_URL

DEFAULT_CONFIG_PATH = Path("config/example.yml")
DEFAULT_UI_HOST = "127.0.0.1"
DEFAULT_UI_PORT = 8000

CONFIG_ENV = "PRICE_GETTER_CONFIG"
DB_URL_ENV = "PRICE_GETTER_DB_URL"
HOST_ENV = "PRICE_GETTER_HOST"
PORT_ENV = "PRICE_GETTER_PORT"


def runtime_config_path(value: str | Path | None = None) -> Path:
    return Path(value or os.environ.get(CONFIG_ENV) or DEFAULT_CONFIG_PATH)


def runtime_db_url(value: str | None = None) -> str:
    return value or os.environ.get(DB_URL_ENV) or DEFAULT_DB_URL


def runtime_host(value: str | None = None) -> str:
    return value or os.environ.get(HOST_ENV) or DEFAULT_UI_HOST


def runtime_port(value: int | str | None = None) -> int:
    if value is not None:
        return int(value)
    return int(os.environ.get(PORT_ENV) or DEFAULT_UI_PORT)
