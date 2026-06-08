#pragma once

// Copy this file to include/config.h, then fill in your local values.
// Do not commit include/config.h because it contains Wi-Fi credentials.

// Use a normal 2.4 GHz Wi-Fi network that the ESP32 can join.
static const char* WIFI_SSID = "YOUR_WIFI_NAME";
static const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Use your computer's LAN IP address, not localhost.
// Example: http://192.168.1.25:8000
static const char* BACKEND_BASE_URL = "http://YOUR_COMPUTER_IP:8000";

// This must match the backend device_id used in the dashboard.
static const char* DEVICE_ID = "device-001";
static const char* DEVICE_NAME = "ESP32 Unit 001";
static const char* FIRMWARE_VERSION = "0.1.0";

// Hardware pins.
static const int SOIL_SENSOR_PIN = 32;
static const int PUMP_RELAY_PIN = 4;
static const bool PUMP_RELAY_ACTIVE_LOW = true;

static const int TFT_CLK_PIN = 26;
static const int TFT_MOSI_PIN = 27;
static const int TFT_RST_PIN = 13;
static const int TFT_DC_PIN = 14;
static const int TFT_CS_PIN = 25;
static const int TFT_BL_PIN = 15;

// Set PUMP_RELAY_ACTIVE_LOW to true for relay modules where LOW is on and HIGH is off.
// Set it to false for transistor/MOSFET drivers or relay modules where HIGH is on.
static const unsigned long PUMP_WATERING_DURATION_MS = 5000;

// Calibrate these with your soil sensor.
// DRY should be the analog reading in dry air/dry soil.
// WET should be the analog reading in water/very wet soil.
static const int SOIL_DRY_READING = 2410;
static const int SOIL_WET_READING = 864;

static const float MOISTURE_LOW_THRESHOLD = 45.0f;
static const float MOISTURE_HIGH_THRESHOLD = 65.0f;

// Timing.
static const unsigned long HEARTBEAT_INTERVAL_MS = 10000;
static const unsigned long COMMAND_POLL_INTERVAL_MS = 1000;
static const unsigned long DISPLAY_REFRESH_INTERVAL_MS = 500;
static const unsigned long SENSOR_POST_INTERVAL_MS = 2000;
