"use client";

import { createPlantGroup } from "@/lib/api";
import type { PlantType } from "@/lib/api";
import { FormEvent, useState } from "react";

function toGroupId(name: string) {
  return `group-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

export default function CreateGroupForm({ onCreated, plantTypes }: { onCreated: () => void; plantTypes: PlantType[] }) {
  const [name, setName] = useState("");
  const [plantTypeId, setPlantTypeId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Creating plant...");
    await createPlantGroup({
      group_id: toGroupId(name),
      name,
      plant_type_id: plantTypeId,
    });
    setName("");
    setPlantTypeId("");
    setMessage("Plant created");
    onCreated();
  }

  return (
    <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
      <h3 className="text-base font-semibold text-ink">Create My Plant</h3>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Plant Name
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" onChange={(event) => setName(event.target.value)} placeholder="Kitchen Basil" required value={name} />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Plant Type
        <select className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" onChange={(event) => setPlantTypeId(event.target.value)} required value={plantTypeId}>
          <option value="">Select Plant Type</option>
          {plantTypes.map((plantType) => (
            <option key={plantType.id} value={plantType.plant_type_id}>
              {plantType.name}
            </option>
          ))}
        </select>
      </label>
      <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
        Create Plant
      </button>
      {message ? <p className="text-sm text-leaf">{message}</p> : null}
    </form>
  );
}
