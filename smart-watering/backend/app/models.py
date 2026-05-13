from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Device(Base):
    """Watering controller or sensor device registered in the app."""

    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    group_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class PlantType(Base):
    """Reusable plant category and its watering preference range."""

    __tablename__ = "plant_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plant_type_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, index=True, nullable=False)
    ideal_moisture_min: Mapped[float] = mapped_column(Float, nullable=False)
    ideal_moisture_max: Mapped[float] = mapped_column(Float, nullable=False)
    suggestion_source: Mapped[str] = mapped_column(String, default="dummy", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class PlantGroup(Base):
    """One physical plant that can have multiple devices assigned to it."""

    __tablename__ = "plant_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    plant_type_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    auto_mode: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_watered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # ← ADD THIS
