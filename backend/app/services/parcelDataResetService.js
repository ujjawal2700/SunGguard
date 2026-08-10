import Parcel from "../models/parcel.js";
import ParcelConfig from "../models/parcelConfig.js";
import ParcelReview from "../models/parcelReview.js";
import Notification from "../models/notification.js";
import Delivery from "../models/delivery.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { syncDeliveryPartnerBusyFlag } from "./deliveryBusyService.js";
import { cancelAllParcelSearchTimers } from "./parcelWorkflowService.js";

const PARCEL_NOTIFICATION_TYPES = [
  NOTIFICATION_EVENTS.PARCEL_REQUESTED,
  NOTIFICATION_EVENTS.NEW_PARCEL_BROADCAST,
  NOTIFICATION_EVENTS.PARCEL_ASSIGNED,
  NOTIFICATION_EVENTS.PARCEL_STATUS_UPDATE,
  NOTIFICATION_EVENTS.PARCEL_DELIVERED,
];

/**
 * Wipe all parcel bookings and related in-app notifications.
 * Pricing config is reset to platform defaults for a clean restart.
 */
export async function resetAllParcelData() {
  cancelAllParcelSearchTimers();

  const [parcelDelete, reviewDelete, notificationDelete] = await Promise.all([
    Parcel.deleteMany({}),
    ParcelReview.deleteMany({}),
    Notification.deleteMany({
      $or: [
        { type: { $in: PARCEL_NOTIFICATION_TYPES } },
        { "data.parcelId": { $exists: true, $ne: null } },
        { title: /parcel/i },
        { message: /parcel/i },
        { body: /parcel/i },
      ],
    }),
  ]);

  await ParcelConfig.deleteMany({});
  await ParcelConfig.getOrCreate();

  const busyRiders = await Delivery.find({ isBusy: true }).select("_id").lean();
  await Promise.all(
    busyRiders.map((rider) => syncDeliveryPartnerBusyFlag(rider._id)),
  );

  return {
    parcelsDeleted: parcelDelete.deletedCount || 0,
    reviewsDeleted: reviewDelete.deletedCount || 0,
    notificationsDeleted: notificationDelete.deletedCount || 0,
    pricingReset: true,
    ridersResynced: busyRiders.length,
  };
}
