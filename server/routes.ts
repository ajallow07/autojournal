import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertVehicleSchema, insertTripSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const patchVehicleSchema = insertVehicleSchema.partial();
  const patchTripSchema = insertTripSchema.partial();

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

  return httpServer;
}
