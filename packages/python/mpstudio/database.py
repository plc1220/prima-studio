import os
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .models import Base
from .settings import get_settings


def _connect_args(database_url: str) -> dict:
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def create_database_engine(database_url: str | None = None) -> Engine:
    url = database_url or get_settings().database_url
    if url.startswith("sqlite:///"):
        path = url.replace("sqlite:///", "", 1)
        if path and path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    return create_engine(url, connect_args=_connect_args(url), pool_pre_ping=True)


engine = create_database_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db(db_engine: Engine | None = None) -> None:
    target = db_engine or engine
    Base.metadata.create_all(bind=target)
    _ensure_workspace_lane_column(target)


def _ensure_workspace_lane_column(db_engine: Engine) -> None:
    inspector = inspect(db_engine)
    if "workspaces" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("workspaces")}
    if "lane" in columns:
        return
    with db_engine.begin() as connection:
        connection.execute(text("ALTER TABLE workspaces ADD COLUMN lane VARCHAR(64)"))
        connection.execute(
            text(
                """
                UPDATE workspaces
                SET lane = CASE
                    WHEN lower(id) LIKE '%newsroom%' THEN 'newsroom'
                    WHEN lower(id) LIKE '%shorts%' THEN 'shorts'
                    WHEN lower(id) LIKE '%clipping%' OR lower(id) LIKE '%video%' THEN 'video_clipping'
                    ELSE NULL
                END
                """
            )
        )


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    init_db()
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
