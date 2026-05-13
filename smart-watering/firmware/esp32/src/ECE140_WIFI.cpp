#include "ECE140_WIFI.h"

ECE140_WIFI::ECE140_WIFI() {
  Serial.println("[ECE140_WIFI] Initialized");
}

const char* ECE140_WIFI::statusName(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS:
      return "idle";
    case WL_NO_SSID_AVAIL:
      return "ssid_not_available";
    case WL_CONNECTED:
      return "connected";
    case WL_CONNECT_FAILED:
      return "connect_failed";
    case WL_CONNECTION_LOST:
      return "connection_lost";
    case WL_DISCONNECTED:
      return "disconnected";
    default:
      return "unknown";
  }
}

bool ECE140_WIFI::connectToWiFi(String ssid, String password, unsigned long timeoutMs) {
  Serial.println("[WiFi] Connecting to WiFi...");

  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());

  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < timeoutMs) {
    delay(1000);
    Serial.print(".");
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.print("\n[WiFi] Connection failed. Status: ");
    Serial.print(statusName(WiFi.status()));
    Serial.print(" (");
    Serial.print(WiFi.status());
    Serial.println(")");
    return false;
  }

  Serial.println("\n[WiFi] Connected to WiFi.");
  Serial.print("[WiFi] IP Address: ");
  Serial.println(WiFi.localIP());
  return true;
}
