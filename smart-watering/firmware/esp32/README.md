# Smart Watering ESP32 Firmware

This PlatformIO project is the ESP32 side of the smart watering system.

It currently does these things:

- Connects the ESP32 to Wi-Fi.
- Sends a heartbeat to the FastAPI backend for device discovery.
- Reads a capacitive soil moisture sensor from an analog pin.
- Posts moisture data to the backend sensor endpoint.
- Polls the backend for pending pump commands.
- Runs the pump relay only when the backend sends a water command.
- Acknowledges the command after the pump finishes.

The ESP32 does not decide when to water. Auto mode, cooldowns, manual watering, and plant thresholds are all decided by the backend/dashboard. The ESP32 only reports readings and obeys queued server commands.

## Setup

Copy the example config:

```bash
cp include/config.example.h include/config.h
```

Edit `include/config.h`:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND_BASE_URL = "http://YOUR_COMPUTER_IP:8000";
```

Use your computer's LAN IP address, not `localhost`.

## Build And Upload

From this folder:

```bash
pio run
pio run --target upload
pio device monitor
```

## Backend Endpoints Used

```txt
POST /api/devices/heartbeat
POST /api/sensor-data
GET /api/devices/{device_id}/commands/next
POST /api/devices/{device_id}/commands/{command_id}/ack
```

The heartbeat endpoint powers real ESP32 discovery in the dashboard. The sensor endpoint writes moisture readings to the backend flow. The command endpoints let the backend tell the ESP32 when to run the pump for both automatic and manual watering.

## Pin Defaults

```txt
Soil sensor analog pin: GPIO 32
Pump relay pin: GPIO 4
```

The tested relay is active LOW:

```txt
GPIO HIGH: pump off
GPIO LOW: pump on
```

Calibrate these values in `include/config.h`:

```cpp
const int SOIL_DRY_READING = 2410;
const int SOIL_WET_READING = 864;
```

## Timing Defaults

```txt
Heartbeat: 10 seconds
Command polling: 1 second
Display refresh: 0.5 seconds
Sensor upload: 2 seconds
Pump duration: 5 seconds per server command
```
