from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import httpx

from price_getter.adapters import get_adapter
from price_getter.adapters.base import FetchContext
from price_getter.config import AppConfig, load_config
from price_getter.db import DEFAULT_DB_URL, init_database, session_scope
from price_getter.repository import finish_run, has_successful_price_today, record_error, record_price, start_run


@dataclass(frozen=True)
class RunSummary:
    run_id: int
    target_count: int
    success_count: int
    error_count: int
    status: str


class PriceRunner:
    def __init__(
        self,
        db_url: str = DEFAULT_DB_URL,
        *,
        sleep_func: Callable[[float], None] = time.sleep,
    ) -> None:
        self.db_url = db_url
        self.sleep_func = sleep_func

    def run_config_file(self, config_path: str | Path) -> RunSummary:
        config = load_config(config_path)
        return self.run(config, config_path=str(config_path))

    def run(self, config: AppConfig, *, config_path: str | None = None) -> RunSummary:
        init_database(self.db_url)
        success_count = 0
        error_count = 0
        last_request_at: dict[str, float] = {}

        with session_scope(self.db_url) as session:
            run = start_run(session, config_path, config)
            run_id = run.id

        for target in config.active_targets():
            source = config.sources[target.source_key]
            if source.adapter != "brsapi_market" and self._has_successful_price_today(target.product_key):
                continue

            adapter = get_adapter(source.adapter)
            self._respect_rate_limit(source_key=target.source_key, seconds=source.rate_limit_seconds, last_request_at=last_request_at)

            try:
                with httpx.Client(timeout=source.timeout_seconds, follow_redirects=True) as client:
                    observation = adapter.fetch(FetchContext(source=source, target=target, client=client))
                with session_scope(self.db_url) as session:
                    record_price(session, run_id, target, observation)
                success_count += 1
            except Exception as exc:
                with session_scope(self.db_url) as session:
                    record_error(session, run_id, target, exc)
                error_count += 1
            finally:
                last_request_at[target.source_key] = time.monotonic()

        with session_scope(self.db_url) as session:
            finished = finish_run(session, run_id, success_count, error_count)
            return RunSummary(
                run_id=run_id,
                target_count=finished.target_count,
                success_count=finished.success_count,
                error_count=finished.error_count,
                status=finished.status,
            )

    def _respect_rate_limit(self, *, source_key: str, seconds: float, last_request_at: dict[str, float]) -> None:
        previous = last_request_at.get(source_key)
        if previous is None or seconds <= 0:
            return
        elapsed = time.monotonic() - previous
        wait_for = seconds - elapsed
        if wait_for > 0:
            self.sleep_func(wait_for)

    def _has_successful_price_today(self, product_key: str) -> bool:
        with session_scope(self.db_url) as session:
            return has_successful_price_today(session, product_key)
