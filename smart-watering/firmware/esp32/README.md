# Smart Watering ESP32 Firmware

This PlatformIO project is the ESP32 side of the smart watering system.

It currently does four things:

- Connects the ESP32 to Wi-Fi.
- Sends a heartbeat to the FastAPI backend for device discovery.
- Reads a capacitive soil moisture sensor from an analog pin.
- Posts moisture data to the backend sensor endpoint.

Pump control is defined in code, but automatic watering decisions should still come from the backend.

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
```

The heartbeat endpoint powers real ESP32 discovery in the dashboard. The sensor endpoint writes moisture readings to the existing backend flow.

## Pin Defaults

```txt
Soil sensor analog pin: GPIO 32
Pump relay pin: GPIO 4
```

Calibrate these values in `include/config.h`:

```cpp
const int SOIL_DRY_READING = 2410;
const int SOIL_WET_READING = 864;
```
