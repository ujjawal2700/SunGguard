import mongoose from "mongoose";
import dotenv from "dotenv";
import { resetAllParcelData } from "../app/services/parcelDataResetService.js";

dotenv.config();

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB. Wiping parcel app data...");

  const summary = await resetAllParcelData();

  console.log("Parcel reset complete:");
  console.log(`  - parcels deleted: ${summary.parcelsDeleted}`);
  console.log(`  - notifications deleted: ${summary.notificationsDeleted}`);
  console.log(`  - pricing reset: ${summary.pricingReset ? "yes" : "no"}`);
  console.log(`  - busy riders resynced: ${summary.ridersResynced}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Parcel reset failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
