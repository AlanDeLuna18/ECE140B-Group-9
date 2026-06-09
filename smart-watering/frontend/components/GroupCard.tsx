"use client";

import { deletePlantGroup, manualWaterGroup } from "@/lib/api";
import type { PlantGroup, PlantType, PumpResult } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";

const COOLDOWN_SECONDS = 60;

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

function getCooldownRemainingSeconds(lastWateredAt: string | null, now: number) {
  if (!lastWateredAt) {
    return 0;
  }

  const elapsedSeconds = Math.floor((now - parseTimestamp(lastWateredAt).getTime()) / 1000);
  return Math.max(0, COOLDOWN_SECONDS - elapsedSeconds);
}

export default function GroupCard({
  group,
  plantTypes,
  deviceCount,
  onWatered,
  onSerialWater,
  onToggleAutoMode,
  onDeleted,
  moistureStatus,
  lastWateredAtOverride,
}: {
  group: PlantGroup;
  plantTypes: PlantType[];
  deviceCount: number;
  onWatered: (result: PumpResult) => void;
  onSerialWater?: (group: PlantGroup) => Promise<PumpResult>;
  onToggleAutoMode: (group: PlantGroup) => Promise<void>;
  onDeleted: () => void;
  lastWateredAtOverride?: string | null;
  moistureStatus: {
    level: "low" | "good" | "high" | "none";
    label: string;
    value: number | null;
  };
}) {
  const plantType = plantTypes.find((type) => type.plant_type_id === group.plant_type_id);
  const [isWatering, setIsWatering] = useState(false);
  const [isTogglingAuto, setIsTogglingAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const effectiveLastWateredAt = lastWateredAtOverride ?? group.last_watered_at;
  const cooldownRemaining = getCooldownRemainingSeconds(effectiveLastWateredAt, now);
  const isInCooldown = cooldownRemaining > 0;
  const cooldownBlocksWatering = isInCooldown;
  const moistureStyle = {
    low: "bg-red-50 text-red-700 ring-red-100",
    good: "bg-green-50 text-green-700 ring-green-100",
    high: "bg-amber-50 text-amber-700 ring-amber-100",
    none: "bg-slate-50 text-slate-500 ring-slate-100",
  }[moistureStatus.level];
  const moistureDotStyle = {
    low: "bg-red-500",
    good: "bg-green-500",
    high: "bg-amber-500",
    none: "bg-slate-300",
  }[moistureStatus.level];

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  async function handleManualWater() {
    if (cooldownBlocksWatering) {
      setMessage(`Watering disabled for ${cooldownRemaining}s cooldown`);
      return;
    }

    setIsWatering(true);
    setError(null);
    setMessage(onSerialWater ? "Sending ESP32 serial water command..." : "Sending manual water command...");
    try {
      const result = onSerialWater ? await onSerialWater(group) : await manualWaterGroup(group.group_id);
      setMessage(formatPumpResult(result));
      onWatered(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manual watering failed");
      setMessage(null);
    } finally {
      setIsWatering(false);
    }
  }

  async function handleToggleAutoMode() {
    setIsTogglingAuto(true);
    setError(null);
    setMessage(`${group.auto_mode ? "Turning off" : "Turning on"} auto water...`);
    try {
      await onToggleAutoMode(group);
      setMessage(`Auto water ${group.auto_mode ? "off" : "on"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto water update failed");
      setMessage(null);
    } finally {
      setIsTogglingAuto(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(`Delete My Plant "${group.name}"? Devices assigned to it will become available again.`);
    if (!confirmed) {
      setMessage("Delete canceled");
      return;
    }

    setError(null);
    setMessage("Deleting plant...");
    try {
      await deletePlantGroup(group.group_id);
      setMessage("Plant deleted");
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete plant failed");
      setMessage(null);
    }
  }

  return (
    <article className="relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <button
        aria-label={`Delete ${group.name}`}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md border border-red-100 text-red-600 transition hover:bg-red-50"
        onClick={handleDelete}
        title="Delete Plant"
        type="button"
      >
        <TrashIcon />
      </button>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-ink">{group.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{group.group_id}</p>
        </div>
        <span className="mr-8 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <span className="text-sm">{group.auto_mode ? "✓" : "○"}</span>
          {group.auto_mode ? "Auto Water Enabled" : "Auto Water Off"}
        </span>
      </div>
      <div className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${moistureStyle}`}>
        <span className={`h-2 w-2 rounded-full ${moistureDotStyle}`} />
        <span>Moisture {moistureStatus.label}</span>
        {moistureStatus.value !== null ? <span>{moistureStatus.value.toFixed(1)}%</span> : null}
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Plant Type</dt>
          <dd className="font-medium text-slate-800">{plantType?.name ?? group.plant_type_id}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Last Watered</dt>
          <dd className="text-right font-medium text-slate-800">{formatDate(group.last_watered_at)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Devices</dt>
          <dd className="font-medium text-slate-800">{deviceCount}</dd>
        </div>
      </dl>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          className="rounded-md bg-leaf px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isWatering || cooldownBlocksWatering}
          onClick={handleManualWater}
          type="button"
        >
          {isWatering ? "Watering..." : cooldownBlocksWatering ? `Cooldown ${cooldownRemaining}s` : "Manual Water Plant"}
        </button>
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          disabled={isTogglingAuto}
          onClick={handleToggleAutoMode}
          type="button"
        >
          {isTogglingAuto ? "Updating..." : group.auto_mode ? "Turn Auto Water Off" : "Turn Auto Water On"}
        </button>
        <Link className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-ink hover:bg-slate-50" href={`/groups/${group.group_id}`}>
          More Info
        </Link>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-leaf">{message}</p> : null}
    </article>
  );
}

function formatPumpResult(result: PumpResult) {
  if (result.status === "queued") {
    return `Manual water queued${result.command_id ? ` (#${result.command_id})` : ""}`;
  }
  if (result.status === "already_queued") {
    return `Water command already queued${result.command_id ? ` (#${result.command_id})` : ""}`;
  }
  if (result.status === "sent_to_esp32") {
    return `ESP32 watering command sent`;
  }
  return `Manual water: ${result.status}`;
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
