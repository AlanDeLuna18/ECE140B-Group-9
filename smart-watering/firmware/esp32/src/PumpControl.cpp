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
  Serial.printf("[Pump] Initialized OFF on pin %d. Relay active %s.\n", PUMP_RELAY_PIN, PUMP_RELAY_ACTIVE_LOW ? "LOW" : "HIGH");
}

void setPump(bool enabled) {
  const int onLevel = PUMP_RELAY_ACTIVE_LOW ? LOW : HIGH;
  const int offLevel = PUMP_RELAY_ACTIVE_LOW ? HIGH : LOW;
  digitalWrite(PUMP_RELAY_PIN, enabled ? onLevel : offLevel);
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
