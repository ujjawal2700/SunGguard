import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { CITY_PARCEL_STATUS as S } from "../constants/cityParcelWorkflow.js";
import logger from "./logger.js";

/**
 * Push/notification copy for the City Parcel module.
 *
 * Sockets only reach an app that is open. These are the messages that have to
 * arrive when it is not — most importantly the failed-delivery prompt, which
 * carries a deadline after which the parcel returns automatically. A customer
 * who never learns their parcel failed cannot answer in time.
 */

/** Only the moments a person actually needs to hear about. */
const CUSTOMER_COPY = {
  [S.SEARCHING]: () => ({
    title: "Finding you a rider",
    body: "We're looking for a delivery partner near your pickup.",
  }),
  [S.ACCEPTED]: (p, ctx) => ({
    title: "Rider assigned",
    body: `${ctx?.riderName || "A delivery partner"} is on the way to collect your parcel.`,
  }),
  [S.PICKUP_REACHED]: () => ({
    title: "Rider is at your door",
    body: "Share your pickup code to hand the parcel over.",
  }),
  [S.PICKED_UP]: (p) => ({
    title: "Parcel collected",
    body: `On its way to ${p.receiver?.name || "the receiver"}.`,
  }),
  [S.DROP_REACHED]: (p) => ({
    title: "Almost there",
    body: `The rider has reached ${p.receiver?.name || "the receiver"}.`,
  }),
  [S.DELIVERED]: (p) => ({
    title: "Delivered",
    body: `${p.receiver?.name || "The receiver"} has your parcel.`,
  }),
  [S.RETURN_IN_TRANSIT]: () => ({
    title: "Coming back to you",
    body: "Your parcel is on its way back. You'll need your return code.",
  }),
  [S.RETURNED]: () => ({
    title: "Returned",
    body: "Your parcel is back with you.",
  }),
  [S.CANCELLED]: () => ({
    title: "Booking cancelled",
    body: "Your parcel booking was cancelled.",
  }),
};

const EVENT_FOR_STATUS = {
  [S.DELIVERED]: NOTIFICATION_EVENTS.CITY_PARCEL_DELIVERED,
  [S.RETURN_IN_TRANSIT]: NOTIFICATION_EVENTS.CITY_PARCEL_RETURN_STARTED,
  [S.RETURNED]: NOTIFICATION_EVENTS.CITY_PARCEL_RETURNED,
  [S.PICKUP_REACHED]: NOTIFICATION_EVENTS.CITY_PARCEL_PICKUP_CODE,
};

function send(eventType, payload) {
  try {
    emitNotificationEvent(eventType, payload);
  } catch (err) {
    // A parcel must never fail because a push failed.
    logger.warn("City parcel notification failed", {
      eventType,
      error: err?.message,
    });
  }
}

/** Tell the customer their parcel moved. Silent for statuses nobody cares about. */
export function notifyCustomerOfStatus(parcel, ctx = {}) {
  const build = CUSTOMER_COPY[parcel?.status];
  if (!build || !parcel?.customerId) return;

  const { title, body } = build(parcel, ctx);
  const customerId = parcel.customerId?._id || parcel.customerId;

  send(EVENT_FOR_STATUS[parcel.status] || NOTIFICATION_EVENTS.CITY_PARCEL_STATUS_UPDATE, {
    userId: customerId,
    customerId,
    cityParcelId: String(parcel._id),
    body,
    data: {
      title,
      cityParcelId: String(parcel._id),
      referenceId: parcel.referenceId,
      status: parcel.status,
      role: "customer",
      // Lets the app deep-link straight to the parcel from the push.
      route: `/parcel/local/track/${parcel._id}`,
    },
  });
}

/**
 * The one notification with a clock on it.
 *
 * The customer has a fixed window to reply before the parcel is sent back
 * automatically, so this says what happened, what they must do, and by when.
 */
export function notifyCustomerDecisionNeeded(parcel, { outcome, deadlineAt } = {}) {
  if (!parcel?.customerId) return;
  const customerId = parcel.customerId?._id || parcel.customerId;

  const why = {
    NO_ANSWER: "nobody answered",
    REFUSED: "they declined it",
    WRONG_ADDRESS: "the address didn't match",
    OTP_FAILED: "the code didn't work",
    NAME_MISMATCH: "the person there wasn't who you named",
  }[outcome] || "the handover didn't happen";

  const by = deadlineAt
    ? new Date(deadlineAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  send(NOTIFICATION_EVENTS.CITY_PARCEL_DECISION_NEEDED, {
    userId: customerId,
    customerId,
    cityParcelId: String(parcel._id),
    body: by
      ? `We couldn't deliver to ${parcel.receiver?.name || "the receiver"} — ${why}. Tell us what to do by ${by}, or we'll bring it back.`
      : `We couldn't deliver to ${parcel.receiver?.name || "the receiver"} — ${why}. Tell us what to do next.`,
    data: {
      title: "Action needed on your parcel",
      cityParcelId: String(parcel._id),
      referenceId: parcel.referenceId,
      outcome,
      deadlineAt,
      role: "customer",
      route: `/parcel/local/track/${parcel._id}`,
      urgent: true,
    },
  });
}

/** A job is open near this rider. */
export function notifyRidersOfBroadcast(parcel, deliveryIds = []) {
  if (!deliveryIds.length) return;
  send(NOTIFICATION_EVENTS.CITY_PARCEL_BROADCAST, {
    deliveryIds,
    cityParcelId: String(parcel._id),
    body: `New city delivery nearby — ${parcel.distanceKm} km, tap to accept.`,
    data: {
      title: "New city delivery",
      cityParcelId: String(parcel._id),
      referenceId: parcel.referenceId,
      role: "delivery",
      route: `/delivery/city-parcel/${parcel._id}`,
    },
  });
}

/** This rider now owns the job. */
export function notifyRiderAssigned(parcel, deliveryId) {
  if (!deliveryId) return;
  send(NOTIFICATION_EVENTS.CITY_PARCEL_ASSIGNED, {
    userId: deliveryId,
    deliveryId,
    cityParcelId: String(parcel._id),
    body: `Collect from ${parcel.pickupAddress?.fullAddress || "the pickup address"}.`,
    data: {
      title: "City delivery assigned",
      cityParcelId: String(parcel._id),
      referenceId: parcel.referenceId,
      role: "delivery",
      route: `/delivery/city-parcel/${parcel._id}`,
    },
  });
}
