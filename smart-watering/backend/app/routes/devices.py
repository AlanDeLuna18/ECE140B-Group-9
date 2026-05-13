from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Device, PlantGroup
from app.schemas import DetectedDevice, DeviceCreate, DeviceHeartbeat, DeviceResponse

router = APIRouter(prefix="/api/devices", tags=["devices"])

DEVICE_DISCOVERY_WINDOW_SECONDS = 20


@router.get("", response_model=list[DeviceResponse])
def list_devices(db: Session = Depends(get_db)) -> list[Device]:
    """List all configured devices."""

    return db.query(Device).order_by(Device.id).all()


@router.get("/detected", response_model=list[DetectedDevice])
def list_detected_devices(db: Session = Depends(get_db)) -> list[DetectedDevice]:
    """Return ESP32 devices currently online and available for assignment checks."""

    groups = {group.group_id: group.name for group in db.query(PlantGroup).all()}
    cutoff = datetime.utcnow() - timedelta(seconds=DEVICE_DISCOVERY_WINDOW_SECONDS)
    devices = (
        db.query(Device)
        .filter(Device.last_seen_at.is_not(None), Device.last_seen_at >= cutoff)
        .order_by(Device.name)
        .all()
    )

    detected_devices: list[DetectedDevice] = []
    for device in devices:
        detected_devices.append(
            DetectedDevice(
                device_id=device.device_id,
                name=device.name,
                is_online=True,
                in_use=device.group_id is not None,
                group_id=device.group_id,
                group_name=groups.get(device.group_id) if device.group_id else None,
                ip_address=device.ip_address,
                firmware_version=device.firmware_version,
                last_seen_at=device.last_seen_at,
            )
        )

    return detected_devices


@router.post("/heartbeat", response_model=DeviceResponse)
def receive_device_heartbeat(heartbeat: DeviceHeartbeat, db: Session = Depends(get_db)) -> Device:
    """Register that an ESP32 is online and available for assignment."""

    device = db.query(Device).filter(Device.device_id == heartbeat.device_id).first()
    if device is None:
        device = Device(device_id=heartbeat.device_id, name=heartbeat.name)
        db.add(device)

    device.name = heartbeat.name
    device.ip_address = heartbeat.ip_address
    device.firmware_version = heartbeat.firmware_version
    device.last_seen_at = datetime.utcnow()

    db.commit()
    db.refresh(device)
    return device


@router.post("", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
def create_device(device: DeviceCreate, db: Session = Depends(get_db)) -> Device:
    """Create a watering or sensor device."""

    group = db.query(PlantGroup).filter(PlantGroup.group_id == device.group_id).first() if device.group_id else None
    if device.group_id and group is None:
        raise HTTPException(status_code=400, detail="group_id does not exist")

    db_device = Device(**device.model_dump())
    db.add(db_device)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="device_id already exists") from exc

    db.refresh(db_device)
    return db_device


def _detected_device_name(device_id: str) -> str:
    suffix = device_id.removeprefix("device-")
    return f"ESP32 Unit {suffix}" if suffix != device_id else device_id
