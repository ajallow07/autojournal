import { reconstructTripsFromTelemetry } from "../server/teslemetry";

const USER_ID = "2d2d8770-6922-4910-a658-d7243f2b7902";
const VIN = "XP7YGCEK2RB503164";

async function main() {
  console.log("Running trip reconstruction...");
  const result = await reconstructTripsFromTelemetry(USER_ID, VIN, 48);
  console.log("\n=== RESULT ===");
  console.log(`Trips created: ${result.tripsCreated}`);
  console.log("\nDetails:");
  result.details.forEach(d => console.log(`  - ${d}`));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
