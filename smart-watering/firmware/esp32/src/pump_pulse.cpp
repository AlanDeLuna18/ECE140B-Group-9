#include <Arduino.h>

#include "config.h"

namespace {
constexpr unsigned long PUMP_ON_MS = 3000;
constexpr unsigned long PUMP_OFF_MS = 2000;

int pumpOnLevel() {
  return PUMP_RELAY_ACTIVE_LOW ? LOW : HIGH;
}

int pumpOffLevel() {
  return PUMP_RELAY_ACTIVE_LOW ? HIGH : LOW;
}

void setPump(bool enabled) {
  const int level = enabled ? pumpOnLevel() : pumpOffLevel();
  digitalWrite(PUMP_RELAY_PIN, level);
  Serial.printf(
      "[PumpPulse] GPIO %d -> %s (%s)\n",
      PUMP_RELAY_PIN,
      enabled ? "ON" : "OFF",
      level == HIGH ? "HIGH" : "LOW");
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(PUMP_RELAY_PIN, OUTPUT);
  setPump(false);

  Serial.println();
  Serial.println("[PumpPulse] Continuous pump pulse firmware started.");
  Serial.printf("[PumpPulse] Pin: %d, active level: %s.\n", PUMP_RELAY_PIN, PUMP_RELAY_ACTIVE_LOW ? "LOW" : "HIGH");
  Serial.printf("[PumpPulse] Repeating ON for %lu ms, OFF for %lu ms.\n", PUMP_ON_MS, PUMP_OFF_MS);
}

void loop() {
  Serial.println("[PumpPulse] Pump should run now.");
  setPump(true);
  delay(PUMP_ON_MS);

  Serial.println("[PumpPulse] Pump should be off now.");
  setPump(false);
  delay(PUMP_OFF_MS);
}
