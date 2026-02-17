import { storage } from "./storage";
import type { TeslaConnection, Geofence } from "@shared/schema";

const TESLA_AUTH_URL = "https://auth.tesla.com/oauth2/v3/authorize";
const TESLA_TOKEN_URL = "https://auth.tesla.com/oauth2/v3/token";
const TESLA_API_BASE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";
const TESLA_AUDIENCE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";

const POLL_INTERVAL_IDLE = 120000;
const POLL_INTERVAL_MONITORING = 60000;
const POLL_INTERVAL_DRIVING = 60000;
const PARKED_CONFIRMATION_MS = 120000;

function getClientId(): string {
  const id = process.env.TESLA_CLIENT_ID;
  if (!id) throw new Error("TESLA_CLIENT_ID not configured");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.TESLA_CLIENT_SECRET;
  if (!secret) throw new Error("TESLA_CLIENT_SECRET not configured");
  return secret;
}

function getRedirectUri(): string {
  const host = process.env.APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || process.env.REPL_SLUG + "." + process.env.REPL_OWNER + ".repl.co";
  return `https://${host}/api/tesla/callback`;
}

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    scope: "openid vehicle_device_data vehicle_location offline_access",
    state,
    audience: TESLA_AUDIENCE,
  });
  return `${TESLA_AUTH_URL}?${params.toString()}`;
}

