#pragma once

#include <Arduino.h>

struct PumpCommand {
  bool hasCommand;
  int commandId;
  unsigned long durationMs;
};

bool sendHeartbeat();
bool sendSensorData(float moisture, float temperature);
PumpCommand fetchNextPumpCommand();
bool acknowledgePumpCommand(int commandId);
