from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from price_getter.models import Base

DEFAULT_DB_URL = "sqlite:///price_getter.db"


def create_engine_for_url(db_url: str = DEFAULT_DB_URL) -> Engine:
    connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
    return create_engine(db_url, future=True, connect_args=connect_args)


def init_database(db_url: str = DEFAULT_DB_URL) -> None:
    engine = create_engine_for_url(db_url)
    Base.metadata.create_all(engine)


def session_factory(db_url: str = DEFAULT_DB_URL) -> sessionmaker[Session]:
    engine = create_engine_for_url(db_url)
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)


@contextmanager
def session_scope(db_url: str = DEFAULT_DB_URL) -> Iterator[Session]:
    factory = session_factory(db_url)
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
