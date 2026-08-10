/**
 * Emits Socket.IO events for order workflow. Safe if socket not initialized.
 */

import mongoose from "mongoose";
import Notification from "../models/notification.js";
import Delivery from "../models/delivery.js";
import {
  getDeliveryPartnerIdsWithinSellerRadius,
  getDeliveryPartnerIdsWithinCustomerRadius,
  getParcelRiderIdsNearPickup,
} from "./deliveryNearbyService.js";
import { getParcelSellerIdsNearPickup } from "./sellerNearbyService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";

let _getIo = null;

export function registerOrderSocketGetter(fn) {
  _getIo = fn;
}

function getIo() {
  try {
    return _getIo ? _getIo() : null;
  } catch {
    return null;
  }
}

function normalizeSellerId(sellerId) {
  if (sellerId == null) return null;
  if (typeof sellerId === "object" && sellerId._id) {
    return sellerId._id.toString();
  }
  return String(sellerId);
}

function normalizeDeliveryId(deliveryId) {
  if (deliveryId == null) return null;
  if (typeof deliveryId === "object" && deliveryId._id) {
    return deliveryId._id.toString();
  }
  return String(deliveryId);
}

/**
 * Emit workflow status to the order room (clients that joined `join_order`)
 * and optionally to the customer’s personal room so the app updates even before
 * opening order details (e.g. checkout success overlay).
 */
export function emitOrderStatusUpdate(orderId, payload, customerId) {
  const s = getIo();
  if (!s) return;
  const body = {
    orderId,
    ...payload,
    at: new Date().toISOString(),
  };
  s.to(`order:${orderId}`).emit("order:status:update", body);
  const cid =
    customerId != null &&
    typeof customerId === "object" &&
    typeof customerId.toString === "function"
      ? customerId.toString()
      : customerId;
  if (cid) {
    s.to(`customer:${cid}`).emit("order:status:update", body);
  }
}

export function emitToSeller(sellerId, { event, payload }) {
  const s = getIo();
  if (!s || !sellerId) return;
  s.to(`seller:${sellerId}`).emit(event, payload);
}

export function emitToDelivery(deliveryId, { event, payload }) {
  const s = getIo();
  const id = normalizeDeliveryId(deliveryId);
  if (!s || !id) return;
  s.to(`delivery:${id}`).emit(event, payload);
}

/**
 * Emit a custom event to a single admin's per-admin room
 * (joined as `admin:<userId>` in socketManager.js). Used for
 * `notification:new` deltas that should only wake up the specific
 * admin who owns the Notification row.
 */
export function emitToAdmin(adminId, { event, payload }) {
  const s = getIo();
  if (!s || !adminId || !event) return;
  const id =
    adminId && typeof adminId === "object" && typeof adminId.toString === "function"
      ? adminId.toString()
      : String(adminId);
  s.to(`admin:${id}`).emit(event, payload);
}

export function emitToAdmins(event, payload) {
  const s = getIo();
  if (!s || !event) return;
  s.to("admin:orders").emit(event, payload);
}

