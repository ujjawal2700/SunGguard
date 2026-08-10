import mongoose from "mongoose";
import Delivery from "../models/delivery.js";
import Order from "../models/order.js";
import Parcel from "../models/parcel.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";

const ACTIVE_WORKFLOW = [
  WORKFLOW_STATUS.DELIVERY_ASSIGNED,
  WORKFLOW_STATUS.PICKUP_READY,
  WORKFLOW_STATUS.OUT_FOR_DELIVERY,
];

const ACTIVE_LEGACY = ["confirmed", "packed", "out_for_delivery"];

const ACTIVE_RETURN = [
  "return_pickup_assigned",
  "return_in_transit",
  "return_drop_pending",
];

const ACTIVE_PARCEL = [
  "ACCEPTED",
  "RIDER_ASSIGNED",
  "PICKUP_REACHED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
];

function toOid(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  return new mongoose.Types.ObjectId(String(id));
}

export async function markDeliveryPartnerBusy(deliveryId) {
  const oid = toOid(deliveryId);
  if (!oid) return;
  await Delivery.findByIdAndUpdate(oid, { $set: { isBusy: true } });
}

export async function clearDeliveryPartnerBusy(deliveryId) {
  const oid = toOid(deliveryId);
  if (!oid) return;
  await Delivery.findByIdAndUpdate(oid, { $set: { isBusy: false } });
}

export async function deliveryPartnerHasActiveJob(deliveryId) {
  const oid = toOid(deliveryId);
  if (!oid) return false;

  const [order, ret, parcel] = await Promise.all([
    Order.exists({
      deliveryBoy: oid,
      $or: [
        {
          workflowVersion: { $gte: 2 },
          workflowStatus: { $in: ACTIVE_WORKFLOW },
        },
        {
          $or: [
            { workflowVersion: { $exists: false } },
            { workflowVersion: { $lt: 2 } },
          ],
          status: { $in: ACTIVE_LEGACY },
        },
      ],
    }),
    Order.exists({
      returnDeliveryBoy: oid,
      returnStatus: { $in: ACTIVE_RETURN },
    }),
    Parcel.exists({
      deliveryPartnerId: oid,
      status: { $in: ACTIVE_PARCEL },
    }),
  ]);

  return Boolean(order || ret || parcel);
}

export async function syncDeliveryPartnerBusyFlag(deliveryId) {
  const busy = await deliveryPartnerHasActiveJob(deliveryId);
  const oid = toOid(deliveryId);
  if (!oid) return busy;
  await Delivery.findByIdAndUpdate(oid, { $set: { isBusy: busy } });
  return busy;
}
