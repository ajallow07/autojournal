import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertVehicleSchema, insertTripSchema, insertGeofenceSchema } from "@shared/schema";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  listTeslaVehicles,
  getVehicleData,
  pollVehicleState,
  startPolling,
  stopPolling,
  initTeslaPolling,
} from "./tesla";
import crypto from "crypto";

let pendingOAuthState: string | null = null;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const patchVehicleSchema = insertVehicleSchema.partial();
  const patchTripSchema = insertTripSchema.partial();
  const patchGeofenceSchema = insertGeofenceSchema.partial();

  // Vehicles
  app.get("/api/vehicles", async (_req, res) => {
    const vehicles = await storage.getVehicles();
    res.json(vehicles);
  });

  app.get("/api/vehicles/:id", async (req, res) => {
    const vehicle = await storage.getVehicle(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.json(vehicle);
  });

  app.post("/api/vehicles", async (req, res) => {
    const parsed = insertVehicleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const vehicle = await storage.createVehicle(parsed.data);
    res.status(201).json(vehicle);
  });

  app.patch("/api/vehicles/:id", async (req, res) => {
    const parsed = patchVehicleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const vehicle = await storage.updateVehicle(req.params.id, parsed.data);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.json(vehicle);
  });

  // Trips
  app.get("/api/trips", async (_req, res) => {
    const trips = await storage.getTrips();
    res.json(trips);
  });

  app.get("/api/trips/:id", async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    res.json(trip);
  });

  app.post("/api/trips", async (req, res) => {
    const parsed = insertTripSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    if (parsed.data.endOdometer < parsed.data.startOdometer) {
      return res.status(400).json({ message: "End odometer must be greater than or equal to start odometer" });
    }
    const data = { ...parsed.data, distance: parsed.data.endOdometer - parsed.data.startOdometer };
    const trip = await storage.createTrip(data);
    res.status(201).json(trip);
  });

  app.patch("/api/trips/:id", async (req, res) => {
    const parsed = patchTripSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    if (parsed.data.startOdometer !== undefined && parsed.data.endOdometer !== undefined) {
      if (parsed.data.endOdometer < parsed.data.startOdometer) {
        return res.status(400).json({ message: "End odometer must be greater than or equal to start odometer" });
      }
      parsed.data.distance = parsed.data.endOdometer - parsed.data.startOdometer;
    }
    const trip = await storage.updateTrip(req.params.id, parsed.data);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    res.json(trip);
  });

  app.delete("/api/trips/:id", async (req, res) => {
    const deleted = await storage.deleteTrip(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Trip not found" });
    res.json({ success: true });
  });

  // Tesla Connection
  app.get("/api/tesla/status", async (_req, res) => {
    const connection = await storage.getTeslaConnection();
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
        tripInProgress: connection.tripInProgress,
        vehicleId: connection.vehicleId,
      } : null,
    });
  });

  app.get("/api/tesla/auth", (_req, res) => {
    try {
      const state = crypto.randomBytes(16).toString("hex");
      pendingOAuthState = state;
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
    if (!state || state !== pendingOAuthState) {
      return res.status(400).send("Invalid OAuth state - possible CSRF attack");
    }
    pendingOAuthState = null;

    try {
      const tokens = await exchangeCodeForTokens(code);
      const teslaVehicles = await listTeslaVehicles(tokens.access_token);

      if (teslaVehicles.length === 0) {
        return res.status(400).send("No Tesla vehicles found on this account");
      }

      const teslaVehicle = teslaVehicles[0];
      const vehicles = await storage.getVehicles();
      const defaultVehicle = vehicles.find((v) => v.isDefault) || vehicles[0];

      const existing = await storage.getTeslaConnection();
      if (existing) {
        await storage.updateTeslaConnection(existing.id, {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          teslaVehicleId: String(teslaVehicle.id),
          vin: teslaVehicle.vin,
          vehicleName: teslaVehicle.display_name || `Tesla ${teslaVehicle.vin}`,
          isActive: true,
          vehicleId: defaultVehicle?.id || null,
        });
      } else {
        await storage.createTeslaConnection({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          teslaVehicleId: String(teslaVehicle.id),
          vin: teslaVehicle.vin,
          vehicleName: teslaVehicle.display_name || `Tesla ${teslaVehicle.vin}`,
          isActive: true,
          vehicleId: defaultVehicle?.id || null,
        });
      }

      startPolling();
      res.redirect("/tesla");
    } catch (error: any) {
      console.error("Tesla callback error:", error.message);
      res.status(500).send(`Tesla authentication failed: ${error.message}`);
    }
  });

  app.post("/api/tesla/disconnect", async (_req, res) => {
    const connection = await storage.getTeslaConnection();
    if (!connection) return res.status(404).json({ message: "No Tesla connection found" });
    stopPolling();
    await storage.deleteTeslaConnection(connection.id);
    res.json({ success: true });
  });

  app.post("/api/tesla/poll", async (_req, res) => {
    try {
      const result = await pollVehicleState();
      res.json(result || { status: "no_connection" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tesla/link-vehicle", async (req, res) => {
    const { vehicleId } = req.body;
    if (!vehicleId) return res.status(400).json({ message: "vehicleId required" });
    const connection = await storage.getTeslaConnection();
    if (!connection) return res.status(404).json({ message: "No Tesla connection found" });
    const updated = await storage.updateTeslaConnection(connection.id, { vehicleId });
    res.json(updated);
  });

  // Geofences
  app.get("/api/geofences", async (_req, res) => {
    const list = await storage.getGeofences();
    res.json(list);
  });

  app.post("/api/geofences", async (req, res) => {
    const parsed = insertGeofenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const geofence = await storage.createGeofence(parsed.data);
    res.status(201).json(geofence);
  });

  app.patch("/api/geofences/:id", async (req, res) => {
    const parsed = patchGeofenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const geofence = await storage.updateGeofence(req.params.id, parsed.data);
    if (!geofence) return res.status(404).json({ message: "Geofence not found" });
    res.json(geofence);
  });

  app.delete("/api/geofences/:id", async (req, res) => {
    const deleted = await storage.deleteGeofence(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Geofence not found" });
    res.json({ success: true });
  });

  // Start Tesla polling if already connected
  await initTeslaPolling();

  return httpServer;
}
