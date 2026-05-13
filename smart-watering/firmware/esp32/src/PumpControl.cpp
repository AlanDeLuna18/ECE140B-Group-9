#include "PumpControl.h"

#include "config.h"

void initPump() {
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  setPump(false);
}

void setPump(bool enabled) {
  const int activeState = PUMP_ACTIVE_HIGH ? HIGH : LOW;
  const int inactiveState = PUMP_ACTIVE_HIGH ? LOW : HIGH;
  digitalWrite(PUMP_RELAY_PIN, enabled ? activeState : inactiveState);
}

void triggerPump(unsigned long durationMs) {
  Serial.printf("Pump ON for %lu ms\n", durationMs);
  setPump(true);
  delay(durationMs);
  setPump(false);
  Serial.println("Pump OFF");
}
