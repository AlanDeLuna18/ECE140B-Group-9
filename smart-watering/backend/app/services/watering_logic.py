from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.influx_client import influx_sensor_client
from app.models import Device, PlantGroup, PlantType, PumpCommand
from app.schemas import SensorData, WateringDecision

COOLDOWN_SECONDS = 30
DEFAULT_WATERING_SECONDS = 5


def decide_and_water(data: SensorData, db: Session) -> WateringDecision:
    """Decide whether a sensor reading should trigger automatic watering."""

    device = db.query(Device).filter(Device.device_id == data.device_id).first()
    if device is None:
        return WateringDecision(
            device_id=data.device_id,
            group_id=None,
            plant_type_id=None,
            plant_type_name=None,
            moisture=data.moisture,
            ideal_moisture_min=None,
            ideal_moisture_max=None,
            should_water=False,
            pump_action="none",
            reason="Device not found in SQLite settings",
        )

    group = db.query(PlantGroup).filter(PlantGroup.group_id == device.group_id).first() if device.group_id else None
    if group is None:
        return WateringDecision(
            device_id=device.device_id,
            group_id=device.group_id,
            plant_type_id=None,
            plant_type_name=None,
            moisture=data.moisture,
            ideal_moisture_min=None,
            ideal_moisture_max=None,
            should_water=False,
            pump_action="none",
            reason="Assigned plant group not found in SQLite settings",
        )

    plant_type = db.query(PlantType).filter(PlantType.plant_type_id == group.plant_type_id, PlantType.user_id == group.user_id).first()
    if plant_type is None:
        return WateringDecision(
            device_id=device.device_id,
            group_id=group.group_id,
            plant_type_id=group.plant_type_id,
            plant_type_name=None,
            moisture=data.moisture,
            ideal_moisture_min=None,
            ideal_moisture_max=None,
            should_water=False,
            pump_action="none",
            reason="Plant type not found in SQLite settings",
        )

    influx_sensor_client.write_sensor_data(
        data=data,
        group_id=group.group_id,
        plant_type_id=plant_type.plant_type_id,
    )

    if not group.auto_mode:
        return _decision(data, device, group, plant_type, False, "none", "Auto mode is disabled")

    if data.moisture >= plant_type.ideal_moisture_min:
        return _decision(
            data,
            device,
            group,
            plant_type,
            False,
            "none",
            "Moisture is above or equal to plant minimum threshold",
        )

    if _is_group_in_cooldown(group):
        return _decision(
            data,
            device,
            group,
            plant_type,
            False,
            "none",
            "Watering skipped because plant group is in cooldown period",
        )

    existing_command = _find_pending_command(db, device_id=device.device_id, group_id=group.group_id)
    if existing_command is not None:
        return _decision(
            data,
            device,
            group,
            plant_type,
            True,
            "queued",
            "Moisture is below threshold and a pump command is already queued",
            command_id=existing_command.id,
        )

    command = _queue_water_command(
        db=db,
        device_id=device.device_id,
        group_id=group.group_id,
        source="auto",
        duration_seconds=DEFAULT_WATERING_SECONDS,
    )
    _mark_group_watered(db, group)
    db.commit()
    influx_sensor_client.write_watering_event(
        group_id=group.group_id,
        source="auto",
        duration_seconds=DEFAULT_WATERING_SECONDS,
        device_id=device.device_id,
        moisture=data.moisture,
    )

    return _decision(
        data,
        device,
        group,
        plant_type,
        True,
        "queued",
        "Moisture is below plant minimum threshold; pump command queued",
        command_id=command.id,
    )


def manual_water(
    device_id: str,
    db: Session,
    duration_seconds: int = DEFAULT_WATERING_SECONDS,
    user_id: int | None = None,
) -> dict[str, str | int | None]:
    """Queue watering manually for a device and update persistence."""

    device = db.query(Device).filter(Device.device_id == device_id).first()
    if device is None:
        return {
            "device_id": device_id,
            "group_id": None,
            "action": "none",
            "source": "manual",
            "duration_seconds": 0,
            "status": "device_not_found",
        }

    group = _get_device_group(db, device, user_id)
    if device.group_id and group is None:
        return {
            "device_id": device_id,
            "group_id": device.group_id,
            "action": "none",
            "source": "manual",
            "duration_seconds": 0,
            "status": "no_group",
        }

    if group is not None and _is_group_in_cooldown(group):
        return {
            "device_id": device_id,
            "group_id": group.group_id,
            "action": "none",
            "source": "manual",
            "duration_seconds": 0,
            "status": "cooldown",
        }

    existing_command = _find_pending_command(db, device_id=device.device_id, group_id=group.group_id if group else None)
    if existing_command is not None:
        return {
            "command_id": existing_command.id,
            "device_id": device_id,
            "group_id": group.group_id if group else None,
            "action": "water",
            "source": "manual",
            "duration_seconds": existing_command.duration_seconds,
            "status": "already_queued",
        }

    command = _queue_water_command(
        db=db,
        device_id=device.device_id,
        group_id=group.group_id if group else None,
        source="manual",
        duration_seconds=duration_seconds,
    )
    if group is not None:
        _mark_group_watered(db, group)
    db.commit()

    if group is not None:
        influx_sensor_client.write_watering_event(
            group_id=group.group_id,
            source="manual",
            duration_seconds=duration_seconds,
            device_id=device_id,
        )
    return {
        "command_id": command.id,
        "device_id": device_id,
        "group_id": group.group_id if group else None,
        "action": "water",
        "source": "manual",
        "duration_seconds": duration_seconds,
        "status": "queued",
    }


