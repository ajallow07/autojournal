import { db } from "./db";
import { vehicles, trips } from "@shared/schema";

export async function seedDatabase() {
  const existingVehicles = await db.select().from(vehicles);
  if (existingVehicles.length > 0) {
    return;
  }
}
