from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_tables
from app.routes.devices import router as devices_router
from app.routes.plant_groups import router as plant_groups_router
from app.routes.plant_types import router as plant_types_router
from app.routes.sensor import router as sensor_router
from app.routes.watering import router as watering_router

app = FastAPI(
    title="Smart Watering Backend",
    description="API for smart watering settings and plant sensor readings.",
    version="0.1.0",
)

# Allow the Next.js dashboard to call the FastAPI backend from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """Create SQLite tables before serving requests."""

    create_tables()


@app.get("/health")
def health() -> dict[str, str]:
    """Basic health check for Docker and local development."""

    return {"status": "ok"}


app.include_router(sensor_router)
app.include_router(plant_types_router)
app.include_router(plant_groups_router)
app.include_router(devices_router)
app.include_router(watering_router)
