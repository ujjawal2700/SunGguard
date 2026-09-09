import mongoose from "mongoose";
import dotenv from "dotenv";
import { cleanupQuickCommerceData } from "../app/services/quickCommerceCleanupService.js";

dotenv.config();

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB (db: ${mongoose.connection.name}). Removing quick-commerce data...`);

  const report = await cleanupQuickCommerceData();

  console.log("\n=== Collections dropped ===");
  for (const row of report.droppedCollections) {
    console.log(
      `  - ${row.collection}: ${row.dropped ? `dropped (${row.documentsRemoved} docs)` : row.note}`,
    );
  }

  console.log("\n=== Customers (User, role:user) ===");
  console.log(`  before: ${report.customers.totalBefore}, kept (porter bookers): ${report.customers.kept}, deleted: ${report.customers.deleted}`);

  console.log("\n=== Delivery riders ===");
  console.log(`  before: ${report.riders.totalBefore}, kept (porter riders): ${report.riders.kept}, deleted: ${report.riders.deleted}, quick-commerce flag cleared: ${report.riders.quickCommerceFlagCleared}`);

  console.log("\n=== Sellers ===");
  console.log(`  before: ${report.sellers.totalBefore}, kept (parcel hubs): ${report.sellers.kept}, deleted: ${report.sellers.deleted}, quick-commerce flag cleared: ${report.sellers.quickCommerceFlagCleared}`);

  console.log("\n=== Orphan cleanup (rows belonging to deleted accounts only) ===");
  console.log(`  wallets: ${report.orphanCleanup.wallets}`);
  console.log(`  ledger entries: ${report.orphanCleanup.ledgerEntries}`);
  console.log(`  transactions: ${report.orphanCleanup.transactions}`);
  console.log(`  notifications: ${report.orphanCleanup.notifications}`);
  console.log(`  payouts: ${report.orphanCleanup.payouts}`);

  console.log("\nDone.");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Quick-commerce cleanup failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
