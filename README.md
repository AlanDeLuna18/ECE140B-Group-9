# ECE140B Group 9 - Smart Watering

Smart Watering is a Dockerized plant watering dashboard with:

- InfluxDB for sensor readings and watering event history
- FastAPI for backend APIs, watering decisions, and ESP32 pump commands
- SQLite for app settings such as plant types, physical plants, and devices
- Next.js dashboard for managing plants, devices, manual watering, and sensor history
- ESP32 firmware for sensor upload, device discovery, display, and pump command execution

## Project Structure

```text
smart-watering/
  infrastructure/
    docker-compose.yml
  backend/
    app/
      main.py
      config.py
      database.py
      models.py
      schemas.py
      influx_client.py
      routes/
      services/
    data/
      app.db
    Dockerfile
    requirements.txt
  frontend/
    app/
    components/
    lib/
    Dockerfile
    package.json
  firmware/
    esp32/
      include/
      src/
      platformio.ini
```

## Services

| Service | URL | Purpose |
| --- | --- | --- |
| Frontend | http://localhost:3000 | Next.js dashboard |
| Backend | http://localhost:8000 | FastAPI API |
| Backend Docs | http://localhost:8000/docs | Interactive API docs |
| InfluxDB | http://localhost:8086 | Time-series database UI |

## Run

```bash
cd smart-watering/infrastructure
docker compose up --build -d
docker ps
```

Stop services:

```bash
cd smart-watering/infrastructure
docker compose down
```

## Backend

Backend stack:

- FastAPI
- SQLAlchemy
- SQLite at `smart-watering/backend/data/app.db`
- InfluxDB

SQLite tables are created automatically on backend startup. For local development, deleting `smart-watering/backend/data/app.db` resets the app settings database.


## Frontend

Frontend stack:

- Next.js
- TypeScript
- Tailwind CSS
- Recharts

Dashboard features:

- Create, edit, and delete plant types
- Create and delete My Plants / physical plant groups
- Show moisture status badges on plant cards
- Show auto water status without strong color coding
- Manual Water button on plant cards
- More Info page per plant group
- Assign and remove ESP32 devices
- Detected device dropdown marks devices already in use
- Current moisture gauge
- Moisture graph with watering event markers
- Watering event history with pagination

## Watering Logic

When sensor data is posted:

1. The backend writes the reading to InfluxDB.
2. It looks up the device in SQLite.
3. It finds the plant group and plant type.
4. It compares moisture against the plant type thresholds.
5. If auto mode is enabled and moisture is below the minimum, a pump command is queued for the ESP32.
6. Watering events are written to InfluxDB.

Manual watering:

1. The dashboard sends a manual water request to the backend.
2. The backend checks the plant group's cooldown and assigned ESP32 device.
3. If watering is allowed, a pump command is queued for that ESP32.
4. The ESP32 polls for commands, runs the pump, then acknowledges completion.

Cooldown:

- Group-level cooldown is currently 30 seconds.
- If one device waters a plant group, the group is considered in cooldown.

The ESP32 does not decide when to water. Auto mode, manual watering, cooldowns, and thresholds are server/dashboard decisions.

## ESP32 Firmware

Firmware lives in `smart-watering/firmware/esp32`.

The ESP32:

- Sends discovery heartbeats to `POST /api/devices/heartbeat`
- Posts moisture readings to `POST /api/sensor-data`
- Polls `GET /api/devices/{device_id}/commands/next`
- Runs the active-LOW pump relay only when the backend returns a water command
- Acknowledges completed commands with `POST /api/devices/{device_id}/commands/{command_id}/ack`

## Notes

- ESP32 discovery is heartbeat-based. `GET /api/devices/detected` returns devices seen recently.
- Backend pump control uses queued commands that the ESP32 polls and executes.
- Plant moisture suggestions are dummy values, not AI-generated recommendations.
