from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.influx_client import influx_sensor_client
from app.models import Device, PlantGroup, PlantType
from app.schemas import (
    AutoModeUpdate,
    DeviceResponse,
    PlantGroupCreate,
    PlantGroupDetail,
    PlantGroupResponse,
    SensorHistoryPoint,
    WateringEventPoint,
)

router = APIRouter(prefix="/api/plant-groups", tags=["plant groups"])


@router.get("", response_model=list[PlantGroupResponse])
def list_plant_groups(db: Session = Depends(get_db)) -> list[PlantGroup]:
    """List physical plants."""

    return db.query(PlantGroup).order_by(PlantGroup.id).all()


@router.post("", response_model=PlantGroupResponse, status_code=status.HTTP_201_CREATED)
def create_plant_group(group: PlantGroupCreate, db: Session = Depends(get_db)) -> PlantGroup:
    """Create one physical plant assigned to a plant type."""

    plant_type = db.query(PlantType).filter(PlantType.plant_type_id == group.plant_type_id).first()
    if plant_type is None:
        raise HTTPException(status_code=400, detail="plant_type_id does not exist")

    db_group = PlantGroup(**group.model_dump())
    db.add(db_group)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="group_id already exists") from exc

    db.refresh(db_group)
    return db_group


@router.get("/{group_id}", response_model=PlantGroupDetail)
def get_plant_group(group_id: str, db: Session = Depends(get_db)) -> PlantGroupDetail:
    """Get one physical plant with plant type and assigned devices."""

    group = _get_group_or_404(db, group_id)
    plant_type = _get_plant_type_or_404(db, group.plant_type_id)
    devices = db.query(Device).filter(Device.group_id == group.group_id).order_by(Device.id).all()
    return PlantGroupDetail(group=group, plant_type=plant_type, devices=devices)


@router.delete("/{group_id}", response_model=PlantGroupResponse)
def delete_plant_group(group_id: str, db: Session = Depends(get_db)) -> PlantGroupResponse:
    """Delete one physical plant and unassign its devices."""

    group = _get_group_or_404(db, group_id)
    response = PlantGroupResponse.model_validate(group)

    devices = db.query(Device).filter(Device.group_id == group.group_id).all()
    for device in devices:
        device.group_id = None

    db.delete(group)
    db.commit()
    return response


@router.post("/{group_id}/devices/{device_id}", response_model=DeviceResponse)
def assign_device_to_group(group_id: str, device_id: str, db: Session = Depends(get_db)) -> Device:
    """Assign an existing or detected ESP32 device to a physical plant group."""

    _get_group_or_404(db, group_id)
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if device is None:
        device = Device(device_id=device_id, name=_detected_device_name(device_id), group_id=group_id)
        db.add(device)
    elif device.group_id and device.group_id != group_id:
        raise HTTPException(
            status_code=400,
            detail=f"{device_id} is already assigned to {device.group_id}. Remove it there before assigning it to another plant.",
        )
    else:
        device.group_id = group_id

    db.commit()
    db.refresh(device)
    return device


@router.delete("/{group_id}/devices/{device_id}", response_model=DeviceResponse)
def remove_device_from_group(group_id: str, device_id: str, db: Session = Depends(get_db)) -> Device:
    """Unassign a device from a physical plant group."""

    device = db.query(Device).filter(Device.device_id == device_id, Device.group_id == group_id).first()
    if device is None:
        raise HTTPException(status_code=404, detail="device not found in this plant group")

    device.group_id = None
    db.commit()
    db.refresh(device)
    return device


@router.patch("/{group_id}/auto-mode", response_model=PlantGroupResponse)
def update_auto_mode(group_id: str, update: AutoModeUpdate, db: Session = Depends(get_db)) -> PlantGroup:
    """Enable or disable automatic watering for a physical plant group."""

    group = _get_group_or_404(db, group_id)
    group.auto_mode = update.auto_mode
    db.commit()
    db.refresh(group)
    return group


@router.get("/{group_id}/sensor-history", response_model=list[SensorHistoryPoint])
def get_sensor_history(group_id: str, db: Session = Depends(get_db)) -> list[dict[str, str | float | None]]:
    """Return recent moisture readings for all devices in a physical plant group."""

    _get_group_or_404(db, group_id)
    return influx_sensor_client.query_sensor_history(group_id)


@router.get("/{group_id}/watering-events", response_model=list[WateringEventPoint])
def get_watering_events(group_id: str, db: Session = Depends(get_db)) -> list[dict[str, str | float | None]]:
    """Return recent watering events for a physical plant group."""

    _get_group_or_404(db, group_id)
    return influx_sensor_client.query_watering_events(group_id)


def _get_group_or_404(db: Session, group_id: str) -> PlantGroup:
    group = db.query(PlantGroup).filter(PlantGroup.group_id == group_id).first()
    if group is None:
        raise HTTPException(status_code=404, detail="plant group not found")
    return group


def _get_plant_type_or_404(db: Session, plant_type_id: str) -> PlantType:
    plant_type = db.query(PlantType).filter(PlantType.plant_type_id == plant_type_id).first()
    if plant_type is None:
        raise HTTPException(status_code=404, detail="plant type not found")
    return plant_type


def _detected_device_name(device_id: str) -> str:
    suffix = device_id.removeprefix("device-")
    return f"ESP32 Unit {suffix}" if suffix != device_id else device_id
