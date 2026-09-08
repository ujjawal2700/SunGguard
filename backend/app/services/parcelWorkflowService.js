import mongoose from "mongoose";
import Parcel from "../models/parcel.js";
import ParcelConfig from "../models/parcelConfig.js";
import Delivery from "../models/delivery.js";
import Warehouse from "../models/warehouse.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { getParcelRiderIdsNearPickup } from "./deliveryNearbyService.js";
import {
  emitParcelBroadcast,
  retractParcelBroadcast,
  emitToDelivery,
  emitToCustomer,
  emitToAdmins,
  emitToSeller,
} from "./orderSocketEmitter.js";
import { findNearestParcelSellerNearPickup, getApprovedParcelSeller } from "./sellerNearbyService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { getRedisClient } from "../config/redis.js";
import {
  deliveryPartnerHasActiveJob,
  markDeliveryPartnerBusy,
} from "./deliveryBusyService.js";

async function assertRiderWithinPickupRadius(deliveryOid, parcelId) {
  const [rider, parcel, settings] = await Promise.all([
    Delivery.findById(deliveryOid).select("location").lean(),
    Parcel.findById(parcelId).select("pickupAddress").lean(),
    ParcelConfig.getSearchSettings(),
  ]);

  const pickupLat = Number(parcel?.pickupAddress?.lat);
  const pickupLng = Number(parcel?.pickupAddress?.lng);
  const coords = rider?.location?.coordinates;

  if (
    !parcel ||
    !Array.isArray(coords) ||
    coords.length < 2 ||
    !Number.isFinite(pickupLat) ||
    !Number.isFinite(pickupLng)
  ) {
    const err = new Error("Pickup or rider location is unavailable");
    err.statusCode = 400;
    throw err;
  }

  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const err = new Error("Rider location is unavailable");
    err.statusCode = 400;
    throw err;
  }

  const radiusKm = settings.baseSearchRadiusKm;
  if (distanceMeters(pickupLat, pickupLng, lat, lng) > radiusKm * 1000) {
    const err = new Error(
      `You must be within ${radiusKm} km of the pickup location to accept this parcel`,
    );
    err.statusCode = 403;
    throw err;
  }
}

const DEFAULT_PARCEL_SEARCH_TIMEOUT_MS = () =>
  parseInt(process.env.PARCEL_SEARCH_TIMEOUT_MS || "60000", 10);
const PARCEL_SEARCH_MAX_ATTEMPTS = () =>
  parseInt(process.env.PARCEL_SEARCH_MAX_ATTEMPTS || "3", 10);

function clampPercent(value, fallback = 80) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Rider payout = % of base fare + % of distance fare (weight charge excluded).
 * Accepts either a parcel doc or explicit breakdown numbers.
 */
export function computeRiderParcelEarnings(parcelOrFare, settingsOrPercent = 80) {
  // Legacy call: computeRiderParcelEarnings(totalFare, 80)
  if (typeof parcelOrFare === "number") {
    const share = clampPercent(settingsOrPercent, 80) / 100;
    return money(parcelOrFare * share);
  }

  const settings =
    typeof settingsOrPercent === "number"
      ? {
          riderBaseFareSharePercent: settingsOrPercent,
          riderDistanceFareSharePercent: settingsOrPercent,
          riderSharePercent: settingsOrPercent,
        }
      : settingsOrPercent || {};

  const legacy = clampPercent(settings.riderSharePercent, 80);
  const basePct =
    clampPercent(settings.riderBaseFareSharePercent ?? legacy, legacy) / 100;
  const distancePct =
    clampPercent(settings.riderDistanceFareSharePercent ?? legacy, legacy) / 100;

  const breakdown = parcelOrFare?.fareBreakdown || parcelOrFare || {};
  let baseFare = Number(breakdown.baseFare);
  let distanceFare = Number(breakdown.distanceFare);

  // Older parcels without breakdown: fall back to total fare share (legacy).
  if (!Number.isFinite(baseFare) && !Number.isFinite(distanceFare)) {
    const fare = Number(parcelOrFare?.fare) || 0;
    return money(fare * (legacy / 100));
  }

  baseFare = Number.isFinite(baseFare) ? baseFare : 0;
  distanceFare = Number.isFinite(distanceFare) ? distanceFare : 0;

  return money(baseFare * basePct + distanceFare * distancePct);
}

