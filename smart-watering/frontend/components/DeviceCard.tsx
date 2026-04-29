"use client";

import type { Device, PumpResult } from "@/lib/api";
import { manualWater } from "@/lib/api";
import { useState } from "react";

type DeviceCardProps = {
  device: Device;
  onWatered: (result: PumpResult) => void;
};

export default function DeviceCard({ device, onWatered }: DeviceCardProps) {
  const [isWatering, setIsWatering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleManualWater() {
    setIsWatering(true);
    setError(null);
    setMessage("Sending manual water command...");
    try {
      const result = await manualWater(device.device_id);
      setMessage(`Manual water sent: ${result.status}`);
      onWatered(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manual watering failed");
      setMessage(null);
    } finally {
      setIsWatering(false);
    }
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-ink">{device.name}</h3>
          <p className="text-sm text-slate-500">{device.device_id}</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">My Plant</dt>
          <dd className="font-medium text-slate-800">{device.group_id ?? "Unassigned"}</dd>
        </div>
      </dl>

      <button
        className="mt-5 w-full rounded-md bg-leaf px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={isWatering}
        onClick={handleManualWater}
        type="button"
      >
        {isWatering ? "Watering..." : "Manual Water"}
      </button>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-leaf">{message}</p> : null}
    </article>
  );
}
