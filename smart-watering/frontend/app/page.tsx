"use client";

import CreateGroupForm from "@/components/CreateGroupForm";
import CreatePlantForm from "@/components/CreatePlantForm";
import GroupCard from "@/components/GroupCard";
import PlantCard from "@/components/PlantCard";
import { getDevices, getPlantGroups, getPlantTypes, getSensorHistory } from "@/lib/api";
import type { Device, PlantGroup, PlantType, PumpResult, SensorHistoryPoint } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [plantGroups, setPlantGroups] = useState<PlantGroup[]>([]);
  const [sensorHistoryByGroup, setSensorHistoryByGroup] = useState<Record<string, SensorHistoryPoint[]>>({});
  const [status, setStatus] = useState("Loading dashboard...");
  const [error, setError] = useState<string | null>(null);
  const [showPlantTypeForm, setShowPlantTypeForm] = useState(false);
  const [showPlantForm, setShowPlantForm] = useState(false);

  const loadDashboard = useCallback(async () => {
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
      setSensorHistoryByGroup(Object.fromEntries(historyEntries));
      setStatus("Dashboard synced with FastAPI");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard data");
      setStatus("Backend connection failed");
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  function handleWatered(result: PumpResult) {
    setStatus(`Manual watering sent to ${result.group_id}: ${result.status}`);
    loadDashboard();
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
              Manage watering actions for all plant from one place.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            {status}
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
                  moistureStatus={getMoistureStatus(group, plantTypes, sensorHistoryByGroup[group.group_id] ?? [])}
                  onDeleted={loadDashboard}
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
