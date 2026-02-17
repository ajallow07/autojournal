import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertVehicleSchema, insertTripSchema, insertGeofenceSchema } from "@shared/schema";
import { setupAuth, isAuthenticated } from "./auth";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  listTeslaVehicles,
  pollVehicleStateForUser,
  startPolling,
  stopPolling,
  initTeslaPolling,
  registerPartnerAccount,
} from "./tesla";
import crypto from "crypto";

let pendingOAuthStates: Map<string, string> = new Map();

function getUserId(req: any): string {
  const userId = req.user?.id;
  if (!userId) throw new Error("User ID not found in session");
  return userId;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  await setupAuth(app);

  const patchVehicleSchema = insertVehicleSchema.partial();
  const patchTripSchema = insertTripSchema.partial();
  const patchGeofenceSchema = insertGeofenceSchema.partial();

  app.get("/api/vehicles/lookup/:regno", isAuthenticated, async (req, res) => {
    const regno = (req.params.regno as string).replace(/\s+/g, "").toUpperCase();
    if (!regno || regno.length < 2 || regno.length > 10) {
      return res.status(400).json({ message: "Invalid registration number" });
    }

    const apiKey = process.env.BILUPPGIFTER_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ message: "Vehicle lookup is not configured. Ask your administrator to add a BILUPPGIFTER_API_KEY.", notConfigured: true });
    }

    try {
      const response = await fetch(`https://api.biluppgifter.se/api/v1/vehicle/regno/${encodeURIComponent(regno)}?include=basic,status,technical`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "MahlisAutoJournal/1.0",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ message: "No vehicle found with that registration number" });
        }
        if (response.status === 401 || response.status === 403) {
          return res.status(503).json({ message: "Vehicle lookup API key is invalid or expired" });
        }
        return res.status(502).json({ message: "Vehicle lookup service unavailable" });
      }

      const result = await response.json();
      const data = result.data;
      const basic = data?.basic?.data;
      const status = data?.status?.data;
      const technical = data?.technical?.data;
      const attrs = data?.attributes;

      let fuelType: string | null = null;
      if (technical?.fuel) {
        const fuelLower = String(technical.fuel).toLowerCase();
        if (fuelLower.includes("el")) fuelType = "electric";
        else if (fuelLower.includes("bensin")) fuelType = "petrol";
        else if (fuelLower.includes("diesel")) fuelType = "diesel";
        else if (fuelLower.includes("hybrid")) fuelType = "hybrid";
        else fuelType = String(technical.fuel);
      } else if (technical?.fuel_code) {
        const code = String(technical.fuel_code);
        if (code === "1") fuelType = "petrol";
        else if (code === "2") fuelType = "diesel";
        else if (code === "3") fuelType = "electric";
        else if (code === "4") fuelType = "hybrid";
      }

      const vehicleInfo = {
        regno: attrs?.regno || regno,
        vin: attrs?.vin || null,
        make: basic?.make || null,
        model: basic?.model || null,
        color: basic?.color || null,
        year: basic?.vehicle_year || basic?.model_year || null,
        fuelType,
        firstRegistered: status?.first_registered || null,
        numberOfOwners: status?.number_of_owners || null,
      };

      console.log(`[Vehicle Lookup] Found: ${vehicleInfo.make} ${vehicleInfo.model} (${vehicleInfo.year}) - ${vehicleInfo.regno}`);
      res.json(vehicleInfo);
    } catch (error: any) {
      console.error(`[Vehicle Lookup] Error for ${regno}:`, error.message);
      res.status(502).json({ message: "Failed to connect to vehicle lookup service" });
    }
  });

  app.get("/api/vehicles", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const vehiclesList = await storage.getVehicles(userId);
    res.json(vehiclesList);
  });

  app.get("/api/vehicles/:id", isAuthenticated, async (req, res) => {
    const vehicle = await storage.getVehicle(req.params.id);
    if (!vehicle || vehicle.userId !== getUserId(req)) return res.status(404).json({ message: "Vehicle not found" });
    res.json(vehicle);
  });

  app.post("/api/vehicles", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const parsed = insertVehicleSchema.safeParse({ ...req.body, userId });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const vehicle = await storage.createVehicle(parsed.data);
    res.status(201).json(vehicle);
  });

  app.patch("/api/vehicles/:id", isAuthenticated, async (req, res) => {
    const vehicle = await storage.getVehicle(req.params.id);
    if (!vehicle || vehicle.userId !== getUserId(req)) return res.status(404).json({ message: "Vehicle not found" });
    const parsed = patchVehicleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const updated = await storage.updateVehicle(req.params.id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/vehicles/:id", isAuthenticated, async (req, res) => {
    const vehicle = await storage.getVehicle(req.params.id);
    if (!vehicle || vehicle.userId !== getUserId(req)) return res.status(404).json({ message: "Vehicle not found" });
    const tripCount = await storage.getTripsCountByVehicle(req.params.id);
    if (tripCount > 0) {
      return res.status(409).json({
        message: `Cannot delete vehicle with ${tripCount} existing trip${tripCount > 1 ? "s" : ""}. Remove all trips for this vehicle first.`,
        tripCount,
      });
    }
    const connection = await storage.getTeslaConnection(getUserId(req));
    if (connection?.vehicleId === req.params.id) {
      await storage.updateTeslaConnection(connection.id, { vehicleId: null });
    }
    await storage.deleteVehicle(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/trips", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const tripsList = await storage.getTrips(userId);
    res.json(tripsList);
  });

  app.get("/api/trips/:id", isAuthenticated, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip || trip.userId !== getUserId(req)) return res.status(404).json({ message: "Trip not found" });
    res.json(trip);
  });

  app.post("/api/trips", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const parsed = insertTripSchema.safeParse({ ...req.body, userId });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    if (parsed.data.endOdometer < parsed.data.startOdometer) {
      return res.status(400).json({ message: "End odometer must be greater than or equal to start odometer" });
    }
    const data = { ...parsed.data, distance: parsed.data.endOdometer - parsed.data.startOdometer };
    const trip = await storage.createTrip(data);
    res.status(201).json(trip);
  });

  app.patch("/api/trips/:id", isAuthenticated, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip || trip.userId !== getUserId(req)) return res.status(404).json({ message: "Trip not found" });
    const parsed = patchTripSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    if (parsed.data.startOdometer !== undefined && parsed.data.endOdometer !== undefined) {
      if (parsed.data.endOdometer < parsed.data.startOdometer) {
        return res.status(400).json({ message: "End odometer must be greater than or equal to start odometer" });
      }
      parsed.data.distance = parsed.data.endOdometer - parsed.data.startOdometer;
    }
    const updated = await storage.updateTrip(req.params.id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/trips/:id", isAuthenticated, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip || trip.userId !== getUserId(req)) return res.status(404).json({ message: "Trip not found" });
    const deleted = await storage.deleteTrip(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Trip not found" });
    res.json({ success: true });
  });

  app.get("/api/tesla/status", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const connection = await storage.getTeslaConnection(userId);
    const hasCredentials = !!(process.env.TESLA_CLIENT_ID && process.env.TESLA_CLIENT_SECRET);
    res.json({
      configured: hasCredentials,
      connected: !!connection?.isActive,
      connection: connection ? {
        id: connection.id,
        vin: connection.vin,
        vehicleName: connection.vehicleName,
        isActive: connection.isActive,
        lastPolledAt: connection.lastPolledAt,
        lastDriveState: connection.lastDriveState,
        lastOdometer: connection.lastOdometer,
        lastLatitude: connection.lastLatitude,
        lastLongitude: connection.lastLongitude,
        tripInProgress: connection.tripInProgress,
        tripStartLocation: connection.tripStartLocation,
        tripStartTime: connection.tripStartTime,
        vehicleId: connection.vehicleId,
      } : null,
    });
  });

  app.post("/api/tesla/register", isAuthenticated, async (req, res) => {
    try {
      const result = await registerPartnerAccount();
      res.json(result);
    } catch (error: any) {
      console.error("Tesla partner registration error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tesla/auth", isAuthenticated, (req, res) => {
    try {
      const userId = getUserId(req);
      const state = crypto.randomBytes(16).toString("hex");
      pendingOAuthStates.set(state, userId);
      const url = getAuthUrl(state);
      res.json({ url, state });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/tesla/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code || typeof code !== "string") {
      return res.status(400).send("Missing authorization code");
    }
    if (!state || typeof state !== "string" || !pendingOAuthStates.has(state)) {
      return res.status(400).send("Invalid OAuth state - possible CSRF attack");
    }
    const userId = pendingOAuthStates.get(state)!;
    pendingOAuthStates.delete(state);

    try {
      const tokens = await exchangeCodeForTokens(code);
      const teslaVehicles = await listTeslaVehicles(tokens.access_token);

      if (teslaVehicles.length === 0) {
        return res.status(400).send("No Tesla vehicles found on this account");
      }

      const teslaVehicle = teslaVehicles[0];
      const userVehicles = await storage.getVehicles(userId);
      let linkedVehicle = userVehicles.find((v) => v.isDefault) || userVehicles[0];

      if (!linkedVehicle) {
        const displayName = teslaVehicle.display_name || "Tesla";
        const vinStr = teslaVehicle.vin || "";
        let make = "Tesla";
        let model = "Vehicle";
        if (vinStr.length >= 4) {
          const modelChar = vinStr[3];
          if (modelChar === "Y" || modelChar === "E") model = "Model Y";
          else if (modelChar === "S" || modelChar === "A") model = "Model S";
          else if (modelChar === "X" || modelChar === "B") model = "Model X";
          else if (modelChar === "3" || modelChar === "W") model = "Model 3";
        }
        const currentYear = new Date().getFullYear();
        linkedVehicle = await storage.createVehicle({
          userId,
          name: displayName,
          make,
          model,
          year: currentYear,
          licensePlate: "",
          currentOdometer: 0,
          isDefault: true,
        });
      }

      const existing = await storage.getTeslaConnection(userId);
      if (existing) {
        await storage.updateTeslaConnection(existing.id, {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          teslaVehicleId: String(teslaVehicle.id),
          vin: teslaVehicle.vin,
          vehicleName: teslaVehicle.display_name || `Tesla ${teslaVehicle.vin}`,
          isActive: true,
          vehicleId: linkedVehicle.id,
        });
      } else {
        await storage.createTeslaConnection({
          userId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          teslaVehicleId: String(teslaVehicle.id),
          vin: teslaVehicle.vin,
          vehicleName: teslaVehicle.display_name || `Tesla ${teslaVehicle.vin}`,
          isActive: true,
          vehicleId: linkedVehicle.id,
        });
      }

      startPolling();
      res.redirect("/tesla");
    } catch (error: any) {
      console.error("Tesla callback error:", error.message);
      res.status(500).send(`Tesla authentication failed: ${error.message}`);
    }
  });

  app.post("/api/tesla/disconnect", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const connection = await storage.getTeslaConnection(userId);
    if (!connection) return res.status(404).json({ message: "No Tesla connection found" });
    await storage.deleteTeslaConnection(connection.id);
    res.json({ success: true });
  });

  app.post("/api/tesla/poll", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const result = await pollVehicleStateForUser(userId);
      res.json(result || { status: "no_connection" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tesla/link-vehicle", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const { vehicleId } = req.body;
    if (!vehicleId) return res.status(400).json({ message: "vehicleId required" });
    const connection = await storage.getTeslaConnection(userId);
    if (!connection) return res.status(404).json({ message: "No Tesla connection found" });
    const updated = await storage.updateTeslaConnection(connection.id, { vehicleId });
    res.json(updated);
  });

  app.get("/api/geofences", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const list = await storage.getGeofences(userId);
    res.json(list);
  });

  app.post("/api/geofences", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const parsed = insertGeofenceSchema.safeParse({ ...req.body, userId });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const geofence = await storage.createGeofence(parsed.data);
    res.status(201).json(geofence);
  });

  app.patch("/api/geofences/:id", isAuthenticated, async (req, res) => {
    const geofence = await storage.getGeofence(req.params.id);
    if (!geofence || geofence.userId !== getUserId(req)) return res.status(404).json({ message: "Geofence not found" });
    const parsed = patchGeofenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const updated = await storage.updateGeofence(req.params.id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/geofences/:id", isAuthenticated, async (req, res) => {
    const geofence = await storage.getGeofence(req.params.id);
    if (!geofence || geofence.userId !== getUserId(req)) return res.status(404).json({ message: "Geofence not found" });
    const deleted = await storage.deleteGeofence(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Geofence not found" });
    res.json({ success: true });
  });

  await initTeslaPolling();

  return httpServer;
}
