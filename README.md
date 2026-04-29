# ECE140B Group 9 - Smart Watering

Smart Watering is a Dockerized plant watering dashboard with:

- InfluxDB for sensor readings and watering event history
- FastAPI for backend APIs, watering decisions, and mock pump control
- SQLite for app settings such as plant types, physical plants, and devices
- Next.js dashboard for managing plants, devices, manual watering, and sensor history

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
5. If auto mode is enabled and moisture is below the minimum, mock pump control is triggered.
6. Watering events are written to InfluxDB.

Cooldown:

- Group-level cooldown is currently 30 seconds.
- If one device waters a plant group, the group is considered in cooldown.

Pump control is mocked in `backend/app/services/pump_control.py`.

## Notes

- Real ESP32 discovery is not implemented yet. `GET /api/devices/detected` returns dummy ESP32 units.
- Pump control is mocked; no real hardware command is sent yet.
- Plant moisture suggestions are dummy values, not AI-generated recommendations.
