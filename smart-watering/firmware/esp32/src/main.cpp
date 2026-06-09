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
String serialCommandBuffer;

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

void handleWaterCommand(const String& value) {
  unsigned long durationMs = value.toInt();
  if (durationMs == 0) {
    durationMs = PUMP_WATERING_DURATION_MS;
  }

  if (isPumpRunning()) {
    Serial.printf("WATER_ACK:{\"status\":\"busy\",\"duration_ms\":%lu}\n", durationMs);
    return;
  }

  startPump(durationMs);
  Serial.printf("WATER_ACK:{\"status\":\"started\",\"duration_ms\":%lu}\n", durationMs);
}

void handleSerialCommand(String command) {
  command.trim();
  if (!command.length()) {
    return;
  }

  if (command.startsWith("WATER:")) {
    handleWaterCommand(command.substring(6));
    return;
  }

  if (command == "PING") {
    Serial.printf("DEVICE_JSON:{\"device_id\":\"%s\",\"name\":\"%s\",\"mode\":\"serial\"}\n", DEVICE_ID, DEVICE_NAME);
    return;
  }

  Serial.printf("SERIAL_ERROR:{\"message\":\"unknown command\",\"command\":\"%s\"}\n", command.c_str());
}

void serviceSerialCommands() {
  while (Serial.available() > 0) {
    const char incoming = static_cast<char>(Serial.read());
    if (incoming == '\n') {
      handleSerialCommand(serialCommandBuffer);
      serialCommandBuffer = "";
      continue;
    }

    if (incoming != '\r') {
      serialCommandBuffer += incoming;
    }

    if (serialCommandBuffer.length() > 120) {
      serialCommandBuffer = "";
      Serial.println("SERIAL_ERROR:{\"message\":\"command too long\"}");
    }
  }
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
  serviceSerialCommands();
  updatePump();

  if (now - lastDisplayRefreshAt >= DISPLAY_REFRESH_INTERVAL_MS) {
    lastDisplayRefreshAt = now;
    refreshLocalReading();
  }

  if (now - lastSensorPostAt >= SENSOR_POST_INTERVAL_MS) {
    lastSensorPostAt = now;
    publishLatestSensorReading();
  }
}
