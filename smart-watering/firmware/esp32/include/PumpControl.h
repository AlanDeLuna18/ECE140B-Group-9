#pragma once

#include <Arduino.h>

void initPump();
void setPump(bool enabled);
void triggerPump(unsigned long durationMs);
