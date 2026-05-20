#include <Arduino.h>
#include <WiFi.h>

#include "BackendClient.h"
#include "DisplayManager.h"
#include "ECE140_WIFI.h"
#include "PumpControl.h"
#include "SensorReader.h"
#include "config.h"

namespace {
ECE140_WIFI wifi;

unsigned long lastHeartbeatAt = 0;
unsigned long lastCommandPollAt = 0;
unsigned long lastDisplayRefreshAt = 0;
unsigned long lastSensorPostAt = 0;
unsigned long lastWifiReconnectAt = 0;
float latestMoisture = 0.0f;
float latestTemperature = 23.0f;
int activePumpCommandId = 0;

bool connectToWifi() {
  const bool connected = wifi.connectToWiFi(WIFI_SSID, WIFI_PASSWORD, 3000);
  updateWifiStatus();
  return connected;
}

bool ensureWifiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  const unsigned long now = millis();
  if (now - lastWifiReconnectAt < 10000) {
    updateWifiStatus();
    return false;
  }

  lastWifiReconnectAt = now;
  Serial.println("[WiFi] Disconnected. Trying a short reconnect...");
  return connectToWifi();
}

void refreshLocalReading() {
  latestMoisture = readMoisturePercent();
  latestTemperature = 23.0f;  // Temperature sensor is not wired yet.
  updateDisplay(latestMoisture);
}

void publishLatestSensorReading() {
  if (ensureWifiConnected()) {
    const bool uploaded = sendSensorData(latestMoisture, latestTemperature);
    Serial.printf("[Sensor] Upload %s: moisture=%.1f temperature=%.1f\n", uploaded ? "ok" : "failed", latestMoisture, latestTemperature);
  } else {
    Serial.println("[Sensor] Display updated locally. Backend upload skipped until Wi-Fi connects.");
  }
}

void pollPumpCommand() {
  if (isPumpRunning() || activePumpCommandId != 0) {
    return;
  }

  if (!ensureWifiConnected()) {
    return;
  }

  const PumpCommand command = fetchNextPumpCommand();
  if (!command.hasCommand) {
    return;
  }

  Serial.printf("[Pump] Running command #%d for %lu ms.\n", command.commandId, command.durationMs);
  activePumpCommandId = command.commandId;
  startPump(command.durationMs);
}

void servicePump() {
  const bool wasRunning = isPumpRunning();
  updatePump();

  if (!wasRunning || isPumpRunning() || activePumpCommandId == 0) {
    return;
  }

  acknowledgePumpCommand(activePumpCommandId);
  activePumpCommandId = 0;
  refreshLocalReading();
}

void publishHeartbeat() {
  if (ensureWifiConnected()) {
    sendHeartbeat();
  }
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1000);

  initDisplay();
  showStartupDisplay();
  initSensors();
  initPump();

  connectToWifi();
  publishHeartbeat();
  refreshLocalReading();
  publishLatestSensorReading();
}

void loop() {
  const unsigned long now = millis();
  servicePump();

  if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatAt = now;
    publishHeartbeat();
  }

  if (now - lastCommandPollAt >= COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollAt = now;
    pollPumpCommand();
  }

  if (now - lastDisplayRefreshAt >= DISPLAY_REFRESH_INTERVAL_MS) {
    lastDisplayRefreshAt = now;
    refreshLocalReading();
  }

  if (now - lastSensorPostAt >= SENSOR_POST_INTERVAL_MS) {
    lastSensorPostAt = now;
    publishLatestSensorReading();
  }
}
