import { eq, desc, asc, and, count, gte, lt } from "drizzle-orm";
import { db } from "./db";
import {
  vehicles, trips, teslaConnections, geofences, telemetryEvents,
  type Vehicle, type InsertVehicle,
  type Trip, type InsertTrip,
  type TeslaConnection, type InsertTeslaConnection,
  type Geofence, type InsertGeofence,
  type TelemetryEvent, type InsertTelemetryEvent,
} from "@shared/schema";

export interface IStorage {
  getVehicles(userId: string): Promise<Vehicle[]>;
  getVehicle(id: string): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: string, vehicle: Partial<InsertVehicle>): Promise<Vehicle | undefined>;
  deleteVehicle(id: string): Promise<boolean>;
  getTripsCountByVehicle(vehicleId: string): Promise<number>;

  getTrips(userId: string): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | undefined>;
  createTrip(trip: InsertTrip): Promise<Trip>;
  updateTrip(id: string, trip: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(id: string): Promise<boolean>;

  getTeslaConnection(userId: string): Promise<TeslaConnection | undefined>;
  getTeslaConnectionById(id: string): Promise<TeslaConnection | undefined>;
  getAllActiveTeslaConnections(): Promise<TeslaConnection[]>;
  createTeslaConnection(conn: InsertTeslaConnection): Promise<TeslaConnection>;
  updateTeslaConnection(id: string, data: Partial<InsertTeslaConnection>): Promise<TeslaConnection | undefined>;
  deleteTeslaConnection(id: string): Promise<boolean>;

  getGeofences(userId: string): Promise<Geofence[]>;
  getGeofence(id: string): Promise<Geofence | undefined>;
  createGeofence(geofence: InsertGeofence): Promise<Geofence>;
  updateGeofence(id: string, data: Partial<InsertGeofence>): Promise<Geofence | undefined>;
  deleteGeofence(id: string): Promise<boolean>;

  createTelemetryEvent(event: InsertTelemetryEvent): Promise<TelemetryEvent>;
  getTelemetryEvents(userId: string, since?: Date): Promise<TelemetryEvent[]>;
  getTelemetryEventsByVin(vin: string, since?: Date): Promise<TelemetryEvent[]>;
  cleanupOldTelemetryEvents(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getVehicles(userId: string): Promise<Vehicle[]> {
    return db.select().from(vehicles).where(eq(vehicles.userId, userId));
  }

  async getVehicle(id: string): Promise<Vehicle | undefined> {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    return vehicle;
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    const [created] = await db.insert(vehicles).values(vehicle).returning();
    return created;
  }

  async updateVehicle(id: string, data: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    const [updated] = await db.update(vehicles).set(data).where(eq(vehicles.id, id)).returning();
    return updated;
  }

  async deleteVehicle(id: string): Promise<boolean> {
    const [deleted] = await db.delete(vehicles).where(eq(vehicles.id, id)).returning();
    return !!deleted;
  }

  async getTripsCountByVehicle(vehicleId: string): Promise<number> {
    const [result] = await db.select({ count: count() }).from(trips).where(eq(trips.vehicleId, vehicleId));
    return result?.count || 0;
  }

  async getTrips(userId: string): Promise<Trip[]> {
    return db.select().from(trips).where(eq(trips.userId, userId)).orderBy(desc(trips.date), desc(trips.createdAt));
  }

  async getTrip(id: string): Promise<Trip | undefined> {
    const [trip] = await db.select().from(trips).where(eq(trips.id, id));
    return trip;
  }

  async createTrip(trip: InsertTrip): Promise<Trip> {
    const [created] = await db.insert(trips).values(trip).returning();

    await db.update(vehicles)
      .set({ currentOdometer: trip.endOdometer })
      .where(eq(vehicles.id, trip.vehicleId));

    return created;
  }

  async updateTrip(id: string, data: Partial<InsertTrip>): Promise<Trip | undefined> {
    const [updated] = await db.update(trips).set(data).where(eq(trips.id, id)).returning();

    if (updated && data.endOdometer) {
      await db.update(vehicles)
        .set({ currentOdometer: data.endOdometer })
        .where(eq(vehicles.id, updated.vehicleId));
    }

    return updated;
  }

  async deleteTrip(id: string): Promise<boolean> {
    const [deleted] = await db.delete(trips).where(eq(trips.id, id)).returning();
    return !!deleted;
  }

  async getTeslaConnection(userId: string): Promise<TeslaConnection | undefined> {
    const [conn] = await db.select().from(teslaConnections).where(eq(teslaConnections.userId, userId)).limit(1);
    return conn;
  }

  async getTeslaConnectionById(id: string): Promise<TeslaConnection | undefined> {
    const [conn] = await db.select().from(teslaConnections).where(eq(teslaConnections.id, id));
    return conn;
  }

  async getAllActiveTeslaConnections(): Promise<TeslaConnection[]> {
    return db.select().from(teslaConnections).where(eq(teslaConnections.isActive, true));
  }

  async createTeslaConnection(conn: InsertTeslaConnection): Promise<TeslaConnection> {
    const [created] = await db.insert(teslaConnections).values(conn).returning();
    return created;
  }

  async updateTeslaConnection(id: string, data: Partial<InsertTeslaConnection>): Promise<TeslaConnection | undefined> {
    const [updated] = await db.update(teslaConnections).set(data).where(eq(teslaConnections.id, id)).returning();
    return updated;
  }

  async deleteTeslaConnection(id: string): Promise<boolean> {
    const [deleted] = await db.delete(teslaConnections).where(eq(teslaConnections.id, id)).returning();
    return !!deleted;
  }

  async getGeofences(userId: string): Promise<Geofence[]> {
    return db.select().from(geofences).where(eq(geofences.userId, userId)).orderBy(asc(geofences.name));
  }

  async getGeofence(id: string): Promise<Geofence | undefined> {
    const [geofence] = await db.select().from(geofences).where(eq(geofences.id, id));
    return geofence;
  }

  async createGeofence(geofence: InsertGeofence): Promise<Geofence> {
    const [created] = await db.insert(geofences).values(geofence).returning();
    return created;
  }

  async updateGeofence(id: string, data: Partial<InsertGeofence>): Promise<Geofence | undefined> {
    const [updated] = await db.update(geofences).set(data).where(eq(geofences.id, id)).returning();
    return updated;
  }

  async deleteGeofence(id: string): Promise<boolean> {
    const [deleted] = await db.delete(geofences).where(eq(geofences.id, id)).returning();
    return !!deleted;
  }

  async createTelemetryEvent(event: InsertTelemetryEvent): Promise<TelemetryEvent> {
    const [created] = await db.insert(telemetryEvents).values(event).returning();
    return created;
  }

  async getTelemetryEvents(userId: string, since?: Date): Promise<TelemetryEvent[]> {
    const conditions = [eq(telemetryEvents.userId, userId)];
    if (since) conditions.push(gte(telemetryEvents.createdAt, since));
    return db.select().from(telemetryEvents)
      .where(and(...conditions))
      .orderBy(asc(telemetryEvents.createdAt))
      .limit(2000);
  }

  async getTelemetryEventsByVin(vin: string, since?: Date): Promise<TelemetryEvent[]> {
    const conditions = [eq(telemetryEvents.vin, vin)];
    if (since) conditions.push(gte(telemetryEvents.createdAt, since));
    return db.select().from(telemetryEvents)
      .where(and(...conditions))
      .orderBy(asc(telemetryEvents.createdAt))
      .limit(2000);
  }
  async cleanupOldTelemetryEvents(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const deleted = await db.delete(telemetryEvents)
      .where(lt(telemetryEvents.createdAt, cutoff))
      .returning({ id: telemetryEvents.id });
    return deleted.length;
  }
}

export const storage = new DatabaseStorage();
