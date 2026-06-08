from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.schemas import PumpActionResponse
from app.services.watering_logic import manual_water as queue_manual_water
from app.services.watering_logic import manual_water_group as queue_manual_water_group

router = APIRouter(prefix="/api/watering", tags=["watering"])


@router.post("/manual/{device_id}", response_model=PumpActionResponse)
def manually_water_device(
    device_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict[str, str | int | None]:
    """Queue a pump command for a device, independent of auto mode."""

    return queue_manual_water(device_id=device_id, db=db, user_id=current_user["id"])


@router.post("/manual/group/{group_id}", response_model=PumpActionResponse)
def manually_water_group(
    group_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict[str, str | int | None]:
    """Queue a pump command for a physical plant group."""

    return queue_manual_water_group(group_id=group_id, db=db, user_id=current_user["id"])
