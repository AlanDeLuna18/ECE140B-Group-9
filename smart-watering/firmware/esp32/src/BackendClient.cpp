#include "BackendClient.h"

#include <ArduinoJson.h>
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "config.h"

namespace {
String deviceIpAddress() {
  return WiFi.localIP().toString();
}

String jsonEscape(const String& value) {
  String escaped = "";
  for (size_t index = 0; index < value.length(); index++) {
    char character = value.charAt(index);
    if (character == '"' || character == '\\') {
      escaped += '\\';
    }
    escaped += character;
  }
  return escaped;
}

String backendUrl(const char* path) {
  String base = String(BACKEND_BASE_URL);
  if (base.endsWith("/")) {
    base.remove(base.length() - 1);
  }
  return base + path;
}

struct PostResult {
  bool ok;
  String response;
};

PostResult postJson(const String& path, const String& body) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping POST because Wi-Fi is disconnected.");
    return {false, ""};
  }

  HTTPClient http;
  const String url = backendUrl(path.c_str());
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  Serial.printf("POST %s\n", url.c_str());
  Serial.println(body);

  const int statusCode = http.POST(body);
  const String response = http.getString();
  http.end();

  Serial.printf("HTTP status: %d\n", statusCode);
  if (response.length() > 0) {
    Serial.println(response);
  }

  return {statusCode >= 200 && statusCode < 300, response};
}

PostResult getJson(const String& path) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping GET because Wi-Fi is disconnected.");
    return {false, ""};
  }

  HTTPClient http;
  const String url = backendUrl(path.c_str());
  http.begin(url);
  http.setTimeout(5000);

  Serial.printf("GET %s\n", url.c_str());

  const int statusCode = http.GET();
  const String response = http.getString();
  http.end();

  Serial.printf("HTTP status: %d\n", statusCode);
  if (response.length() > 0) {
    Serial.println(response);
  }

  return {statusCode >= 200 && statusCode < 300, response};
}

}  // namespace

bool sendHeartbeat() {
  String body = "{";
  body += "\"device_id\":\"" + jsonEscape(DEVICE_ID) + "\",";
  body += "\"name\":\"" + jsonEscape(DEVICE_NAME) + "\",";
  body += "\"ip_address\":\"" + jsonEscape(deviceIpAddress()) + "\",";
  body += "\"firmware_version\":\"" + jsonEscape(FIRMWARE_VERSION) + "\"";
  body += "}";

  return postJson("/api/devices/heartbeat", body).ok;
}

bool sendSensorData(float moisture, float temperature) {
  String body = "{";
  body += "\"device_id\":\"" + jsonEscape(DEVICE_ID) + "\",";
  body += "\"moisture\":" + String(moisture, 1) + ",";
  body += "\"temperature\":" + String(temperature, 1);
  body += "}";

  const PostResult result = postJson("/api/sensor-data", body);
  return result.ok;
}

PumpCommand fetchNextPumpCommand() {
  const String path = "/api/devices/" + jsonEscape(DEVICE_ID) + "/commands/next";
  const PostResult result = getJson(path);
  if (!result.ok) {
    Serial.println("[Command] Poll failed.");
    return {false, 0, 0};
  }

  JsonDocument response;
  const DeserializationError error = deserializeJson(response, result.response);
  if (error) {
    Serial.print("Command JSON parse failed: ");
    Serial.println(error.c_str());
    return {false, 0, 0};
  }

  const String action = response["action"] | "none";
  if (action != "water") {
    Serial.println("[Command] No pending pump command.");
    return {false, 0, 0};
  }

  const int commandId = response["command_id"] | 0;
  if (commandId <= 0) {
    Serial.println("[Command] Water command missing command_id.");
    return {false, 0, 0};
  }

  const int durationSeconds = response["duration_seconds"] | 5;
  Serial.printf("[Command] Water command #%d for %d seconds.\n", commandId, durationSeconds);
  return {true, commandId, static_cast<unsigned long>(durationSeconds) * 1000UL};
}

bool acknowledgePumpCommand(int commandId) {
  const String path = "/api/devices/" + jsonEscape(DEVICE_ID) + "/commands/" + String(commandId) + "/ack";
  const PostResult result = postJson(path, "{\"status\":\"completed\"}");
  Serial.printf("[Command] Ack #%d %s.\n", commandId, result.ok ? "sent" : "failed");
  return result.ok;
}
