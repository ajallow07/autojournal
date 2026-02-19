import { storage } from "./storage";
import type { TeslaConnection, Geofence } from "@shared/schema";

const TESLEMETRY_API_BASE = "https://api.teslemetry.com";
const PARKED_CONFIRMATION_MS = 120000;
const MIN_DISTANCE_KM = 0.1;

function getTeslemetryToken(): string {
  const token = process.env.TESLEMETRY_API_TOKEN;
  if (!token) throw new Error("TESLEMETRY_API_TOKEN not configured");
  return token;
}

export function isTeslemetryConfigured(): boolean {
  return !!process.env.TESLEMETRY_API_TOKEN;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findMatchingGeofence(lat: number, lon: number, geofencesList: Geofence[]): Geofence | undefined {
  for (const gf of geofencesList) {
    const dist = haversineDistance(lat, lon, gf.latitude, gf.longitude);
    if (dist <= gf.radiusMeters) return gf;
  }
  return undefined;
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`,
      { headers: { "User-Agent": "MahlisAutoJournal/1.0" } }
    );
    if (!res.ok) return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    const data = await res.json();
    const addr = data.address;
    if (addr) {
      const parts = [
        addr.road || addr.pedestrian || addr.neighbourhood,
        addr.suburb || addr.city_district,
        addr.city || addr.town || addr.village,
      ].filter(Boolean);
      if (parts.length > 0) return parts.join(", ");
    }
    return data.display_name?.split(",").slice(0, 3).join(",").trim() || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

interface TelemetryData {
  vin: string;
  createdAt: string;
  shiftState?: string | null;
  speed?: number | null;
  odometer?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  batteryLevel?: number | null;
  chargingState?: string | null;
  vehicleState?: string | null;
}

function extractVin(body: any): string | null {
  if (body.vin) return body.vin;
  if (body.vehicle?.vin) return body.vehicle.vin;
  if (body.metadata?.vin) return body.metadata.vin;
  return null;
}

function parseWebhookPayload(body: any): TelemetryData | null {
  const vin = extractVin(body);
  if (!body || !vin) {
    console.log("[Teslemetry] Webhook: missing VIN in payload");
    return null;
  }

  const result: TelemetryData = {
    vin,
    createdAt: body.createdAt || new Date().toISOString(),
  };

  if (body.state) {
    result.vehicleState = String(body.state);
  }

  let data = body.data || body;

  console.log(`[Teslemetry] Raw webhook keys: ${JSON.stringify(Object.keys(body))}${body.data ? `, data keys: ${JSON.stringify(Object.keys(body.data))}` : ""}`);

  if (body.data) {
    console.log(`[Teslemetry] Data payload: ${JSON.stringify(body.data).substring(0, 500)}`);
  }

  if (!Array.isArray(data) && typeof data === "object" && data !== null) {
    const keys = Object.keys(data);
    const isNumberedObject = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
    if (isNumberedObject) {
      data = keys.map(k => data[k]);
      console.log(`[Teslemetry] Converted numbered object to array with ${data.length} items`);
    }
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== "object") continue;

      const key = item.key;
      const value = item.value;

      if (key && value !== undefined && value !== null) {
        switch (key) {
          case "ShiftState":
          case "Gear":
            result.shiftState = value.stringValue != null ? String(value.stringValue) : null;
            break;
          case "VehicleSpeed": {
            const sv = value.stringValue;
            result.speed = sv != null ? parseFloat(String(sv)) : null;
            break;
          }
          case "Odometer": {
            const ov = value.stringValue;
            if (ov != null) {
              const miles = parseFloat(String(ov));
              result.odometer = !isNaN(miles) ? miles * 1.60934 : null;
            }
            break;
          }
          case "Location":
            if (value.locationValue) {
              result.latitude = value.locationValue.latitude ?? null;
              result.longitude = value.locationValue.longitude ?? null;
            }
            break;
          case "BatteryLevel": {
            const bv = value.stringValue;
            result.batteryLevel = bv != null ? parseFloat(String(bv)) : null;
            break;
          }
          case "ChargingState":
          case "DetailedChargeState":
            result.chargingState = value.stringValue != null ? String(value.stringValue) : null;
            break;
        }
        continue;
      }

      if (item.ShiftState !== undefined || item.Gear !== undefined) {
        result.shiftState = String(item.ShiftState ?? item.Gear);
      }
      if (item.VehicleSpeed !== undefined) {
        result.speed = parseFloat(String(item.VehicleSpeed));
      }
      if (item.Odometer !== undefined) {
        const miles = parseFloat(String(item.Odometer));
        result.odometer = !isNaN(miles) ? miles * 1.60934 : null;
      }
      if (item.Location) {
        result.latitude = item.Location.latitude ?? null;
        result.longitude = item.Location.longitude ?? null;
      }
      if (item.BatteryLevel !== undefined) {
        result.batteryLevel = parseFloat(String(item.BatteryLevel));
      }
    }
  } else if (typeof data === "object") {
    if (data.ShiftState !== undefined) result.shiftState = String(data.ShiftState);
    if (data.Gear !== undefined) result.shiftState = String(data.Gear);
    if (data.VehicleSpeed !== undefined) result.speed = parseFloat(String(data.VehicleSpeed));
    if (data.Odometer !== undefined) {
      const miles = parseFloat(String(data.Odometer));
      result.odometer = !isNaN(miles) ? miles * 1.60934 : null;
    }
    if (data.Location) {
      result.latitude = data.Location.latitude ?? null;
      result.longitude = data.Location.longitude ?? null;
    }
    if (data.BatteryLevel !== undefined) result.batteryLevel = parseFloat(String(data.BatteryLevel));
    if (data.ChargingState !== undefined) result.chargingState = String(data.ChargingState);
    if (data.DetailedChargeState !== undefined) result.chargingState = String(data.DetailedChargeState);
  }

  return result;
}

async function findConnectionByVin(vin: string): Promise<TeslaConnection | null> {
  const connections = await storage.getAllActiveTeslaConnections();
  const match = connections.find(c => c.vin === vin);
  return match || null;
}

async function completeTripFromWebhook(
  connection: TeslaConnection,
  endLat: number | undefined,
  endLon: number | undefined,
  endOdometer: number | null,
): Promise<void> {
  let distance: number | null = null;
  let distanceSource = "unknown";

  if (connection.tripStartOdometer && endOdometer) {
    distance = endOdometer - connection.tripStartOdometer;
    distanceSource = "odometer";
  }

  if ((distance == null || distance <= 0) && endLat && endLon && connection.tripStartLatitude && connection.tripStartLongitude) {
    const gpsDistM = haversineDistance(connection.tripStartLatitude, connection.tripStartLongitude, endLat, endLon);
    distance = gpsDistM / 1000;
    distanceSource = "gps";
    console.log(`[Teslemetry Trip] Using GPS distance fallback: ${distance.toFixed(2)} km`);
  }

  const userVehicles = await storage.getVehicles(connection.userId);
  const linkedVehicle = userVehicles.find((v) => v.id === connection.vehicleId) || userVehicles[0];

  let startOdo: number;
  let endOdo: number;
  if (connection.tripStartOdometer && endOdometer) {
    startOdo = connection.tripStartOdometer;
    endOdo = endOdometer;
  } else if (connection.tripStartOdometer && !endOdometer && distance != null) {
    startOdo = connection.tripStartOdometer;
    endOdo = connection.tripStartOdometer + distance;
  } else if (!connection.tripStartOdometer && endOdometer && distance != null) {
    startOdo = endOdometer - distance;
    endOdo = endOdometer;
  } else {
    const baseOdo = linkedVehicle?.currentOdometer || 0;
    startOdo = baseOdo;
    endOdo = baseOdo + (distance || 0);
  }

  if (endOdo < startOdo) {
    endOdo = startOdo + (distance || 0);
  }

  if (distance != null && distance >= MIN_DISTANCE_KM) {
    const endLocationName = endLat && endLon ? await reverseGeocode(endLat, endLon) : "Unknown";
    const geofencesList = await storage.getGeofences(connection.userId);

    let tripType = "private";
    if (endLat && endLon) {
      const startGf = connection.tripStartLatitude && connection.tripStartLongitude
        ? findMatchingGeofence(connection.tripStartLatitude, connection.tripStartLongitude, geofencesList)
        : undefined;
      const endGf = findMatchingGeofence(endLat, endLon, geofencesList);
      if (startGf?.tripType === "business" || endGf?.tripType === "business") {
        tripType = "business";
      }
    }

    if (linkedVehicle) {
      const now = new Date();
      const startTime = connection.tripStartTime || now;
      await storage.createTrip({
        userId: connection.userId,
        vehicleId: linkedVehicle.id,
        date: now.toISOString().split("T")[0],
        startTime: startTime.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }),
        endTime: now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }),
        startLocation: connection.tripStartLocation || "Unknown",
        endLocation: endLocationName,
        startOdometer: Math.round(startOdo * 10) / 10,
        endOdometer: Math.round(endOdo * 10) / 10,
        distance: Math.round(distance * 10) / 10,
        tripType,
        autoLogged: true,
        notes: distanceSource === "gps" ? "Distance estimated via GPS (odometer unavailable)" : "Via Teslemetry",
      });

      if (endOdo > (linkedVehicle.currentOdometer || 0)) {
        await storage.updateVehicle(linkedVehicle.id, { currentOdometer: Math.round(endOdo * 10) / 10 });
      }

      console.log(`[Teslemetry Trip] SAVED for user=${connection.userId}: ${connection.tripStartLocation} -> ${endLocationName}, ${distance.toFixed(1)} km (${distanceSource}), type=${tripType}`);
    }
  } else {
    console.log(`[Teslemetry Trip] DISCARDED for user=${connection.userId}: distance=${distance?.toFixed(2) || "unknown"} km (too short or no location data)`);
  }
}

async function autoFetchVehicleData(connection: TeslaConnection, telemetry: TelemetryData): Promise<TelemetryData> {
  try {
    const token = getTeslemetryToken();
    if (!token) return telemetry;

    console.log(`[Teslemetry] Auto-fetching vehicle data for VIN=${telemetry.vin} (state=${telemetry.vehicleState})`);
    const vehicleData = await fetchTeslemetryVehicleData(telemetry.vin);
    const driveState = vehicleData?.drive_state;
    const vehicleState = vehicleData?.vehicle_state;

    if (vehicleState?.odometer != null && vehicleState.odometer > 0) {
      telemetry.odometer = vehicleState.odometer * 1.60934;
    }
    if (driveState?.latitude != null) telemetry.latitude = driveState.latitude;
    if (driveState?.longitude != null) telemetry.longitude = driveState.longitude;
    if (driveState?.shift_state) telemetry.shiftState = driveState.shift_state;
    if (driveState?.speed != null) telemetry.speed = driveState.speed;

    console.log(`[Teslemetry] Auto-fetch result: odo=${telemetry.odometer?.toFixed(1)} lat=${telemetry.latitude} lon=${telemetry.longitude} shift=${telemetry.shiftState} speed=${telemetry.speed}`);
  } catch (err: any) {
    console.log(`[Teslemetry] Auto-fetch failed (car may be asleep): ${err.message?.substring(0, 100)}`);
  }
  return telemetry;
}

async function updateVehicleOdometer(connection: TeslaConnection, odometerKm: number) {
  if (!connection.vehicleId) return;
  try {
    const vehicle = await storage.getVehicle(connection.vehicleId);
    if (vehicle && odometerKm > (vehicle.currentOdometer || 0)) {
      await storage.updateVehicle(vehicle.id, { currentOdometer: Math.round(odometerKm * 10) / 10 });
      console.log(`[Teslemetry] Updated vehicle odometer to ${(Math.round(odometerKm * 10) / 10).toFixed(1)} km`);
    }
  } catch (err: any) {
    console.log(`[Teslemetry] Failed to update vehicle odometer: ${err.message}`);
  }
}

export async function handleTelemetryWebhook(body: any): Promise<{ processed: boolean; action?: string }> {
  let telemetry = parseWebhookPayload(body);
  if (!telemetry) {
    return { processed: false };
  }

  const connection = await findConnectionByVin(telemetry.vin);
  if (!connection) {
    console.log(`[Teslemetry] No active connection for VIN ${telemetry.vin}`);
    return { processed: false };
  }

  const hasTelemetryData = telemetry.odometer != null || telemetry.shiftState != null || telemetry.latitude != null;

  if (!hasTelemetryData && telemetry.vehicleState && telemetry.vehicleState !== "asleep" && telemetry.vehicleState !== "offline") {
    telemetry = await autoFetchVehicleData(connection, telemetry);
  }

  const odometerKm = telemetry.odometer ?? null;
  const lat = telemetry.latitude ?? undefined;
  const lon = telemetry.longitude ?? undefined;
  const shiftState = telemetry.shiftState;

  const shiftDriving = shiftState === "D" || shiftState === "R" || shiftState === "N";
  const shiftParked = shiftState === "P" || shiftState === "SNA";

  let locationMovedKm = 0;
  if (lat && lon && connection.lastLatitude && connection.lastLongitude) {
    locationMovedKm = haversineDistance(connection.lastLatitude, connection.lastLongitude, lat, lon) / 1000;
  }
  let odometerMovedKm = 0;
  if (odometerKm != null && connection.lastOdometer != null && connection.lastOdometer > 0) {
    odometerMovedKm = odometerKm - connection.lastOdometer;
  }

  const movementDetected = locationMovedKm > 0.05 || odometerMovedKm > 0.1;
  const speedDetected = telemetry.speed != null && telemetry.speed > 0;

  const isDriving = shiftDriving || (!shiftState && (movementDetected || speedDetected));
  const isParked = shiftParked || (!shiftState && !isDriving);

  console.log(`[Teslemetry] Webhook for VIN=${telemetry.vin} user=${connection.userId} shift=${shiftState || "null"} speed=${telemetry.speed} odo=${odometerKm?.toFixed(1)} lat=${lat} lon=${lon} vehicleState=${telemetry.vehicleState || "n/a"} locMoved=${locationMovedKm.toFixed(3)}km odoMoved=${odometerMovedKm.toFixed(3)}km movement=${movementDetected} isDriving=${isDriving}`);

  const updateFields: Record<string, any> = {
    lastPolledAt: new Date(),
  };
  if (odometerKm != null) updateFields.lastOdometer = odometerKm;
  if (lat != null) updateFields.lastLatitude = lat;
  if (lon != null) updateFields.lastLongitude = lon;
  if (shiftState != null) updateFields.lastShiftState = shiftState;

  if (odometerKm != null) {
    await updateVehicleOdometer(connection, odometerKm);
  }

  if (isDriving && !connection.tripInProgress) {
    const locationName = lat && lon ? await reverseGeocode(lat, lon) : "Unknown";
    await storage.updateTeslaConnection(connection.id, {
      ...updateFields,
      lastDriveState: "driving",
      pollState: "active_trip",
      tripInProgress: true,
      tripStartTime: new Date(),
      tripStartOdometer: odometerKm,
      tripStartLatitude: lat ?? null,
      tripStartLongitude: lon ?? null,
      tripStartLocation: locationName,
      parkedSince: null,
      idleSince: null,
      consecutiveErrors: 0,
      lastApiErrorAt: null,
    });

    console.log(`[Teslemetry Trip] STARTED for user=${connection.userId} at ${locationName} odo=${odometerKm?.toFixed(1)}`);
    return { processed: true, action: "trip_started" };
  }

  if (isDriving && connection.tripInProgress) {
    await storage.updateTeslaConnection(connection.id, {
      ...updateFields,
      lastDriveState: "driving",
      parkedSince: null,
    });
    return { processed: true, action: "driving_update" };
  }

  if (isParked && connection.tripInProgress) {
    const now = new Date();

    if (!connection.parkedSince) {
      console.log(`[Teslemetry Trip] Parked detected for user=${connection.userId} - starting ${PARKED_CONFIRMATION_MS / 1000}s confirmation`);
      await storage.updateTeslaConnection(connection.id, {
        ...updateFields,
        lastPolledAt: now,
        lastDriveState: "parked",
        lastShiftState: shiftState || "P",
        parkedSince: now,
      });
      return { processed: true, action: "parked_confirming" };
    }

    const parkedDuration = now.getTime() - new Date(connection.parkedSince).getTime();

    if (parkedDuration >= PARKED_CONFIRMATION_MS) {
      console.log(`[Teslemetry Trip] Park confirmed after ${Math.round(parkedDuration / 1000)}s for user=${connection.userId} - ending trip`);
      await completeTripFromWebhook(connection, lat, lon, odometerKm);
      await storage.updateTeslaConnection(connection.id, {
        ...updateFields,
        lastPolledAt: now,
        lastDriveState: "parked",
        lastShiftState: shiftState || "P",
        pollState: "awake_idle",
        tripInProgress: false,
        tripStartTime: null,
        tripStartOdometer: null,
        tripStartLatitude: null,
        tripStartLongitude: null,
        tripStartLocation: null,
        parkedSince: null,
        idleSince: new Date(),
      });
      return { processed: true, action: "trip_ended" };
    }

    await storage.updateTeslaConnection(connection.id, {
      ...updateFields,
      lastPolledAt: now,
      lastDriveState: "parked",
      lastShiftState: shiftState || "P",
    });
    return { processed: true, action: "parked_confirming" };
  }

  await storage.updateTeslaConnection(connection.id, {
    ...updateFields,
    lastDriveState: isParked ? "parked" : "online",
  });

  return { processed: true, action: "status_update" };
}

export async function fetchTeslemetryVehicles(): Promise<any[]> {
  const token = getTeslemetryToken();
  const res = await fetch(`${TESLEMETRY_API_BASE}/api/1/vehicles`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Teslemetry vehicles request failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.response || [];
}

export async function fetchTeslemetryVehicleData(vin: string): Promise<any> {
  const token = getTeslemetryToken();
  const res = await fetch(`${TESLEMETRY_API_BASE}/api/1/vehicles/${vin}/vehicle_data`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Teslemetry vehicle_data failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.response;
}

export function getWebhookUrl(): string {
  const host = process.env.APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || "localhost:5000";
  return `https://${host}/api/teslemetry/webhook`;
}

export async function setupTeslemetryConnection(userId: string): Promise<TeslaConnection> {
  const vehicles = await fetchTeslemetryVehicles();
  if (vehicles.length === 0) {
    throw new Error("No Tesla vehicles found on your Teslemetry account");
  }

  const teslaVehicle = vehicles[0];
  const vin = teslaVehicle.vin;
  const displayName = teslaVehicle.display_name || "Tesla";

  let make = "Tesla";
  let model = "Vehicle";
  if (vin && vin.length >= 4) {
    const modelChar = vin[3];
    if (modelChar === "Y" || modelChar === "E") model = "Model Y";
    else if (modelChar === "S" || modelChar === "A") model = "Model S";
    else if (modelChar === "X" || modelChar === "B") model = "Model X";
    else if (modelChar === "3" || modelChar === "W") model = "Model 3";
  }

  let year = new Date().getFullYear();
  if (vin && vin.length >= 10) {
    const yearChar = vin[9];
    const vinYearMap: Record<string, number> = {
      "A": 2010, "B": 2011, "C": 2012, "D": 2013, "E": 2014, "F": 2015,
      "G": 2016, "H": 2017, "J": 2018, "K": 2019, "L": 2020, "M": 2021,
      "N": 2022, "P": 2023, "R": 2024, "S": 2025, "T": 2026, "V": 2027,
      "W": 2028, "X": 2029, "Y": 2030,
    };
    if (vinYearMap[yearChar]) year = vinYearMap[yearChar];
  }

  const userVehicles = await storage.getVehicles(userId);
  let linkedVehicle = userVehicles.find((v) => v.vin === vin) || userVehicles.find((v) => v.isDefault) || userVehicles[0];

  if (!linkedVehicle) {
    linkedVehicle = await storage.createVehicle({
      userId,
      name: displayName,
      make,
      model,
      year,
      licensePlate: "",
      vin,
      currentOdometer: 0,
      isDefault: true,
    });
  } else {
    const updates: Record<string, any> = {};
    if (!linkedVehicle.vin) updates.vin = vin;
    if (linkedVehicle.year !== year) updates.year = year;
    if (Object.keys(updates).length > 0) {
      await storage.updateVehicle(linkedVehicle.id, updates);
    }
  }

  const existing = await storage.getTeslaConnection(userId);
  if (existing) {
    const updated = await storage.updateTeslaConnection(existing.id, {
      teslaVehicleId: String(teslaVehicle.id),
      vin,
      vehicleName: displayName,
      isActive: true,
      vehicleId: linkedVehicle.id,
      pollState: "awake_idle",
    });
    return updated!;
  }

  return await storage.createTeslaConnection({
    userId,
    teslaVehicleId: String(teslaVehicle.id),
    vin,
    vehicleName: displayName,
    isActive: true,
    vehicleId: linkedVehicle.id,
    pollState: "awake_idle",
  });
}
