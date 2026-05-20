#include "PumpControl.h"

#include "config.h"

namespace {
bool pumpRunning = false;
unsigned long pumpStartedAt = 0;
unsigned long pumpDurationMs = 0;
}  // namespace

void initPump() {
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  setPump(false);
  Serial.println("[Pump] Initialized OFF.");
}

void setPump(bool enabled) {
  digitalWrite(PUMP_RELAY_PIN, enabled ? LOW : HIGH);
}

void startPump(unsigned long durationMs) {
  if (pumpRunning) {
    Serial.println("[Pump] Start ignored because pump is already running.");
    return;
  }

  Serial.printf("Pump ON for %lu ms\n", durationMs);
  setPump(true);
  pumpRunning = true;
  pumpStartedAt = millis();
  pumpDurationMs = durationMs;
}

void updatePump() {
  if (!pumpRunning) {
    return;
  }

  if (millis() - pumpStartedAt < pumpDurationMs) {
    return;
  }

  setPump(false);
  pumpRunning = false;
  pumpDurationMs = 0;
  Serial.println("Pump OFF");
}

bool isPumpRunning() {
  return pumpRunning;
}
