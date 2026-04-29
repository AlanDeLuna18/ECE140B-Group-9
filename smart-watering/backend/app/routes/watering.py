from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import PumpActionResponse
from app.services.watering_logic import manual_water, manual_water_group

router = APIRouter(prefix="/api/watering", tags=["watering"])


@router.post("/manual/{device_id}", response_model=PumpActionResponse)
def manually_water_device(device_id: str, db: Session = Depends(get_db)) -> dict[str, str | int]:
    """Trigger mock pump control for a device, independent of auto mode."""

    return manual_water(device_id=device_id, db=db)


@router.post("/manual/group/{group_id}", response_model=PumpActionResponse)
def manually_water_group(group_id: str, db: Session = Depends(get_db)) -> dict[str, str | int]:
    """Trigger mock pump control for a physical plant group."""

    return manual_water_group(group_id=group_id, db=db)
