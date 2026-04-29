"use client";

import { deletePlantType, updatePlantType } from "@/lib/api";
import type { PlantType } from "@/lib/api";
import { FormEvent, useState } from "react";

export default function PlantCard({ onUpdated, plant }: { onUpdated: () => void; plant: PlantType }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(plant.name);
  const [idealMin, setIdealMin] = useState(String(plant.ideal_moisture_min));
  const [idealMax, setIdealMax] = useState(String(plant.ideal_moisture_max));
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Saving Plant Type...");
    await updatePlantType(plant.plant_type_id, {
      name,
      ideal_moisture_min: Number(idealMin),
      ideal_moisture_max: Number(idealMax),
    });
    setIsEditing(false);
    setMessage("Plant Type updated");
    onUpdated();
  }

  async function handleDelete() {
    const confirmed = window.confirm(`Delete Plant Type "${plant.name}"?`);
    if (!confirmed) {
      setMessage("Delete canceled");
      return;
    }

    setMessage("Deleting Plant Type...");
    try {
      await deletePlantType(plant.plant_type_id);
      setMessage("Plant Type deleted");
      onUpdated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete Plant Type failed");
    }
  }

  if (isEditing) {
    return (
      <form className="grid w-80 shrink-0 gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
        <h3 className="text-lg font-semibold text-ink">Edit Plant Type</h3>
        <p className="text-sm text-slate-500">{plant.plant_type_id}</p>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Plant Type Name
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
            Ideal Moisture Min
            <input className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm font-normal" onChange={(event) => setIdealMin(event.target.value)} required type="number" value={idealMin} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
            Ideal Moisture Max
            <input className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm font-normal" onChange={(event) => setIdealMax(event.target.value)} required type="number" value={idealMax} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
            Save
          </button>
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
            onClick={() => {
              setIsEditing(false);
              setMessage("Edit canceled");
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <article className="relative w-80 shrink-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <button
        aria-label={`Delete ${plant.name}`}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md border border-red-100 text-red-600 transition hover:bg-red-50"
        onClick={handleDelete}
        title="Delete Plant Type"
        type="button"
      >
        <TrashIcon />
      </button>
      <h3 className="text-lg font-semibold text-ink">{plant.name}</h3>
      <p className="text-sm text-slate-500">{plant.plant_type_id}</p>
      <dl className="mt-4 grid gap-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Ideal moisture</dt>
          <dd className="font-medium text-slate-800">
            {plant.ideal_moisture_min} to {plant.ideal_moisture_max}
          </dd>
        </div>
      </dl>
      <div className="mt-5">
        <button
          className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
          onClick={() => {
            setIsEditing(true);
            setMessage("Edit mode opened");
          }}
          type="button"
        >
          Edit
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-leaf">{message}</p> : null}
    </article>
  );
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
