from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.influx_client import influx_sensor_client
from app.models import Device, PlantGroup, PlantType
from app.schemas import SensorData, WateringDecision
from app.services.pump_control import trigger_pump

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

    plant_type = db.query(PlantType).filter(PlantType.plant_type_id == group.plant_type_id).first()
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
            "Watering skipped because device is in cooldown period",
        )

    trigger_pump(device.device_id, DEFAULT_WATERING_SECONDS)
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
        "pump_on",
        "Moisture is below plant minimum threshold",
    )


def manual_water(device_id: str, db: Session, duration_seconds: int = DEFAULT_WATERING_SECONDS) -> dict[str, str | int]:
    """Trigger mock watering manually and update persistence."""

    pump_result = trigger_pump(device_id, duration_seconds)
    device = db.query(Device).filter(Device.device_id == device_id).first()
    group_id = "unknown"
    if device is not None:
        group_id = device.group_id or "unknown"
        group = db.query(PlantGroup).filter(PlantGroup.group_id == device.group_id).first()
        if group is not None:
            if _is_group_in_cooldown(group):
                return {
                    "device_id": device_id,
                    "group_id": group_id,
                    "action": "none",
                    "source": "manual",
                    "duration_seconds": 0,
                    "status": "cooldown",
                }
            _mark_group_watered(db, group)
            db.commit()

    influx_sensor_client.write_watering_event(
        group_id=group_id,
        source="manual",
        duration_seconds=duration_seconds,
        device_id=device_id,
    )
    pump_result["group_id"] = group_id
    pump_result["source"] = "manual"
    return pump_result


def manual_water_group(group_id: str, db: Session, duration_seconds: int = DEFAULT_WATERING_SECONDS) -> dict[str, str | int]:
    """Trigger mock watering for a physical plant group."""

    group = db.query(PlantGroup).filter(PlantGroup.group_id == group_id).first()
    if group is not None:
        if _is_group_in_cooldown(group):
            return {
                "group_id": group_id,
                "action": "none",
                "source": "manual",
                "duration_seconds": 0,
                "status": "cooldown",
            }

        pump_result = trigger_pump(group_id, duration_seconds)
        _mark_group_watered(db, group)
        db.commit()
    else:
        pump_result = trigger_pump(group_id, duration_seconds)

    influx_sensor_client.write_watering_event(
        group_id=group_id,
        source="manual",
        duration_seconds=duration_seconds,
    )
    return {
        "group_id": group_id,
        "action": pump_result["action"],
        "source": "manual",
        "duration_seconds": duration_seconds,
        "status": pump_result["status"],
    }


def _is_group_in_cooldown(group: PlantGroup) -> bool:
    if group.last_watered_at is None:
        return False

    cooldown_started_at = datetime.utcnow() - timedelta(seconds=COOLDOWN_SECONDS)
    return group.last_watered_at > cooldown_started_at


def _mark_group_watered(db: Session, group: PlantGroup) -> None:
    watered_at = datetime.utcnow()
    group.last_watered_at = watered_at


def _decision(
    data: SensorData,
    device: Device,
    group: PlantGroup,
    plant_type: PlantType,
    should_water: bool,
    pump_action: str,
    reason: str,
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
    )
