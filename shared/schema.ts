import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  licensePlate: text("license_plate").notNull(),
  currentOdometer: real("current_odometer").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
});

export const trips = pgTable("trips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({ id: true });
export const insertTripSchema = createInsertSchema(trips).omit({ id: true, createdAt: true });

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof trips.$inferSelect;
