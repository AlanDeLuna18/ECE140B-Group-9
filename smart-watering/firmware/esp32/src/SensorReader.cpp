#include "SensorReader.h"

#include <Arduino.h>

#include "config.h"

void initSensors() {
  pinMode(SOIL_SENSOR_PIN, INPUT);
}

float readMoisturePercent() {
  const int rawReading = analogRead(SOIL_SENSOR_PIN);
  const int constrainedReading = constrain(rawReading, SOIL_WET_READING, SOIL_DRY_READING);
  const float percent = 100.0f * (SOIL_DRY_READING - constrainedReading) / (SOIL_DRY_READING - SOIL_WET_READING);

  Serial.printf("Soil raw=%d moisture=%.1f%%\n", rawReading, percent);
  return constrain(percent, 0.0f, 100.0f);
}
