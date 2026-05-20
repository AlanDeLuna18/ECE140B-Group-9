#pragma once

#include <Arduino.h>

void initPump();
void setPump(bool enabled);
void startPump(unsigned long durationMs);
void updatePump();
bool isPumpRunning();
