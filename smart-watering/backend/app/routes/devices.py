from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Device, PlantGroup
from app.schemas import DetectedDevice, DeviceCreate, DeviceResponse

router = APIRouter(prefix="/api/devices", tags=["devices"])


@router.get("", response_model=list[DeviceResponse])
def list_devices(db: Session = Depends(get_db)) -> list[Device]:
    """List all configured devices."""

    return db.query(Device).order_by(Device.id).all()


@router.get("/detected", response_model=list[DetectedDevice])
def list_detected_devices(db: Session = Depends(get_db)) -> list[DetectedDevice]:
    """Return dummy detected ESP32 devices with assignment status."""

    configured_devices = {device.device_id: device for device in db.query(Device).order_by(Device.id).all()}
    groups = {group.group_id: group.name for group in db.query(PlantGroup).all()}
    detected_device_ids = [f"device-{index:03d}" for index in range(1, 25)]

    detected_devices: list[DetectedDevice] = []
    for device_id in detected_device_ids:
        configured_device = configured_devices.get(device_id)
        group_id = configured_device.group_id if configured_device else None
        configured_name = configured_device.name if configured_device else None
        detected_devices.append(
            DetectedDevice(
                device_id=device_id,
                name=configured_name if configured_name and configured_name != device_id else _detected_device_name(device_id),
                in_use=group_id is not None,
                group_id=group_id,
                group_name=groups.get(group_id) if group_id else None,
            )
        )

    return detected_devices


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
