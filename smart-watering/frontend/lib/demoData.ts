import type { PlantGroup, PlantType, SensorHistoryPoint, WateringEventPoint } from "@/lib/api";

function demoOffset(seed: string) {
  return Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0) % 9;
}

export function getDemoSensorHistory(group: PlantGroup, plantType: PlantType | undefined): SensorHistoryPoint[] {
  const now = Date.now();
  const idealMin = plantType?.ideal_moisture_min ?? 40;
  const idealMax = plantType?.ideal_moisture_max ?? 65;
  const idealMid = (idealMin + idealMax) / 2;
  const offset = demoOffset(group.group_id);
  const deviceId = `demo-${group.group_id}`;

  return Array.from({ length: 18 }, (_, index) => {
    const ageMinutes = (17 - index) * 5;
    const wave = Math.sin((index + offset) / 2.4) * 4.5;
    const drift = index > 12 ? 1.6 : -1.2;
    const moisture = Math.max(18, Math.min(92, idealMid + wave + drift + offset / 3));

    return {
      time: new Date(now - ageMinutes * 60_000).toISOString(),
      device_id: deviceId,
      moisture: Number(moisture.toFixed(1)),
      temperature: Number((22 + Math.sin(index / 3) * 1.8).toFixed(1)),
    };
  });
}

export function withDemoSensorHistory(group: PlantGroup, plantType: PlantType | undefined, history: SensorHistoryPoint[]) {
  return history.length ? history : getDemoSensorHistory(group, plantType);
}

export function getDemoWateringEvents(group: PlantGroup, latestMoisture: number | null | undefined): WateringEventPoint[] {
  const now = Date.now();
  const offset = demoOffset(group.group_id);

  return [95, 210, 360].map((ageMinutes, index) => ({
    time: new Date(now - (ageMinutes + offset * 3) * 60_000).toISOString(),
    group_id: group.group_id,
    source: index === 1 ? "manual" : "auto",
    duration_seconds: index === 1 ? 6 : 8,
    moisture: latestMoisture === null || latestMoisture === undefined ? null : Number(Math.max(20, latestMoisture - 7 + index * 3).toFixed(1)),
  }));
}
