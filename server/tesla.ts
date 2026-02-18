import { storage } from "./storage";
import type { TeslaConnection, Geofence } from "@shared/schema";

const TESLA_AUTH_URL = "https://auth.tesla.com/oauth2/v3/authorize";
const TESLA_TOKEN_URL = "https://auth.tesla.com/oauth2/v3/token";
const TESLA_API_BASE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";
const TESLA_AUDIENCE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";

const POLL_DEEP_SLEEP_MS = 600000;
const POLL_AWAKE_IDLE_MS = 90000;
const POLL_ACTIVE_TRIP_MS = 30000;
const POLL_PARKED_CONFIRMING_MS = 60000;
const POLL_SLEEP_CHECK_MS = 60000;
const SLEEP_ALLOWANCE_MS = 900000;
const PARKED_CONFIRMATION_MS = 120000;
const TRIP_ERROR_TIMEOUT_MS = 600000;
const MIN_DISTANCE_KM = 0.1;

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

  const bufferMs = 60000;
  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() - bufferMs < Date.now()) {
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
  if (res.status === 408) {
    throw new TeslaApiError(408, "Vehicle unavailable (asleep/offline)");
  }
  if (res.status === 429) {
    throw new TeslaApiError(429, "Rate limited");
  }
  if (!res.ok) {
    const err = await res.text();
    throw new TeslaApiError(res.status, `Tesla API error: ${err}`);
  }
  return res.json();
}

class TeslaApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "TeslaApiError";
  }
}

export async function listTeslaVehicles(token: string): Promise<any[]> {
  const data = await teslaApiGet(token, "/api/1/vehicles");
  return data.response || [];
}

async function getVehicleOnlineState(token: string, teslaVehicleId: string): Promise<string> {
  const data = await teslaApiGet(token, "/api/1/vehicles");
  const vehicles = data.response || [];
  const vehicle = vehicles.find((v: any) => String(v.id) === String(teslaVehicleId));
  return vehicle?.state || "unknown";
}

