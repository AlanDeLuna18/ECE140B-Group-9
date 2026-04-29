"use client";

import { createPlantType, getPlantTypeSuggestion } from "@/lib/api";
import { FormEvent, useState } from "react";

function toPlantTypeId(name: string) {
  return `type-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

export default function CreatePlantForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [idealMin, setIdealMin] = useState("45");
  const [idealMax, setIdealMax] = useState("65");
  const [suggestionSource, setSuggestionSource] = useState("manual");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSuggestion() {
    if (!name.trim()) {
      setMessage("Enter a plant type name first");
      return;
    }

    setMessage("Getting dummy suggestion...");
    const suggestion = await getPlantTypeSuggestion(name);
    setIdealMin(String(suggestion.ideal_moisture_min));
    setIdealMax(String(suggestion.ideal_moisture_max));
    setSuggestionSource(suggestion.suggestion_source);
    setMessage(`Dummy suggestion loaded for ${suggestion.name}`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Saving Plant Type...");
    await createPlantType({
      plant_type_id: toPlantTypeId(name),
      name,
      ideal_moisture_min: Number(idealMin),
      ideal_moisture_max: Number(idealMax),
      suggestion_source: suggestionSource,
    });
    setName("");
    setIdealMin("45");
    setIdealMax("65");
    setSuggestionSource("manual");
    setMessage("Plant Type created");
    onCreated();
  }

  return (
    <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
      <h3 className="text-base font-semibold text-ink">Create Plant Type</h3>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Plant Type Name
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" onChange={(event) => setName(event.target.value)} placeholder="Basil" required value={name} />
      </label>
      <button className="rounded-md border border-leaf px-4 py-2 text-sm font-semibold text-leaf hover:bg-mint" onClick={handleSuggestion} type="button">
        Get Dummy Suggestion
      </button>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Ideal Moisture Min
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" onChange={(event) => setIdealMin(event.target.value)} placeholder="45" required type="number" value={idealMin} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Ideal Moisture Max
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" onChange={(event) => setIdealMax(event.target.value)} placeholder="65" required type="number" value={idealMax} />
        </label>
      </div>
      <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
        Save Plant Type
      </button>
      {message ? <p className="text-sm text-leaf">{message}</p> : null}
    </form>
  );
}
