import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    """Application settings loaded from environment variables."""

    influx_url: str = os.getenv("INFLUX_URL", "http://influxdb:8086")
    influx_token: str = os.getenv("INFLUX_TOKEN", "plant-token")
    influx_org: str = os.getenv("INFLUX_ORG", "plant-org")
    influx_bucket: str = os.getenv("INFLUX_BUCKET", "plant-data")


settings = Settings()
