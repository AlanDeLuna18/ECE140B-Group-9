#include "BackendClient.h"

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

bool postJson(const String& path, const String& body) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping POST because Wi-Fi is disconnected.");
    return false;
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

  return statusCode >= 200 && statusCode < 300;
}
}  // namespace

bool sendHeartbeat() {
  String body = "{";
  body += "\"device_id\":\"" + jsonEscape(DEVICE_ID) + "\",";
  body += "\"name\":\"" + jsonEscape(DEVICE_NAME) + "\",";
  body += "\"ip_address\":\"" + jsonEscape(deviceIpAddress()) + "\",";
  body += "\"firmware_version\":\"" + jsonEscape(FIRMWARE_VERSION) + "\"";
  body += "}";

  return postJson("/api/devices/heartbeat", body);
}

bool sendSensorData(float moisture, float temperature) {
  String body = "{";
  body += "\"device_id\":\"" + jsonEscape(DEVICE_ID) + "\",";
  body += "\"moisture\":" + String(moisture, 1) + ",";
  body += "\"temperature\":" + String(temperature, 1);
  body += "}";

  return postJson("/api/sensor-data", body);
}