export async function registerPartnerAccount(): Promise<{ success: boolean; message: string }> {
  const tokenRes = await fetch(TESLA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      scope: "openid vehicle_device_data vehicle_location",
      audience: TESLA_AUDIENCE,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get partner token: ${err}`);
  }

  const tokenData = await tokenRes.json();
  const domain = process.env.APP_DOMAIN || "autojournal.3ilights.com";

  const regRes = await fetch(`${TESLA_API_BASE}/api/1/partner_accounts`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ domain }),
  });

  if (!regRes.ok) {
    const err = await regRes.text();
    throw new Error(`Partner registration failed (${regRes.status}): ${err}`);
  }

  const result = await regRes.json();
  console.log("Tesla partner registration result:", JSON.stringify(result));
  return { success: true, message: `Partner registered for domain: ${domain}` };
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(TESLA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      code,
      redirect_uri: getRedirectUri(),
      audience: TESLA_AUDIENCE,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tesla token exchange failed: ${err}`);
  }

  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(TESLA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tesla token refresh failed: ${err}`);
  }

  return res.json();
}

async function getValidToken(connection: TeslaConnection): Promise<string> {
  if (!connection.accessToken) throw new Error("No access token");

  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) < new Date()) {
    if (!connection.refreshToken) throw new Error("No refresh token available");

    const tokens = await refreshAccessToken(connection.refreshToken);
    await storage.updateTeslaConnection(connection.id, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    });
    return tokens.access_token;
  }

  return connection.accessToken;
}

async function teslaApiGet(token: string, path: string): Promise<any> {
  const res = await fetch(`${TESLA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tesla API error (${res.status}): ${err}`);
  }
  return res.json();
}

export async function listTeslaVehicles(token: string): Promise<any[]> {
  const data = await teslaApiGet(token, "/api/1/vehicles");
  return data.response || [];
}

export async function getVehicleState(token: string, vehicleId: string): Promise<string> {
  const data = await teslaApiGet(token, "/api/1/vehicles");
  const vehicles = data.response || [];
  const vehicle = vehicles.find((v: any) => String(v.id) === String(vehicleId));
  return vehicle?.state || "unknown";
}

async function wakeUpVehicle(token: string, vehicleId: string): Promise<boolean> {
  try {
    const res = await fetch(`${TESLA_API_BASE}/api/1/vehicles/${vehicleId}/wake_up`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.log(`[Tesla Wake] Failed to wake vehicle ${vehicleId}: ${res.status}`);
      return false;
    }
    const data = await res.json();
    const state = data.response?.state;
    console.log(`[Tesla Wake] Vehicle ${vehicleId} state after wake: ${state}`);
    if (state === "online") return true;

    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const checkState = await getVehicleState(token, vehicleId);
      console.log(`[Tesla Wake] Retry ${i + 1}: state=${checkState}`);
      if (checkState === "online") return true;
    }
    return false;
  } catch (err: any) {
    console.error(`[Tesla Wake] Error: ${err.message}`);
    return false;
  }
}

export async function getVehicleData(token: string, vehicleId: string): Promise<any | null> {
  try {
    const data = await teslaApiGet(
      token,
      `/api/1/vehicles/${vehicleId}/vehicle_data?endpoints=location_data;vehicle_state;drive_state`
    );
    return data.response;
  } catch (err: any) {
    if (err.message?.includes("408")) {
      console.log(`[Tesla Data] Vehicle ${vehicleId} returned 408 (asleep/offline) - skipping`);
      return null;
    }
    throw err;
  }
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

let pollingTimeout: ReturnType<typeof setTimeout> | null = null;
let isPollingActive = false;

async function pollSingleConnection(connection: TeslaConnection): Promise<{
  status: string;
  driveState?: string;
  tripAction?: string;
} | null> {
  if (!connection.isActive || !connection.teslaVehicleId) return null;

  try {
    const token = await getValidToken(connection);
    const prevShiftState = connection.lastShiftState;
    const prevDriveState = connection.lastDriveState;

    const vehicleOnlineState = await getVehicleState(token, connection.teslaVehicleId);
    console.log(`[Tesla Poll] user=${connection.userId} onlineState=${vehicleOnlineState} prevShift=${prevShiftState} prevDrive=${prevDriveState} tripInProgress=${connection.tripInProgress}`);

    if (vehicleOnlineState !== "online") {
      if (connection.tripInProgress) {
        console.log(`[Tesla Poll] Vehicle asleep but trip in progress - attempting wake to complete trip`);
        const woke = await wakeUpVehicle(token, connection.teslaVehicleId);
        if (!woke) {
          await storage.updateTeslaConnection(connection.id, { lastPolledAt: new Date() });
          return { status: "asleep_trip_pending", driveState: "asleep" };
        }
      } else {
        await storage.updateTeslaConnection(connection.id, {
          lastPolledAt: new Date(),
          lastDriveState: "asleep",
          lastShiftState: null,
          parkedSince: null,
        });
        return { status: "asleep", driveState: "asleep" };
      }
    }

    const vehicleData = await getVehicleData(token, connection.teslaVehicleId);
    if (!vehicleData) {
      console.log(`[Tesla Poll] No vehicle data returned (408/asleep) for user=${connection.userId}`);
      await storage.updateTeslaConnection(connection.id, {
        lastPolledAt: new Date(),
        lastDriveState: "asleep",
        lastShiftState: null,
      });
      return { status: "asleep", driveState: "asleep" };
    }

    const driveState = vehicleData.drive_state;
    const vehicleState = vehicleData.vehicle_state;
    const shiftState = driveState?.shift_state;
    const lat = driveState?.latitude;
    const lon = driveState?.longitude;
    const rawOdometer = vehicleState?.odometer;
    const odometer = rawOdometer != null && rawOdometer > 0 ? rawOdometer * 1.60934 : null;

    const isDriving = shiftState === "D" || shiftState === "R" || shiftState === "N";
    const isExplicitlyParked = shiftState === "P";
    const currentDriveState = isDriving ? "driving" : "parked";
    const wasParkedOrAsleep = !prevShiftState || prevShiftState === "P" || prevDriveState === "asleep";

    console.log(`[Tesla Poll] user=${connection.userId} shift=${shiftState || "null"} prevShift=${prevShiftState || "null"} lat=${lat} lon=${lon} odo_km=${odometer?.toFixed(1)} isDriving=${isDriving}`);

    if (isDriving && !connection.tripInProgress && wasParkedOrAsleep) {
      const locationName = lat && lon ? await reverseGeocode(lat, lon) : "Unknown";
      await storage.updateTeslaConnection(connection.id, {
        lastPolledAt: new Date(),
        lastDriveState: "driving",
        lastShiftState: shiftState,
        lastLatitude: lat,
        lastLongitude: lon,
        lastOdometer: odometer,
        tripInProgress: true,
        tripStartTime: new Date(),
        tripStartOdometer: odometer,
        tripStartLatitude: lat,
        tripStartLongitude: lon,
        tripStartLocation: locationName,
        parkedSince: null,
      });

      console.log(`[Tesla Trip] STARTED (P→${shiftState}) for user=${connection.userId} at ${locationName} odo=${odometer?.toFixed(1)}`);
      return { status: "trip_started", driveState: "driving", tripAction: "started" };
    }

    if (isDriving && !connection.tripInProgress && !wasParkedOrAsleep) {
      console.log(`[Tesla Poll] Vehicle already in ${shiftState} without P→D transition, tracking shift state only`);
      await storage.updateTeslaConnection(connection.id, {
        lastPolledAt: new Date(),
        lastDriveState: "driving",
        lastShiftState: shiftState,
        lastLatitude: lat,
        lastLongitude: lon,
        lastOdometer: odometer,
      });
      return { status: "driving_no_trip", driveState: "driving" };
    }

    if (isDriving && connection.tripInProgress) {
      await storage.updateTeslaConnection(connection.id, {
        lastPolledAt: new Date(),
        lastDriveState: "driving",
        lastShiftState: shiftState,
        lastLatitude: lat,
        lastLongitude: lon,
        lastOdometer: odometer,
        parkedSince: null,
      });

      console.log(`[Tesla Trip] DRIVING for user=${connection.userId} lat=${lat} lon=${lon} odo=${odometer?.toFixed(1)}`);
      return { status: "driving", driveState: "driving" };
    }

    if (isExplicitlyParked && connection.tripInProgress) {
      const now = new Date();

      if (!connection.parkedSince) {
        console.log(`[Tesla Trip] Car returned to Park for user=${connection.userId} - starting ${PARKED_CONFIRMATION_MS / 1000}s confirmation timer`);
        await storage.updateTeslaConnection(connection.id, {
          lastPolledAt: now,
          lastDriveState: "parked",
          lastShiftState: shiftState || "P",
          lastLatitude: lat,
          lastLongitude: lon,
          lastOdometer: odometer,
          parkedSince: now,
        });
        return { status: "parked_confirming", driveState: "parked" };
      }

      const parkedDuration = now.getTime() - new Date(connection.parkedSince).getTime();

      if (parkedDuration < PARKED_CONFIRMATION_MS) {
        console.log(`[Tesla Trip] Still confirming park for user=${connection.userId} (${Math.round(parkedDuration / 1000)}s / ${PARKED_CONFIRMATION_MS / 1000}s)`);
        await storage.updateTeslaConnection(connection.id, {
          lastPolledAt: now,
          lastDriveState: "parked",
          lastShiftState: shiftState || "P",
          lastLatitude: lat,
          lastLongitude: lon,
          lastOdometer: odometer,
        });
        return { status: "parked_confirming", driveState: "parked" };
      }

      console.log(`[Tesla Trip] Parked for ${Math.round(parkedDuration / 1000)}s - completing trip for user=${connection.userId}`);
      await completeTrip(connection, lat, lon, odometer);

      await storage.updateTeslaConnection(connection.id, {
        lastPolledAt: now,
        lastDriveState: "parked",
        lastShiftState: shiftState || "P",
        lastLatitude: lat,
        lastLongitude: lon,
        lastOdometer: odometer,
        tripInProgress: false,
        tripStartTime: null,
        tripStartOdometer: null,
        tripStartLatitude: null,
        tripStartLongitude: null,
        tripStartLocation: null,
        parkedSince: null,
      });

      return { status: "trip_ended", driveState: "parked", tripAction: "ended" };
    }

    if (!shiftState && connection.tripInProgress) {
      console.log(`[Tesla Poll] Null shift_state with trip in progress for user=${connection.userId} - treating as parked for confirmation`);
      const now = new Date();
      if (!connection.parkedSince) {
        await storage.updateTeslaConnection(connection.id, {
          lastPolledAt: now,
          lastDriveState: "parked",
          lastShiftState: null,
          lastLatitude: lat,
          lastLongitude: lon,
          lastOdometer: odometer,
          parkedSince: now,
        });
        return { status: "parked_confirming", driveState: "parked" };
      }

      const parkedDuration = now.getTime() - new Date(connection.parkedSince).getTime();
      if (parkedDuration >= PARKED_CONFIRMATION_MS) {
        console.log(`[Tesla Trip] Null shift_state + parked ${Math.round(parkedDuration / 1000)}s - completing trip for user=${connection.userId}`);
        await completeTrip(connection, lat, lon, odometer);
        await storage.updateTeslaConnection(connection.id, {
          lastPolledAt: now,
          lastDriveState: "parked",
          lastShiftState: null,
          lastLatitude: lat,
          lastLongitude: lon,
          lastOdometer: odometer,
          tripInProgress: false,
          tripStartTime: null,
          tripStartOdometer: null,
          tripStartLatitude: null,
          tripStartLongitude: null,
          tripStartLocation: null,
          parkedSince: null,
        });
        return { status: "trip_ended", driveState: "parked", tripAction: "ended" };
      }

      await storage.updateTeslaConnection(connection.id, {
        lastPolledAt: now,
        lastDriveState: "parked",
        lastShiftState: null,
        lastLatitude: lat,
        lastLongitude: lon,
        lastOdometer: odometer,
      });
      return { status: "parked_confirming", driveState: "parked" };
    }

    await storage.updateTeslaConnection(connection.id, {
      lastPolledAt: new Date(),
      lastDriveState: currentDriveState,
      lastShiftState: shiftState || null,
      lastLatitude: lat,
      lastLongitude: lon,
      lastOdometer: odometer,
    });

    const wokeUp = prevDriveState === "asleep" && vehicleOnlineState === "online";
    return { status: wokeUp ? "woke_up" : "idle", driveState: currentDriveState };
  } catch (error: any) {
    console.error(`Tesla polling error for user ${connection.userId}:`, error.message);
    return { status: "error" };
  }
}

async function completeTrip(
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
    console.log(`[Tesla Trip] Using GPS distance fallback: ${distance.toFixed(2)} km`);
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

  const MIN_DISTANCE_KM = 0.1;

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
        notes: distanceSource === "gps" ? "Distance estimated via GPS (odometer unavailable)" : undefined,
      });

      if (endOdo > (linkedVehicle.currentOdometer || 0)) {
        await storage.updateVehicle(linkedVehicle.id, { currentOdometer: Math.round(endOdo * 10) / 10 });
      }

      console.log(`[Tesla Trip] SAVED for user=${connection.userId}: ${connection.tripStartLocation} -> ${endLocationName}, ${distance.toFixed(1)} km (${distanceSource}), type=${tripType}, odo=${startOdo.toFixed(0)}->${endOdo.toFixed(0)}`);
    }
  } else {
    console.log(`[Tesla Trip] DISCARDED for user=${connection.userId}: distance=${distance?.toFixed(2) || "unknown"} km (too short or no location data)`);
  }
}

export async function pollVehicleStateForUser(userId: string): Promise<{
  status: string;
  driveState?: string;
  tripAction?: string;
} | null> {
  const connection = await storage.getTeslaConnection(userId);
  if (!connection) return null;
  return pollSingleConnection(connection);
}

function getNextPollInterval(results: Array<{ status: string; driveState?: string } | null>): number {
  const hasDriving = results.some((r) => r?.driveState === "driving");
  const hasTripPending = results.some((r) => r?.status === "asleep_trip_pending");
  const hasParkedConfirming = results.some((r) => r?.status === "parked_confirming");
  const hasWokeUp = results.some((r) => r?.status === "woke_up");
  const hasParked = results.some((r) => r?.driveState === "parked");

  if (hasDriving) return POLL_INTERVAL_DRIVING;
  if (hasTripPending || hasParkedConfirming || hasWokeUp) return POLL_INTERVAL_MONITORING;
  if (hasParked) return POLL_INTERVAL_MONITORING;
  return POLL_INTERVAL_IDLE;
}

async function pollAllConnections(): Promise<number> {
  const connections = await storage.getAllActiveTeslaConnections();
  if (connections.length === 0) {
    console.log("[Tesla Poll] No active connections - stopping polling");
    stopPolling();
    return POLL_INTERVAL_IDLE;
  }
  const results: Array<{ status: string; driveState?: string } | null> = [];
  for (const conn of connections) {
    try {
      const result = await pollSingleConnection(conn);
      results.push(result);
    } catch (err: any) {
      console.error(`Polling error for connection ${conn.id}:`, err.message);
      results.push(null);
    }
  }
  return getNextPollInterval(results);
}

async function pollLoop() {
  if (!isPollingActive) return;
  try {
    const nextInterval = await pollAllConnections();
    if (isPollingActive) {
      pollingTimeout = setTimeout(pollLoop, nextInterval);
    }
  } catch (err: any) {
    console.error("Polling error:", err.message);
    if (isPollingActive) {
      pollingTimeout = setTimeout(pollLoop, POLL_INTERVAL_IDLE);
    }
  }
}

export function startPolling() {
  stopPolling();
  isPollingActive = true;
  console.log(`Starting Tesla polling (driving=${POLL_INTERVAL_DRIVING / 1000}s, monitoring=${POLL_INTERVAL_MONITORING / 1000}s, idle=${POLL_INTERVAL_IDLE / 1000}s, park-confirm=${PARKED_CONFIRMATION_MS / 1000}s)`);
  pollingTimeout = setTimeout(pollLoop, 5000);
}

export function stopPolling() {
  isPollingActive = false;
  if (pollingTimeout) {
    clearTimeout(pollingTimeout);
    pollingTimeout = null;
    console.log("Stopped Tesla polling");
  }
}

export async function initTeslaPolling() {
  const connections = await storage.getAllActiveTeslaConnections();
  if (connections.length > 0) {
    startPolling();
  }
}
