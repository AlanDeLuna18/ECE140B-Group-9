#include <Arduino.h>

#include "DisplayManager.h"
#include "PumpControl.h"
#include "SensorReader.h"
#include "config.h"

namespace {
unsigned long lastDisplayRefreshAt = 0;
unsigned long lastSensorPostAt = 0;
float latestMoisture = 0.0f;
float latestTemperature = 23.0f;

void refreshLocalReading() {
  latestMoisture = readMoisturePercent();
  latestTemperature = 23.0f;  // Temperature sensor is not wired yet.
  updateDisplay(latestMoisture);
}

void publishSerialSensorReading() {
  Serial.printf(
      "SENSOR_JSON:{\"device_id\":\"%s\",\"name\":\"%s\",\"moisture\":%.1f,\"temperature\":%.1f}\n",
      DEVICE_ID,
      DEVICE_NAME,
      latestMoisture,
      latestTemperature);
}

void publishLatestSensorReading() {
  publishSerialSensorReading();
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.printf("DEVICE_JSON:{\"device_id\":\"%s\",\"name\":\"%s\",\"mode\":\"serial\"}\n", DEVICE_ID, DEVICE_NAME);

  initDisplay();
  showStartupDisplay();
  initSensors();
  initPump();

  refreshLocalReading();
  publishLatestSensorReading();
}

void loop() {
  const unsigned long now = millis();

  if (now - lastDisplayRefreshAt >= DISPLAY_REFRESH_INTERVAL_MS) {
    lastDisplayRefreshAt = now;
    refreshLocalReading();
  }

  if (now - lastSensorPostAt >= SENSOR_POST_INTERVAL_MS) {
    lastSensorPostAt = now;
    publishLatestSensorReading();
  }
}