const timeoutTimers = new Map();

function toDeliveryObjectId(deliveryId) {
  if (!deliveryId) return null;
  const id = String(deliveryId);
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

export function parcelBroadcastPayloadFromDoc(parcel, extra = {}, settingsOrPercent = 80) {
  const pickup = parcel.pickupAddress?.fullAddress || "Pickup location";
  const drop = parcel.dropAddress?.fullAddress || "Drop location";
  const fare = Number(parcel.fare) || 0;
  const settings =
    typeof settingsOrPercent === "number"
      ? {
          riderSharePercent: settingsOrPercent,
          riderBaseFareSharePercent: settingsOrPercent,
          riderDistanceFareSharePercent: settingsOrPercent,
        }
      : settingsOrPercent || {};
  const earnings = computeRiderParcelEarnings(parcel, settings);
  const paymentMethod = String(parcel.paymentMethod || "COD").toUpperCase();
  const isCod = paymentMethod === "COD";
  const collectAmount = isCod
    ? Math.max(
        0,
        Number(parcel.codSettlement?.collectAmount) || Number(parcel.fare) || 0,
      )
    : 0;
  return {
    parcelId: parcel._id?.toString?.() || String(parcel._id),
    status: parcel.status,
    preview: {
      pickup,
      drop,
      fare,
      earnings,
      riderBaseFareSharePercent: settings.riderBaseFareSharePercent,
      riderDistanceFareSharePercent: settings.riderDistanceFareSharePercent,
      weight: parcel.weight,
      distance: parcel.distance,
      deliverySpeed: parcel.deliverySpeed === "express" ? "express" : "normal",
      paymentMethod,
      collectAmount,
      type: "PARCEL",
      parcelType: parcel.parcelType || "outstation",
      deliveryInstruction:
        parcel.deliveryInstruction ||
        (parcel.parcelType === "local"
          ? "deliver_to_receiver"
          : "deliver_to_warehouse"),
      warehouseId: parcel.warehouseId || null,
    },
    searchExpiresAt: parcel.searchExpiresAt,
    ...extra,
  };
}

function clearParcelSearchTimeout(parcelId) {
  const id = String(parcelId);
  const timer = timeoutTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    timeoutTimers.delete(id);
  }
}

function scheduleParcelSearchTimeout(parcelId, attempt) {
  clearParcelSearchTimeout(parcelId);
  const delay = DEFAULT_PARCEL_SEARCH_TIMEOUT_MS();
  const timer = setTimeout(() => {
    processParcelSearchTimeout(parcelId, attempt).catch((err) => {
      console.warn("[parcelWorkflow] timeout failed", parcelId, err.message);
    });
  }, delay);
  timeoutTimers.set(String(parcelId), timer);
}

async function emitParcelBroadcastForPickup(parcel, extra = {}) {
  const lat = Number(parcel.pickupAddress?.lat);
  const lng = Number(parcel.pickupAddress?.lng);
  const settings = await ParcelConfig.getSearchSettings();
  const radiusKm = parcel.searchMeta?.radiusKm ?? settings.baseSearchRadiusKm;
  await emitParcelBroadcast(
    lat,
    lng,
    radiusKm,
    parcelBroadcastPayloadFromDoc(parcel, extra, settings),
  );
}

/**
 * Attach nearest warehouse for outstation parcels.
 * Updates warehouseId, dropAddress, and deliveryInstruction.
 * Never emits to seller!
 */
