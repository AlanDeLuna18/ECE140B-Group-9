from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy ORM models."""


def get_db() -> Generator[Session, None, None]:
    """Provide one SQLite session per request."""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables() -> None:
    """Create SQLite tables and keep the local dev database compatible."""

    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    ensure_device_columns()
    ensure_plant_group_columns()


def ensure_device_columns() -> None:
    """Add simple new columns to an existing local SQLite database."""

    inspector = inspect(engine)
    if "devices" not in inspector.get_table_names():
        return

    device_columns = {column["name"] for column in inspector.get_columns("devices")}
    if "last_watered_at" in device_columns:
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE devices ADD COLUMN last_watered_at DATETIME"))


def ensure_plant_group_columns() -> None:
    """Add group-level settings columns to an existing local SQLite database."""

    inspector = inspect(engine)
    if "plant_groups" not in inspector.get_table_names():
        return

    group_columns = {column["name"] for column in inspector.get_columns("plant_groups")}
    with engine.begin() as connection:
        if "auto_mode" not in group_columns:
            connection.execute(text("ALTER TABLE plant_groups ADD COLUMN auto_mode BOOLEAN DEFAULT 1 NOT NULL"))
        if "last_watered_at" not in group_columns:
            connection.execute(text("ALTER TABLE plant_groups ADD COLUMN last_watered_at DATETIME"))
