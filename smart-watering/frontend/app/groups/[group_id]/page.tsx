"use client";

import {
  assignDeviceToGroup,
  getDetectedDevices,
  getPlantGroup,
  getSensorHistory,
  getWateringEvents,
  manualWaterGroup,
  removeDeviceFromGroup,
  updateGroupAutoMode,
} from "@/lib/api";
import type { DetectedDevice, PlantGroupDetail, PumpResult, SensorHistoryPoint, WateringEventPoint } from "@/lib/api";
import { getDemoWateringEvents, withDemoSensorHistory } from "@/lib/demoData";
import { getSerialWateringEvents, recordSerialWateringEvent } from "@/lib/serialWateringEvents";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COOLDOWN_SECONDS = 60;
const AUTO_REFRESH_INTERVAL_MS = 2000;
const DEVICE_ONLINE_WINDOW_SECONDS = 20;
const DEVICE_LINE_COLORS = ["#2f7d59", "#2563eb", "#9333ea", "#dc2626", "#0f766e", "#b45309"];
const GAUGE_PATH_LENGTH = 126;
const SERIAL_WATER_DURATION_MS = 5000;
const WATERING_COOLDOWN_MS = 60_000;

type SerialPortHandle = {
  open: (options: { baudRate: number }) => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return parseTimestamp(value).toLocaleString();
}

