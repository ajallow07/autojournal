import { eq, desc, asc, and, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  vehicles, trips, teslaConnections, geofences,
  type Vehicle, type InsertVehicle,
  type Trip, type InsertTrip,
  type TeslaConnection, type InsertTeslaConnection,
  type Geofence, type InsertGeofence,
} from "@shared/schema";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export interface IStorage {
  getVehicles(): Promise<Vehicle[]>;
  getVehicle(id: string): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: string, vehicle: Partial<InsertVehicle>): Promise<Vehicle | undefined>;

  getTrips(): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | undefined>;
  createTrip(trip: InsertTrip): Promise<Trip>;
  updateTrip(id: string, trip: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(id: string): Promise<boolean>;

  getTeslaConnection(): Promise<TeslaConnection | undefined>;
  createTeslaConnection(conn: InsertTeslaConnection): Promise<TeslaConnection>;
  updateTeslaConnection(id: string, data: Partial<InsertTeslaConnection>): Promise<TeslaConnection | undefined>;
  deleteTeslaConnection(id: string): Promise<boolean>;

  getGeofences(): Promise<Geofence[]>;
  getGeofence(id: string): Promise<Geofence | undefined>;
  createGeofence(geofence: InsertGeofence): Promise<Geofence>;
  updateGeofence(id: string, data: Partial<InsertGeofence>): Promise<Geofence | undefined>;
  deleteGeofence(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getVehicles(): Promise<Vehicle[]> {
    return db.select().from(vehicles);
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

  async getTrips(): Promise<Trip[]> {
    return db.select().from(trips).orderBy(desc(trips.date), desc(trips.createdAt));
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

  async getTeslaConnection(): Promise<TeslaConnection | undefined> {
    const [conn] = await db.select().from(teslaConnections).limit(1);
    return conn;
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

  async getGeofences(): Promise<Geofence[]> {
    return db.select().from(geofences).orderBy(asc(geofences.name));
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
}

export const storage = new DatabaseStorage();
