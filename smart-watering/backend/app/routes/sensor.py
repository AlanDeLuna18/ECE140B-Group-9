from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import SensorData, SensorWriteResponse, WateringDecision
from app.services.watering_logic import decide_and_water

router = APIRouter(prefix="/api", tags=["sensor"])


@router.post("/sensor-data", response_model=WateringDecision)
def create_sensor_data(data: SensorData, db: Session = Depends(get_db)) -> WateringDecision:
    """Write a plant sensor reading and return the watering decision."""

    return decide_and_water(data, db)


@router.get("/fake-sensor-data", response_model=SensorWriteResponse)
def create_fake_sensor_data() -> SensorWriteResponse:
    """Write a sample plant sensor reading into InfluxDB for quick testing."""

    fake_data = SensorData(
        device_id="device-001",
        moisture=42.5,
        temperature=23.1,
    )
    return SensorWriteResponse(
        status="success",
        message="Fake sensor data generated. Use POST /api/sensor-data to write it with group/type tags.",
        data=fake_data,
    )
