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
    ensure_auth_tables()
    ensure_device_columns()
    ensure_plant_type_columns()
    ensure_plant_group_columns()


def ensure_auth_tables() -> None:
    """Create the simple dashboard auth tables used by the login routes."""

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username VARCHAR UNIQUE NOT NULL,
                    password_hash VARCHAR NOT NULL
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    session_token VARCHAR UNIQUE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )
        )


def ensure_device_columns() -> None:
    """Add simple new columns to an existing local SQLite database."""

    inspector = inspect(engine)
    if "devices" not in inspector.get_table_names():
        return

    device_columns = {column["name"] for column in inspector.get_columns("devices")}
    with engine.begin() as connection:
        if "last_watered_at" not in device_columns:
            connection.execute(text("ALTER TABLE devices ADD COLUMN last_watered_at DATETIME"))
        if "ip_address" not in device_columns:
            connection.execute(text("ALTER TABLE devices ADD COLUMN ip_address VARCHAR"))
        if "firmware_version" not in device_columns:
            connection.execute(text("ALTER TABLE devices ADD COLUMN firmware_version VARCHAR"))
        if "last_seen_at" not in device_columns:
            connection.execute(text("ALTER TABLE devices ADD COLUMN last_seen_at DATETIME"))


def ensure_plant_type_columns() -> None:
    """Add user ownership to plant types in the local SQLite database."""

    inspector = inspect(engine)
    if "plant_types" not in inspector.get_table_names():
        return

    plant_type_columns = {column["name"] for column in inspector.get_columns("plant_types")}
    with engine.begin() as connection:
        if "user_id" not in plant_type_columns:
            connection.execute(text("ALTER TABLE plant_types ADD COLUMN user_id INTEGER"))

        # Older local databases had globally unique plant type ids/names.
        # Plant types are now per user, so duplicates across users must be allowed.
        indexes = {index["name"] for index in inspector.get_indexes("plant_types")}
        if "ix_plant_types_plant_type_id" in indexes:
            connection.execute(text("DROP INDEX ix_plant_types_plant_type_id"))
        if "ix_plant_types_name" in indexes:
            connection.execute(text("DROP INDEX ix_plant_types_name"))

        first_user_id = connection.execute(text("SELECT id FROM users ORDER BY id LIMIT 1")).scalar()
        if first_user_id is not None:
            connection.execute(
                text("UPDATE plant_types SET user_id = :user_id WHERE user_id IS NULL"),
                {"user_id": first_user_id},
            )


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
        if "user_id" not in group_columns:
            connection.execute(text("ALTER TABLE plant_groups ADD COLUMN user_id INTEGER"))

        first_user_id = connection.execute(text("SELECT id FROM users ORDER BY id LIMIT 1")).scalar()
        if first_user_id is not None:
            connection.execute(
                text("UPDATE plant_groups SET user_id = :user_id WHERE user_id IS NULL"),
                {"user_id": first_user_id},
            )