async function getVehicleData(token: string, vehicleIdOrVin: string): Promise<any> {
  const data = await teslaApiGet(
    token,
    `/api/1/vehicles/${vehicleIdOrVin}/vehicle_data?endpoints=location_data%3Bvehicle_state%3Bdrive_state%3Bcharge_state`
  );
  return data.response;
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
      const checkState = await getVehicleOnlineState(token, vehicleId);
      console.log(`[Tesla Wake] Retry ${i + 1}: state=${checkState}`);
      if (checkState === "online") return true;
    }
    return false;
  } catch (err: any) {
    console.error(`[Tesla Wake] Error: ${err.message}`);
    return false;
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

interface PollResult {
  status: string;
  driveState?: string;
  tripAction?: string;
  pollState?: string;
}

async function pollSingleConnection(connection: TeslaConnection): Promise<PollResult | null> {
  if (!connection.isActive || !connection.teslaVehicleId) return null;

  const currentPollState = connection.pollState || "deep_sleep";

  try {
    const token = await getValidToken(connection);

    if (currentPollState === "deep_sleep") {
      return await pollDeepSleep(connection, token);
    } else if (currentPollState === "awake_idle") {
      return await pollAwakeIdle(connection, token);
    } else if (currentPollState === "active_trip") {
      return await pollActiveTrip(connection, token);
    } else if (currentPollState === "sleep_pending") {
      return await pollSleepPending(connection, token);
    }

    return await pollDeepSleep(connection, token);
  } catch (error: any) {
    const isRetryable = error instanceof TeslaApiError && (error.status === 408 || error.status === 429);

    if (isRetryable && connection.tripInProgress) {
      const errors = (connection.consecutiveErrors || 0) + 1;
      const firstErrorAt = connection.lastApiErrorAt || new Date();
      const errorDuration = Date.now() - new Date(firstErrorAt).getTime();

      console.log(`[Tesla Poll] Retryable error (${error.status}) during active trip for user=${connection.userId}, errors=${errors}, duration=${Math.round(errorDuration / 1000)}s`);

      if (errorDuration > TRIP_ERROR_TIMEOUT_MS) {
        console.log(`[Tesla Poll] Trip error timeout reached (${Math.round(errorDuration / 1000)}s) - force-closing trip for user=${connection.userId}`);
        await completeTrip(connection, connection.lastLatitude ?? undefined, connection.lastLongitude ?? undefined, connection.lastOdometer);
        await storage.updateTeslaConnection(connection.id, {
          lastPolledAt: new Date(),
          pollState: "deep_sleep",
          tripInProgress: false,
          tripStartTime: null,
          tripStartOdometer: null,
          tripStartLatitude: null,
          tripStartLongitude: null,
          tripStartLocation: null,
          parkedSince: null,
          idleSince: null,
          consecutiveErrors: 0,
          lastApiErrorAt: null,
        });
        return { status: "trip_force_ended", driveState: "unknown", tripAction: "ended", pollState: "deep_sleep" };
      }

      await storage.updateTeslaConnection(connection.id, {
        lastPolledAt: new Date(),
        consecutiveErrors: errors,
        lastApiErrorAt: firstErrorAt,
      });
      return { status: "error_retrying", driveState: "driving", pollState: "active_trip" };
    }

    console.error(`[Tesla Poll] Error for user ${connection.userId} (state=${currentPollState}):`, error.message);
    await storage.updateTeslaConnection(connection.id, {
      lastPolledAt: new Date(),
      consecutiveErrors: (connection.consecutiveErrors || 0) + 1,
    });
    return { status: "error", pollState: currentPollState };
  }
}

async function pollDeepSleep(connection: TeslaConnection, token: string): Promise<PollResult> {
  let onlineState: string;
  try {
    onlineState = await getVehicleOnlineState(token, connection.teslaVehicleId!);
  } catch (err: any) {
    if (err instanceof TeslaApiError && (err.status === 408 || err.status === 429)) {
      console.log(`[Tesla Poll] DEEP_SLEEP: ${err.status} for user=${connection.userId} - staying in DEEP_SLEEP`);
      await storage.updateTeslaConnection(connection.id, { lastPolledAt: new Date() });
      return { status: "asleep", driveState: "asleep", pollState: "deep_sleep" };
    }
    throw err;
  }
  console.log(`[Tesla Poll] DEEP_SLEEP user=${connection.userId} vehicleState=${onlineState} tripInProgress=${connection.tripInProgress}`);

  if (connection.tripInProgress && onlineState !== "online") {
    console.log(`[Tesla Poll] Trip in progress but vehicle asleep for user=${connection.userId} - attempting wake to complete trip`);
    const woke = await wakeUpVehicle(token, connection.teslaVehicleId!);
    if (woke) {
      console.log(`[Tesla Poll] Vehicle woken successfully - transitioning to ACTIVE_TRIP to complete`);
      await storage.updateTeslaConnection(connection.id, {
        lastPolledAt: new Date(),
        pollState: "active_trip",
        consecutiveErrors: 0,
        lastApiErrorAt: null,
      });
      return { status: "woke_for_trip", driveState: "online", pollState: "active_trip" };
    }
    console.log(`[Tesla Poll] Could not wake vehicle - will retry next poll`);
    await storage.updateTeslaConnection(connection.id, { lastPolledAt: new Date() });
    return { status: "asleep_trip_pending", driveState: "asleep", pollState: "deep_sleep" };
  }

  if (onlineState === "online") {
    const nextState = connection.tripInProgress ? "active_trip" : "awake_idle";
    console.log(`[Tesla Poll] Vehicle woke up for user=${connection.userId} - transitioning to ${nextState.toUpperCase()}`);
    await storage.updateTeslaConnection(connection.id, {
      lastPolledAt: new Date(),
      lastDriveState: "online",
      pollState: nextState,
      idleSince: connection.tripInProgress ? null : new Date(),
      consecutiveErrors: 0,
    });
    return { status: "woke_up", driveState: "online", pollState: nextState };
  }

  await storage.updateTeslaConnection(connection.id, {
    lastPolledAt: new Date(),
    lastDriveState: "asleep",
    lastShiftState: null,
    consecutiveErrors: 0,
  });
  return { status: "asleep", driveState: "asleep", pollState: "deep_sleep" };
}

async function pollAwakeIdle(connection: TeslaConnection, token: string): Promise<PollResult> {
  const vehicleIdForData = connection.vin || connection.teslaVehicleId!;
  let vehicleData: any;
  try {
    vehicleData = await getVehicleData(token, vehicleIdForData);
  } catch (err: any) {
    if (err instanceof TeslaApiError && (err.status === 408 || err.status === 429)) {
      console.log(`[Tesla Poll] AWAKE_IDLE: ${err.status} for user=${connection.userId} - transitioning to DEEP_SLEEP`);
      await storage.updateTeslaConnection(connection.id, {
        lastPolledAt: new Date(),
        lastDriveState: "asleep",
        lastShiftState: null,
        pollState: "deep_sleep",
        idleSince: null,
        consecutiveErrors: 0,
      });
      return { status: "asleep", driveState: "asleep", pollState: "deep_sleep" };
    }
    throw err;
  }
  if (!vehicleData) {
    console.log(`[Tesla Poll] AWAKE_IDLE: No vehicle data for user=${connection.userId} - back to DEEP_SLEEP`);
    await storage.updateTeslaConnection(connection.id, {
      lastPolledAt: new Date(),
      lastDriveState: "asleep",
      lastShiftState: null,
      pollState: "deep_sleep",
      idleSince: null,
    });
    return { status: "asleep", driveState: "asleep", pollState: "deep_sleep" };
  }

  const driveState = vehicleData.drive_state;
  const vehicleState = vehicleData.vehicle_state;
  const chargeState = vehicleData.charge_state;
  const shiftState = driveState?.shift_state;
  const lat = driveState?.latitude;
  const lon = driveState?.longitude;
  const rawOdometer = vehicleState?.odometer;
  const odometer = rawOdometer != null && rawOdometer > 0 ? rawOdometer * 1.60934 : null;
  const isCharging = chargeState?.charging_state === "Charging";

  if (rawOdometer == null) {
    console.log(`[Tesla Debug] AWAKE_IDLE vehicle_state keys: ${vehicleState ? Object.keys(vehicleState).join(", ") : "NULL"}`);
    console.log(`[Tesla Debug] Top-level response keys: ${Object.keys(vehicleData).join(", ")}`);
    if (vehicleState) {
      const relevantKeys = ["odometer", "car_version", "api_version", "vehicle_name"];
      const subset: any = {};
      for (const k of relevantKeys) { if (k in vehicleState) subset[k] = vehicleState[k]; }
      console.log(`[Tesla Debug] vehicle_state subset: ${JSON.stringify(subset)}`);
    }
  }

  const isDriving = shiftState === "D" || shiftState === "R" || shiftState === "N";

  console.log(`[Tesla Poll] AWAKE_IDLE user=${connection.userId} shift=${shiftState || "null"} charging=${isCharging} lat=${lat} lon=${lon} rawOdo=${rawOdometer}`);

  if (isDriving) {
    const locationName = lat && lon ? await reverseGeocode(lat, lon) : "Unknown";
    await storage.updateTeslaConnection(connection.id, {
      lastPolledAt: new Date(),
      lastDriveState: "driving",
      lastShiftState: shiftState,
      lastLatitude: lat,
      lastLongitude: lon,
      lastOdometer: odometer,
      pollState: "active_trip",
      tripInProgress: true,
      tripStartTime: new Date(),
      tripStartOdometer: odometer,
      tripStartLatitude: lat,
      tripStartLongitude: lon,
      tripStartLocation: locationName,
      parkedSince: null,
      idleSince: null,
      consecutiveErrors: 0,
      lastApiErrorAt: null,
    });

    console.log(`[Tesla Trip] STARTED (P→${shiftState}) for user=${connection.userId} at ${locationName} odo=${odometer?.toFixed(1)}`);
    return { status: "trip_started", driveState: "driving", tripAction: "started", pollState: "active_trip" };
  }

  const idleSince = connection.idleSince ? new Date(connection.idleSince) : new Date();
  const idleDuration = Date.now() - idleSince.getTime();

  if (!isCharging && idleDuration > SLEEP_ALLOWANCE_MS) {
    console.log(`[Tesla Poll] Idle for ${Math.round(idleDuration / 1000)}s (>${SLEEP_ALLOWANCE_MS / 1000}s) - transitioning to SLEEP_PENDING to allow car to sleep`);
    await storage.updateTeslaConnection(connection.id, {
      lastPolledAt: new Date(),
      lastDriveState: "parked",
      lastShiftState: shiftState || null,
      lastLatitude: lat,
      lastLongitude: lon,
      lastOdometer: odometer,
      pollState: "sleep_pending",
    });
    return { status: "sleep_pending", driveState: "parked", pollState: "sleep_pending" };
  }

  await storage.updateTeslaConnection(connection.id, {
    lastPolledAt: new Date(),
    lastDriveState: "parked",
    lastShiftState: shiftState || null,
    lastLatitude: lat,
    lastLongitude: lon,
    lastOdometer: odometer,
    idleSince: connection.idleSince || new Date(),
    consecutiveErrors: 0,
  });

  return { status: isCharging ? "charging" : "idle", driveState: "parked", pollState: "awake_idle" };
}

async function pollSleepPending(connection: TeslaConnection, token: string): Promise<PollResult> {
  let onlineState: string;
  try {
    onlineState = await getVehicleOnlineState(token, connection.teslaVehicleId!);
  } catch (err: any) {
    if (err instanceof TeslaApiError && (err.status === 408 || err.status === 429)) {
      console.log(`[Tesla Poll] SLEEP_PENDING: ${err.status} for user=${connection.userId} - staying in SLEEP_PENDING`);
      await storage.updateTeslaConnection(connection.id, { lastPolledAt: new Date() });
      return { status: "sleep_pending_error", driveState: "unknown", pollState: "sleep_pending" };
    }
    throw err;
  }
  console.log(`[Tesla Poll] SLEEP_PENDING user=${connection.userId} vehicleState=${onlineState}`);

  if (onlineState === "online") {
    console.log(`[Tesla Poll] Vehicle still online in SLEEP_PENDING for user=${connection.userId} - returning to AWAKE_IDLE to check for driving`);
    await storage.updateTeslaConnection(connection.id, {
      lastPolledAt: new Date(),
      pollState: "awake_idle",
      idleSince: connection.idleSince || new Date(),
      consecutiveErrors: 0,
    });
    return { status: "woke_from_sleep_pending", driveState: "parked", pollState: "awake_idle" };
  }

  console.log(`[Tesla Poll] Vehicle fell asleep for user=${connection.userId} - transitioning to DEEP_SLEEP`);
  await storage.updateTeslaConnection(connection.id, {
    lastPolledAt: new Date(),
    lastDriveState: "asleep",
    lastShiftState: null,
    pollState: "deep_sleep",
    idleSince: null,
    consecutiveErrors: 0,
  });
  return { status: "asleep", driveState: "asleep", pollState: "deep_sleep" };
}

async function pollActiveTrip(connection: TeslaConnection, token: string): Promise<PollResult> {
  const vehicleIdForData = connection.vin || connection.teslaVehicleId!;
  let vehicleData: any;
  try {
    vehicleData = await getVehicleData(token, vehicleIdForData);
  } catch (err: any) {
    if (err instanceof TeslaApiError && (err.status === 408 || err.status === 429)) {
      console.log(`[Tesla Poll] ACTIVE_TRIP: ${err.status} for user=${connection.userId} - keeping trip open`);
      const errors = (connection.consecutiveErrors || 0) + 1;
      await storage.updateTeslaConnection(connection.id, {
        lastPolledAt: new Date(),
        consecutiveErrors: errors,
        lastApiErrorAt: connection.lastApiErrorAt || new Date(),
      });
      return { status: "driving_no_data", driveState: "driving", pollState: "active_trip" };
    }
    throw err;
  }
  if (!vehicleData) {
    console.log(`[Tesla Poll] ACTIVE_TRIP: No vehicle data for user=${connection.userId} - keeping trip open`);
    const errors = (connection.consecutiveErrors || 0) + 1;
    await storage.updateTeslaConnection(connection.id, {
      lastPolledAt: new Date(),
      consecutiveErrors: errors,
      lastApiErrorAt: connection.lastApiErrorAt || new Date(),
    });
    return { status: "driving_no_data", driveState: "driving", pollState: "active_trip" };
  }

  await storage.updateTeslaConnection(connection.id, {
    consecutiveErrors: 0,
    lastApiErrorAt: null,
  });

  const driveState = vehicleData.drive_state;
  const vehicleState = vehicleData.vehicle_state;
  const shiftState = driveState?.shift_state;
  const lat = driveState?.latitude;
  const lon = driveState?.longitude;
  const rawOdometer = vehicleState?.odometer;
  const odometer = rawOdometer != null && rawOdometer > 0 ? rawOdometer * 1.60934 : null;

  if (rawOdometer == null) {
    console.log(`[Tesla Debug] ACTIVE_TRIP vehicle_state keys: ${vehicleState ? Object.keys(vehicleState).join(", ") : "NULL"}`);
  }

  const isDriving = shiftState === "D" || shiftState === "R" || shiftState === "N";
  const isParked = shiftState === "P" || (!shiftState && !isDriving);

  console.log(`[Tesla Poll] ACTIVE_TRIP user=${connection.userId} shift=${shiftState || "null"} lat=${lat} lon=${lon} odo_km=${odometer?.toFixed(1)} rawOdo=${rawOdometer}`);

  if (isDriving) {
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
    return { status: "driving", driveState: "driving", pollState: "active_trip" };
  }

  if (isParked) {
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
      return { status: "parked_confirming", driveState: "parked", pollState: "active_trip" };
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
      return { status: "parked_confirming", driveState: "parked", pollState: "active_trip" };
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

    return { status: "trip_ended", driveState: "parked", tripAction: "ended", pollState: "awake_idle" };
  }

  await storage.updateTeslaConnection(connection.id, {
    lastPolledAt: new Date(),
    lastDriveState: "driving",
    lastShiftState: shiftState || null,
    lastLatitude: lat,
    lastLongitude: lon,
    lastOdometer: odometer,
  });
  return { status: "driving", driveState: "driving", pollState: "active_trip" };
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

export async function pollVehicleStateForUser(userId: string): Promise<PollResult | null> {
  const connection = await storage.getTeslaConnection(userId);
  if (!connection) return null;
  return pollSingleConnection(connection);
}

function getNextPollInterval(results: Array<PollResult | null>): number {
  let minInterval = POLL_DEEP_SLEEP_MS;

  for (const r of results) {
    if (!r) continue;
    let interval = POLL_DEEP_SLEEP_MS;
    switch (r.pollState) {
      case "active_trip":
        interval = r.status === "parked_confirming" ? POLL_PARKED_CONFIRMING_MS : POLL_ACTIVE_TRIP_MS;
        break;
      case "awake_idle":
        interval = POLL_AWAKE_IDLE_MS;
        break;
      case "sleep_pending":
        interval = POLL_SLEEP_CHECK_MS;
        break;
    }
    if (interval < minInterval) minInterval = interval;
  }

  return minInterval;
}

let pollingTimeout: ReturnType<typeof setTimeout> | null = null;
let isPollingActive = false;

async function pollAllConnections(): Promise<number> {
  const connections = await storage.getAllActiveTeslaConnections();
  if (connections.length === 0) {
    console.log("[Tesla Poll] No active connections - stopping polling");
    stopPolling();
    return POLL_DEEP_SLEEP_MS;
  }
  const results: Array<PollResult | null> = [];
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
      pollingTimeout = setTimeout(pollLoop, POLL_DEEP_SLEEP_MS);
    }
  }
}

