import { storage } from "./storage";
import type { TeslaConnection, Geofence } from "@shared/schema";

const TESLA_AUTH_URL = "https://auth.tesla.com/oauth2/v3/authorize";
const TESLA_TOKEN_URL = "https://auth.tesla.com/oauth2/v3/token";
const TESLA_API_BASE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";
const TESLA_AUDIENCE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";

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

export async function getVehicleData(token: string, vehicleId: string): Promise<any> {
  const data = await teslaApiGet(
    token,
    `/api/1/vehicles/${vehicleId}/vehicle_data?endpoints=location_data;vehicle_state;drive_state`
  );
  return data.response;
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
      { headers: { "User-Agent": "Korjournal/1.0" } }
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

let pollingInterval: ReturnType<typeof setInterval> | null = null;

async function pollSingleConnection(connection: TeslaConnection): Promise<{
  status: string;
  driveState?: string;
  tripAction?: string;
} | null> {
  if (!connection.isActive || !connection.teslaVehicleId) return null;

  try {
    const token = await getValidToken(connection);
    const vehicleData = await getVehicleData(token, connection.teslaVehicleId);
    const driveState = vehicleData.drive_state;
    const vehicleState = vehicleData.vehicle_state;

    const shiftState = driveState?.shift_state;
    const lat = driveState?.latitude;
    const lon = driveState?.longitude;
    const rawOdometer = vehicleState?.odometer;
    const odometer = rawOdometer != null && rawOdometer > 0 ? rawOdometer * 1.60934 : null;

    console.log(`[Tesla Poll] user=${connection.userId} shift=${shiftState} lat=${lat} lon=${lon} odo_raw=${rawOdometer} odo_km=${odometer} tripInProgress=${connection.tripInProgress}`);

    const isDriving = shiftState && shiftState !== "P";
    const currentDriveState = isDriving ? "driving" : "parked";

    const updateData: any = {
      lastPolledAt: new Date(),
      lastDriveState: currentDriveState,
      lastLatitude: lat,
      lastLongitude: lon,
      lastOdometer: odometer,
    };

    if (isDriving && !connection.tripInProgress) {
      const locationName = lat && lon ? await reverseGeocode(lat, lon) : "Unknown";
      updateData.tripInProgress = true;
      updateData.tripStartTime = new Date();
      updateData.tripStartOdometer = odometer;
      updateData.tripStartLatitude = lat;
      updateData.tripStartLongitude = lon;
      updateData.tripStartLocation = locationName;

      console.log(`[Tesla Trip] STARTED for user=${connection.userId} at ${locationName} odo=${odometer} lat=${lat} lon=${lon}`);
      await storage.updateTeslaConnection(connection.id, updateData);
      return { status: "trip_started", driveState: currentDriveState, tripAction: "started" };
    }

    if (!isDriving && connection.tripInProgress) {
      let distance: number | null = null;
      let distanceSource = "unknown";

      if (connection.tripStartOdometer && odometer) {
        distance = odometer - connection.tripStartOdometer;
        distanceSource = "odometer";
      }

      if ((distance == null || distance <= 0) && lat && lon && connection.tripStartLatitude && connection.tripStartLongitude) {
        const gpsDistM = haversineDistance(connection.tripStartLatitude, connection.tripStartLongitude, lat, lon);
        distance = gpsDistM / 1000;
        distanceSource = "gps";
        console.log(`[Tesla Trip] Using GPS distance: ${distance.toFixed(2)} km (odometer not available)`);
      }

      const userVehicles = await storage.getVehicles(connection.userId);
      const linkedVehicle = userVehicles.find((v) => v.id === connection.vehicleId) || userVehicles[0];

      let startOdo: number;
      let endOdo: number;
      if (connection.tripStartOdometer && odometer) {
        startOdo = connection.tripStartOdometer;
        endOdo = odometer;
      } else if (connection.tripStartOdometer && !odometer && distance != null) {
        startOdo = connection.tripStartOdometer;
        endOdo = connection.tripStartOdometer + distance;
      } else if (!connection.tripStartOdometer && odometer && distance != null) {
        startOdo = odometer - distance;
        endOdo = odometer;
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
        const endLocationName = lat && lon ? await reverseGeocode(lat, lon) : "Unknown";
        const geofencesList = await storage.getGeofences(connection.userId);

        let tripType = "private";
        if (lat && lon) {
          const startGf = connection.tripStartLatitude && connection.tripStartLongitude
            ? findMatchingGeofence(connection.tripStartLatitude, connection.tripStartLongitude, geofencesList)
            : undefined;
          const endGf = findMatchingGeofence(lat, lon, geofencesList);
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
            notes: distanceSource === "gps" ? "Distance estimated via GPS" : undefined,
          });

          if (endOdo > (linkedVehicle.currentOdometer || 0)) {
            await storage.updateVehicle(linkedVehicle.id, { currentOdometer: Math.round(endOdo * 10) / 10 });
          }

          console.log(`[Tesla Trip] SAVED for user=${connection.userId}: ${connection.tripStartLocation} -> ${endLocationName}, ${distance.toFixed(1)} km (${distanceSource}), type=${tripType}, odo=${startOdo.toFixed(0)}->${endOdo.toFixed(0)}`);
        }
      } else {
        console.log(`[Tesla Trip] DISCARDED for user=${connection.userId}: distance=${distance?.toFixed(2) || 'unknown'} km (too short or no location data)`);
      }

      updateData.tripInProgress = false;
      updateData.tripStartTime = null;
      updateData.tripStartOdometer = null;
      updateData.tripStartLatitude = null;
      updateData.tripStartLongitude = null;
      updateData.tripStartLocation = null;

      await storage.updateTeslaConnection(connection.id, updateData);
      return { status: "trip_ended", driveState: currentDriveState, tripAction: "ended" };
    }

    await storage.updateTeslaConnection(connection.id, updateData);
    return { status: "ok", driveState: currentDriveState };
  } catch (error: any) {
    console.error(`Tesla polling error for user ${connection.userId}:`, error.message);
    return { status: "error" };
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

async function pollAllConnections() {
  const connections = await storage.getAllActiveTeslaConnections();
  for (const conn of connections) {
    try {
      await pollSingleConnection(conn);
    } catch (err: any) {
      console.error(`Polling error for connection ${conn.id}:`, err.message);
    }
  }
}

export function startPolling(intervalMs: number = 30000) {
  stopPolling();
  console.log(`Starting Tesla polling every ${intervalMs / 1000}s`);
  pollingInterval = setInterval(async () => {
    try {
      await pollAllConnections();
    } catch (err: any) {
      console.error("Polling error:", err.message);
    }
  }, intervalMs);
}

export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("Stopped Tesla polling");
  }
}

export async function initTeslaPolling() {
  const connections = await storage.getAllActiveTeslaConnections();
  if (connections.length > 0) {
    startPolling();
  }
}
