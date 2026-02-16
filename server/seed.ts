import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { vehicles, trips } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const existingVehicles = await db.select().from(vehicles);
  if (existingVehicles.length > 0) {
    await pool.end();
    return;
  }

  const [vehicle] = await db.insert(vehicles).values({
    name: "Tesla Model Y",
    make: "Tesla",
    model: "Model Y",
    year: 2024,
    licensePlate: "ABC 123",
    currentOdometer: 12847,
    isDefault: true,
  }).returning();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const seedTrips = [
    {
      vehicleId: vehicle.id,
      date: `${year}-${String(month + 1).padStart(2, "0")}-03`,
      startTime: "08:15",
      endTime: "08:52",
      startLocation: "Kungsholmen, Stockholm",
      endLocation: "Kista Science Tower",
      startOdometer: 12450,
      endOdometer: 12478,
      distance: 28,
      tripType: "business" as const,
      purpose: "Client meeting at Ericsson HQ",
      notes: null,
    },
    {
      vehicleId: vehicle.id,
      date: `${year}-${String(month + 1).padStart(2, "0")}-03`,
      startTime: "17:30",
      endTime: "18:05",
      startLocation: "Kista Science Tower",
      endLocation: "Kungsholmen, Stockholm",
      startOdometer: 12478,
      endOdometer: 12506,
      distance: 28,
      tripType: "business" as const,
      purpose: "Return from client meeting",
      notes: null,
    },
    {
      vehicleId: vehicle.id,
      date: `${year}-${String(month + 1).padStart(2, "0")}-05`,
      startTime: "10:00",
      endTime: "10:25",
      startLocation: "Kungsholmen, Stockholm",
      endLocation: "Mall of Scandinavia, Solna",
      startOdometer: 12506,
      endOdometer: 12518,
      distance: 12,
      tripType: "private" as const,
      purpose: "Shopping",
      notes: null,
    },
    {
      vehicleId: vehicle.id,
      date: `${year}-${String(month + 1).padStart(2, "0")}-07`,
      startTime: "07:45",
      endTime: "09:15",
      startLocation: "Kungsholmen, Stockholm",
      endLocation: "Uppsala Universitet",
      startOdometer: 12530,
      endOdometer: 12602,
      distance: 72,
      tripType: "business" as const,
      purpose: "Workshop at Uppsala University",
      notes: "Full day workshop on AI integration",
    },
    {
      vehicleId: vehicle.id,
      date: `${year}-${String(month + 1).padStart(2, "0")}-07`,
      startTime: "17:00",
      endTime: "18:30",
      startLocation: "Uppsala Universitet",
      endLocation: "Kungsholmen, Stockholm",
      startOdometer: 12602,
      endOdometer: 12674,
      distance: 72,
      tripType: "business" as const,
      purpose: "Return from Uppsala workshop",
      notes: null,
    },
    {
      vehicleId: vehicle.id,
      date: `${year}-${String(month + 1).padStart(2, "0")}-10`,
      startTime: "09:00",
      endTime: "09:20",
      startLocation: "Kungsholmen, Stockholm",
      endLocation: "Södermalm, Götgatan",
      startOdometer: 12674,
      endOdometer: 12682,
      distance: 8,
      tripType: "private" as const,
      purpose: "Dinner reservation",
      notes: null,
    },
    {
      vehicleId: vehicle.id,
      date: `${year}-${String(month + 1).padStart(2, "0")}-12`,
      startTime: "08:00",
      endTime: "08:35",
      startLocation: "Kungsholmen, Stockholm",
      endLocation: "Nacka Strand, Offices",
      startOdometer: 12690,
      endOdometer: 12715,
      distance: 25,
      tripType: "business" as const,
      purpose: "Quarterly review at partner office",
      notes: "Q4 financial review meeting",
    },
    {
      vehicleId: vehicle.id,
      date: `${year}-${String(month + 1).padStart(2, "0")}-14`,
      startTime: "14:00",
      endTime: "15:45",
      startLocation: "Kungsholmen, Stockholm",
      endLocation: "Arlanda Airport (ARN)",
      startOdometer: 12740,
      endOdometer: 12787,
      distance: 47,
      tripType: "business" as const,
      purpose: "Airport pickup - visiting consultant",
      notes: null,
    },
    {
      vehicleId: vehicle.id,
      date: `${year}-${String(month + 1).padStart(2, "0")}-15`,
      startTime: "11:00",
      endTime: "11:45",
      startLocation: "Kungsholmen, Stockholm",
      endLocation: "IKEA Kungens Kurva",
      startOdometer: 12800,
      endOdometer: 12825,
      distance: 25,
      tripType: "private" as const,
      purpose: "Home furnishing shopping",
      notes: null,
    },
    {
      vehicleId: vehicle.id,
      date: `${year}-${String(month + 1).padStart(2, "0")}-16`,
      startTime: "08:30",
      endTime: "08:50",
      startLocation: "Kungsholmen, Stockholm",
      endLocation: "Östermalm, Stureplan",
      startOdometer: 12825,
      endOdometer: 12847,
      distance: 22,
      tripType: "business" as const,
      purpose: "Investor meeting",
      notes: "Series B discussion",
    },
  ];

  await db.insert(trips).values(seedTrips);
  await pool.end();
}