/** Notify parcel hub sellers whose service radius covers the pickup location. */
export async function emitParcelNewToNearbySellers(parcel) {
  const lat = Number(parcel?.pickupAddress?.lat);
  const lng = Number(parcel?.pickupAddress?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const sellerIds = await getParcelSellerIdsNearPickup(lat, lng);
  if (!sellerIds.length) return;

  const s = getIo();
  if (!s) return;

  const payload =
    parcel && typeof parcel.toObject === "function" ? parcel.toObject() : parcel;

  for (const sellerId of sellerIds) {
    s.to(`seller:${sellerId}`).emit("parcel:new", payload);
  }
}

/**
 * Emit a custom event to everyone who has joined the order room
 * (via `join_order`). Used for events that aren't pure workflow
 * status updates — e.g. `delivery:otp:validated`, `delivery:otp:generated`.
 */
export function emitToOrder(orderId, { event, payload }) {
  const s = getIo();
  if (!s || !orderId || !event) return;
  s.to(`order:${orderId}`).emit(event, payload);
}

/**
 * Notify only delivery partners whose live location is within the seller's
 * service radius (see Delivery model location + Seller.serviceRadius).
 */
export async function emitDeliveryBroadcastForSeller(sellerId, payload) {
  const s = getIo();
  const sid = normalizeSellerId(sellerId);
  if (!sid) return;

  const ids = await getDeliveryPartnerIdsWithinSellerRadius(sid);
  if (!ids.length) {
    if (process.env.NODE_ENV !== "production" && s) {
      s.to("delivery:online").emit("delivery:broadcast", {
        ...payload,
        at: new Date().toISOString(),
        _devFallback: true,
      });
    }
    return;
  }

  const body = { ...payload, at: new Date().toISOString() };

  if (s) {
    for (const id of ids) {
      s.to(`delivery:${id}`).emit("delivery:broadcast", body);
    }
  }

  // Trigger Push Notifications for nearby riders
  if (ids.length > 0 && !payload.retryAttempt) {
    emitNotificationEvent(NOTIFICATION_EVENTS.NEW_DELIVERY_BROADCAST, {
      orderId: payload.orderId,
      deliveryIds: ids,
    });
  }

  // Avoid duplicate DB rows when delivery search retries with wider ring
  if (!payload.retryAttempt) {
    try {
      await Notification.insertMany(
        ids.map((id) => ({
          recipient: new mongoose.Types.ObjectId(id),
          recipientModel: "Delivery",
          title: "New delivery order",
          message: `Order ${payload.orderId} — tap Accept on the alert or open this list.`,
          type: "order",
          data: {
            orderId: payload.orderId,
            preview: payload.preview || null,
            deliverySearchExpiresAt: payload.deliverySearchExpiresAt || null,
          },
        })),
        { ordered: false },
      );
    } catch (e) {
      console.warn("[emitDeliveryBroadcastForSeller] notifications", e.message);
    }
  }
}

/**
 * Retract an order request from every delivery partner except the winner.
 * This clears stale push/in-app notifications and closes any open popup.
 */
export async function retractDeliveryBroadcastForOrder(orderId, winnerDeliveryId) {
  const s = getIo();
  const winnerId = normalizeDeliveryId(winnerDeliveryId);
  const winnerObjectId =
    winnerId && mongoose.Types.ObjectId.isValid(winnerId)
      ? new mongoose.Types.ObjectId(winnerId)
      : null;

  try {
    const query = {
      recipientModel: "Delivery",
      type: "order",
      "data.orderId": orderId,
    };

    if (winnerObjectId) {
      query.recipient = { $ne: winnerObjectId };
    }

    const notifications = await Notification.find(query)
      .select("_id recipient")
      .lean();

    if (!notifications.length) {
      if (s) {
        s.to("delivery:online").emit("delivery:broadcast:withdrawn", {
          orderId,
          winnerDeliveryId: winnerId,
          at: new Date().toISOString(),
        });
      }
      return { removedCount: 0 };
    }

    const recipientIds = [
      ...new Set(
        notifications
          .map((n) => n.recipient?.toString?.() || String(n.recipient || ""))
          .filter(Boolean),
      ),
    ];

    if (s) {
      for (const recipientId of recipientIds) {
        s.to(`delivery:${recipientId}`).emit("delivery:broadcast:withdrawn", {
          orderId,
          winnerDeliveryId: winnerId,
          at: new Date().toISOString(),
        });
      }
    }

    await Notification.deleteMany({
      recipientModel: "Delivery",
      type: "order",
      "data.orderId": orderId,
      ...(winnerObjectId ? { recipient: { $ne: winnerObjectId } } : {}),
    });

    return { removedCount: notifications.length };
  } catch (error) {
    console.warn(
      "[retractDeliveryBroadcastForOrder] failed",
      orderId,
      error.message,
    );
    return { removedCount: 0 };
  }
}

/** Broadcast to all sockets in delivery:online (legacy / dev only). */
export function emitDeliveryBroadcast(payload) {
  const s = getIo();
  if (!s) return;
  s.to("delivery:online").emit("delivery:broadcast", {
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitToCustomer(customerId, { event, payload }) {
  const s = getIo();
  if (!s || !customerId) return;
  s.to(`customer:${customerId}`).emit(event, payload);
}

/**
 * Notify delivery partners near a CUSTOMER for return pickups.
 * Sends both Socket events (for open app) and Push (for background).
 */
export async function emitReturnBroadcastForCustomer(customerLocation, payload) {
  const s = getIo();
  if (!customerLocation) return;

  const ids = await getDeliveryPartnerIdsWithinCustomerRadius(customerLocation);
  if (!ids.length) {
    if (process.env.NODE_ENV !== "production" && s) {
      s.to("delivery:online").emit("delivery:broadcast", { ...payload, at: new Date().toISOString() });
    }
    return;
  }

  const body = { ...payload, at: new Date().toISOString() };

  if (s) {
    for (const id of ids) {
      s.to(`delivery:${id}`).emit("delivery:broadcast", body);
    }
  }

  // Send Push Notification
  emitNotificationEvent(NOTIFICATION_EVENTS.NEW_RETURN_BROADCAST, {
    orderId: payload.orderId,
    deliveryIds: ids,
  });

  // DB Sync for in-app notification list
  try {
    await Notification.insertMany(
      ids.map((id) => ({
        recipient: new mongoose.Types.ObjectId(id),
        recipientModel: "Delivery",
        title: "New Return Pickup Task",
        message: `Return pickup ${payload.orderId} nearby — tap to Accept.`,
        type: "order",
        data: {
          orderId: payload.orderId,
          type: "RETURN_PICKUP",
          preview: payload.preview || null,
        },
      })),
      { ordered: false }
    );
  } catch (err) {
    console.warn("[emitReturnBroadcastForCustomer] DB error", err.message);
  }
}

/**
 * Broadcast a parcel pickup offer to every eligible parcel/both rider
 * inside the configured search radius (first accept wins).
 */
export async function emitParcelBroadcast(lat, lng, radiusKm, payload) {
  const s = getIo();
  // Parcel-only + "both" riders (isParcelService: true), online, verified.
  let ids = await getParcelRiderIdsNearPickup(lat, lng, radiusKm);

  if (!ids.length) {
    return { ids: [] };
  }

  // De-dupe in case of any overlap.
  ids = [...new Set(ids.map((id) => String(id)))];

  const body = {
    ...payload,
    at: new Date().toISOString(),
  };

  if (s) {
    for (const id of ids) {
      s.to(`delivery:${id}`).emit("parcel:broadcast", body);
    }
  }

  if (!payload.retryAttempt) {
    emitNotificationEvent(NOTIFICATION_EVENTS.NEW_PARCEL_BROADCAST, {
      parcelId: payload.parcelId,
      deliveryIds: ids,
    });

    try {
      await Notification.insertMany(
        ids.map((id) => ({
          recipient: new mongoose.Types.ObjectId(id),
          recipientModel: "Delivery",
          title: "New parcel delivery",
          message: `Parcel #${String(payload.parcelId || "").slice(-6)} nearby — tap Accept on the alert.`,
          type: "parcel",
          data: {
            parcelId: payload.parcelId,
            preview: payload.preview || null,
            searchExpiresAt: payload.searchExpiresAt || null,
          },
        })),
        { ordered: false },
      );
    } catch (e) {
      console.warn("[emitParcelBroadcast] notifications", e.message);
    }
  }

  return { ids };
}

/**
 * Retract a parcel offer from losing riders after first-wins accept.
 */
export async function retractParcelBroadcast(parcelId, winnerDeliveryId) {
  const s = getIo();
  const winnerId = normalizeDeliveryId(winnerDeliveryId);
  const winnerObjectId =
    winnerId && mongoose.Types.ObjectId.isValid(winnerId)
      ? new mongoose.Types.ObjectId(winnerId)
      : null;

  try {
    const query = {
      recipientModel: "Delivery",
      type: "parcel",
      "data.parcelId": String(parcelId),
    };

    if (winnerObjectId) {
      query.recipient = { $ne: winnerObjectId };
    }

    const notifications = await Notification.find(query)
      .select("_id recipient")
      .lean();

    if (!notifications.length) {
      if (s) {
        s.to("delivery:online").emit("parcel:broadcast:withdrawn", {
          parcelId: String(parcelId),
          winnerDeliveryId: winnerId,
          at: new Date().toISOString(),
        });
      }
      return { removedCount: 0 };
    }

    const recipientIds = [
      ...new Set(
        notifications
          .map((n) => n.recipient?.toString?.() || String(n.recipient || ""))
          .filter(Boolean),
      ),
    ];

    if (s) {
      for (const recipientId of recipientIds) {
        s.to(`delivery:${recipientId}`).emit("parcel:broadcast:withdrawn", {
          parcelId: String(parcelId),
          winnerDeliveryId: winnerId,
          at: new Date().toISOString(),
        });
      }
    }

    await Notification.deleteMany({
      recipientModel: "Delivery",
      type: "parcel",
      "data.parcelId": String(parcelId),
      ...(winnerObjectId ? { recipient: { $ne: winnerObjectId } } : {}),
    });

    return { removedCount: notifications.length };
  } catch (error) {
    console.warn("[retractParcelBroadcast] failed", parcelId, error.message);
    return { removedCount: 0 };
  }
}
