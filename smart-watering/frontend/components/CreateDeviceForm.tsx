"use client";

import { createDevice } from "@/lib/api";
import type { DetectedDevice, PlantGroup } from "@/lib/api";
import { FormEvent, useMemo, useState } from "react";

export default function CreateDeviceForm({
  detectedDevices,
  plantGroups,
  onCreated,
}: {
  detectedDevices: DetectedDevice[];
  plantGroups: PlantGroup[];
  onCreated: () => void;
}) {
  const [deviceId, setDeviceId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const selectedDevice = useMemo(
    () => detectedDevices.find((device) => device.device_id === deviceId),
    [detectedDevices, deviceId],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDevice) {
      setMessage("Select a detected ESP32 device");
      return;
    }

    setMessage("Creating device...");
    await createDevice({
      device_id: selectedDevice.device_id,
      name: selectedDevice.name,
      group_id: groupId,
    });
    setDeviceId("");
    setGroupId("");
    setMessage("Device created");
    onCreated();
  }

  return (
    <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
      <h3 className="text-base font-semibold text-ink">Create Device</h3>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Detected ESP32 Device
        <select className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" onChange={(event) => setDeviceId(event.target.value)} required value={deviceId}>
          <option value="">Select Detected ESP32</option>
          {detectedDevices.map((device) => (
            <option key={device.device_id} value={device.device_id}>
              {device.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        My Plant
        <select className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" onChange={(event) => setGroupId(event.target.value)} required value={groupId}>
          <option value="">Select My Plant</option>
          {plantGroups.map((group) => (
            <option key={group.id} value={group.group_id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
        Create Device
      </button>
      {message ? <p className="text-sm text-leaf">{message}</p> : null}
    </form>
  );
}
