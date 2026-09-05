import mongoose from "mongoose";
import CityParcel from "../models/cityParcel.js";
import CityParcelOtp from "../models/cityParcelOtp.js";
import CityParcelEvent from "../models/cityParcelEvent.js";
import Parcel from "../models/parcel.js";
import Order from "../models/order.js";
import Delivery from "../models/delivery.js";
import DeliveryAssignment from "../models/deliveryAssignment.js";
import Notification from "../models/notification.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { cancelAllParcelSearchTimers } from "./parcelWorkflowService.js";
import { syncDeliveryPartnerBusyFlag } from "./deliveryBusyService.js";
import {
  CITY_PARCEL_TERMINAL_STATUSES,
  CITY_PARCEL_STATUS,
} from "../constants/cityParcelWorkflow.js";

const ACTIVE_CITY_PARCEL_STATUSES = [
  CITY_PARCEL_STATUS.REQUESTED,
  CITY_PARCEL_STATUS.SEARCHING,
  CITY_PARCEL_STATUS.ACCEPTED,
  CITY_PARCEL_STATUS.RIDER_ASSIGNED,
  CITY_PARCEL_STATUS.PICKUP_REACHED,
  CITY_PARCEL_STATUS.PICKED_UP,
  CITY_PARCEL_STATUS.AT_WAYPOINT,
  CITY_PARCEL_STATUS.OUT_FOR_DELIVERY,
  CITY_PARCEL_STATUS.DROP_REACHED,
  CITY_PARCEL_STATUS.DELIVERY_FAILED,
  CITY_PARCEL_STATUS.RETURN_IN_TRANSIT,
];

const ACTIVE_PARCEL_STATUSES = [
  "REQUESTED",
  "SEARCHING",
  "ACCEPTED",
  "RIDER_ASSIGNED",
  "PICKUP_REACHED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
];

const ACTIVE_RETURN_STATUSES = [
  "return_pickup_assigned",
  "return_in_transit",
  "return_drop_pending",
];

const BOOKING_NOTIFICATION_TYPES = [
  // City Parcel
  NOTIFICATION_EVENTS.CITY_PARCEL_BROADCAST,
  NOTIFICATION_EVENTS.CITY_PARCEL_ASSIGNED,
  NOTIFICATION_EVENTS.CITY_PARCEL_STATUS_UPDATE,
  NOTIFICATION_EVENTS.CITY_PARCEL_PICKUP_CODE,
  NOTIFICATION_EVENTS.CITY_PARCEL_DELIVERED,
  NOTIFICATION_EVENTS.CITY_PARCEL_DECISION_NEEDED,
  NOTIFICATION_EVENTS.CITY_PARCEL_RETURN_STARTED,
  NOTIFICATION_EVENTS.CITY_PARCEL_RETURNED,
  // Outstation / standard parcel
  NOTIFICATION_EVENTS.PARCEL_REQUESTED,
  NOTIFICATION_EVENTS.NEW_PARCEL_BROADCAST,
  NOTIFICATION_EVENTS.PARCEL_ASSIGNED,
  NOTIFICATION_EVENTS.PARCEL_STATUS_UPDATE,
  NOTIFICATION_EVENTS.PARCEL_DELIVERED,
  // Delivery broadcasts / assignments
  NOTIFICATION_EVENTS.DELIVERY_ASSIGNED,
  NOTIFICATION_EVENTS.NEW_DELIVERY_BROADCAST,
  NOTIFICATION_EVENTS.NEW_RETURN_BROADCAST,
];

/**
 * Reset existing bookings across CityParcel, Parcel, and Quick-Commerce Orders,
 * and free all riders (or a specific rider by phone) so fresh bookings can be tested.
 *
 * @param {Object} options
 * @param {boolean} [options.wipe=false] - If true, permanently delete parcel/city parcel bookings.
 * @param {string} [options.phone=null] - Specific rider phone to reset. If omitted, resets all riders.
 * @param {boolean} [options.makeReady=true] - Ensure riders are online, verified, and have parcel & QC flags enabled.
 * @param {[number, number]} [options.coordinates=null] - [lng, lat] GeoJSON coordinates to assign to riders.
 * @returns {Promise<Object>} Summary of reset operations.
 */
