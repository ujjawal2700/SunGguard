import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const PHONE = process.argv[2] || "9999999999";

const ACTIVE_PARCEL = [
  "REQUESTED",
  "SEARCHING",
  "ACCEPTED",
  "RIDER_ASSIGNED",
  "PICKUP_REACHED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
];

const ACTIVE_RETURN = [
  "return_pickup_assigned",
  "return_in_transit",
  "return_drop_pending",
];

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const delivery = await db.collection("deliveries").findOne({
    phone: { $in: [PHONE, `+91${PHONE}`, `91${PHONE}`] },
  });

  if (!delivery) {
    console.error(`Delivery partner not found for phone ${PHONE}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const id = delivery._id;
  console.log(
    `Found: ${delivery.name || "N/A"} | ${delivery.phone} | id=${id} | isBusy=${delivery.isBusy}`,
  );

  const parcels = await db.collection("parcels").updateMany(
    { deliveryPartnerId: id, status: { $in: ACTIVE_PARCEL } },
    {
      $set: {
        status: "CANCELLED",
        deliveryPartnerId: null,
        acceptedAt: null,
      },
    },
  );

  const skipped = await db.collection("parcels").updateMany(
    { skippedBy: id },
    { $pull: { skippedBy: id } },
  );

  const orders = await db.collection("orders").updateMany(
    {
      $or: [{ deliveryBoy: id }, { deliveryPartner: id }],
      status: { $nin: ["delivered", "cancelled", "DELIVERED", "CANCELLED"] },
    },
    {
      $set: {
        deliveryBoy: null,
        deliveryPartner: null,
        status: "cancelled",
        workflowStatus: "CANCELLED",
      },
    },
  );

  const returns = await db.collection("orders").updateMany(
    {
      returnDeliveryBoy: id,
      returnStatus: { $in: ACTIVE_RETURN },
    },
    {
      $set: {
        returnDeliveryBoy: null,
        returnStatus: "return_cancelled",
      },
    },
  );

  const notifications = await db.collection("notifications").deleteMany({
    $or: [{ recipient: id }, { userId: id }],
  });

  await db.collection("deliveries").updateOne(
    { _id: id },
    { $set: { isBusy: false } },
  );

  const remainingParcels = await db.collection("parcels").countDocuments({
    deliveryPartnerId: id,
    status: { $nin: ["DELIVERED", "CANCELLED"] },
  });
  const remainingOrders = await db.collection("orders").countDocuments({
    $or: [{ deliveryBoy: id }, { deliveryPartner: id }],
    status: { $nin: ["delivered", "cancelled", "DELIVERED", "CANCELLED"] },
  });

  console.log("Cleared jobs:");
  console.log(`  parcels cancelled: ${parcels.modifiedCount}`);
  console.log(`  skippedBy cleared: ${skipped.modifiedCount}`);
  console.log(`  orders cancelled/unassigned: ${orders.modifiedCount}`);
  console.log(`  returns cleared: ${returns.modifiedCount}`);
  console.log(`  notifications deleted: ${notifications.deletedCount}`);
  console.log(`  isBusy: false`);
  console.log(`  remaining active parcels: ${remainingParcels}`);
  console.log(`  remaining active orders: ${remainingOrders}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
