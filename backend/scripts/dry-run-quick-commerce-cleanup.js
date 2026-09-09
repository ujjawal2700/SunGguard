import mongoose from "mongoose";
import dotenv from "dotenv";
import Parcel from "../app/models/parcel.js";
import CityParcel from "../app/models/cityParcel.js";
import Customer from "../app/models/customer.js";
import Delivery from "../app/models/delivery.js";
import Seller from "../app/models/seller.js";

dotenv.config();

const PURE_QUICK_COMMERCE_COLLECTIONS = [
  "product", "category", "cart", "wishlist", "order", "orderOtp", "review",
  "sellerMetrics", "coupon", "checkoutGroup", "offer", "offerSection",
  "experienceSection", "heroConfig", "stockHistory", "searchIndexFailure",
  "deliveryAssignment", "dashboardStats",
];

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB (db: ${mongoose.connection.name}). DRY RUN — nothing will be deleted.\n`);

  console.log("=== Collections that would be dropped entirely ===");
  for (const modelPath of PURE_QUICK_COMMERCE_COLLECTIONS) {
    const { default: Model } = await import(`../app/models/${modelPath}.js`);
    let count = "?";
    try {
      count = await Model.estimatedDocumentCount();
    } catch {
      count = 0;
    }
    console.log(`  - ${Model.collection.name}: ${count} docs`);
  }

  const [
    parcelCustomerIds,
    cityCustomerIds,
    parcelRiderIds,
    cityRiderIds,
    parcelServiceRiderIds,
    parcelSellerIds,
    parcelServiceSellerIds,
  ] = await Promise.all([
    Parcel.distinct("customerId"),
    CityParcel.distinct("customerId"),
    Parcel.distinct("deliveryPartnerId"),
    CityParcel.distinct("deliveryPartnerId"),
    Delivery.distinct("_id", { isParcelService: true }),
    Parcel.distinct("sellerId"),
    Seller.distinct("_id", { isParcelService: true }),
  ]);

  const keepCustomerIds = new Set([...parcelCustomerIds, ...cityCustomerIds].filter(Boolean).map(String));
  const keepRiderIds = new Set(
    [...parcelRiderIds, ...cityRiderIds, ...parcelServiceRiderIds].filter(Boolean).map(String),
  );
  const keepSellerIds = new Set([...parcelSellerIds, ...parcelServiceSellerIds].filter(Boolean).map(String));

  const allCustomerIds = (await Customer.find({ role: "user" }).distinct("_id")).map(String);
  const allRiderIds = (await Delivery.find({}).distinct("_id")).map(String);
  const allSellerIds = (await Seller.find({}).distinct("_id")).map(String);

  const otherRoleCustomers = await Customer.countDocuments({ role: { $ne: "user" } });

  console.log("\n=== Customers (User collection, role:user) ===");
  console.log(`  total: ${allCustomerIds.length}`);
  console.log(`  would KEEP (booked porter): ${keepCustomerIds.size}`);
  console.log(`  would DELETE: ${allCustomerIds.length - keepCustomerIds.size}`);
  console.log(`  other-role docs in same collection (never touched): ${otherRoleCustomers}`);

  console.log("\n=== Delivery riders ===");
  console.log(`  total: ${allRiderIds.length}`);
  console.log(`  would KEEP (porter riders): ${keepRiderIds.size}`);
  console.log(`  would DELETE: ${allRiderIds.length - keepRiderIds.size}`);

  console.log("\n=== Sellers ===");
  console.log(`  total: ${allSellerIds.length}`);
  console.log(`  would KEEP (parcel hubs): ${keepSellerIds.size}`);
  console.log(`  would DELETE: ${allSellerIds.length - keepSellerIds.size}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Dry run failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