export async function tryAutoAssignParcelToWarehouse(parcelDoc) {
  const lat = Number(parcelDoc.pickupAddress?.lat);
  const lng = Number(parcelDoc.pickupAddress?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const warehouse = await Warehouse.findNearestActive(lat, lng);
  if (!warehouse?._id) return null;

  const dropAddress = {
    name: warehouse.name,
    phone: warehouse.phone || parcelDoc.dropAddress?.phone || "0000000000",
    fullAddress: warehouse.address + (warehouse.city ? `, ${warehouse.city}` : ""),
    lat: Number(warehouse.lat),
    lng: Number(warehouse.lng),
  };

  const updated = await Parcel.findOneAndUpdate(
    {
      _id: parcelDoc._id,
      status: { $in: ["REQUESTED", "SEARCHING"] },
    },
    {
      $set: {
        warehouseId: warehouse._id,
        dropAddress,
        deliveryInstruction: "deliver_to_warehouse",
      },
    },
    { new: true },
  );

  if (updated) {
    emitToAdmins("parcel:status:update", updated);
  }

  return updated;
}

/**
 * Attach nearest parcel-hub seller for visibility / seller panel.
 * Does NOT mark the parcel ACCEPTED — delivery riders still need SEARCHING broadcast.
 */
export async function tryAutoAssignParcelToSeller(parcelDoc) {
  const lat = Number(parcelDoc.pickupAddress?.lat);
  const lng = Number(parcelDoc.pickupAddress?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const seller = await findNearestParcelSellerNearPickup(lat, lng);
  if (!seller?._id) return null;

  const updated = await Parcel.findOneAndUpdate(
    {
      _id: parcelDoc._id,
      sellerId: null,
      status: { $in: ["REQUESTED", "SEARCHING"] },
    },
    {
      $set: {
        sellerId: seller._id,
      },
    },
    { new: true },
  );

  if (!updated) return null;

  emitToSeller(String(seller._id), {
    event: "parcel:auto-assigned",
    payload: {
      parcelId: String(updated._id),
      parcel: updated,
    },
  });

  emitToAdmins("parcel:status:update", updated);

  return updated;
}

export async function fetchParcelsForSeller(sellerId) {
  const seller = await getApprovedParcelSeller(sellerId);
  if (!seller) return [];

  const coords = seller.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return Parcel.find({ sellerId })
      .populate("customerId", "name phone email")
      .populate("deliveryPartnerId", "name phone")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  const [sellerLng, sellerLat] = coords;
  const radiusKm = Math.min(Math.max(Number(seller.serviceRadius) || 5, 1), 100);
  const radiusM = radiusKm * 1000;

  const [assigned, nearbyOpen] = await Promise.all([
    Parcel.find({ sellerId })
      .populate("customerId", "name phone email")
      .populate("deliveryPartnerId", "name phone")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Parcel.find({
      sellerId: null,
      status: { $in: ["REQUESTED", "SEARCHING"] },
    })
      .populate("customerId", "name phone email")
      .populate("deliveryPartnerId", "name phone")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const assignedIds = new Set(assigned.map((p) => String(p._id)));
  const nearby = nearbyOpen.filter((parcel) => {
    const pickupLat = Number(parcel.pickupAddress?.lat);
    const pickupLng = Number(parcel.pickupAddress?.lng);
    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) return false;
    return distanceMeters(pickupLat, pickupLng, sellerLat, sellerLng) <= radiusM;
  });

  const merged = [...assigned];
  for (const parcel of nearby) {
    if (!assignedIds.has(String(parcel._id))) {
      merged.push(parcel);
    }
  }

  return merged.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function startParcelBroadcast(parcelDoc) {
  // Attach nearby parcel hub seller (if any), but always continue rider search.
  await tryAutoAssignParcelToSeller(parcelDoc);
  // Only local parcels attach to nearby seller hubs.
  // Outstation parcels attach to nearest warehouse and NEVER emit to seller app!
  if (parcelDoc.parcelType === "local") {
    await tryAutoAssignParcelToSeller(parcelDoc);
  } else {
    await tryAutoAssignParcelToWarehouse(parcelDoc);
  }

  const parcelId = parcelDoc._id?.toString?.() || String(parcelDoc._id);
  const now = new Date();
  const searchMs = DEFAULT_PARCEL_SEARCH_TIMEOUT_MS();
  const settings = await ParcelConfig.getSearchSettings();
  const radiusKm = settings.baseSearchRadiusKm;
  const searchExpiresAt = new Date(now.getTime() + searchMs);

  const updated = await Parcel.findByIdAndUpdate(
    parcelDoc._id,
    {
      $set: {
        status: "SEARCHING",
        searchExpiresAt,
        searchMeta: {
          radiusKm,
          attempt: 1,
          lastBroadcastAt: now,
        },
      },
    },
    { new: true },
  );

  if (!updated) return null;

  await emitParcelBroadcastForPickup(updated);
  scheduleParcelSearchTimeout(parcelId, 1);

  emitToAdmins("parcel:status:update", updated);

  emitToCustomer(updated.customerId, {
    event: "parcel:status:update",
    payload: {
      parcelId,
      status: "SEARCHING",
      parcel: updated,
    },
  });

  return updated;
}

export async function processParcelSearchTimeout(parcelId, attempt) {
  const now = new Date();
  const parcel = await Parcel.findById(parcelId);
  if (!parcel || parcel.status !== "SEARCHING") return;

  if (parcel.searchExpiresAt && parcel.searchExpiresAt > now) {
    return;
  }

  const meta = parcel.searchMeta || {};
  const currentAttempt = meta.attempt || attempt || 1;
  const maxAttempts = PARCEL_SEARCH_MAX_ATTEMPTS();
  const settings = await ParcelConfig.getSearchSettings();

  if (currentAttempt < maxAttempts) {
    const nextRadius =
      Math.round(
        (meta.radiusKm || settings.baseSearchRadiusKm) *
          settings.radiusMultiplier *
          100,
      ) / 100;
    const searchExpiresAt = new Date(now.getTime() + DEFAULT_PARCEL_SEARCH_TIMEOUT_MS());

    const updated = await Parcel.findOneAndUpdate(
      { _id: parcelId, status: "SEARCHING" },
      {
        $set: {
          searchExpiresAt,
          searchMeta: {
            radiusKm: nextRadius,
            attempt: currentAttempt + 1,
            lastBroadcastAt: now,
          },
        },
      },
      { new: true },
    );

    if (!updated) return;

    await emitParcelBroadcastForPickup(updated, {
      retryAttempt: currentAttempt + 1,
    });
    emitToAdmins("parcel:status:update", updated);
    scheduleParcelSearchTimeout(parcelId, currentAttempt + 1);
    return;
  }

  await Parcel.findOneAndUpdate(
    { _id: parcelId, status: "SEARCHING" },
    {
      $set: { status: "REQUESTED" },
      $unset: { searchExpiresAt: 1, searchMeta: 1 },
    },
  );
  clearParcelSearchTimeout(parcelId);

  emitToAdmins("parcel:status:update", {
    _id: String(parcelId),
    status: "REQUESTED",
  });

  emitToCustomer(parcel.customerId, {
    event: "parcel:status:update",
    payload: {
      parcelId: String(parcelId),
      status: "REQUESTED",
      message: "No rider accepted in time. Admin will assign a rider shortly.",
    },
  });
}

export async function fetchAvailableParcelsForRider(deliveryId) {
  const deliveryOid = toDeliveryObjectId(deliveryId);
  if (!deliveryOid) return [];

  const rider = await Delivery.findById(deliveryOid)
    .select("location isParcelService isVerified isOnline")
    .lean();

  if (
    !rider?.isParcelService ||
    !rider.isVerified ||
    !rider.isOnline
  ) {
    return [];
  }

  if (await deliveryPartnerHasActiveJob(deliveryOid)) {
    return [];
  }

  const coords = rider.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return [];

  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const now = new Date();
  const settings = await ParcelConfig.getSearchSettings();
  const parcels = await Parcel.find({
    status: "SEARCHING",
    deliveryPartnerId: null,
    searchExpiresAt: { $gt: now },
    skippedBy: { $ne: deliveryOid },
  })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  return parcels.filter((parcel) => {
    const pickupLat = Number(parcel.pickupAddress?.lat);
    const pickupLng = Number(parcel.pickupAddress?.lng);
    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
      return false;
    }
    const radiusKm = settings.baseSearchRadiusKm;
    return distanceMeters(pickupLat, pickupLng, lat, lng) <= radiusKm * 1000;
  });
}

export async function parcelAcceptAtomic(deliveryId, parcelId, idempotencyKey) {
  const deliveryOid = toDeliveryObjectId(deliveryId);
  if (!deliveryOid) {
    const err = new Error("Invalid delivery account");
    err.statusCode = 400;
    throw err;
  }

  const partner = await Delivery.findById(deliveryOid)
    .select("isVerified isParcelService name phone")
    .lean();

  if (!partner?.isVerified) {
    const err = new Error("Your account is pending admin approval.");
    err.statusCode = 403;
    throw err;
  }

  if (!partner.isParcelService) {
    const err = new Error("Parcel delivery service is not enabled on your account.");
    err.statusCode = 403;
    throw err;
  }

  if (await deliveryPartnerHasActiveJob(deliveryOid)) {
    const err = new Error("Finish your current job before taking another.");
    err.statusCode = 409;
    throw err;
  }

  await assertRiderWithinPickupRadius(deliveryOid, parcelId);

  if (idempotencyKey) {
    try {
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `idem:parcel_accept:${parcelId}:${idempotencyKey}`;
        const hit = await redis.get(cacheKey);
        if (hit) {
          const parcel = await Parcel.findById(parcelId)
            .populate("customerId", "name phone")
            .populate("sellerId", "name shopName phone address location")
            .populate("warehouseId", "name address city phone lat lng")
            .lean();
          return { parcel, duplicate: true };
        }
      }
    } catch {
      /* optional */
    }
  }

  const now = new Date();
  const updated = await Parcel.findOneAndUpdate(
    {
      _id: parcelId,
      status: "SEARCHING",
      deliveryPartnerId: null,
      searchExpiresAt: { $gt: now },
      skippedBy: { $nin: [deliveryOid] },
    },
    {
      $set: {
        deliveryPartnerId: deliveryOid,
        status: "ACCEPTED",
        acceptedAt: now,
      },
      $unset: { searchExpiresAt: 1, searchMeta: 1 },
    },
    { new: true },
  )
    .populate("customerId", "name phone")
    .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber profileImage location")
    .populate("sellerId", "name shopName phone address location");
    .populate("sellerId", "name shopName phone address location")
    .populate("warehouseId", "name address city phone lat lng");

  if (!updated) {
    const existing = await Parcel.findById(parcelId).lean();
    if (!existing) {
      const err = new Error("Parcel not found");
      err.statusCode = 404;
      throw err;
    }
    let msg = "Parcel already assigned or not available";
    if (existing.searchExpiresAt && new Date(existing.searchExpiresAt) <= now) {
      msg = "Accept window has expired. Wait for the next parcel request.";
    } else if (existing.deliveryPartnerId) {
      msg = "Another rider already accepted this parcel.";
    } else if (
      (existing.skippedBy || []).some(
        (id) => id.toString() === deliveryOid.toString(),
      )
    ) {
      msg = "You rejected this parcel earlier.";
    } else if (existing.status !== "SEARCHING") {
      msg = "This parcel is no longer open for acceptance.";
    }
    const err = new Error(msg);
    err.statusCode = 409;
    throw err;
  }

  clearParcelSearchTimeout(parcelId);
  await retractParcelBroadcast(String(parcelId), deliveryOid);
  await markDeliveryPartnerBusy(deliveryOid);

  emitToAdmins("parcel:status:update", updated);

  emitToDelivery(deliveryOid, {
    event: "parcel:assigned",
    payload: updated,
  });

  emitToCustomer(updated.customerId?._id || updated.customerId, {
    event: "parcel:status:update",
    payload: {
      parcelId: String(parcelId),
      status: "ACCEPTED",
      parcel: updated,
    },
  });

  emitNotificationEvent(NOTIFICATION_EVENTS.PARCEL_ASSIGNED, {
    deliveryId: deliveryOid,
    parcelId: String(parcelId),
    body: `Parcel accepted — pickup at ${updated.pickupAddress?.fullAddress || "pickup location"}.`,
  });

  emitNotificationEvent(NOTIFICATION_EVENTS.PARCEL_STATUS_UPDATE, {
    userId: updated.customerId?._id || updated.customerId,
    customerId: updated.customerId?._id || updated.customerId,
    parcelId: String(parcelId),
    body: `Delivery partner ${partner.name} (${partner.phone}) has accepted your parcel.`,
  });

  if (idempotencyKey) {
    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.set(
          `idem:parcel_accept:${parcelId}:${idempotencyKey}`,
          "1",
          "EX",
          86400,
        );
      }
    } catch {
      /* optional */
    }
  }

  return { parcel: updated, duplicate: false };
}

export async function parcelRejectAtomic(deliveryId, parcelId) {
  const deliveryOid = toDeliveryObjectId(deliveryId);
  if (!deliveryOid) {
    const err = new Error("Invalid delivery account");
    err.statusCode = 400;
    throw err;
  }

  await Parcel.findOneAndUpdate(
    { _id: parcelId, status: "SEARCHING" },
    { $addToSet: { skippedBy: deliveryOid } },
  );

  return { ok: true };
}

export function cancelParcelSearch(parcelId) {
  clearParcelSearchTimeout(parcelId);
}

export function cancelAllParcelSearchTimers() {
  for (const timer of timeoutTimers.values()) {
    clearTimeout(timer);
  }
  timeoutTimers.clear();
}
