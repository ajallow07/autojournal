import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, boolean, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  licensePlate: text("license_plate").notNull(),
  vin: text("vin"),
  color: text("color"),
  fuelType: text("fuel_type"),
  currentOdometer: real("current_odometer").notNull().default(0),
  batteryLevel: real("battery_level"),
  isDefault: boolean("is_default").notNull().default(false),
});

export const trips = pgTable("trips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  vehicleId: varchar("vehicle_id").notNull().references(() => vehicles.id),
  date: date("date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  startLocation: text("start_location").notNull(),
  endLocation: text("end_location").notNull(),
  startOdometer: real("start_odometer").notNull(),
  endOdometer: real("end_odometer").notNull(),
  distance: real("distance").notNull(),
  tripType: text("trip_type").notNull().default("private"),
  purpose: text("purpose"),
  notes: text("notes"),
  autoLogged: boolean("auto_logged").notNull().default(false),
  startLatitude: real("start_latitude"),
  startLongitude: real("start_longitude"),
  endLatitude: real("end_latitude"),
  endLongitude: real("end_longitude"),
  routeCoordinates: jsonb("route_coordinates"),
  routeGeometry: jsonb("route_geometry"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const teslaConnections = pgTable("tesla_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  teslaVehicleId: text("tesla_vehicle_id"),
  vin: text("vin"),
  vehicleName: text("vehicle_name"),
  isActive: boolean("is_active").notNull().default(false),
  lastPolledAt: timestamp("last_polled_at"),
  lastDriveState: text("last_drive_state"),
  lastLatitude: real("last_latitude"),
  lastLongitude: real("last_longitude"),
  lastOdometer: real("last_odometer"),
  tripInProgress: boolean("trip_in_progress").notNull().default(false),
  tripStartTime: timestamp("trip_start_time"),
  tripStartOdometer: real("trip_start_odometer"),
  tripStartLatitude: real("trip_start_latitude"),
  tripStartLongitude: real("trip_start_longitude"),
  tripStartLocation: text("trip_start_location"),
  lastShiftState: text("last_shift_state"),
  parkedSince: timestamp("parked_since"),
  routeWaypoints: jsonb("route_waypoints"),
  lastGpsAt: timestamp("last_gps_at"),
  pollState: text("poll_state").notNull().default("deep_sleep"),
  idleSince: timestamp("idle_since"),
  lastApiErrorAt: timestamp("last_api_error_at"),
  consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const geofences = pgTable("geofences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  radiusMeters: integer("radius_meters").notNull().default(200),
  tripType: text("trip_type").notNull().default("business"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const telemetryEvents = pgTable("telemetry_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  vin: text("vin").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  odometer: real("odometer"),
  speed: real("speed"),
  shiftState: text("shift_state"),
  batteryLevel: real("battery_level"),
  vehicleState: text("vehicle_state"),
  source: text("source").notNull().default("webhook"),
  rawPayload: jsonb("raw_payload"),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({ id: true });
export const insertTripSchema = createInsertSchema(trips).omit({ id: true, createdAt: true });
export const insertTeslaConnectionSchema = createInsertSchema(teslaConnections).omit({ id: true, createdAt: true });
export const insertGeofenceSchema = createInsertSchema(geofences).omit({ id: true, createdAt: true });
export const insertTelemetryEventSchema = createInsertSchema(telemetryEvents).omit({ id: true, createdAt: true });

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof trips.$inferSelect;
export type InsertTeslaConnection = z.infer<typeof insertTeslaConnectionSchema>;
export type TeslaConnection = typeof teslaConnections.$inferSelect;
export type InsertGeofence = z.infer<typeof insertGeofenceSchema>;
export type Geofence = typeof geofences.$inferSelect;
export type InsertTelemetryEvent = z.infer<typeof insertTelemetryEventSchema>;
export type TelemetryEvent = typeof telemetryEvents.$inferSelect;
