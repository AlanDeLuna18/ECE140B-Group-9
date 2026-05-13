from fastapi import APIRouter, Cookie, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.models import PlantGroup, PlantType
from app.schemas import PlantTypeCreate, PlantTypeResponse, PlantTypeSuggestion, PlantTypeUpdate

router = APIRouter(prefix="/api/plant-types", tags=["plant types"])

DUMMY_SUGGESTIONS: dict[str, tuple[float, float]] = {
    "basil": (45, 65),
    "succulent": (20, 35),
    "tomato": (50, 70),
    "orchid": (40, 60),
}
DEFAULT_SUGGESTION = (35, 55)


def get_current_user(session_token: str | None = Cookie(None)):
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    with engine.connect() as conn:
        user = conn.execute(
            text(
                """
                SELECT users.id, users.username FROM sessions
                JOIN users ON sessions.user_id = users.id
                WHERE sessions.session_token = :st
                """
            ),
            {"st": session_token},
        ).mappings().first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user


@router.get("", response_model=list[PlantTypeResponse])
def list_plant_types(db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> list[PlantType]:
    """List reusable plant categories for the logged-in user."""

    return db.query(PlantType).filter(PlantType.user_id == current_user["id"]).order_by(PlantType.id).all()


@router.post("", response_model=PlantTypeResponse, status_code=status.HTTP_201_CREATED)
def create_plant_type(
    plant_type: PlantTypeCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> PlantType:
    """Create a reusable plant category with moisture thresholds for the logged-in user."""

    duplicate = (
        db.query(PlantType)
        .filter(
            PlantType.user_id == current_user["id"],
            (PlantType.plant_type_id == plant_type.plant_type_id) | (PlantType.name == plant_type.name),
        )
        .first()
    )
    if duplicate is not None:
        raise HTTPException(status_code=400, detail="plant_type_id or name already exists")

    db_plant_type = PlantType(**plant_type.model_dump(), user_id=current_user["id"])
    db.add(db_plant_type)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="plant_type_id or name already exists") from exc

    db.refresh(db_plant_type)
    return db_plant_type


@router.patch("/{plant_type_id}", response_model=PlantTypeResponse)
def update_plant_type(
    plant_type_id: str,
    update: PlantTypeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> PlantType:
    """Update one of the logged-in user's reusable plant categories."""

    db_plant_type = (
        db.query(PlantType)
        .filter(PlantType.plant_type_id == plant_type_id, PlantType.user_id == current_user["id"])
        .first()
    )
    if db_plant_type is None:
        raise HTTPException(status_code=404, detail="plant type not found")

    duplicate_name = (
        db.query(PlantType)
        .filter(
            PlantType.user_id == current_user["id"],
            PlantType.name == update.name,
            PlantType.plant_type_id != plant_type_id,
        )
        .first()
    )
    if duplicate_name is not None:
        raise HTTPException(status_code=400, detail="plant type name already exists")

    db_plant_type.name = update.name
    db_plant_type.ideal_moisture_min = update.ideal_moisture_min
    db_plant_type.ideal_moisture_max = update.ideal_moisture_max
    db_plant_type.suggestion_source = "manual"
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="plant type name already exists") from exc

    db.refresh(db_plant_type)
    return db_plant_type


@router.delete("/{plant_type_id}", response_model=PlantTypeResponse)
def delete_plant_type(
    plant_type_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> PlantType:
    """Delete one of the logged-in user's plant types if no physical plants are using it."""

    db_plant_type = (
        db.query(PlantType)
        .filter(PlantType.plant_type_id == plant_type_id, PlantType.user_id == current_user["id"])
        .first()
    )
    if db_plant_type is None:
        raise HTTPException(status_code=404, detail="plant type not found")

    group_using_type = (
        db.query(PlantGroup)
        .filter(PlantGroup.plant_type_id == plant_type_id, PlantGroup.user_id == current_user["id"])
        .first()
    )
    if group_using_type is not None:
        raise HTTPException(status_code=400, detail="delete plants using this plant type first")

    response = PlantTypeResponse.model_validate(db_plant_type)
    db.delete(db_plant_type)
    db.commit()
    return response


@router.get("/suggestions", response_model=dict[str, PlantTypeSuggestion])
def list_suggestions() -> dict[str, PlantTypeSuggestion]:
    """Return all dummy plant moisture suggestions."""

    suggestions = {
        name: PlantTypeSuggestion(
            name=name.title(),
            ideal_moisture_min=limits[0],
            ideal_moisture_max=limits[1],
        )
        for name, limits in DUMMY_SUGGESTIONS.items()
    }
    suggestions["default"] = PlantTypeSuggestion(
        name="Default",
        ideal_moisture_min=DEFAULT_SUGGESTION[0],
        ideal_moisture_max=DEFAULT_SUGGESTION[1],
    )
    return suggestions


@router.get("/suggestions/{plant_name}", response_model=PlantTypeSuggestion)
def get_suggestion(plant_name: str) -> PlantTypeSuggestion:
    """Return a dummy moisture suggestion for a plant name."""

    normalized_name = plant_name.strip().lower()
    moisture_min, moisture_max = DUMMY_SUGGESTIONS.get(normalized_name, DEFAULT_SUGGESTION)
    return PlantTypeSuggestion(
        name=plant_name.strip().title() or "Default",
        ideal_moisture_min=moisture_min,
        ideal_moisture_max=moisture_max,
    )
