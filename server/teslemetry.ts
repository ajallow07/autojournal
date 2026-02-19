import { storage } from "./storage";
import type { TeslaConnection, Geofence } from "@shared/schema";

const TESLEMETRY_API_BASE = "https://api.teslemetry.com";
const PARKED_CONFIRMATION_MS = 120000;
const MIN_DISTANCE_KM = 0.1;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const STALE_TRIP_MS = 12 * 60 * 60 * 1000;

let lastCleanupTime = 0;

async function maybeCleanupTelemetryEvents() {
  const now = Date.now();
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS) return;
  lastCleanupTime = now;
  try {
    const deleted = await storage.cleanupOldTelemetryEvents();
    if (deleted > 0) {
      console.log(`[Teslemetry] Cleaned up ${deleted} telemetry events older than 24h`);
    }
  } catch (err: any) {
    console.log(`[Teslemetry] Cleanup error: ${err.message}`);
  }
}

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

  if (body.status) {
    result.vehicleState = String(body.status);
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
        const getNumeric = (): number | null => {
          if (value.doubleValue != null) return parseFloat(String(value.doubleValue));
          if (value.stringValue != null) return parseFloat(String(value.stringValue));
          if (value.floatValue != null) return parseFloat(String(value.floatValue));
          if (value.intValue != null) return parseInt(String(value.intValue));
          return null;
        };
        const getString = (): string | null => {
          if (value.stringValue != null) return String(value.stringValue);
          if (value.doubleValue != null) return String(value.doubleValue);
          return null;
        };

        switch (key) {
          case "ShiftState":
          case "Gear":
            result.shiftState = getString();
            break;
          case "VehicleSpeed":
            result.speed = getNumeric();
            break;
          case "Odometer": {
            const miles = getNumeric();
            if (miles != null && !isNaN(miles)) {
              result.odometer = miles * 1.60934;
            }
            break;
          }
          case "Location":
            if (value.locationValue) {
              result.latitude = value.locationValue.latitude ?? null;
              result.longitude = value.locationValue.longitude ?? null;
            }
            break;
          case "BatteryLevel":
            result.batteryLevel = getNumeric();
            break;
          case "ChargingState":
          case "DetailedChargeState":
            result.chargingState = getString();
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
  routeWaypoints?: Array<[number, number]>,
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

      const finalWaypoints = routeWaypoints && routeWaypoints.length > 0 ? routeWaypoints : null;
      if (endLat && endLon && finalWaypoints) {
        const lastWp = finalWaypoints[finalWaypoints.length - 1];
        if (!lastWp || haversineDistance(lastWp[0], lastWp[1], endLat, endLon) > 20) {
          finalWaypoints.push([endLat, endLon]);
        }
      }

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
        startLatitude: connection.tripStartLatitude ?? null,
        startLongitude: connection.tripStartLongitude ?? null,
        endLatitude: endLat ?? null,
        endLongitude: endLon ?? null,
        routeCoordinates: finalWaypoints,
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

    console.log(`[Teslemetry] Auto-fetching vehicle data for VIN=${telemetry.vin} (state=${telemetry.vehicleState}, tripInProgress=${connection.tripInProgress})`);
    const vehicleData = await fetchTeslemetryVehicleData(telemetry.vin);
    const driveState = vehicleData?.drive_state;
    const vehicleStateData = vehicleData?.vehicle_state;

    if (vehicleStateData?.odometer != null && vehicleStateData.odometer > 0) {
      telemetry.odometer = vehicleStateData.odometer * 1.60934;
    }
    if (driveState?.latitude != null) telemetry.latitude = driveState.latitude;
    if (driveState?.longitude != null) telemetry.longitude = driveState.longitude;
    if (driveState?.shift_state) telemetry.shiftState = driveState.shift_state;
    if (driveState?.speed != null) telemetry.speed = driveState.speed;

    const chargeState = vehicleData?.charge_state;
    if (chargeState?.battery_level != null) telemetry.batteryLevel = chargeState.battery_level;

    console.log(`[Teslemetry] Auto-fetch result: odo=${telemetry.odometer?.toFixed(1)} lat=${telemetry.latitude} lon=${telemetry.longitude} shift=${telemetry.shiftState} speed=${telemetry.speed} battery=${telemetry.batteryLevel}`);
  } catch (err: any) {
    console.log(`[Teslemetry] Auto-fetch failed (car may be asleep): ${err.message?.substring(0, 200)}`);
  }
  return telemetry;
}

