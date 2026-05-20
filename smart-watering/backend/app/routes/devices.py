from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Device, PlantGroup, PumpCommand
from app.schemas import CommandAck, DetectedDevice, DeviceCommandResponse, DeviceCreate, DeviceHeartbeat, DeviceResponse

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
    _clear_stale_device_assignments(db, groups)
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

    groups = {group.group_id for group in db.query(PlantGroup).all()}
    device = db.query(Device).filter(Device.device_id == heartbeat.device_id).first()
    if device is None:
        device = Device(device_id=heartbeat.device_id, name=heartbeat.name)
        db.add(device)
    elif device.group_id and device.group_id not in groups:
        device.group_id = None

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


@router.get("/{device_id}/commands/next", response_model=DeviceCommandResponse)
def get_next_command(device_id: str, db: Session = Depends(get_db)) -> DeviceCommandResponse:
    """Return the next pending server command for an ESP32."""

    command = (
        db.query(PumpCommand)
        .filter(PumpCommand.device_id == device_id, PumpCommand.status == "pending")
        .order_by(PumpCommand.id)
        .first()
    )
    if command is None:
        return DeviceCommandResponse()

    command.status = "sent"
    command.sent_at = datetime.utcnow()
    db.commit()
    db.refresh(command)
    return DeviceCommandResponse(
        command_id=command.id,
        action=command.action,
        group_id=command.group_id,
        source=command.source,
        duration_seconds=command.duration_seconds,
    )


@router.post("/{device_id}/commands/{command_id}/ack", response_model=DeviceCommandResponse)
def acknowledge_command(
    device_id: str,
    command_id: int,
    ack: CommandAck,
    db: Session = Depends(get_db),
) -> DeviceCommandResponse:
    """Mark a command completed after the ESP32 runs it."""

    command = (
        db.query(PumpCommand)
        .filter(PumpCommand.id == command_id, PumpCommand.device_id == device_id)
        .first()
    )
    if command is None:
        raise HTTPException(status_code=404, detail="command not found")

    command.status = ack.status
    command.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(command)
    return DeviceCommandResponse(
        command_id=command.id,
        action=command.action,
        group_id=command.group_id,
        source=command.source,
        duration_seconds=command.duration_seconds,
    )


def _detected_device_name(device_id: str) -> str:
    suffix = device_id.removeprefix("device-")
    return f"ESP32 Unit {suffix}" if suffix != device_id else device_id


def _clear_stale_device_assignments(db: Session, groups: dict[str, str]) -> None:
    group_ids = list(groups.keys())
    if not group_ids:
        stale_devices = db.query(Device).filter(Device.group_id.is_not(None)).all()
    else:
        stale_devices = db.query(Device).filter(Device.group_id.is_not(None), ~Device.group_id.in_(group_ids)).all()
    if not stale_devices:
        return

    for device in stale_devices:
        device.group_id = None

    db.commit()
