from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

from app.config import settings
from app.schemas import SensorData


class InfluxSensorClient:
    """wrapper around InfluxDB writes for plant sensor readings."""

    def __init__(self) -> None:
        self.client = InfluxDBClient(
            url=settings.influx_url,
            token=settings.influx_token,
            org=settings.influx_org,
        )
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
        self.query_api = self.client.query_api()

    def write_sensor_data(self, data: SensorData, group_id: str, plant_type_id: str) -> None:
        # Store sensor readings in the plant_sensor measurement with searchable tags.
        point = (
            Point("plant_sensor")
            .tag("device_id", data.device_id)
            .tag("group_id", group_id)
            .tag("plant_type_id", plant_type_id)
            .field("moisture", data.moisture)
            .field("temperature", data.temperature)
        )

        self.write_api.write(
            bucket=settings.influx_bucket,
            org=settings.influx_org,
            record=point,
        )

    def write_watering_event(
        self,
        group_id: str,
        source: str,
        duration_seconds: int,
        device_id: str | None = None,
        moisture: float | None = None,
    ) -> None:
        # Store pump activity so manual and automatic watering are visible in history.
        point = (
            Point("watering_event")
            .tag("group_id", group_id)
            .tag("source", source)
            .field("duration_seconds", duration_seconds)
        )
        if device_id is not None:
            point = point.tag("device_id", device_id)
        if moisture is not None:
            point = point.field("moisture", moisture)

        self.write_api.write(
            bucket=settings.influx_bucket,
            org=settings.influx_org,
            record=point,
        )

    def query_sensor_history(self, group_id: str) -> list[dict[str, str | float | None]]:
        query = f'''
from(bucket: "{settings.influx_bucket}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "plant_sensor")
  |> filter(fn: (r) => r.group_id == "{group_id}")
  |> filter(fn: (r) => r._field == "moisture" or r._field == "temperature")
  |> pivot(rowKey:["_time", "device_id"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "device_id", "moisture", "temperature"])
  |> sort(columns: ["_time"])
'''
        return self._query_records(query, include_group_id=False)

    def query_watering_events(self, group_id: str) -> list[dict[str, str | float | None]]:
        query = f'''
from(bucket: "{settings.influx_bucket}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "watering_event")
  |> filter(fn: (r) => r.group_id == "{group_id}")
  |> filter(fn: (r) => r._field == "duration_seconds" or r._field == "moisture")
  |> pivot(rowKey:["_time", "group_id", "source"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "group_id", "source", "duration_seconds", "moisture"])
  |> sort(columns: ["_time"], desc: true)
'''
        return self._query_records(query, include_group_id=True)

    def _query_records(self, query: str, include_group_id: bool) -> list[dict[str, str | float | None]]:
        tables = self.query_api.query(query=query, org=settings.influx_org)
        records: list[dict[str, str | float | None]] = []
        for table in tables:
            for record in table.records:
                item = {
                    "time": record.get_time().isoformat() if record.get_time() else "",
                    "device_id": record.values.get("device_id"),
                    "moisture": record.values.get("moisture"),
                    "temperature": record.values.get("temperature"),
                }
                if include_group_id:
                    item = {
                        "time": record.get_time().isoformat() if record.get_time() else "",
                        "group_id": record.values.get("group_id"),
                        "source": record.values.get("source"),
                        "duration_seconds": record.values.get("duration_seconds"),
                        "moisture": record.values.get("moisture"),
                    }
                records.append(item)
        return records


influx_sensor_client = InfluxSensorClient()