export function startPolling() {
  stopPolling();
  isPollingActive = true;
  console.log(`[Tesla Polling] Started - Sleep-Aware State Machine`);
  console.log(`  Deep Sleep: check /vehicles every ${POLL_DEEP_SLEEP_MS / 1000}s`);
  console.log(`  Awake Idle: poll /vehicle_data every ${POLL_AWAKE_IDLE_MS / 1000}s`);
  console.log(`  Active Trip: poll /vehicle_data every ${POLL_ACTIVE_TRIP_MS / 1000}s`);
  console.log(`  Sleep Allowance: ${SLEEP_ALLOWANCE_MS / 1000}s idle → stop /vehicle_data to let car sleep`);
  console.log(`  Park Confirmation: ${PARKED_CONFIRMATION_MS / 1000}s before ending trip`);
  console.log(`  Trip Error Timeout: ${TRIP_ERROR_TIMEOUT_MS / 1000}s of 408/429 → force-close trip`);
  pollingTimeout = setTimeout(pollLoop, 5000);
}

export function stopPolling() {
  isPollingActive = false;
  if (pollingTimeout) {
    clearTimeout(pollingTimeout);
    pollingTimeout = null;
    console.log("[Tesla Polling] Stopped");
  }
}

export async function initTeslaPolling() {
  const connections = await storage.getAllActiveTeslaConnections();
  if (connections.length === 0) {
    console.log("[Tesla Polling] No active connections found at startup");
    return;
  }

  console.log(`[Tesla Polling] Startup recovery: ${connections.length} active connection(s)`);
  for (const conn of connections) {
    const state = conn.pollState || "deep_sleep";
    const tripActive = conn.tripInProgress;
    if (tripActive) {
      console.log(`[Tesla Polling] RECOVERY: Connection ${conn.id} (user=${conn.userId}) has active trip started at ${conn.tripStartTime} - pollState=${state}`);
      console.log(`[Tesla Polling]   Trip start: odo=${conn.tripStartOdometer}, lat=${conn.tripStartLatitude}, lng=${conn.tripStartLongitude}`);
      if (state === "deep_sleep" || state === "sleep_pending") {
        console.log(`[Tesla Polling]   Correcting pollState from ${state} to active_trip for in-progress trip`);
        await storage.updateTeslaConnection(conn.id, {
          pollState: "active_trip",
          consecutiveErrors: 0,
          lastApiErrorAt: null,
        });
      }
    } else {
      console.log(`[Tesla Polling] Connection ${conn.id} (user=${conn.userId}): pollState=${state}, no active trip`);
    }
  }

  startPolling();
}

export { getVehicleOnlineState as getVehicleState };
