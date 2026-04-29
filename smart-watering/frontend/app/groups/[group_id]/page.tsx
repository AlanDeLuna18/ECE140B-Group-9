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
import type { DetectedDevice, PlantGroupDetail, SensorHistoryPoint, WateringEventPoint } from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COOLDOWN_SECONDS = 30;
const DEVICE_LINE_COLORS = ["#2f7d59", "#2563eb", "#9333ea", "#dc2626", "#0f766e", "#b45309"];
const GAUGE_PATH_LENGTH = 126;

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

function getMoistureStatus(moisture: number, idealMin: number, idealMax: number) {
  if (moisture < idealMin) {
    return { label: "Low", className: "text-red-700", gaugeColor: "#dc2626" };
  }

  if (moisture > idealMax) {
    return { label: "High", className: "text-amber-700", gaugeColor: "#d97706" };
  }

  return { label: "Good", className: "text-green-700", gaugeColor: "#8fbe4f" };
}

export default function GroupDetailPage() {
  const params = useParams<{ group_id: string }>();
  const groupId = params.group_id;
  const [detail, setDetail] = useState<PlantGroupDetail | null>(null);
  const [detectedDevices, setDetectedDevices] = useState<DetectedDevice[]>([]);
  const [sensorHistory, setSensorHistory] = useState<SensorHistoryPoint[]>([]);
  const [wateringEvents, setWateringEvents] = useState<WateringEventPoint[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [status, setStatus] = useState("Loading plant...");
  const [error, setError] = useState<string | null>(null);
  const [wateringEventPage, setWateringEventPage] = useState(1);
  const [now, setNow] = useState(Date.now());

  const loadGroup = useCallback(async () => {
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
      setSensorHistory(historyData);
      setWateringEvents(eventData);
      setStatus("Plant synced with FastAPI");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load plant");
      setStatus("Backend connection failed");
    }
  }, [groupId]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setWateringEventPage(1);
  }, [groupId, wateringEvents.length]);

  async function handleManualWater() {
    if (detail && getCooldownRemainingSeconds(detail.group.last_watered_at, now) > 0) {
      setStatus(`Watering disabled for ${getCooldownRemainingSeconds(detail.group.last_watered_at, now)}s cooldown`);
      return;
    }

    setStatus("Sending Manual Water Plant command...");
    try {
      const result = await manualWaterGroup(groupId);
      setStatus(`Manual Water Plant sent: ${result.status}`);
      loadGroup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manual Water Plant failed");
      setStatus("Manual Water Plant failed");
    }
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

    const selectedDevice = detectedDevices.find((device) => device.device_id === selectedDeviceId);
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

  const deviceIds = Array.from(new Set(sensorHistory.map((point) => point.device_id).filter((deviceId): deviceId is string => Boolean(deviceId))));
  const chartDataByTimestamp = new Map<number, { timestamp: number; [deviceId: string]: number }>();
  sensorHistory.forEach((point) => {
    if (!point.device_id || point.moisture === null) {
      return;
    }

    const timestamp = parseTimestamp(point.time).getTime();
    const row = chartDataByTimestamp.get(timestamp) ?? { timestamp };
    row[point.device_id] = point.moisture;
    chartDataByTimestamp.set(timestamp, row);
  });
  const chartData = Array.from(chartDataByTimestamp.values()).sort((first, second) => first.timestamp - second.timestamp);
  const firstChartTimestamp = chartData[0]?.timestamp ?? 0;
  const lastChartTimestamp = chartData[chartData.length - 1]?.timestamp ?? 0;
  const chartEventMarkers = wateringEvents
    .map((event) => ({
      ...event,
      timestamp: parseTimestamp(event.time).getTime(),
      label: event.source === "auto" ? "Auto Water" : "Manual Water",
    }))
    .filter((event) => Number.isFinite(event.timestamp) && event.timestamp >= firstChartTimestamp && event.timestamp <= lastChartTimestamp);
  const eventsPerPage = 5;
  const sortedWateringEvents = [...wateringEvents].sort((first, second) => parseTimestamp(second.time).getTime() - parseTimestamp(first.time).getTime());
  const wateringEventPageCount = Math.max(1, Math.ceil(sortedWateringEvents.length / eventsPerPage));
  const firstWateringEventIndex = (wateringEventPage - 1) * eventsPerPage;
  const visibleWateringEvents = sortedWateringEvents.slice(firstWateringEventIndex, firstWateringEventIndex + eventsPerPage);
  const cooldownRemaining = detail ? getCooldownRemainingSeconds(detail.group.last_watered_at, now) : 0;
  const isInCooldown = cooldownRemaining > 0;
  const selectedDevice = detectedDevices.find((device) => device.device_id === selectedDeviceId);
  const selectedDeviceUnavailable = Boolean(selectedDevice?.group_id && selectedDevice.group_id !== groupId);
  const latestMoisturePoint = sensorHistory
    .filter((point) => point.moisture !== null)
    .reduce<SensorHistoryPoint | null>((latest, point) => {
      if (!latest) {
        return point;
      }

      return parseTimestamp(point.time).getTime() > parseTimestamp(latest.time).getTime() ? point : latest;
    }, null);
  const moistureStatus =
    detail && latestMoisturePoint?.moisture !== null && latestMoisturePoint?.moisture !== undefined
      ? getMoistureStatus(latestMoisturePoint.moisture, detail.plant_type.ideal_moisture_min, detail.plant_type.ideal_moisture_max)
      : null;
  const currentMoisture = latestMoisturePoint?.moisture;
  const moistureGaugeValue = Math.min(100, Math.max(0, currentMoisture ?? 0));
  const moistureGaugeOffset = GAUGE_PATH_LENGTH - (moistureGaugeValue / 100) * GAUGE_PATH_LENGTH;

  if (!detail) {
    return (
      <main className="min-h-screen px-8 py-8 sm:px-10 lg:px-16 xl:px-20">
        <section className="mx-auto max-w-7xl">
          <Link className="text-sm font-semibold text-leaf" href="/">
            Back to Dashboard
          </Link>
          <p className="mt-6 text-slate-700">{status}</p>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-8 py-8 sm:px-10 lg:px-16 xl:px-20">
      <section className="mx-auto max-w-7xl">
        <Link className="text-sm font-semibold text-leaf" href="/">
          Back to Dashboard
        </Link>

        <div className="mt-6 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-leaf">My Plant</p>
            <h1 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">{detail.group.name}</h1>
            <p className="mt-3 text-slate-600">
              {detail.plant_type.name} · Ideal moisture {detail.plant_type.ideal_moisture_min} to {detail.plant_type.ideal_moisture_max}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            {status}
          </div>
        </div>

        {error ? <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Watering Controls</h2>
            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-4 pb-4 pt-3">
              <p className="text-center text-sm font-semibold text-ink">Current Moisture</p>
              {currentMoisture !== null && currentMoisture !== undefined && moistureStatus ? (
                <div className="mx-auto mt-2 w-full max-w-48">
                  <svg aria-label={`Current moisture ${currentMoisture.toFixed(1)} percent, ${moistureStatus.label}`} className="h-32 w-full" viewBox="0 0 120 82">
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
                    <text className="fill-ink text-base font-bold" textAnchor="middle" x="60" y="58">
                      {currentMoisture.toFixed(1)}%
                    </text>
                    <text className={`text-xs font-semibold ${moistureStatus.className}`} textAnchor="middle" x="60" y="76">
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
              <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                <span className="text-slate-500">Threshold</span>
                <span className="font-semibold text-ink">
                  {detail.plant_type.ideal_moisture_min} to {detail.plant_type.ideal_moisture_max}
                </span>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Auto Water Enabled</dt>
                <dd className="font-medium text-slate-800">{detail.group.auto_mode ? "Yes" : "No"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Last Watered</dt>
                <dd className="text-right font-medium text-slate-800">{formatDate(detail.group.last_watered_at)}</dd>
              </div>
            </dl>
            <div className="mt-5 grid gap-3">
              <button
                className="rounded-md bg-leaf px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={isInCooldown}
                onClick={handleManualWater}
                type="button"
              >
                {isInCooldown ? `Cooldown ${cooldownRemaining}s` : "Manual Water Plant"}
              </button>
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50" onClick={handleToggleAutoMode} type="button">
                {detail.group.auto_mode ? "Turn Auto Water Off" : "Turn Auto Water On"}
              </button>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-ink">Devices in this Plant</h2>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Detected ESP32 Device
                <select className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" onChange={(event) => setSelectedDeviceId(event.target.value)} value={selectedDeviceId}>
                  <option value="">Select Detected ESP32</option>
                  {detectedDevices.map((device) => (
                    <option disabled={Boolean(device.group_id && device.group_id !== groupId)} key={device.device_id} value={device.device_id}>
                      {device.name} · {device.device_id}
                      {device.group_id === groupId ? " · In this plant" : device.group_id ? ` · In use by ${device.group_name ?? device.group_id}` : " · Available"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={selectedDeviceUnavailable}
                onClick={handleAddDevice}
                type="button"
              >
                Add Device to Plant
              </button>
              <p className="text-xs text-slate-500">Devices already used by another plant are marked in use and cannot be selected.</p>
            </div>

            <div className="mt-5 grid gap-3">
              {detail.devices.length ? (
                detail.devices.map((device) => (
                  <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between" key={device.id}>
                    <div>
                      <p className="font-medium text-ink">{device.name}</p>
                      <p className="text-sm text-slate-500">{device.device_id}</p>
                    </div>
                    <button className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => handleRemoveDevice(device.device_id)} type="button">
                      Remove Device
                    </button>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No devices assigned yet.</p>
              )}
            </div>
          </article>
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
            {wateringEvents.length ? (
              <p className="text-sm text-slate-500">
                Showing {firstWateringEventIndex + 1}-{Math.min(firstWateringEventIndex + eventsPerPage, sortedWateringEvents.length)} of {sortedWateringEvents.length}
              </p>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3">
            {wateringEvents.length ? (
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
          {wateringEvents.length > eventsPerPage ? (
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