function parseTimestamp(value: string) {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

function formatTime(value: string) {
  return parseTimestamp(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatChartTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function getCooldownRemainingSeconds(lastWateredAt: string | null, now: number) {
  if (!lastWateredAt) {
    return 0;
  }

  const elapsedSeconds = Math.floor((now - parseTimestamp(lastWateredAt).getTime()) / 1000);
  return Math.max(0, COOLDOWN_SECONDS - elapsedSeconds);
}

function isDeviceOnline(lastSeenAt: string | null | undefined, now: number) {
  if (!lastSeenAt) {
    return false;
  }

  const elapsedSeconds = Math.floor((now - parseTimestamp(lastSeenAt).getTime()) / 1000);
  return elapsedSeconds <= DEVICE_ONLINE_WINDOW_SECONDS;
}

function getMoistureStatus(moisture: number, idealMin: number, idealMax: number) {
  if (moisture < idealMin) {
    return { label: "Needs Water", className: "text-red-700", gaugeColor: "#dc2626", bgClassName: "bg-red-50", borderClassName: "border-red-200" };
  }

  if (moisture > idealMax) {
    return { label: "Too Wet", className: "text-amber-700", gaugeColor: "#d97706", bgClassName: "bg-amber-50", borderClassName: "border-amber-200" };
  }

  return { label: "Healthy", className: "text-green-700", gaugeColor: "#2f7d59", bgClassName: "bg-green-50", borderClassName: "border-green-200" };
}

function getMoistureScore(moisture: number | null | undefined, idealMin: number, idealMax: number) {
  if (moisture === null || moisture === undefined) {
    return 0;
  }

  const idealMid = (idealMin + idealMax) / 2;
  const tolerance = Math.max(idealMax - idealMin, 12);
  const distance = Math.abs(moisture - idealMid);
  return Math.max(0, Math.min(100, Math.round(100 - (distance / tolerance) * 55)));
}

function getDisplayMetrics(moisture: number | null | undefined, idealMin: number, idealMax: number, deviceCount: number, eventCount: number) {
  const score = getMoistureScore(moisture, idealMin, idealMax);
  const baseline = moisture ?? idealMin;
  const leafTurgor = Math.max(42, Math.min(99, Math.round(score * 0.72 + 24)));
  const soilTrend = moisture === null || moisture === undefined ? "Waiting for sensor" : moisture < idealMin ? "Drying fast" : moisture > idealMax ? "Holding water" : "Stable";
  const rootZone = moisture === null || moisture === undefined ? "Unknown" : moisture < idealMin ? "Thirsty" : moisture > idealMax ? "Saturated" : "Comfortable";
  const lightIndex = Math.max(48, Math.min(92, Math.round(64 + deviceCount * 7 + eventCount * 1.5)));
  const roomTemp = Math.max(20, Math.min(27, Math.round(23 + ((baseline % 7) - 3) / 2)));
  const humidity = Math.max(38, Math.min(74, Math.round(52 + (baseline - idealMin) / 3)));
  const nextCheckMinutes = moisture === null || moisture === undefined ? 5 : moisture < idealMin ? 1 : moisture > idealMax ? 18 : 8;

  return {
    score,
    leafTurgor,
    soilTrend,
    rootZone,
    lightIndex,
    roomTemp,
    humidity,
    nextCheckMinutes,
  };
}

export default function GroupDetailPage() {
  const params = useParams<{ group_id: string }>();
  const groupId = params.group_id;
  const [detail, setDetail] = useState<PlantGroupDetail | null>(null);
  const [detectedDevices, setDetectedDevices] = useState<DetectedDevice[]>([]);
  const [serialDevices, setSerialDevices] = useState<DetectedDevice[]>([]);
  const [serialConnected, setSerialConnected] = useState(false);
  const [sensorHistory, setSensorHistory] = useState<SensorHistoryPoint[]>([]);
  const [wateringEvents, setWateringEvents] = useState<WateringEventPoint[]>([]);
  const [serialWateringEvents, setSerialWateringEvents] = useState<WateringEventPoint[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [status, setStatus] = useState("Loading plant...");
  const [error, setError] = useState<string | null>(null);
  const [wateringEventPage, setWateringEventPage] = useState(1);
  const [serialLastWateredAt, setSerialLastWateredAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const serialConnectedRef = useRef(false);
  const detailRef = useRef<PlantGroupDetail | null>(null);
  const serialWriterRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const serialLastWateredAtRef = useRef<string | null>(null);

  useEffect(() => {
    serialConnectedRef.current = serialConnected;
  }, [serialConnected]);

  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  useEffect(() => {
    serialLastWateredAtRef.current = serialLastWateredAt;
  }, [serialLastWateredAt]);

  const loadGroup = useCallback(async (showSyncedStatus = true) => {
    setError(null);
    try {
      const [groupData, detectedData, historyData, eventData] = await Promise.all([
        getPlantGroup(groupId),
        getDetectedDevices(),
        getSensorHistory(groupId),
        getWateringEvents(groupId),
      ]);
      setDetail(groupData);
      setDetectedDevices(detectedData);
      if (!serialConnectedRef.current) {
        setSensorHistory(historyData);
      }
      setWateringEvents(eventData);
      if (showSyncedStatus) {
        setStatus("Plant synced with FastAPI");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load plant");
      setStatus("Backend connection failed");
    }
  }, [groupId]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadGroup(false);
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadGroup]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setWateringEventPage(1);
  }, [groupId, wateringEvents.length]);

  useEffect(() => {
    setSerialWateringEvents(getSerialWateringEvents(groupId));
  }, [groupId]);

  async function handleManualWater() {
    if (isSerialCooldownActive() || (detail && getCooldownRemainingSeconds(detail.group.last_watered_at, now) > 0)) {
      setStatus("Watering disabled for cooldown");
      return;
    }

    if (serialConnected && serialWriterRef.current) {
      await sendSerialWaterCommand("manual");
      return;
    }

    if (detail && getCooldownRemainingSeconds(detail.group.last_watered_at, now) > 0) {
      setStatus(`Watering disabled for ${getCooldownRemainingSeconds(detail.group.last_watered_at, now)}s cooldown`);
      return;
    }

    setStatus("Sending Manual Water Plant command...");
    try {
      const result = await manualWaterGroup(groupId);
      setStatus(formatPumpResult(result));
      loadGroup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manual Water Plant failed");
      setStatus("Manual Water Plant failed");
    }
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

  function upsertSerialDevice(deviceId: string, name?: string) {
    const currentDetail = detailRef.current;
    const assignedDevice = currentDetail?.devices.find((device) => device.device_id === deviceId);
    const existingDetected = detectedDevices.find((device) => device.device_id === deviceId);
    const nextDevice: DetectedDevice = {
      device_id: deviceId,
      name: name || assignedDevice?.name || existingDetected?.name || deviceId,
      is_online: true,
      in_use: Boolean(assignedDevice),
      group_id: assignedDevice ? currentDetail?.group.group_id ?? null : existingDetected?.group_id ?? null,
      group_name: assignedDevice ? currentDetail?.group.name ?? null : existingDetected?.group_name ?? null,
      ip_address: null,
      firmware_version: "serial",
      last_seen_at: new Date().toISOString(),
    };

    setSerialDevices((current) => [nextDevice, ...current.filter((device) => device.device_id !== deviceId)]);
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

    if (line.startsWith("DEVICE_JSON:")) {
      try {
        const payload = JSON.parse(line.slice("DEVICE_JSON:".length)) as { device_id?: string; name?: string };
        if (payload.device_id) {
          upsertSerialDevice(payload.device_id, payload.name);
          setStatus(`Serial ESP32 found: ${payload.device_id}`);
        }
      } catch {
        setStatus("Ignored malformed serial device line");
      }
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

      const deviceId = reading.device_id;
      const moisture = reading.moisture;

      upsertSerialDevice(deviceId, reading.name);
      const currentDetail = detailRef.current;
      const assignedHere = currentDetail?.devices.some((device) => device.device_id === deviceId);
      if (assignedHere) {
        setSensorHistory((current) => [
          ...current.slice(-119),
          {
            time: new Date().toISOString(),
            device_id: deviceId,
            moisture,
            temperature: typeof reading.temperature === "number" ? reading.temperature : null,
          },
        ]);
        maybeAutoWater(moisture);
      }
      if (!assignedHere) {
        setStatus(`Serial moisture ${moisture.toFixed(1)}% from ${deviceId}`);
      }
    } catch {
      setStatus("Ignored malformed serial sensor line");
    }
  }

  function isSerialCooldownActive() {
    const lastWateredAt = serialLastWateredAtRef.current;
    if (!lastWateredAt) {
      return false;
    }

    return Date.now() - new Date(lastWateredAt).getTime() < WATERING_COOLDOWN_MS;
  }

  function markSerialWatered() {
    const timestamp = new Date().toISOString();
    serialLastWateredAtRef.current = timestamp;
    setSerialLastWateredAt(timestamp);
  }

  async function sendSerialWaterCommand(source: "manual" | "auto") {
    const writer = serialWriterRef.current;
    if (!writer) {
      throw new Error("Connect ESP32 Serial before watering.");
    }

    setError(null);
    setStatus(`${source === "auto" ? "Auto" : "Manual"} watering sent to ESP32...`);
    try {
      await writer.write(new TextEncoder().encode(`WATER:${SERIAL_WATER_DURATION_MS}\n`));
      markSerialWatered();
      const event = recordSerialWateringEvent({
        groupId,
        source,
        durationSeconds: SERIAL_WATER_DURATION_MS / 1000,
        moisture: getLatestDisplayedMoisture(),
      });
      setSerialWateringEvents((current) => [event, ...current].slice(0, 30));
      setStatus(`${source === "auto" ? "Auto" : "Manual"} watering command sent for ${detailRef.current?.group.name ?? groupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Serial water command failed");
      setStatus("ESP32 serial water command failed");
    }
  }

  function maybeAutoWater(moisture: number) {
    const currentDetail = detailRef.current;
    if (!currentDetail) {
      return;
    }

    if (!currentDetail.group.auto_mode || moisture >= currentDetail.plant_type.ideal_moisture_min) {
      setStatus(`Serial moisture ${moisture.toFixed(1)}% from ${currentDetail.group.name}`);
      return;
    }

    if (isSerialCooldownActive()) {
      setStatus(`Auto water waiting for cooldown: ${moisture.toFixed(1)}% from ${currentDetail.group.name}`);
      return;
    }

    void sendSerialWaterCommand("auto");
  }

  function getLatestDisplayedMoisture() {
    const latest = sensorHistory
      .filter((point) => point.moisture !== null)
      .reduce<SensorHistoryPoint | null>((currentLatest, point) => {
        if (!currentLatest) {
          return point;
        }
        return parseTimestamp(point.time).getTime() > parseTimestamp(currentLatest.time).getTime() ? point : currentLatest;
      }, null);

    return latest?.moisture ?? null;
  }

  async function handleToggleAutoMode() {
    if (!detail) {
      return;
    }

    setStatus("Updating Auto Water setting...");
    try {
      await updateGroupAutoMode(groupId, !detail.group.auto_mode);
      setStatus("Auto Water setting updated");
      loadGroup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto Water update failed");
      setStatus("Auto Water update failed");
    }
  }

  async function handleAddDevice() {
    if (!selectedDeviceId) {
      setStatus("Select a detected ESP32 device first");
      return;
    }

    const selectedDevice = allDetectedDevices.find((device) => device.device_id === selectedDeviceId);
    if (selectedDevice?.group_id && selectedDevice.group_id !== groupId) {
      setStatus("This ESP32 is already in use by another plant");
      return;
    }

    setStatus("Adding device to plant...");
    try {
      await assignDeviceToGroup(groupId, selectedDeviceId);
      setSelectedDeviceId("");
      setStatus("Device added to plant");
      loadGroup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add device failed");
      setStatus("Add device failed");
    }
  }

  async function handleRemoveDevice(deviceId: string) {
    const confirmed = window.confirm(`Remove ${deviceId} from this plant?`);
    if (!confirmed) {
      setStatus("Remove device canceled");
      return;
    }

    setStatus("Removing device from plant...");
    try {
      await removeDeviceFromGroup(groupId, deviceId);
      setStatus("Device removed from plant");
      loadGroup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove device failed");
      setStatus("Remove device failed");
    }
  }

  if (!detail) {
    return (
      <main className="min-h-screen px-8 py-8 sm:px-10 lg:px-16 xl:px-20">
        <section className="mx-auto max-w-7xl">
          <Link className="text-sm font-semibold text-leaf" href="/dashboard">
            Back to Dashboard
          </Link>
          <p className="mt-6 text-slate-700">{status}</p>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </section>
      </main>
    );
  }

  const displaySensorHistory = withDemoSensorHistory(detail.group, detail.plant_type, sensorHistory);
  const deviceIds = Array.from(new Set(displaySensorHistory.map((point) => point.device_id).filter((deviceId): deviceId is string => Boolean(deviceId))));
  const chartDataByTimestamp = new Map<number, { timestamp: number; [deviceId: string]: number }>();
  displaySensorHistory.forEach((point) => {
    if (!point.device_id || point.moisture === null) {
      return;
    }

    const timestamp = parseTimestamp(point.time).getTime();
    const row = chartDataByTimestamp.get(timestamp) ?? { timestamp };
    row[point.device_id] = point.moisture;
    chartDataByTimestamp.set(timestamp, row);
  });
  const chartData = Array.from(chartDataByTimestamp.values()).sort((first, second) => first.timestamp - second.timestamp);
  const latestMoisturePoint = displaySensorHistory
    .filter((point) => point.moisture !== null)
    .reduce<SensorHistoryPoint | null>((latest, point) => {
      if (!latest) {
        return point;
      }

      return parseTimestamp(point.time).getTime() > parseTimestamp(latest.time).getTime() ? point : latest;
    }, null);
  const moistureStatus =
    latestMoisturePoint?.moisture !== null && latestMoisturePoint?.moisture !== undefined
      ? getMoistureStatus(latestMoisturePoint.moisture, detail.plant_type.ideal_moisture_min, detail.plant_type.ideal_moisture_max)
      : null;
  const currentMoisture = latestMoisturePoint?.moisture;
  const moistureGaugeValue = Math.min(100, Math.max(0, currentMoisture ?? 0));
  const moistureGaugeOffset = GAUGE_PATH_LENGTH - (moistureGaugeValue / 100) * GAUGE_PATH_LENGTH;
  const realWateringEvents = [...serialWateringEvents, ...wateringEvents];
  const displayWateringEvents = realWateringEvents.length ? realWateringEvents : getDemoWateringEvents(detail.group, currentMoisture);
  const firstChartTimestamp = chartData[0]?.timestamp ?? 0;
  const lastChartTimestamp = chartData[chartData.length - 1]?.timestamp ?? 0;
  const chartEventMarkers = displayWateringEvents
    .map((event) => ({
      ...event,
      timestamp: parseTimestamp(event.time).getTime(),
      label: event.source === "auto" ? "Auto Water" : "Manual Water",
    }))
    .filter((event) => Number.isFinite(event.timestamp));
  const eventsPerPage = 5;
  const sortedWateringEvents = [...displayWateringEvents].sort((first, second) => parseTimestamp(second.time).getTime() - parseTimestamp(first.time).getTime());
  const wateringEventPageCount = Math.max(1, Math.ceil(sortedWateringEvents.length / eventsPerPage));
  const firstWateringEventIndex = (wateringEventPage - 1) * eventsPerPage;
  const visibleWateringEvents = sortedWateringEvents.slice(firstWateringEventIndex, firstWateringEventIndex + eventsPerPage);
  const cooldownRemaining = getCooldownRemainingSeconds(serialLastWateredAt ?? detail.group.last_watered_at, now);
  const isInCooldown = cooldownRemaining > 0;
  const cooldownBlocksWatering = isInCooldown;
  const allDetectedDevices = [
    ...serialDevices,
    ...detectedDevices.filter((device) => !serialDevices.some((serialDevice) => serialDevice.device_id === device.device_id)),
  ];
  const addableDetectedDevices = allDetectedDevices.filter((device) => device.is_online && !device.group_id);
  const selectedDevice = allDetectedDevices.find((device) => device.device_id === selectedDeviceId);
  const selectedDeviceUnavailable = !selectedDevice || !selectedDevice.is_online || Boolean(selectedDevice.group_id);
  const displayMetrics = getDisplayMetrics(
    currentMoisture,
    detail.plant_type.ideal_moisture_min,
    detail.plant_type.ideal_moisture_max,
    detail.devices.length,
    displayWateringEvents.length,
  );
  const assignedDeviceCount = detail.devices.length;
  const onlineDeviceCount = detail.devices.filter((device) => isDeviceOnline(device.last_seen_at, now)).length;
  const lastReadingLabel = latestMoisturePoint ? formatTime(latestMoisturePoint.time) : "No reading";
  const plantHealthLabel = moistureStatus?.label === "Healthy" ? "Healthy" : "Need Attention";

  return (
    <main className="min-h-screen px-8 py-8 sm:px-10 lg:px-16 xl:px-20">
      <section className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-4">
          <Link className="text-sm font-semibold text-leaf" href="/dashboard">
            Back to Dashboard
          </Link>
          <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${serialConnected ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-600"}`}>
            {serialConnected ? "USB Serial Live" : "Backend Sync"}
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="bg-[linear-gradient(135deg,#f8fbf9_0%,#eef7f2_52%,#fdf8eb_100%)] p-6 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-wide text-leaf">Plant Detail</p>
              <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-ink sm:text-5xl">{detail.group.name}</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                    {detail.plant_type.name} monitored with a live soil-moisture signal. Ideal range is{" "}
                    <span className="font-semibold text-ink">
                      {detail.plant_type.ideal_moisture_min}-{detail.plant_type.ideal_moisture_max}%
                    </span>
                    .
                  </p>
                </div>
                <div className={`w-fit rounded-lg border px-4 py-3 ${moistureStatus ? `${moistureStatus.bgClassName} ${moistureStatus.borderClassName}` : "border-slate-200 bg-white"}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plant Health</p>
                  <p className={`mt-1 text-2xl font-bold ${moistureStatus?.className ?? "text-slate-700"}`}>{plantHealthLabel}</p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricTile label="Moisture" value={currentMoisture !== null && currentMoisture !== undefined ? `${currentMoisture.toFixed(1)}%` : "No data"} detail={moistureStatus?.label ?? "Waiting"} />
                <MetricTile label="Last Reading" value={lastReadingLabel} detail={latestMoisturePoint?.device_id ?? "No device"} />
                <MetricTile label="Devices" value={`${onlineDeviceCount}/${assignedDeviceCount}`} detail="online now" />
                <MetricTile label="Next Check" value={`${displayMetrics.nextCheckMinutes}m`} detail="serial monitor" />
              </div>
            </div>
            <div className="border-t border-slate-200 bg-white p-6 lg:border-l lg:border-t-0">
              <p className="text-sm font-semibold text-ink">System Status</p>
              <div className="mt-4 grid gap-3 text-sm">
                <StatusRow label="Serial" value={serialConnected ? "Connected" : "Ready"} tone={serialConnected ? "good" : "neutral"} />
                <StatusRow label="Auto Water" value={detail.group.auto_mode ? "Enabled" : "Disabled"} tone={detail.group.auto_mode ? "good" : "neutral"} />
                <StatusRow label="Pump" value={serialConnected ? "Serial Ready" : "Backend Only"} tone={serialConnected ? "good" : "warn"} />
                <StatusRow label="Last Watered" value={formatDate(detail.group.last_watered_at)} tone="neutral" />
              </div>
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{status}</div>
            </div>
          </div>
        </div>

        {error ? <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <section className="mt-8 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">Live Moisture</h2>
                <p className="mt-1 text-sm text-slate-500">This is the real sensor value used for the demo.</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${moistureStatus ? `${moistureStatus.bgClassName} ${moistureStatus.borderClassName} ${moistureStatus.className}` : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                {moistureStatus?.label ?? "Waiting"}
              </span>
            </div>
            <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 px-4 pb-5 pt-4">
              {currentMoisture !== null && currentMoisture !== undefined && moistureStatus ? (
                <div className="mx-auto w-full max-w-72">
                  <svg aria-label={`Current moisture ${currentMoisture.toFixed(1)} percent, ${moistureStatus.label}`} className="h-44 w-full" viewBox="0 0 120 82">
                    <path d="M 18 62 A 42 42 0 0 1 102 62" fill="none" pathLength={GAUGE_PATH_LENGTH} stroke="#d9d9d9" strokeLinecap="butt" strokeWidth="14" />
                    <path
                      d="M 18 62 A 42 42 0 0 1 102 62"
                      fill="none"
                      pathLength={GAUGE_PATH_LENGTH}
                      stroke={moistureStatus.gaugeColor}
                      strokeDasharray={GAUGE_PATH_LENGTH}
                      strokeDashoffset={moistureGaugeOffset}
                      strokeLinecap="butt"
                      strokeWidth="14"
                    />
                    <text className="fill-ink text-lg font-bold" textAnchor="middle" x="60" y="54">
                      {currentMoisture.toFixed(1)}%
                    </text>
                    <text fill={moistureStatus.gaugeColor} fontSize="5.5" fontWeight="700" textAnchor="middle" x="60" y="73">
                      {moistureStatus.label}
                    </text>
                    <text className="fill-slate-600 text-xs" textAnchor="middle" x="18" y="78">
                      0
                    </text>
                    <text className="fill-slate-600 text-xs" textAnchor="middle" x="102" y="78">
                      100
                    </text>
                  </svg>
                </div>
              ) : (
                <p className="mt-3 text-center text-sm text-slate-500">No data</p>
              )}
              <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                <span className="text-slate-500">Threshold</span>
                <span className="font-semibold text-ink">
                  {detail.plant_type.ideal_moisture_min}% to {detail.plant_type.ideal_moisture_max}%
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                className="rounded-md bg-leaf px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={cooldownBlocksWatering}
                onClick={handleManualWater}
                type="button"
              >
                {cooldownBlocksWatering ? `Cooldown ${cooldownRemaining}s` : "Manual Water Plant"}
              </button>
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50" onClick={handleToggleAutoMode} type="button">
                {detail.group.auto_mode ? "Turn Auto Water Off" : "Turn Auto Water On"}
              </button>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Environment Snapshot</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InsightCard label="Root Zone" value={displayMetrics.rootZone} detail={`${displayMetrics.leafTurgor}% leaf turgor`} />
              <InsightCard label="Soil Trend" value={displayMetrics.soilTrend} detail="based on moisture" />
              <InsightCard label="Room Temp" value={`${displayMetrics.roomTemp} C`} detail="display estimate" />
              <InsightCard label="Humidity" value={`${displayMetrics.humidity}%`} detail="display estimate" />
              <InsightCard label="Light Index" value={`${displayMetrics.lightIndex}/100`} detail="demo display" />
              <InsightCard label="Care Events" value={`${displayWateringEvents.length}`} detail={realWateringEvents.length ? "watering records" : "demo records"} />
            </div>
          </article>
        </section>

        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Devices in this Plant</h2>
              <p className="mt-1 text-sm text-slate-500">USB serial devices can be assigned here for a Wi-Fi-free demo.</p>
            </div>
            <button
              className={`w-fit rounded-md border px-4 py-2 text-sm font-semibold ${
                serialConnected
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-slate-300 text-ink hover:bg-slate-50"
              }`}
              onClick={handleSerialConnect}
              type="button"
            >
              {serialConnected ? "Serial Connected" : "Connect ESP32 Serial"}
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Detected ESP32 Device
                <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal" onChange={(event) => setSelectedDeviceId(event.target.value)} value={selectedDeviceId}>
                  <option value="">Select Detected ESP32</option>
                  {addableDetectedDevices.map((device) => (
                    <option key={device.device_id} value={device.device_id}>
                      {device.name} · {device.device_id} · {device.firmware_version === "serial" ? "Serial" : "Online"} · Available
                    </option>
                  ))}
                </select>
              </label>
              {!addableDetectedDevices.length ? (
                <p className="mt-3 text-sm text-slate-500">
                  No unassigned ESP32 devices found. Connect ESP32 Serial above for a Wi-Fi-free demo.
                </p>
              ) : null}
              <button
                className="mt-4 w-full rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={selectedDeviceUnavailable}
                onClick={handleAddDevice}
                type="button"
              >
                Add Device to Plant
              </button>
            </div>

            <div className="grid gap-3">
              {detail.devices.length ? (
                detail.devices.map((device) => {
                  const online = isDeviceOnline(device.last_seen_at, now);

                  return (
                    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between" key={device.id}>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-ink">{device.name}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${online ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                            {online ? "Live" : "Offline"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{device.device_id}</p>
                        <p className="text-xs text-slate-500">Last seen: {formatDate(device.last_seen_at ?? null)}</p>
                      </div>
                      <button className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => handleRemoveDevice(device.device_id)} type="button">
                        Remove Device
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No devices assigned yet.</p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Moisture Graph</h2>
          {chartData.length ? (
            <div className="mt-4 h-72 min-h-72 min-w-0">
              <ResponsiveContainer height="100%" width="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" domain={["dataMin", "dataMax"]} stroke="#64748b" tickFormatter={formatChartTime} type="number" />
                  <YAxis stroke="#64748b" />
                  <Tooltip labelFormatter={(value) => formatChartTime(Number(value))} formatter={(value, name) => [`${value}%`, name]} />
                  <Legend />
                  <ReferenceLine
                    ifOverflow="extendDomain"
                    label={{ value: `Min ${detail.plant_type.ideal_moisture_min}`, fill: "#64748b", fontSize: 11, position: "insideLeft" }}
                    stroke="#94a3b8"
                    strokeDasharray="5 5"
                    y={detail.plant_type.ideal_moisture_min}
                  />
                  <ReferenceLine
                    ifOverflow="extendDomain"
                    label={{ value: `Max ${detail.plant_type.ideal_moisture_max}`, fill: "#64748b", fontSize: 11, position: "insideLeft" }}
                    stroke="#94a3b8"
                    strokeDasharray="5 5"
                    y={detail.plant_type.ideal_moisture_max}
                  />
                  {chartEventMarkers.map((event) => (
                    <ReferenceLine
                      ifOverflow="extendDomain"
                      key={`${event.time}-${event.source}-${event.moisture ?? "event"}`}
                      label={{ value: event.label, angle: -90, fill: "#b45309", fontSize: 11, position: "insideTop" }}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      x={event.timestamp}
                    />
                  ))}
                  {deviceIds.map((deviceId, index) => (
                    <Line
                      connectNulls
                      dataKey={deviceId}
                      dot={false}
                      key={deviceId}
                      name={deviceId}
                      stroke={DEVICE_LINE_COLORS[index % DEVICE_LINE_COLORS.length]}
                      strokeWidth={2}
                      type="monotone"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No sensor data yet.</p>
          )}
        </section>

        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-ink">Watering Event History</h2>
            {displayWateringEvents.length ? (
              <p className="text-sm text-slate-500">
                Showing {firstWateringEventIndex + 1}-{Math.min(firstWateringEventIndex + eventsPerPage, sortedWateringEvents.length)} of {sortedWateringEvents.length}
              </p>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3">
            {displayWateringEvents.length ? (
              visibleWateringEvents.map((event) => (
                <div className="grid gap-1 rounded-md border border-slate-200 p-3 text-sm sm:grid-cols-4" key={`${event.time}-${event.source}`}>
                  <span className="font-medium text-ink">{formatDate(event.time)}</span>
                  <span className="text-slate-600">Source: {event.source ?? "unknown"}</span>
                  <span className="text-slate-600">Duration: {event.duration_seconds ?? 0}s</span>
                  <span className="text-slate-600">Moisture: {event.moisture ?? "n/a"}</span>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No watering events yet.</p>
            )}
          </div>
          {displayWateringEvents.length > eventsPerPage ? (
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-white"
                disabled={wateringEventPage === 1}
                onClick={() => {
                  setWateringEventPage((page) => Math.max(1, page - 1));
                  setStatus("Watering history page changed");
                }}
                type="button"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {wateringEventPage} of {wateringEventPageCount}
              </span>
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-white"
                disabled={wateringEventPage === wateringEventPageCount}
                onClick={() => {
                  setWateringEventPage((page) => Math.min(wateringEventPageCount, page + 1));
                  setStatus("Watering history page changed");
                }}
                type="button"
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function formatPumpResult(result: PumpResult) {
  if (result.status === "queued") {
    return `Manual Water Plant queued${result.command_id ? ` (#${result.command_id})` : ""}`;
  }
  if (result.status === "already_queued") {
    return `Water command already queued${result.command_id ? ` (#${result.command_id})` : ""}`;
  }
  return `Manual Water Plant: ${result.status}`;
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
      <p className="mt-1 truncate text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "neutral" }) {
  const toneClass =
    tone === "good"
      ? "border-green-200 bg-green-50 text-green-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`max-w-44 truncate rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}
