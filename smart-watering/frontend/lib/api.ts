const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type Device = {
  id: number;
  device_id: string;
  name: string;
  group_id: string | null;
  created_at: string;
};

export type PlantType = {
  id: number;
  plant_type_id: string;
  name: string;
  ideal_moisture_min: number;
  ideal_moisture_max: number;
  suggestion_source: string;
  created_at: string;
};

export type PlantTypeSuggestion = {
  name: string;
  ideal_moisture_min: number;
  ideal_moisture_max: number;
  suggestion_source: string;
};

export type PlantGroup = {
  id: number;
  group_id: string;
  name: string;
  plant_type_id: string;
  auto_mode: boolean;
  last_watered_at: string | null;
  created_at: string;
};

export type PlantGroupDetail = {
  group: PlantGroup;
  plant_type: PlantType;
  devices: Device[];
};

export type SensorHistoryPoint = {
  time: string;
  device_id: string | null;
  moisture: number | null;
  temperature: number | null;
};

export type WateringEventPoint = {
  time: string;
  group_id: string;
  source: string | null;
  duration_seconds: number | null;
  moisture: number | null;
};

export type DetectedDevice = {
  device_id: string;
  name: string;
  in_use: boolean;
  group_id: string | null;
  group_name: string | null;
};

export type PumpResult = {
  group_id?: string | null;
  device_id?: string | null;
  action: string;
  source: string;
  duration_seconds: number;
  status: string;
};

export type CreatePlantTypeInput = {
  plant_type_id: string;
  name: string;
  ideal_moisture_min: number;
  ideal_moisture_max: number;
  suggestion_source: string;
};

export type UpdatePlantTypeInput = {
  name: string;
  ideal_moisture_min: number;
  ideal_moisture_max: number;
};

export type CreatePlantGroupInput = {
  group_id: string;
  name: string;
  plant_type_id: string;
};

export type CreateDeviceInput = {
  device_id: string;
  name: string;
  group_id?: string | null;
};

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function logout() {
  return apiRequest<{ message: string }>("/logout", {
    method: "POST",
  });
}

export function getDevices() {
  return apiRequest<Device[]>("/api/devices");
}

export function getDetectedDevices() {
  return apiRequest<DetectedDevice[]>("/api/devices/detected");
}

export function getPlantTypes() {
  return apiRequest<PlantType[]>("/api/plant-types");
}

export function getPlantTypeSuggestion(plantName: string) {
  return apiRequest<PlantTypeSuggestion>(`/api/plant-types/suggestions/${encodeURIComponent(plantName)}`);
}

export function createPlantType(plantType: CreatePlantTypeInput) {
  return apiRequest<PlantType>("/api/plant-types", {
    method: "POST",
    body: JSON.stringify(plantType),
  });
}

export function updatePlantType(plantTypeId: string, plantType: UpdatePlantTypeInput) {
  return apiRequest<PlantType>(`/api/plant-types/${plantTypeId}`, {
    method: "PATCH",
    body: JSON.stringify(plantType),
  });
}

export function deletePlantType(plantTypeId: string) {
  return apiRequest<PlantType>(`/api/plant-types/${plantTypeId}`, {
    method: "DELETE",
  });
}

export function getPlantGroups() {
  return apiRequest<PlantGroup[]>("/api/plant-groups");
}

export function getPlantGroup(groupId: string) {
  return apiRequest<PlantGroupDetail>(`/api/plant-groups/${groupId}`);
}

export function getSensorHistory(groupId: string) {
  return apiRequest<SensorHistoryPoint[]>(`/api/plant-groups/${groupId}/sensor-history`);
}

export function getWateringEvents(groupId: string) {
  return apiRequest<WateringEventPoint[]>(`/api/plant-groups/${groupId}/watering-events`);
}

export function createPlantGroup(group: CreatePlantGroupInput) {
  return apiRequest<PlantGroup>("/api/plant-groups", {
    method: "POST",
    body: JSON.stringify(group),
  });
}

export function deletePlantGroup(groupId: string) {
  return apiRequest<PlantGroup>(`/api/plant-groups/${groupId}`, {
    method: "DELETE",
  });
}

export function createDevice(device: CreateDeviceInput) {
  return apiRequest<Device>("/api/devices", {
    method: "POST",
    body: JSON.stringify(device),
  });
}

export function assignDeviceToGroup(groupId: string, deviceId: string) {
  return apiRequest<Device>(`/api/plant-groups/${groupId}/devices/${deviceId}`, {
    method: "POST",
  });
}

export function removeDeviceFromGroup(groupId: string, deviceId: string) {
  return apiRequest<Device>(`/api/plant-groups/${groupId}/devices/${deviceId}`, {
    method: "DELETE",
  });
}

export function updateGroupAutoMode(groupId: string, autoMode: boolean) {
  return apiRequest<PlantGroup>(`/api/plant-groups/${groupId}/auto-mode`, {
    method: "PATCH",
    body: JSON.stringify({ auto_mode: autoMode }),
  });
}

export function manualWaterGroup(groupId: string) {
  return apiRequest<PumpResult>(`/api/watering/manual/group/${groupId}`, {
    method: "POST",
  });
}

export function manualWater(deviceId: string) {
  return apiRequest<PumpResult>(`/api/watering/manual/${deviceId}`, {
    method: "POST",
  });
}
