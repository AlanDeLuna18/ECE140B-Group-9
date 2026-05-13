from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# Plant sensor readings written to InfluxDB.
class SensorData(BaseModel):
    device_id: str = Field(..., examples=["device-001"])
    moisture: float = Field(..., examples=[42.5])
    temperature: float = Field(..., examples=[23.1])


class SensorWriteResponse(BaseModel):
    status: str
    message: str
    data: SensorData


class WateringDecision(BaseModel):
    device_id: str
    group_id: str | None
    plant_type_id: str | None
    plant_type_name: str | None
    moisture: float
    ideal_moisture_min: float | None
    ideal_moisture_max: float | None
    should_water: bool
    pump_action: str
    reason: str


class PlantTypeCreate(BaseModel):
    plant_type_id: str = Field(..., examples=["type-basil"])
    name: str = Field(..., examples=["Basil"])
    ideal_moisture_min: float = Field(..., examples=[45])
    ideal_moisture_max: float = Field(..., examples=[65])
    suggestion_source: str = Field(default="manual", examples=["manual"])


class PlantTypeUpdate(BaseModel):
    name: str = Field(..., examples=["Basil"])
    ideal_moisture_min: float = Field(..., examples=[45])
    ideal_moisture_max: float = Field(..., examples=[65])


class PlantTypeResponse(PlantTypeCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None = None
    created_at: datetime


class PlantTypeSuggestion(BaseModel):
    name: str
    ideal_moisture_min: float
    ideal_moisture_max: float
    suggestion_source: str = "dummy"


class PlantGroupCreate(BaseModel):
    group_id: str = Field(..., examples=["group-kitchen-basil"])
    name: str = Field(..., examples=["Kitchen Basil"])
    plant_type_id: str = Field(..., examples=["type-basil"])


class PlantGroupResponse(PlantGroupCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    auto_mode: bool
    last_watered_at: datetime | None
    created_at: datetime


class DeviceCreate(BaseModel):
    device_id: str = Field(..., examples=["device-001"])
    name: str = Field(..., examples=["ESP32 Unit 001"])
    group_id: str | None = Field(default=None, examples=["group-kitchen-basil"])


class DeviceResponse(DeviceCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ip_address: str | None = None
    firmware_version: str | None = None
    last_seen_at: datetime | None = None
    created_at: datetime


class DeviceHeartbeat(BaseModel):
    device_id: str = Field(..., examples=["device-001"])
    name: str = Field(..., examples=["ESP32 Unit 001"])
    ip_address: str | None = Field(default=None, examples=["192.168.1.42"])
    firmware_version: str | None = Field(default=None, examples=["0.1.0"])


class DetectedDevice(BaseModel):
    device_id: str
    name: str
    is_online: bool = True
    in_use: bool = False
    group_id: str | None = None
    group_name: str | None = None
    ip_address: str | None = None
    firmware_version: str | None = None
    last_seen_at: datetime | None = None


class AutoModeUpdate(BaseModel):
    auto_mode: bool


class SensorHistoryPoint(BaseModel):
    time: str
    device_id: str | None = None
    moisture: float | None = None
    temperature: float | None = None


class WateringEventPoint(BaseModel):
    time: str
    group_id: str
    source: str | None = None
    duration_seconds: float | None = None
    moisture: float | None = None


class PlantGroupDetail(BaseModel):
    group: PlantGroupResponse
    plant_type: PlantTypeResponse
    devices: list[DeviceResponse]


class PumpActionResponse(BaseModel):
    group_id: str | None = None
    device_id: str | None = None
    action: str
    source: str = "manual"
    duration_seconds: int
    status: str
