import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertVehicleSchema, insertTripSchema, insertGeofenceSchema } from "@shared/schema";
import { setupAuth, isAuthenticated } from "./auth";

const OWNER_EMAIL = process.env.OWNER_EMAIL || "";

function isOwner(req: any): boolean {
  return !!req.user?.email && req.user.email === OWNER_EMAIL;
}
import {
  isTeslemetryConfigured,
  handleTelemetryWebhook,
  setupTeslemetryConnection,
  fetchTeslemetryVehicleData,
  getWebhookUrl,
  reconstructTripsFromTelemetry,
} from "./teslemetry";

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

  app.get("/api/vehicles", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const vehiclesList = await storage.getVehicles(userId);
    res.json(vehiclesList);
  });

  app.post("/api/vehicles", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const parsed = insertVehicleSchema.safeParse({ ...req.body, userId });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const vehicle = await storage.createVehicle(parsed.data);
    res.status(201).json(vehicle);
  });

  app.get("/api/vehicles/:id", isAuthenticated, async (req, res) => {
    const id = req.params.id as string;
    const vehicle = await storage.getVehicle(id);
    if (!vehicle || vehicle.userId !== getUserId(req)) return res.status(404).json({ message: "Vehicle not found" });
    res.json(vehicle);
  });

  app.patch("/api/vehicles/:id", isAuthenticated, async (req, res) => {
    const id = req.params.id as string;
    const vehicle = await storage.getVehicle(id);
    if (!vehicle || vehicle.userId !== getUserId(req)) return res.status(404).json({ message: "Vehicle not found" });
    const parsed = patchVehicleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const updated = await storage.updateVehicle(id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/vehicles/:id", isAuthenticated, async (req, res) => {
    const id = req.params.id as string;
    const vehicle = await storage.getVehicle(id);
    if (!vehicle || vehicle.userId !== getUserId(req)) return res.status(404).json({ message: "Vehicle not found" });
    const tripCount = await storage.getTripsCountByVehicle(id);
    if (tripCount > 0) {
      return res.status(409).json({
        message: `Cannot delete vehicle with ${tripCount} existing trip${tripCount > 1 ? "s" : ""}. Remove all trips for this vehicle first.`,
        tripCount,
      });
    }
    const connection = await storage.getTeslaConnection(getUserId(req));
    if (connection?.vehicleId === id) {
      await storage.updateTeslaConnection(connection.id, { vehicleId: null });
    }
    await storage.deleteVehicle(id);
    res.json({ success: true });
  });

  app.get("/api/trips", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const tripsList = await storage.getTrips(userId);
    res.json(tripsList);
  });

  app.get("/api/trips/:id", isAuthenticated, async (req, res) => {
    const id = req.params.id as string;
    const trip = await storage.getTrip(id);
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
    const id = req.params.id as string;
    const trip = await storage.getTrip(id);
    if (!trip || trip.userId !== getUserId(req)) return res.status(404).json({ message: "Trip not found" });
    const parsed = patchTripSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    if (parsed.data.startOdometer !== undefined && parsed.data.endOdometer !== undefined) {
      if (parsed.data.endOdometer < parsed.data.startOdometer) {
        return res.status(400).json({ message: "End odometer must be greater than or equal to start odometer" });
      }
      parsed.data.distance = parsed.data.endOdometer - parsed.data.startOdometer;
    }
    const updated = await storage.updateTrip(id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/trips/:id", isAuthenticated, async (req, res) => {
    const id = req.params.id as string;
    const trip = await storage.getTrip(id);
    if (!trip || trip.userId !== getUserId(req)) return res.status(404).json({ message: "Trip not found" });
    const deleted = await storage.deleteTrip(id);
    if (!deleted) return res.status(404).json({ message: "Trip not found" });
    res.json({ success: true });
  });

  app.get("/api/tesla/status", isAuthenticated, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ message: "Tesla features are restricted" });
    const userId = getUserId(req);
    const connection = await storage.getTeslaConnection(userId);
    const hasTeslemetry = isTeslemetryConfigured();
    res.json({
      configured: hasTeslemetry,
      connected: !!connection?.isActive,
      teslemetryConfigured: hasTeslemetry,
      webhookUrl: hasTeslemetry ? getWebhookUrl() : null,
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

  app.post("/api/tesla/disconnect", isAuthenticated, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ message: "Tesla features are restricted" });
    const userId = getUserId(req);
    const connection = await storage.getTeslaConnection(userId);
    if (!connection) return res.status(404).json({ message: "No Tesla connection found" });
    await storage.deleteTeslaConnection(connection.id);
    res.json({ success: true });
  });

  app.post("/api/tesla/link-vehicle", isAuthenticated, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ message: "Tesla features are restricted" });
    const userId = getUserId(req);
    const { vehicleId } = req.body;
    if (!vehicleId) return res.status(400).json({ message: "vehicleId required" });
    const connection = await storage.getTeslaConnection(userId);
    if (!connection) return res.status(404).json({ message: "No Tesla connection found" });
    const updated = await storage.updateTeslaConnection(connection.id, { vehicleId });
    res.json(updated);
  });

  app.get("/api/geofences", isAuthenticated, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ message: "Geofence features are restricted" });
    const userId = getUserId(req);
    const list = await storage.getGeofences(userId);
    res.json(list);
  });

  app.post("/api/geofences", isAuthenticated, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ message: "Geofence features are restricted" });
    const userId = getUserId(req);
    const parsed = insertGeofenceSchema.safeParse({ ...req.body, userId });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const geofence = await storage.createGeofence(parsed.data);
    res.status(201).json(geofence);
  });

  app.patch("/api/geofences/:id", isAuthenticated, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ message: "Geofence features are restricted" });
    const id = req.params.id as string;
    const geofence = await storage.getGeofence(id);
    if (!geofence || geofence.userId !== getUserId(req)) return res.status(404).json({ message: "Geofence not found" });
    const parsed = patchGeofenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const updated = await storage.updateGeofence(id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/geofences/:id", isAuthenticated, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ message: "Geofence features are restricted" });
    const id = req.params.id as string;
    const geofence = await storage.getGeofence(id);
    if (!geofence || geofence.userId !== getUserId(req)) return res.status(404).json({ message: "Geofence not found" });
    const deleted = await storage.deleteGeofence(id);
    if (!deleted) return res.status(404).json({ message: "Geofence not found" });
    res.json({ success: true });
  });

  app.post("/api/teslemetry/webhook", async (req, res) => {
    const webhookSecret = process.env.TESLEMETRY_WEBHOOK_SECRET;
    if (webhookSecret) {
      const authHeader = req.headers.authorization;
      const providedToken = authHeader?.replace(/^Bearer\s+/i, "");
      if (!providedToken || providedToken !== webhookSecret) {
        console.log("[Teslemetry] Webhook auth failed - invalid or missing token");
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
    try {
      const result = await handleTelemetryWebhook(req.body);
      res.json(result);
    } catch (error: any) {
      console.error("[Teslemetry Webhook] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/teslemetry/connect", isAuthenticated, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ message: "Tesla features are restricted" });
    try {
      const userId = getUserId(req);
      const connection = await setupTeslemetryConnection(userId);
      res.json({
        success: true,
        connection: {
          id: connection.id,
          vin: connection.vin,
          vehicleName: connection.vehicleName,
          vehicleId: connection.vehicleId,
        },
        webhookUrl: getWebhookUrl(),
      });
    } catch (error: any) {
      console.error("[Teslemetry Connect] Error:", error.message);
      const status = error.message?.includes("already connected") ? 409 : 500;
      res.status(status).json({ message: error.message });
    }
  });

  app.post("/api/teslemetry/refresh", isAuthenticated, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ message: "Tesla features are restricted" });
    try {
      const userId = getUserId(req);
      const connection = await storage.getTeslaConnection(userId);
      if (!connection?.vin) {
        return res.status(404).json({ message: "No Tesla connection found" });
      }
      const vehicleData = await fetchTeslemetryVehicleData(connection.vin);
      const driveState = vehicleData?.drive_state;
      const vehicleState = vehicleData?.vehicle_state;
      const rawOdometer = vehicleState?.odometer;
      const odometerKm = rawOdometer != null && rawOdometer > 0 ? rawOdometer * 1.60934 : null;
      await storage.updateTeslaConnection(connection.id, {
        lastPolledAt: new Date(),
        lastDriveState: driveState?.shift_state === "D" ? "driving" : "parked",
        lastShiftState: driveState?.shift_state || null,
        lastLatitude: driveState?.latitude ?? null,
        lastLongitude: driveState?.longitude ?? null,
        lastOdometer: odometerKm,
      });
      if (odometerKm != null && connection.vehicleId) {
        const vehicle = await storage.getVehicle(connection.vehicleId);
        if (vehicle && odometerKm > (vehicle.currentOdometer || 0)) {
          await storage.updateVehicle(vehicle.id, { currentOdometer: Math.round(odometerKm * 10) / 10 });
        }
      }
      res.json({
        success: true,
        odometer: odometerKm,
        latitude: driveState?.latitude,
        longitude: driveState?.longitude,
        shiftState: driveState?.shift_state,
      });
    } catch (error: any) {
      console.error("[Teslemetry Refresh] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/telemetry-events", isAuthenticated, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ message: "Tesla features are restricted" });
    try {
      const userId = getUserId(req);
      const hours = parseInt(String(req.query.hours || "24"));
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const events = await storage.getTelemetryEvents(userId, since);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/telemetry/reconstruct", isAuthenticated, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ message: "Tesla features are restricted" });
    try {
      const userId = getUserId(req);
      const connection = await storage.getTeslaConnection(userId);
      if (!connection?.vin) {
        return res.status(404).json({ message: "No Tesla connection found" });
      }
      const hours = req.body.hours || 24;
      const result = await reconstructTripsFromTelemetry(userId, connection.vin, hours);
      res.json(result);
    } catch (error: any) {
      console.error("[Reconstruct] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
