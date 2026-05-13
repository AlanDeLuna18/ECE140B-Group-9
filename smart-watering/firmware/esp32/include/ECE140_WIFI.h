#pragma once

#include <Arduino.h>
#include <WiFi.h>

class ECE140_WIFI {
 public:
  ECE140_WIFI();

  bool connectToWiFi(String ssid, String password, unsigned long timeoutMs = 5000);

 private:
  const char* statusName(wl_status_t status);
};