export async function resetBookingsAndFreeRiders(options = {}) {
  const {
    wipe = false,
    phone = null,
    makeReady = true,
    coordinates = null,
  } = options;

  const summary = {
    cityParcelsCancelled: 0,
    cityParcelsDeleted: 0,
    cityParcelSkipsCleared: 0,
    parcelsCancelled: 0,
    parcelsDeleted: 0,
    parcelSkipsCleared: 0,
    ordersUnassigned: 0,
    assignmentsCancelled: 0,
    notificationsDeleted: 0,
    otpsDeleted: 0,
    eventsDeleted: 0,
    ridersUpdated: 0,
    riders: [],
  };

  // 1. Cancel in-memory parcel search timers
  try {
    cancelAllParcelSearchTimers();
  } catch (err) {
    // Ignore in case timer map is empty or uninitialized
  }

  // 2. Reset / Wipe City Parcel bookings
  if (wipe) {
    const cpDel = await CityParcel.deleteMany({});
    summary.cityParcelsDeleted = cpDel.deletedCount || 0;

    const otpDel = await CityParcelOtp.deleteMany({});
    summary.otpsDeleted = otpDel.deletedCount || 0;

    const evDel = await CityParcelEvent.deleteMany({});
    summary.eventsDeleted = evDel.deletedCount || 0;
  } else {
    // Cancel active city parcels and release riders
    const cpUpdate = await CityParcel.updateMany(
      { status: { $in: ACTIVE_CITY_PARCEL_STATUSES } },
      {
        $set: {
          status: CITY_PARCEL_STATUS.CANCELLED,
          deliveryPartnerId: null,
          acceptedAt: null,
          searchExpiresAt: null,
        },
      },
    );
    summary.cityParcelsCancelled = cpUpdate.modifiedCount || 0;

    // Clear skippedBy across all city parcels so riders aren't blocked from seeing fresh bookings
    const cpSkips = await CityParcel.updateMany(
      { "skippedBy.0": { $exists: true } },
      { $set: { skippedBy: [] } },
    );
    summary.cityParcelSkipsCleared = cpSkips.modifiedCount || 0;
  }

  // 3. Reset / Wipe Outstation / Pickup Parcels
  if (wipe) {
    const pDel = await Parcel.deleteMany({});
    summary.parcelsDeleted = pDel.deletedCount || 0;
  } else {
    const pUpdate = await Parcel.updateMany(
      { status: { $in: ACTIVE_PARCEL_STATUSES } },
      {
        $set: {
          status: "CANCELLED",
          deliveryPartnerId: null,
          acceptedAt: null,
          searchExpiresAt: null,
        },
      },
    );
    summary.parcelsCancelled = pUpdate.modifiedCount || 0;

    const pSkips = await Parcel.updateMany(
      { "skippedBy.0": { $exists: true } },
      { $set: { skippedBy: [] } },
    );
    summary.parcelSkipsCleared = pSkips.modifiedCount || 0;
  }

  // 4. Unassign / Cancel Quick-Commerce Orders with riders
  const orderUpdate = await Order.updateMany(
    {
      $or: [
        { deliveryBoy: { $exists: true, $ne: null } },
        { deliveryPartner: { $exists: true, $ne: null } },
        { returnDeliveryBoy: { $exists: true, $ne: null } },
        { returnStatus: { $in: ACTIVE_RETURN_STATUSES } },
      ],
      status: { $nin: ["delivered", "cancelled", "DELIVERED", "CANCELLED"] },
    },
    {
      $set: {
        deliveryBoy: null,
        deliveryPartner: null,
        returnDeliveryBoy: null,
        status: "cancelled",
        workflowStatus: "CANCELLED",
        returnStatus: "return_cancelled",
      },
    },
  );
  summary.ordersUnassigned = orderUpdate.modifiedCount || 0;

  // 5. Cancel active DeliveryAssignments
  const assignmentUpdate = await DeliveryAssignment.updateMany(
    { status: { $in: ["broadcasting", "assigned"] } },
    { $set: { status: "cancelled" } },
  );
  summary.assignmentsCancelled = assignmentUpdate.modifiedCount || 0;

  // 6. Delete broadcast & booking notifications
  const notifDel = await Notification.deleteMany({
    $or: [
      { type: { $in: BOOKING_NOTIFICATION_TYPES } },
      { "data.parcelId": { $exists: true, $ne: null } },
      { "data.cityParcelId": { $exists: true, $ne: null } },
      { "data.orderId": { $exists: true, $ne: null } },
      { title: /parcel|broadcast|order assigned/i },
      { message: /parcel|broadcast|order assigned/i },
    ],
  });
  summary.notificationsDeleted = notifDel.deletedCount || 0;

  // 7. Free and configure Riders
  const riderFilter = {};
  if (phone) {
    const rawPhone = String(phone).replace(/\D/g, "");
    riderFilter.phone = {
      $in: [phone, rawPhone, `+91${rawPhone}`, `91${rawPhone}`],
    };
  }

  const riderUpdateFields = {
    isBusy: false,
  };

  if (makeReady) {
    riderUpdateFields.isOnline = true;
    riderUpdateFields.isVerified = true;
    riderUpdateFields.isParcelService = true;
    riderUpdateFields.isQuickCommerceService = true;
  }

  if (Array.isArray(coordinates) && coordinates.length === 2) {
    riderUpdateFields.location = {
      type: "Point",
      coordinates: [Number(coordinates[0]), Number(coordinates[1])],
    };
    riderUpdateFields.lastLocationAt = new Date();
  }

  const riderUpdateResult = await Delivery.updateMany(
    riderFilter,
    { $set: riderUpdateFields },
  );
  summary.ridersUpdated = riderUpdateResult.modifiedCount || 0;

  // Fetch updated rider documents for verification report
  const allRiders = await Delivery.find(riderFilter).lean();

  summary.riders = allRiders.map((r) => {
    const coords = r.location?.coordinates || [0, 0];
    const [lng, lat] = coords;
    const hasValidLocation =
      Array.isArray(coords) &&
      coords.length >= 2 &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      (Math.abs(lat) > 1e-5 || Math.abs(lng) > 1e-5);

    const issues = [];
    if (!r.isOnline) issues.push("Rider is OFFLINE (needs isOnline: true)");
    if (!r.isVerified) issues.push("Rider is UNVERIFIED (needs isVerified: true)");
    if (!r.isParcelService) issues.push("Parcel service disabled (needs isParcelService: true)");
    if (r.isBusy) issues.push("Rider is marked BUSY");
    if (!hasValidLocation) issues.push("Location coordinates are [0, 0] or unset");

    return {
      id: String(r._id),
      name: r.name || "N/A",
      phone: r.phone || "N/A",
      isOnline: Boolean(r.isOnline),
      isBusy: Boolean(r.isBusy),
      isVerified: Boolean(r.isVerified),
      isParcelService: Boolean(r.isParcelService),
      isQuickCommerceService: Boolean(r.isQuickCommerceService),
      coordinates: coords,
      readyForTesting: issues.length === 0,
      issues,
    };
  });

  return summary;
}