async function updateVehicleFromTelemetry(connection: TeslaConnection, odometerKm: number | null, batteryLevel: number | null) {
  if (!connection.vehicleId) return;
  try {
    const vehicle = await storage.getVehicle(connection.vehicleId);
    if (!vehicle) return;
    const updates: Record<string, any> = {};
    if (odometerKm != null && odometerKm > (vehicle.currentOdometer || 0)) {
      updates.currentOdometer = Math.round(odometerKm * 10) / 10;
    }
    if (batteryLevel != null) {
      updates.batteryLevel = Math.round(batteryLevel);
    }
    if (Object.keys(updates).length > 0) {
      await storage.updateVehicle(vehicle.id, updates);
      console.log(`[Teslemetry] Updated vehicle: ${JSON.stringify(updates)}`);
    }
  } catch (err: any) {
    console.log(`[Teslemetry] Failed to update vehicle: ${err.message}`);
  }
}

export async function ingestTelemetryWebhook(body: any): Promise<{ accepted: boolean; eventId?: string }> {
  const telemetry = parseWebhookPayload(body);
  if (!telemetry) {
    return { accepted: false };
  }

  const connection = await findConnectionByVin(telemetry.vin);
  if (!connection) {
    console.log(`[Teslemetry Ingest] No active connection for VIN ${telemetry.vin}`);
    return { accepted: false };
  }

  const hasTelemetryData = telemetry.odometer != null || telemetry.shiftState != null || telemetry.latitude != null;

  try {
    const event = await storage.createTelemetryEvent({
      userId: connection.userId,
      vin: telemetry.vin,
      latitude: telemetry.latitude ?? null,
      longitude: telemetry.longitude ?? null,
      odometer: telemetry.odometer ?? null,
      speed: telemetry.speed ?? null,
      shiftState: telemetry.shiftState ?? null,
      batteryLevel: telemetry.batteryLevel ?? null,
      vehicleState: telemetry.vehicleState ?? null,
      source: hasTelemetryData ? "webhook" : "state_only",
      rawPayload: JSON.stringify(body).length > 5000 ? { _truncated: true, keys: Object.keys(body) } : body,
    });
    console.log(`[Teslemetry Ingest] Stored event ${event.id} for VIN=${telemetry.vin} (shift=${telemetry.shiftState || "null"} state=${telemetry.vehicleState || "n/a"})`);
    return { accepted: true, eventId: event.id };
  } catch (err: any) {
    console.error(`[Teslemetry Ingest] Failed to store event: ${err.message}`);
    throw err;
  }
}

let workerRunning = false;
const WORKER_INTERVAL_MS = 5000;

export function startTelemetryWorker(): void {
  console.log(`[Teslemetry Worker] Starting background worker (interval=${WORKER_INTERVAL_MS}ms)`);
  setInterval(async () => {
    if (workerRunning) return;
    workerRunning = true;
    try {
      await processTelemetryEvents();
    } catch (err: any) {
      console.error(`[Teslemetry Worker] Unhandled error: ${err.message}`);
    } finally {
      workerRunning = false;
    }
  }, WORKER_INTERVAL_MS);
}

async function processTelemetryEvents(): Promise<void> {
  const events = await storage.getUnprocessedEvents(100);
  if (events.length === 0) return;

  const byVin = new Map<string, typeof events>();
  for (const ev of events) {
    const arr = byVin.get(ev.vin) || [];
    arr.push(ev);
    byVin.set(ev.vin, arr);
  }

  for (const [vin, vinEvents] of byVin) {
    vinEvents.sort((a, b) => {
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
    });

    let connection = await findConnectionByVin(vin);
    if (!connection) {
      console.log(`[Teslemetry Worker] No connection for VIN=${vin}, marking ${vinEvents.length} events processed`);
      await storage.markEventsProcessed(vinEvents.map(e => e.id));
      continue;
    }

    for (const ev of vinEvents) {
      try {
        connection = await processOneEvent(ev, connection);
        await storage.markEventsProcessed([ev.id]);
      } catch (err: any) {
        console.error(`[Teslemetry Worker] Error processing event ${ev.id}: ${err.message} - will retry next cycle`);
        break;
      }
    }
  }

  maybeCleanupTelemetryEvents();
}

