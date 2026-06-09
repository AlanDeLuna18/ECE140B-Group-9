import type { WateringEventPoint } from "@/lib/api";

const STORAGE_KEY = "smart-watering.serialWateringEvents.v1";

type StoredEvents = Record<string, WateringEventPoint[]>;

function readAllEvents(): StoredEvents {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as StoredEvents;
  } catch {
    return {};
  }
}

function writeAllEvents(events: StoredEvents) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function getSerialWateringEvents(groupId: string): WateringEventPoint[] {
  return readAllEvents()[groupId] ?? [];
}

export function recordSerialWateringEvent({
  groupId,
  source,
  durationSeconds,
  moisture,
}: {
  groupId: string;
  source: "manual" | "auto";
  durationSeconds: number;
  moisture: number | null;
}) {
  const allEvents = readAllEvents();
  const event: WateringEventPoint = {
    time: new Date().toISOString(),
    group_id: groupId,
    source,
    duration_seconds: durationSeconds,
    moisture,
  };

  allEvents[groupId] = [event, ...(allEvents[groupId] ?? [])].slice(0, 30);
  writeAllEvents(allEvents);
  return event;
}