def manual_water_group(
    group_id: str,
    db: Session,
    duration_seconds: int = DEFAULT_WATERING_SECONDS,
    user_id: int | None = None,
) -> dict[str, str | int | None]:
    """Queue watering manually for the ESP32 assigned to a physical plant group."""

    group_query = db.query(PlantGroup).filter(PlantGroup.group_id == group_id)
    if user_id is not None:
        group_query = group_query.filter(PlantGroup.user_id == user_id)

    group = group_query.first()
    if group is None:
        return {
            "group_id": group_id,
            "device_id": None,
            "action": "none",
            "source": "manual",
            "duration_seconds": 0,
            "status": "group_not_found",
        }

    if _is_group_in_cooldown(group):
        return {
            "group_id": group_id,
            "action": "none",
            "source": "manual",
            "duration_seconds": 0,
            "status": "cooldown",
        }

    device = db.query(Device).filter(Device.group_id == group.group_id).order_by(Device.id).first()
    if device is None:
        return {
            "group_id": group_id,
            "device_id": None,
            "action": "none",
            "source": "manual",
            "duration_seconds": 0,
            "status": "no_device",
        }

    existing_command = _find_pending_command(db, device_id=device.device_id, group_id=group.group_id)
    if existing_command is not None:
        return {
            "command_id": existing_command.id,
            "group_id": group_id,
            "device_id": device.device_id,
            "action": "water",
            "source": "manual",
            "duration_seconds": existing_command.duration_seconds,
            "status": "already_queued",
        }

    command = _queue_water_command(
        db=db,
        device_id=device.device_id,
        group_id=group.group_id,
        source="manual",
        duration_seconds=duration_seconds,
    )
    _mark_group_watered(db, group)
    db.commit()

    influx_sensor_client.write_watering_event(
        group_id=group_id,
        source="manual",
        duration_seconds=duration_seconds,
        device_id=device.device_id,
    )
    return {
        "command_id": command.id,
        "group_id": group_id,
        "device_id": device.device_id,
        "action": "water",
        "source": "manual",
        "duration_seconds": duration_seconds,
        "status": "queued",
    }


def _is_group_in_cooldown(group: PlantGroup) -> bool:
    if group.last_watered_at is None:
        return False

    cooldown_started_at = datetime.utcnow() - timedelta(seconds=COOLDOWN_SECONDS)
    return group.last_watered_at > cooldown_started_at


def _mark_group_watered(db: Session, group: PlantGroup) -> None:
    watered_at = datetime.utcnow()
    group.last_watered_at = watered_at


def _get_device_group(db: Session, device: Device, user_id: int | None) -> PlantGroup | None:
    if not device.group_id:
        return None

    query = db.query(PlantGroup).filter(PlantGroup.group_id == device.group_id)
    if user_id is not None:
        query = query.filter(PlantGroup.user_id == user_id)

    return query.first()


def _find_pending_command(db: Session, device_id: str, group_id: str | None) -> PumpCommand | None:
    query = (
        db.query(PumpCommand)
        .filter(
            PumpCommand.device_id == device_id,
            PumpCommand.action == "water",
            PumpCommand.status == "pending",
        )
        .order_by(PumpCommand.id)
    )
    if group_id is None:
        query = query.filter(PumpCommand.group_id.is_(None))
    else:
        query = query.filter(PumpCommand.group_id == group_id)

    return query.first()


def _queue_water_command(
    db: Session,
    device_id: str,
    group_id: str | None,
    source: str,
    duration_seconds: int,
) -> PumpCommand:
    command = PumpCommand(
        device_id=device_id,
        group_id=group_id,
        action="water",
        source=source,
        duration_seconds=duration_seconds,
        status="pending",
    )
    db.add(command)
    db.flush()
    return command


def _decision(
    data: SensorData,
    device: Device,
    group: PlantGroup,
    plant_type: PlantType,
    should_water: bool,
    pump_action: str,
    reason: str,
    command_id: int | None = None,
) -> WateringDecision:
    return WateringDecision(
        device_id=device.device_id,
        group_id=group.group_id,
        plant_type_id=plant_type.plant_type_id,
        plant_type_name=plant_type.name,
        moisture=data.moisture,
        ideal_moisture_min=plant_type.ideal_moisture_min,
        ideal_moisture_max=plant_type.ideal_moisture_max,
        should_water=should_water,
        pump_action=pump_action,
        reason=reason,
        command_id=command_id,
    )