async function processOneEvent(ev: any, connection: TeslaConnection): Promise<TeslaConnection> {
  let telemetry: TelemetryData = {
    vin: ev.vin,
    createdAt: ev.createdAt?.toISOString() || new Date().toISOString(),
    latitude: ev.latitude,
    longitude: ev.longitude,
    odometer: ev.odometer,
    speed: ev.speed,
    shiftState: ev.shiftState,
    batteryLevel: ev.batteryLevel,
    vehicleState: ev.vehicleState,
  };

  const hasTelemetryData = telemetry.odometer != null || telemetry.shiftState != null || telemetry.latitude != null;

  if (!hasTelemetryData) {
    console.log(`[Teslemetry Worker] No telemetry data in event ${ev.id} (state=${telemetry.vehicleState || "n/a"}) - auto-fetching via API`);
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

  const carOfflineOrAsleep = telemetry.vehicleState === "offline" || telemetry.vehicleState === "asleep";
  const isDriving = !carOfflineOrAsleep && (shiftDriving || (!shiftState && (movementDetected || speedDetected)));
  const isParked = carOfflineOrAsleep || shiftParked || (!shiftState && !isDriving);

  console.log(`[Teslemetry Worker] Processing event ${ev.id} VIN=${ev.vin} user=${connection.userId} shift=${shiftState || "null"} speed=${telemetry.speed} odo=${odometerKm?.toFixed(1)} lat=${lat} lon=${lon} state=${telemetry.vehicleState || "n/a"} isDriving=${isDriving} tripInProgress=${connection.tripInProgress}`);

  const updateFields: Record<string, any> = {
    lastPolledAt: new Date(),
  };
  if (odometerKm != null) updateFields.lastOdometer = odometerKm;
  if (lat != null) updateFields.lastLatitude = lat;
  if (lon != null) updateFields.lastLongitude = lon;
  if (shiftState != null) updateFields.lastShiftState = shiftState;

  if (odometerKm != null || telemetry.batteryLevel != null) {
    await updateVehicleFromTelemetry(connection, odometerKm, telemetry.batteryLevel ?? null);
  }

  if (connection.tripInProgress && connection.tripStartTime) {
    const eventTime = ev.createdAt ? new Date(ev.createdAt).getTime() : Date.now();
    const tripAge = eventTime - new Date(connection.tripStartTime).getTime();
    if (tripAge > STALE_TRIP_MS) {
      console.log(`[Teslemetry Trip] STALE trip detected for user=${connection.userId} (${Math.round(tripAge / 3600000)}h old) - auto-closing`);
      const tripWaypoints: Array<[number, number]> = Array.isArray(connection.routeWaypoints) ? (connection.routeWaypoints as Array<[number, number]>) : [];
      const endLat = connection.lastLatitude ? Number(connection.lastLatitude) : undefined;
      const endLon = connection.lastLongitude ? Number(connection.lastLongitude) : undefined;
      const endOdo = connection.lastOdometer ? Number(connection.lastOdometer) : null;
      await completeTripFromWebhook(connection, endLat, endLon, endOdo, tripWaypoints);
      const staleUpdates = {
        lastDriveState: "parked",
        pollState: "awake_idle",
        tripInProgress: false,
        tripStartTime: null,
        tripStartOdometer: null,
        tripStartLatitude: null,
        tripStartLongitude: null,
        tripStartLocation: null,
        routeWaypoints: null,
        parkedSince: null,
        idleSince: new Date(),
      };
      await storage.updateTeslaConnection(connection.id, staleUpdates);
      connection = { ...connection, ...staleUpdates, tripInProgress: false } as TeslaConnection;
      console.log(`[Teslemetry Trip] Stale trip auto-closed for user=${connection.userId}`);
    }
  }

  if (isDriving && !connection.tripInProgress) {
    const locationName = lat && lon ? await reverseGeocode(lat, lon) : "Unknown";
    const initialWaypoints: Array<[number, number]> = [];
    if (lat && lon) initialWaypoints.push([lat, lon]);
    const updates = {
      ...updateFields,
      lastDriveState: "driving",
      pollState: "active_trip",
      tripInProgress: true,
      tripStartTime: new Date(),
      tripStartOdometer: odometerKm,
      tripStartLatitude: lat ?? null,
      tripStartLongitude: lon ?? null,
      tripStartLocation: locationName,
      routeWaypoints: initialWaypoints,
      parkedSince: null,
      idleSince: null,
      consecutiveErrors: 0,
      lastApiErrorAt: null,
    };
    await storage.updateTeslaConnection(connection.id, updates);
    console.log(`[Teslemetry Trip] STARTED for user=${connection.userId} at ${locationName} odo=${odometerKm?.toFixed(1)}`);
    return { ...connection, ...updates, tripInProgress: true } as TeslaConnection;
  }

  if (isDriving && connection.tripInProgress) {
    const existingWaypoints: Array<[number, number]> = Array.isArray(connection.routeWaypoints) ? (connection.routeWaypoints as Array<[number, number]>) : [];
    if (lat && lon) {
      const lastWp = existingWaypoints[existingWaypoints.length - 1];
      if (!lastWp || haversineDistance(lastWp[0], lastWp[1], lat, lon) > 20) {
        existingWaypoints.push([lat, lon]);
      }
    }
    const updates = {
      ...updateFields,
      lastDriveState: "driving",
      parkedSince: null,
      routeWaypoints: existingWaypoints,
    };
    await storage.updateTeslaConnection(connection.id, updates);
    return { ...connection, ...updates } as TeslaConnection;
  }

  if (isParked && connection.tripInProgress) {
    const now = new Date();

    if (carOfflineOrAsleep) {
      console.log(`[Teslemetry Trip] Car went ${telemetry.vehicleState} with trip in progress for user=${connection.userId} - ending trip immediately`);
      const tripWaypoints: Array<[number, number]> = Array.isArray(connection.routeWaypoints) ? (connection.routeWaypoints as Array<[number, number]>) : [];
      const endLat = lat ?? (connection.lastLatitude ? Number(connection.lastLatitude) : undefined);
      const endLon = lon ?? (connection.lastLongitude ? Number(connection.lastLongitude) : undefined);
      const endOdo = odometerKm ?? (connection.lastOdometer ? Number(connection.lastOdometer) : null);
      await completeTripFromWebhook(connection, endLat, endLon, endOdo, tripWaypoints);
      const updates = {
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
        routeWaypoints: null,
        parkedSince: null,
        idleSince: new Date(),
      };
      await storage.updateTeslaConnection(connection.id, updates);
      return { ...connection, ...updates, tripInProgress: false } as TeslaConnection;
    }

    if (!connection.parkedSince) {
      console.log(`[Teslemetry Trip] Parked detected for user=${connection.userId} - starting ${PARKED_CONFIRMATION_MS / 1000}s confirmation`);
      const updates = {
        ...updateFields,
        lastPolledAt: now,
        lastDriveState: "parked",
        lastShiftState: shiftState || "P",
        parkedSince: now,
      };
      await storage.updateTeslaConnection(connection.id, updates);
      return { ...connection, ...updates } as TeslaConnection;
    }

    const parkedDuration = now.getTime() - new Date(connection.parkedSince).getTime();

    if (parkedDuration >= PARKED_CONFIRMATION_MS) {
      console.log(`[Teslemetry Trip] Park confirmed after ${Math.round(parkedDuration / 1000)}s for user=${connection.userId} - ending trip`);
      const tripWaypoints: Array<[number, number]> = Array.isArray(connection.routeWaypoints) ? (connection.routeWaypoints as Array<[number, number]>) : [];
      await completeTripFromWebhook(connection, lat, lon, odometerKm, tripWaypoints);
      const updates = {
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
        routeWaypoints: null,
        parkedSince: null,
        idleSince: new Date(),
      };
      await storage.updateTeslaConnection(connection.id, updates);
      return { ...connection, ...updates, tripInProgress: false } as TeslaConnection;
    }

    const updates = {
      ...updateFields,
      lastPolledAt: now,
      lastDriveState: "parked",
      lastShiftState: shiftState || "P",
    };
    await storage.updateTeslaConnection(connection.id, updates);
    return { ...connection, ...updates } as TeslaConnection;
  }

  const updates = {
    ...updateFields,
    lastDriveState: isParked ? "parked" : "online",
  };
  await storage.updateTeslaConnection(connection.id, updates);
  return { ...connection, ...updates } as TeslaConnection;
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

export async function reconstructTripsFromTelemetry(userId: string, vin: string, sinceHours: number = 24): Promise<{ tripsCreated: number; details: string[] }> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const events = await storage.getTelemetryEventsByVin(vin, since);
  const details: string[] = [];

  if (events.length === 0) {
    return { tripsCreated: 0, details: ["No telemetry events found in the specified period"] };
  }

  details.push(`Found ${events.length} telemetry events in the last ${sinceHours}h`);

  const connection = await findConnectionByVin(vin);
  if (!connection) {
    return { tripsCreated: 0, details: [...details, "No active Tesla connection for this VIN"] };
  }

  const userVehicles = await storage.getVehicles(userId);
  const linkedVehicle = userVehicles.find((v) => v.id === connection.vehicleId) || userVehicles[0];
  if (!linkedVehicle) {
    return { tripsCreated: 0, details: [...details, "No vehicle linked to this connection"] };
  }

  interface TripSegment {
    startTime: Date;
    endTime: Date;
    startLat: number | null;
    startLon: number | null;
    endLat: number | null;
    endLon: number | null;
    startOdo: number | null;
    endOdo: number | null;
    waypoints: Array<[number, number]>;
    maxSpeed: number | null;
  }

  const segments: TripSegment[] = [];
  let current: TripSegment | null = null;
  let lastMovingTime: Date | null = null;
  let lastStreamGpsLat: number | null = null;
  let lastStreamGpsLon: number | null = null;
  let lastOdo: number | null = null;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const evTime = new Date(ev.createdAt);

    const isAutoFetch = ev.source === "auto_fetch";
    const isWebhookGps = !isAutoFetch && ev.latitude != null && ev.longitude != null;

    const shiftDriving = ev.shiftState === "D" || ev.shiftState === "R" || ev.shiftState === "N";
    const offlineOrAsleep = ev.vehicleState === "offline" || ev.vehicleState === "asleep";
    const staleShiftState = shiftDriving && offlineOrAsleep && (ev.speed == null || ev.speed === 0);
    const isMovingByShift = shiftDriving && !staleShiftState;
    const isMovingBySpeed = ev.speed != null && ev.speed > 0;

    const hasLocationChange = isWebhookGps &&
      lastStreamGpsLat != null && lastStreamGpsLon != null &&
      haversineDistance(lastStreamGpsLat, lastStreamGpsLon, ev.latitude!, ev.longitude!) > 50;

    const hasOdometerChange = ev.odometer != null && lastOdo != null &&
      (ev.odometer! - lastOdo) > 0.1;

    if (isWebhookGps) {
      lastStreamGpsLat = ev.latitude;
      lastStreamGpsLon = ev.longitude;
    }
    if (ev.odometer != null) {
      lastOdo = ev.odometer;
    }

    const isDriving = isMovingByShift || isMovingBySpeed || hasLocationChange || hasOdometerChange;

    if (isDriving) {
      lastMovingTime = evTime;
      const gpsLat = isWebhookGps ? ev.latitude : (isAutoFetch ? null : ev.latitude);
      const gpsLon = isWebhookGps ? ev.longitude : (isAutoFetch ? null : ev.longitude);
      if (!current) {
        current = {
          startTime: evTime,
          endTime: evTime,
          startLat: gpsLat,
          startLon: gpsLon,
          endLat: gpsLat,
          endLon: gpsLon,
          startOdo: ev.odometer,
          endOdo: ev.odometer,
          waypoints: [],
          maxSpeed: ev.speed,
        };
        if (gpsLat != null && gpsLon != null) {
          current.waypoints.push([gpsLat, gpsLon]);
        }
      } else {
        current.endTime = evTime;
        if (gpsLat != null && gpsLon != null) {
          current.endLat = gpsLat;
          current.endLon = gpsLon;
          if (!current.startLat || !current.startLon) {
            current.startLat = gpsLat;
            current.startLon = gpsLon;
          }
          const lastWp = current.waypoints[current.waypoints.length - 1];
          if (!lastWp || haversineDistance(lastWp[0], lastWp[1], gpsLat, gpsLon) > 20) {
            current.waypoints.push([gpsLat, gpsLon]);
          }
        }
        if (ev.odometer != null) current.endOdo = ev.odometer;
        if (ev.speed != null && (current.maxSpeed == null || ev.speed > current.maxSpeed)) {
          current.maxSpeed = ev.speed;
        }
      }
    } else if (current && lastMovingTime) {
      const idleMs = evTime.getTime() - lastMovingTime.getTime();
      if (idleMs > 120000) {
        segments.push(current);
        current = null;
        lastMovingTime = null;
      } else {
        if (isWebhookGps) {
          current.endLat = ev.latitude;
          current.endLon = ev.longitude;
        }
        if (ev.odometer != null) current.endOdo = ev.odometer;
      }
    }
  }

  if (current) {
    segments.push(current);
  }

  details.push(`Detected ${segments.length} potential trip segment(s)`);

  const existingTrips = await storage.getTrips(userId);
  let tripsCreated = 0;

  for (const seg of segments) {
    let distance: number | null = null;
    let distanceSource = "unknown";

    if (seg.startOdo != null && seg.endOdo != null && seg.endOdo > seg.startOdo) {
      distance = seg.endOdo - seg.startOdo;
      distanceSource = "odometer";
    }

    if ((distance == null || distance <= 0) && seg.startLat != null && seg.startLon != null && seg.endLat != null && seg.endLon != null) {
      distance = haversineDistance(seg.startLat, seg.startLon, seg.endLat, seg.endLon) / 1000;
      distanceSource = "gps";
    }

    if (distance == null || distance < MIN_DISTANCE_KM) {
      details.push(`Skipped segment ${seg.startTime.toLocaleTimeString("sv-SE")} - too short (${distance?.toFixed(2) || "unknown"} km)`);
      continue;
    }

    const segDate = seg.startTime.toISOString().split("T")[0];
    const segStartHHMM = seg.startTime.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
    const segEndHHMM = seg.endTime.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

    const isDuplicate = existingTrips.some(t => {
      if (t.vehicleId !== linkedVehicle.id || t.date !== segDate) return false;
      if (t.startTime === segStartHHMM && t.autoLogged) return true;
      if (t.startOdometer && t.endOdometer && seg.startOdo != null && seg.endOdo != null) {
        const odoOverlap = seg.startOdo < t.endOdometer && seg.endOdo > t.startOdometer;
        if (odoOverlap) return true;
      }
      if (t.startTime && t.endTime) {
        const tStart = t.startTime;
        const tEnd = t.endTime;
        const sStart = segStartHHMM;
        const sEnd = segEndHHMM;
        if (sStart < tEnd && sEnd > tStart) return true;
      }
      return false;
    });

    if (isDuplicate) {
      details.push(`Skipped segment ${segStartHHMM}-${segEndHHMM} - already logged`);
      continue;
    }

    const startOdo = seg.startOdo ?? linkedVehicle.currentOdometer ?? 0;
    const endOdo = seg.endOdo ?? startOdo + distance;

    const startLocation = seg.startLat != null && seg.startLon != null
      ? await reverseGeocode(seg.startLat, seg.startLon)
      : "Unknown";
    const endLocation = seg.endLat != null && seg.endLon != null
      ? await reverseGeocode(seg.endLat, seg.endLon)
      : "Unknown";

    const geofencesList = await storage.getGeofences(userId);
    let tripType = "private";
    if (seg.startLat != null && seg.startLon != null) {
      const startGf = findMatchingGeofence(seg.startLat, seg.startLon, geofencesList);
      if (startGf?.tripType === "business") tripType = "business";
    }
    if (seg.endLat != null && seg.endLon != null) {
      const endGf = findMatchingGeofence(seg.endLat, seg.endLon, geofencesList);
      if (endGf?.tripType === "business") tripType = "business";
    }

    await storage.createTrip({
      userId,
      vehicleId: linkedVehicle.id,
      date: segDate,
      startTime: segStartHHMM,
      endTime: segEndHHMM,
      startLocation,
      endLocation,
      startOdometer: Math.round(startOdo * 10) / 10,
      endOdometer: Math.round(endOdo * 10) / 10,
      distance: Math.round(distance * 10) / 10,
      tripType,
      autoLogged: true,
      startLatitude: seg.startLat,
      startLongitude: seg.startLon,
      endLatitude: seg.endLat,
      endLongitude: seg.endLon,
      routeCoordinates: seg.waypoints.length > 0 ? seg.waypoints : null,
      notes: `Reconstructed from telemetry (${distanceSource})`,
    });

    tripsCreated++;
    details.push(`Created trip: ${startLocation} -> ${endLocation}, ${distance.toFixed(1)} km at ${segStartHHMM}-${segEndHHMM}`);
  }

  return { tripsCreated, details };
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
