#include <Arduino.h>
#include <unity.h>

#include "config.h"

namespace {
constexpr unsigned long PUMP_TEST_ON_MS = 3000;
constexpr unsigned long PUMP_TEST_OFF_MS = 2000;
constexpr int PUMP_TEST_CYCLES = 3;

int pumpOnLevel() {
  return PUMP_RELAY_ACTIVE_LOW ? LOW : HIGH;
}

int pumpOffLevel() {
  return PUMP_RELAY_ACTIVE_LOW ? HIGH : LOW;
}

void writePump(bool enabled) {
  digitalWrite(PUMP_RELAY_PIN, enabled ? pumpOnLevel() : pumpOffLevel());
  Serial.printf(
      "[PumpTest] GPIO %d -> %s (%s)\n",
      PUMP_RELAY_PIN,
      enabled ? "ON" : "OFF",
      enabled ? (pumpOnLevel() == HIGH ? "HIGH" : "LOW") : (pumpOffLevel() == HIGH ? "HIGH" : "LOW"));
}
}  // namespace

void test_pump_pin_cycles_on_and_off() {
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  writePump(false);
  delay(PUMP_TEST_OFF_MS);
  TEST_ASSERT_EQUAL(pumpOffLevel(), digitalRead(PUMP_RELAY_PIN));

  for (int cycle = 1; cycle <= PUMP_TEST_CYCLES; cycle++) {
    Serial.printf("[PumpTest] Cycle %d/%d: pump should run now.\n", cycle, PUMP_TEST_CYCLES);
    writePump(true);
    TEST_ASSERT_EQUAL(pumpOnLevel(), digitalRead(PUMP_RELAY_PIN));
    delay(PUMP_TEST_ON_MS);

    Serial.printf("[PumpTest] Cycle %d/%d: pump should be off now.\n", cycle, PUMP_TEST_CYCLES);
    writePump(false);
    TEST_ASSERT_EQUAL(pumpOffLevel(), digitalRead(PUMP_RELAY_PIN));
    delay(PUMP_TEST_OFF_MS);
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println();
  Serial.println("[PumpTest] Starting pump-only hardware test.");
  Serial.printf("[PumpTest] Pin: %d, active level: %s.\n", PUMP_RELAY_PIN, PUMP_RELAY_ACTIVE_LOW ? "LOW" : "HIGH");
  Serial.println("[PumpTest] Watch/listen for 3 pump pulses. No Wi-Fi, backend, display, or sensors are used.");

  UNITY_BEGIN();
  RUN_TEST(test_pump_pin_cycles_on_and_off);
  UNITY_END();
}

void loop() {
  Serial.println("[PumpTest] Continuous pulse: pump should run now.");
  writePump(true);
  delay(PUMP_TEST_ON_MS);

  Serial.println("[PumpTest] Continuous pulse: pump should be off now.");
  writePump(false);
  delay(PUMP_TEST_OFF_MS);
}
