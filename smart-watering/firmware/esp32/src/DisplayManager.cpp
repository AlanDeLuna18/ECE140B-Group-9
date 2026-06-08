#include "DisplayManager.h"

#include <Adafruit_GC9A01A.h>
#include <Adafruit_GFX.h>
#include <Arduino.h>

#include "config.h"

namespace {
Adafruit_GC9A01A tft = Adafruit_GC9A01A(TFT_CS_PIN, TFT_DC_PIN, TFT_MOSI_PIN, TFT_CLK_PIN, TFT_RST_PIN);

const uint16_t DISPLAY_WHITE = 0xFFFF;
const uint16_t DISPLAY_RED = 0xF800;
const uint16_t DISPLAY_GREEN = 0x07E0;
const uint16_t DISPLAY_YELLOW = 0xFFE0;
const uint16_t DISPLAY_DARK = 0x2104;
const uint16_t DISPLAY_LIGHT_GRAY = 0xE71C;

const int DISPLAY_WIDTH = 240;
const int GAUGE_CENTER_X = 120;
const int GAUGE_CENTER_Y = 144;
const int GAUGE_RADIUS = 70;
const int GAUGE_THICKNESS = 14;

int lastGaugeEnd = 180;

const char* moistureLevel(float moisture) {
  if (moisture < MOISTURE_LOW_THRESHOLD) {
    return "LOW";
  }

  if (moisture > MOISTURE_HIGH_THRESHOLD) {
    return "HIGH";
  }

  return "GOOD";
}

uint16_t moistureLevelColor(float moisture) {
  if (moisture < MOISTURE_LOW_THRESHOLD) {
    return DISPLAY_RED;
  }

  if (moisture > MOISTURE_HIGH_THRESHOLD) {
    return DISPLAY_YELLOW;
  }

  return DISPLAY_GREEN;
}

void drawCenteredText(const String& text, int y, int textSize, uint16_t color) {
  int16_t x1;
  int16_t y1;
  uint16_t width;
  uint16_t height;

  tft.setTextSize(textSize);
  tft.getTextBounds(text, 0, y, &x1, &y1, &width, &height);
  tft.setTextColor(color);
  tft.setCursor((DISPLAY_WIDTH - width) / 2, y);
  tft.print(text);
}

void drawThickArc(int centerX, int centerY, int radius, int thickness, int startDegrees, int endDegrees, uint16_t color) {
  for (int angle = startDegrees; angle <= endDegrees; angle += 2) {
    const float radians = angle * PI / 180.0f;
    const int x = centerX + static_cast<int>(cos(radians) * radius);
    const int y = centerY + static_cast<int>(sin(radians) * radius);
    tft.fillCircle(x, y, thickness / 2, color);
  }
}

void drawStaticDisplay() {
  tft.fillScreen(DISPLAY_WHITE);
  drawCenteredText("Moisture", 40, 2, DISPLAY_DARK);
  drawThickArc(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS, GAUGE_THICKNESS, 180, 360, DISPLAY_LIGHT_GRAY);

  tft.setTextSize(1);
  tft.setTextColor(DISPLAY_DARK);
  tft.setCursor(44, 150);
  tft.print("0");
  tft.setCursor(188, 150);
  tft.print("100");

  tft.setCursor(58, 188);
  tft.print("Threshold ");
  tft.print(static_cast<int>(MOISTURE_LOW_THRESHOLD));
  tft.print("-");
  tft.print(static_cast<int>(MOISTURE_HIGH_THRESHOLD));
}
}  // namespace

void initDisplay() {
  pinMode(TFT_BL_PIN, OUTPUT);
  digitalWrite(TFT_BL_PIN, HIGH);

  tft.begin();
  tft.setRotation(0);
  tft.fillScreen(DISPLAY_WHITE);
  tft.setTextWrap(false);
}

void updateWifiStatus() {
  tft.fillRect(70, 204, 110, 14, DISPLAY_WHITE);
  tft.setTextSize(2);
  tft.setTextColor(DISPLAY_GREEN);
  tft.setCursor(80, 204);
  tft.print("Serial");
}

void showStartupDisplay() {
  drawStaticDisplay();

  tft.setTextSize(1);
  tft.setTextColor(DISPLAY_DARK);
  tft.setCursor(84, 112);
  tft.print("Starting...");

  updateWifiStatus();
}

void updateDisplay(float moisture) {
  const char* level = moistureLevel(moisture);
  const uint16_t levelColor = moistureLevelColor(moisture);
  const float gaugeValue = constrain(moisture, 0.0f, 100.0f);
  const int progressEnd = 180 + static_cast<int>((gaugeValue / 100.0f) * 180.0f);

  tft.fillRect(70, 112, 100, 28, DISPLAY_WHITE);
  if (progressEnd < lastGaugeEnd) {
    drawThickArc(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS, GAUGE_THICKNESS, progressEnd, lastGaugeEnd, DISPLAY_LIGHT_GRAY);
  }
  drawThickArc(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS, GAUGE_THICKNESS, 180, progressEnd, levelColor);
  lastGaugeEnd = progressEnd;

  drawCenteredText(String(moisture, 1) + "%", 116, 3, DISPLAY_DARK);
  tft.fillRect(82, 154, 76, 20, DISPLAY_WHITE);
  drawCenteredText(level, 154, 2, levelColor);
  updateWifiStatus();
}
