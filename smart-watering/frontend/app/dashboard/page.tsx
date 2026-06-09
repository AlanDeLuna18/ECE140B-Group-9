"use client";

import CreateGroupForm from "@/components/CreateGroupForm";
import CreatePlantForm from "@/components/CreatePlantForm";
import GroupCard from "@/components/GroupCard";
import PlantCard from "@/components/PlantCard";
import { getDevices, getPlantGroups, getPlantTypes, getSensorHistory, logout, updateGroupAutoMode } from "@/lib/api";
import type { Device, PlantGroup, PlantType, PumpResult, SensorHistoryPoint } from "@/lib/api";
import { withDemoSensorHistory } from "@/lib/demoData";
import { recordSerialWateringEvent } from "@/lib/serialWateringEvents";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const AUTO_REFRESH_INTERVAL_MS = 2000;
const SERIAL_WATER_DURATION_MS = 5000;
const WATERING_COOLDOWN_MS = 60_000;

type SerialPortHandle = {
  open: (options: { baudRate: number }) => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [plantGroups, setPlantGroups] = useState<PlantGroup[]>([]);
  const [sensorHistoryByGroup, setSensorHistoryByGroup] = useState<Record<string, SensorHistoryPoint[]>>({});
  const [status, setStatus] = useState("Loading dashboard...");
  const [error, setError] = useState<string | null>(null);
  const [showPlantTypeForm, setShowPlantTypeForm] = useState(false);
  const [showPlantForm, setShowPlantForm] = useState(false);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialWateredAtByGroup, setSerialWateredAtByGroup] = useState<Record<string, string>>({});
  const devicesRef = useRef<Device[]>([]);
  const plantGroupsRef = useRef<PlantGroup[]>([]);
  const plantTypesRef = useRef<PlantType[]>([]);
  const sensorHistoryByGroupRef = useRef<Record<string, SensorHistoryPoint[]>>({});
  const serialWateredAtByGroupRef = useRef<Record<string, string>>({});
  const serialConnectedRef = useRef(false);
  const serialWriterRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    plantGroupsRef.current = plantGroups;
  }, [plantGroups]);

  useEffect(() => {
    plantTypesRef.current = plantTypes;
  }, [plantTypes]);

  useEffect(() => {
    sensorHistoryByGroupRef.current = sensorHistoryByGroup;
  }, [sensorHistoryByGroup]);

  useEffect(() => {
    serialWateredAtByGroupRef.current = serialWateredAtByGroup;
  }, [serialWateredAtByGroup]);

  useEffect(() => {
    serialConnectedRef.current = serialConnected;
  }, [serialConnected]);

  const loadDashboard = useCallback(async (showSyncedStatus = true) => {
    setError(null);
    try {
      const [deviceData, plantTypeData, plantGroupData] = await Promise.all([
        getDevices(),
        getPlantTypes(),
        getPlantGroups(),
      ]);
      setDevices(deviceData);
      setPlantTypes(plantTypeData);
      setPlantGroups(plantGroupData);
      const historyEntries = await Promise.all(
        plantGroupData.map(async (group) => {
          try {
            return [group.group_id, await getSensorHistory(group.group_id)] as const;
          } catch {
            return [group.group_id, []] as const;
          }
        })
      );
      if (!serialConnectedRef.current) {
        const backendHistory = Object.fromEntries(historyEntries);
        setSensorHistoryByGroup(
          Object.fromEntries(
            plantGroupData.map((group) => [
              group.group_id,
              withDemoSensorHistory(
                group,
                plantTypeData.find((plantType) => plantType.plant_type_id === group.plant_type_id),
                backendHistory[group.group_id] ?? [],
              ),
            ]),
          ),
        );
      }
      if (showSyncedStatus) {
        setStatus("Dashboard synced with FastAPI");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard data");
      setStatus("Backend connection failed");
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadDashboard(false);
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadDashboard]);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  async function handleSerialConnect() {
    const nav = navigator as Navigator & {
      serial?: {
        requestPort: () => Promise<SerialPortHandle>;
      };
    };

    if (!nav.serial) {
      setError("This browser does not support Web Serial. Use Chrome or Edge for the serial demo.");
      return;
    }

    setError(null);
    setStatus("Select the ESP32 serial port...");

    try {
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: 115200 });
      const writer = port.writable?.getWriter();
      if (!writer) {
        throw new Error("Serial port is not writable");
      }

      serialWriterRef.current = writer;
      setSerialConnected(true);
      setStatus("ESP32 serial demo connected");

      const reader = port.readable?.getReader();
      if (!reader) {
        throw new Error("Serial port is not readable");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          ingestSerialLine(line.trim());
        }
      }
    } catch (err) {
      setSerialConnected(false);
      serialWriterRef.current = null;
      setError(err instanceof Error ? err.message : "Serial connection failed");
      setStatus("ESP32 serial demo disconnected");
    }
  }

  function ingestSerialLine(line: string) {
    if (line.startsWith("WATER_ACK:")) {
      try {
        const ack = JSON.parse(line.slice("WATER_ACK:".length)) as { status?: string; duration_ms?: number };
        setStatus(`ESP32 watering ${ack.status ?? "ack"}${ack.duration_ms ? ` for ${(ack.duration_ms / 1000).toFixed(1)}s` : ""}`);
      } catch {
        setStatus("ESP32 watering acknowledged");
      }
      return;
    }

    if (line.startsWith("SERIAL_ERROR:")) {
      setStatus("ESP32 serial command error");
      return;
    }

    if (!line.startsWith("SENSOR_JSON:")) {
      return;
    }

    try {
      const reading = JSON.parse(line.slice("SENSOR_JSON:".length)) as {
        device_id?: string;
        name?: string;
        moisture?: number;
        temperature?: number;
      };
      if (!reading.device_id || typeof reading.moisture !== "number") {
        return;
      }

      const device = devicesRef.current.find((item) => item.device_id === reading.device_id);
      if (!device?.group_id) {
        setStatus(`Serial reading from ${reading.device_id}; assign it to a plant to show it`);
        return;
      }

      const point: SensorHistoryPoint = {
        time: new Date().toISOString(),
        device_id: reading.device_id,
        moisture: reading.moisture,
        temperature: typeof reading.temperature === "number" ? reading.temperature : null,
      };

      setSensorHistoryByGroup((current) => {
        const existing = current[device.group_id ?? ""] ?? [];
        return {
          ...current,
          [device.group_id ?? ""]: [...existing.slice(-119), point],
        };
      });
      maybeAutoWater(device.group_id, reading.moisture);
    } catch {
      setStatus("Ignored malformed serial sensor line");
    }
  }

  function isGroupInSerialCooldown(groupId: string) {
    const lastWateredAt = serialWateredAtByGroupRef.current[groupId];
    if (!lastWateredAt) {
      return false;
    }

    return Date.now() - new Date(lastWateredAt).getTime() < WATERING_COOLDOWN_MS;
  }

  function markSerialWatered(groupId: string) {
    const timestamp = new Date().toISOString();
    serialWateredAtByGroupRef.current = {
      ...serialWateredAtByGroupRef.current,
      [groupId]: timestamp,
    };
    setSerialWateredAtByGroup(serialWateredAtByGroupRef.current);
  }

  async function sendSerialWaterCommand(group: PlantGroup, source: "manual" | "auto") {
    const writer = serialWriterRef.current;
    if (!writer) {
      throw new Error("Connect ESP32 Serial before watering from the dashboard.");
    }

    await writer.write(new TextEncoder().encode(`WATER:${SERIAL_WATER_DURATION_MS}\n`));
    markSerialWatered(group.group_id);
    recordSerialWateringEvent({
      groupId: group.group_id,
      source,
      durationSeconds: SERIAL_WATER_DURATION_MS / 1000,
      moisture: getLatestMoisture(group.group_id),
    });
    setStatus(`${source === "auto" ? "Auto" : "Manual"} watering sent to ESP32 for ${group.name}`);
  }

  function getLatestMoisture(groupId: string) {
    const latest = (sensorHistoryByGroupRef.current[groupId] ?? [])
      .filter((point) => point.moisture !== null)
      .reduce<SensorHistoryPoint | null>((currentLatest, point) => {
        if (!currentLatest) {
          return point;
        }
        return new Date(point.time).getTime() > new Date(currentLatest.time).getTime() ? point : currentLatest;
      }, null);

    return latest?.moisture ?? null;
  }

  function maybeAutoWater(groupId: string, moisture: number) {
    const group = plantGroupsRef.current.find((item) => item.group_id === groupId);
    if (!group) {
      setStatus(`Serial moisture ${moisture.toFixed(1)}% from ${groupId}`);
      return;
    }

    const plantType = plantTypesRef.current.find((type) => type.plant_type_id === group.plant_type_id);
    if (!group.auto_mode || !plantType || moisture >= plantType.ideal_moisture_min) {
      setStatus(`Serial moisture ${moisture.toFixed(1)}% from ${group.name}`);
      return;
    }

    if (isGroupInSerialCooldown(group.group_id)) {
      setStatus(`Auto water waiting for cooldown: ${moisture.toFixed(1)}% from ${group.name}`);
      return;
    }

    void sendSerialWaterCommand(group, "auto").catch((err) => {
      setError(err instanceof Error ? err.message : "Auto watering failed");
      setStatus("Auto watering failed");
    });
  }

  function handleWatered(result: PumpResult) {
    const commandLabel = result.command_id ? ` command #${result.command_id}` : "";
    if (result.source === "serial") {
      setStatus(`ESP32 watering command sent for ${result.group_id ?? result.device_id ?? "device"}`);
      return;
    }

    setStatus(`Manual watering ${result.status}${commandLabel} for ${result.group_id ?? result.device_id ?? "device"}`);
    loadDashboard();
  }

  async function handleToggleAutoMode(group: PlantGroup) {
    await updateGroupAutoMode(group.group_id, !group.auto_mode);
    setStatus(`Auto water ${group.auto_mode ? "turned off" : "turned on"} for ${group.name}`);
    await loadDashboard(false);
  }

  async function handleSerialWater(group: PlantGroup): Promise<PumpResult> {
    await sendSerialWaterCommand(group, "manual");

    return {
      action: "water",
      source: "serial",
      duration_seconds: SERIAL_WATER_DURATION_MS / 1000,
      status: "sent_to_esp32",
      group_id: group.group_id,
      device_id: null,
      command_id: null,
    };
  }

  function togglePlantTypeForm() {
    setShowPlantTypeForm((current) => {
      const next = !current;
      setStatus(next ? "Plant Type form opened" : "Plant Type form closed");
      return next;
    });
  }

  function togglePlantForm() {
    setShowPlantForm((current) => {
      const next = !current;
      setStatus(next ? "My Plants form opened" : "My Plants form closed");
      return next;
    });
  }

  return (
    <main className="min-h-screen px-8 py-8 sm:px-10 lg:px-16 xl:px-20">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-leaf">Smart Watering</p>
            <h1 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">Dashboard</h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Manage watering actions for all plants from one place.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
              {status}
            </div>
            <button
              className={`rounded-lg border px-4 py-3 text-sm font-medium shadow-sm transition-colors ${
                serialConnected
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              onClick={handleSerialConnect}
              type="button"
            >
              {serialConnected ? "Serial Connected" : "Connect ESP32 Serial"}
            </button>
            <button
              className="rounded-lg border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 transition-colors"
              onClick={handleLogout}
              type="button"
            >
              Sign Out
            </button>
          </div>
        </div>

        {error ? <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <section className="mt-8">
          <SectionHeading
            isOpen={showPlantTypeForm}
            onToggle={togglePlantTypeForm}
            title="Plant Types"
          />
          {showPlantTypeForm ? (
            <div className="mt-4 max-w-xl">
              <CreatePlantForm onCreated={loadDashboard} />
            </div>
          ) : null}
          <div className="mt-4 flex gap-4 overflow-x-auto pb-3">
            {plantTypes.length ? plantTypes.map((plantType) => <PlantCard key={plantType.id} onUpdated={loadDashboard} plant={plantType} />) : <EmptyState label="No Plant Types yet" />}
          </div>
        </section>

        <section className="mt-10">
          <SectionHeading
            isOpen={showPlantForm}
            onToggle={togglePlantForm}
            title="My Plants"
          />
          {showPlantForm ? (
            <div className="mt-4 max-w-xl">
              <CreateGroupForm onCreated={loadDashboard} plantTypes={plantTypes} />
            </div>
          ) : null}
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plantGroups.length ? (
              plantGroups.map((group) => (
                <GroupCard
                  deviceCount={devices.filter((device) => device.group_id === group.group_id).length}
                  group={group}
                  key={group.id}
                  lastWateredAtOverride={serialWateredAtByGroup[group.group_id] ?? null}
                  moistureStatus={getMoistureStatus(group, plantTypes, sensorHistoryByGroup[group.group_id] ?? [])}
                  onDeleted={loadDashboard}
                  onSerialWater={serialConnected ? handleSerialWater : undefined}
                  onToggleAutoMode={handleToggleAutoMode}
                  onWatered={handleWatered}
                  plantTypes={plantTypes}
                />
              ))
            ) : (
              <EmptyState label="No plants yet" />
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function getMoistureStatus(group: PlantGroup, plantTypes: PlantType[], history: SensorHistoryPoint[]) {
  const plantType = plantTypes.find((type) => type.plant_type_id === group.plant_type_id);
  const latest = history
    .filter((point) => point.moisture !== null)
    .reduce<SensorHistoryPoint | null>((currentLatest, point) => {
      if (!currentLatest) {
        return point;
      }
      return new Date(point.time).getTime() > new Date(currentLatest.time).getTime() ? point : currentLatest;
    }, null);

  if (!plantType || latest?.moisture === null || latest?.moisture === undefined) {
    return { level: "none" as const, label: "No data", value: null };
  }

  if (latest.moisture < plantType.ideal_moisture_min) {
    return { level: "low" as const, label: "Low", value: latest.moisture };
  }

  if (latest.moisture > plantType.ideal_moisture_max) {
    return { level: "high" as const, label: "High", value: latest.moisture };
  }

  return { level: "good" as const, label: "Good", value: latest.moisture };
}

function SectionHeading({
  isOpen,
  onToggle,
  title,
}: {
  isOpen: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <button
        aria-label={isOpen ? `Hide ${title} form` : `Add ${title}`}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-xl font-semibold leading-none text-leaf shadow-sm transition hover:bg-mint"
        onClick={onToggle}
        type="button"
      >
        {isOpen ? "-" : "+"}
      </button>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
      {label}
    </div>
  );
}
