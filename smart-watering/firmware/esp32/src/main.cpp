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
unsigned long lastSensorPostAt = 0;
unsigned long lastWifiReconnectAt = 0;

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

void publishSensorReading() {
  const float moisture = readMoisturePercent();
  const float temperature = 23.0f;  // Temperature sensor is not wired yet.

  updateDisplay(moisture);

  if (ensureWifiConnected()) {
    sendSensorData(moisture, temperature);
  } else {
    Serial.println("[Sensor] Display updated locally. Backend upload skipped until Wi-Fi connects.");
  }
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
  publishSensorReading();
}

void loop() {
  const unsigned long now = millis();

  if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatAt = now;
    publishHeartbeat();
  }

  if (now - lastSensorPostAt >= SENSOR_POST_INTERVAL_MS) {
    lastSensorPostAt = now;
    publishSensorReading();
  }
}
