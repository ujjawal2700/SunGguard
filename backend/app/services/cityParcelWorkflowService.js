import mongoose from "mongoose";
import CityParcel, { RIDER_SAFE_FIELDS } from "../models/cityParcel.js";
import CityParcelConfig from "../models/cityParcelConfig.js";
import Delivery from "../models/delivery.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { getParcelRiderIdsNearPickup } from "./deliveryNearbyService.js";
import { emitToDelivery, emitToCustomer, emitToAdmins } from "./orderSocketEmitter.js";
import { deliveryPartnerHasActiveJob, markDeliveryPartnerBusy } from "./deliveryBusyService.js";
import { transition, recordEvent } from "./cityParcelStateMachine.js";
import { computeRiderEarning } from "./cityParcelFareService.js";
import { getRedisClient } from "../config/redis.js";
import {
  CITY_PARCEL_STATUS as S,
  CITY_PARCEL_EVENT_ACTOR,
  CITY_PARCEL_SEARCH_TIMEOUT_MS,
  CITY_PARCEL_SEARCH_MAX_ATTEMPTS,
} from "../constants/cityParcelWorkflow.js";
import {
  notifyRidersOfBroadcast,
  notifyRiderAssigned,
  notifyCustomerOfStatus,
} from "./cityParcelNotifyService.js";
import logger from "./logger.js";

/**
 * Rider matching for the City Parcel module.
 *
 * Deliberately does NOT hold search timers in memory. The pickup-service
 * equivalent keeps a module-level Map of setTimeout handles, so a restart or
 * a second instance silently drops every pending timer and the parcel sits
 * in SEARCHING for ever. Here the deadline lives in `searchExpiresAt` on the
 * document, and a sweeper job advances it. That survives restarts, and works
 * unchanged with more than one process running.
 */

function toOid(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  return new mongoose.Types.ObjectId(String(id));
}

/** The trimmed shape a rider sees in a broadcast — never the whole document. */
function broadcastPayload(parcel, riderEarning, extra = {}) {
  return {
    cityParcelId: String(parcel._id),
    referenceId: parcel.referenceId,
    status: parcel.status,
    preview: {
      pickup: parcel.pickupAddress?.fullAddress || "Pickup",
      drop: parcel.dropAddress?.fullAddress || "Drop",
      distanceKm: parcel.distanceKm,
      weightKg: parcel.package?.weightKg,
      packageType: parcel.package?.packageType,
      deliverySpeed: parcel.deliverySpeed,
      paymentMethod: parcel.paymentMethod,
      // What the rider takes home, not what the customer paid.
      earnings: riderEarning,
      collectAmount:
        String(parcel.paymentMethod).toUpperCase() === "COD"
          ? Number(parcel.fare) || 0
          : 0,
      type: "CITY_PARCEL",
    },
    searchExpiresAt: parcel.searchExpiresAt,
    ...extra,
  };
}

async function fanOutToNearbyRiders(parcel, radiusKm, extra = {}) {
  const lat = Number(parcel.pickupAddress?.lat);
  const lng = Number(parcel.pickupAddress?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ids: [] };

  const config = await CityParcelConfig.getConfig();
  const earning = computeRiderEarning(parcel.fareBreakdown, config);

  // Reuses the pickup-service rider pool: same people, same eligibility
  // rules (parcel-enabled, online, verified). Read-only, nothing shared.
  const rawIds = await getParcelRiderIdsNearPickup(lat, lng, radiusKm);
  const skipped = new Set((parcel.skippedBy || []).map(String));
  const ids = [...new Set(rawIds.map(String))].filter((id) => !skipped.has(id));

  if (!ids.length) return { ids: [] };

  const payload = broadcastPayload(parcel, earning, extra);
  for (const id of ids) {
    emitToDelivery(id, { event: "cityparcel:broadcast", payload });
  }

  // Sockets only reach an app that is open; a push reaches one that is not.
  // Retries stay silent so a widening search does not buzz the same phone
  // three times over.
  if (!extra.retryAttempt) {
    notifyRidersOfBroadcast(parcel, ids);
  }

  return { ids };
}

/** Put a freshly paid parcel in front of nearby riders. */
export async function startBroadcast(cityParcelId) {
  const config = await CityParcelConfig.getConfig();
  const now = new Date();
  const radiusKm = config.baseSearchRadiusKm;

  const parcel = await transition({
    cityParcelId,
    to: S.SEARCHING,
    expectedFrom: [S.REQUESTED],
    set: {
      searchExpiresAt: new Date(now.getTime() + CITY_PARCEL_SEARCH_TIMEOUT_MS()),
      searchMeta: { radiusKm, attempt: 1, lastBroadcastAt: now },
    },
    actor: CITY_PARCEL_EVENT_ACTOR.SYSTEM,
    note: "Looking for a delivery partner",
  });

  const { ids } = await fanOutToNearbyRiders(parcel, radiusKm);

  emitToAdmins("cityparcel:status:update", parcel);
  emitToCustomer(parcel.customerId, {
    event: "cityparcel:status:update",
    payload: { cityParcelId: String(parcel._id), status: S.SEARCHING, parcel },
  });

  notifyCustomerOfStatus(parcel);

  logger.info("City parcel broadcast started", {
    referenceId: parcel.referenceId,
    radiusKm,
    ridersReached: ids.length,
  });

  return { parcel, ridersReached: ids.length };
}

/**
 * Advance one parcel whose search window has lapsed: widen the radius and
 * re-broadcast, or give up and hand it to an admin.
 *
 * Called by the sweeper, never by a timer.
 */
export async function advanceExpiredSearch(cityParcelId) {
  const parcel = await CityParcel.findById(cityParcelId);
  if (!parcel || parcel.status !== S.SEARCHING) return null;
  if (parcel.searchExpiresAt && parcel.searchExpiresAt > new Date()) return null;

  const config = await CityParcelConfig.getConfig();
  const attempt = parcel.searchMeta?.attempt || 1;
  const maxAttempts = CITY_PARCEL_SEARCH_MAX_ATTEMPTS();
  const now = new Date();

  if (attempt < maxAttempts) {
    const nextRadius =
      Math.round(
        (parcel.searchMeta?.radiusKm || config.baseSearchRadiusKm) *
          config.radiusMultiplier *
          100,
      ) / 100;

    const updated = await CityParcel.findOneAndUpdate(
      { _id: cityParcelId, status: S.SEARCHING },
      {
        $set: {
          searchExpiresAt: new Date(now.getTime() + CITY_PARCEL_SEARCH_TIMEOUT_MS()),
          searchMeta: { radiusKm: nextRadius, attempt: attempt + 1, lastBroadcastAt: now },
        },
      },
      { new: true },
    );
    if (!updated) return null;

    await fanOutToNearbyRiders(updated, nextRadius, { retryAttempt: attempt + 1 });
    emitToAdmins("cityparcel:status:update", updated);
    return { widened: true, radiusKm: nextRadius, attempt: attempt + 1 };
  }

  // Out of rounds. Park it back at REQUESTED so an admin can assign by hand,
  // rather than leaving it spinning for ever.
  const parked = await transition({
    cityParcelId,
    to: S.REQUESTED,
    expectedFrom: [S.SEARCHING],
    unset: { searchExpiresAt: 1 },
    actor: CITY_PARCEL_EVENT_ACTOR.SYSTEM,
    note: "No delivery partner accepted — needs manual assignment",
  });

  emitToAdmins("cityparcel:needs-assignment", parked);
  emitToCustomer(parked.customerId, {
    event: "cityparcel:status:update",
    payload: {
      cityParcelId: String(parked._id),
      status: S.REQUESTED,
      message: "We are still finding you a delivery partner.",
    },
  });

  return { widened: false, parked: true };
}

/**
 * Find every search that has lapsed and advance it. Idempotent, so running
 * it twice is harmless — this is what makes it safe on a schedule.
 */
export async function sweepExpiredSearches({ limit = 50 } = {}) {
  const due = await CityParcel.find({
    status: S.SEARCHING,
    searchExpiresAt: { $lte: new Date() },
  })
    .select("_id")
    .limit(limit)
    .lean();

  let widened = 0;
  let parked = 0;

  for (const row of due) {
    try {
      const result = await advanceExpiredSearch(row._id);
      if (result?.widened) widened += 1;
      if (result?.parked) parked += 1;
    } catch (err) {
      logger.error("City parcel search sweep failed", {
        cityParcelId: String(row._id),
        error: err?.message,
      });
    }
  }

  return { examined: due.length, widened, parked };
}

/** Open jobs this rider could take right now. */
export async function fetchAvailableForRider(deliveryId) {
  const oid = toOid(deliveryId);
  if (!oid) return { parcels: [], reason: "INVALID_RIDER" };

  const rider = await Delivery.findById(oid)
    .select("location isParcelService isVerified isOnline")
    .lean();

  /**
   * Every one of these used to return a bare empty array, so five very
   * different situations — offline, unapproved, no GPS, already on a job,
   * genuinely nothing nearby — were indistinguishable to the rider and to
   * anyone debugging it. The reason travels with the result now.
   */
  if (!rider) return { parcels: [], reason: "INVALID_RIDER" };
  if (!rider.isVerified) return { parcels: [], reason: "NOT_APPROVED" };
  if (!rider.isParcelService) return { parcels: [], reason: "PARCEL_DISABLED" };
  if (!rider.isOnline) return { parcels: [], reason: "OFFLINE" };

  const coords = rider.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return { parcels: [], reason: "NO_LOCATION" };
  }
  const [lng, lat] = coords.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { parcels: [], reason: "NO_LOCATION" };
  }

  /**
   * A rider already carrying something still SEES what is waiting — the
   * pickup-service list does, and hiding it made city jobs look broken while
   * outstation jobs kept appearing. They just cannot take one until they are
   * free, which `acceptAtomic` enforces anyway.
   */
  const busy = await deliveryPartnerHasActiveJob(oid);

  const config = await CityParcelConfig.getConfig();
  const baseRadiusM = config.baseSearchRadiusKm * 1000;

  /**
   * Deliberately NOT filtered on `searchExpiresAt`.
   *
   * That field paces the push rounds — how long to wait before widening the
   * radius and alerting more riders. It was never meant to decide whether a
   * rider opening their app can see an open job, and using it that way made
   * every unaccepted parcel vanish sixty seconds after booking: still
   * SEARCHING, still unassigned, invisible to everyone.
   *
   * That was survivable only while a scheduler was running to widen the
   * search. Deployments that run the API alone (PROCESS_ROLE=api) have no
   * sweeper, so nothing ever revived them.
   *
   * An unassigned parcel in SEARCHING is available. Full stop.
   */
  const open = await CityParcel.find({
    status: S.SEARCHING,
    deliveryPartnerId: null,
    skippedBy: { $ne: oid },
  })
    .select(RIDER_SAFE_FIELDS)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const now = Date.now();

  const matched = open
    .filter((parcel) => {
      const pLat = Number(parcel.pickupAddress?.lat);
      const pLng = Number(parcel.pickupAddress?.lng);
      if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) return false;

      // A parcel nobody has taken widens its own reach over time, so it stays
      // discoverable without depending on the sweeper to widen it. Capped, so
      // a rider is never shown a job on the far side of the city.
      const roundsElapsed = parcel.searchExpiresAt
        ? Math.max(0, Math.floor((now - new Date(parcel.searchExpiresAt).getTime()) /
            CITY_PARCEL_SEARCH_TIMEOUT_MS()))
        : 0;
      const widened =
        baseRadiusM *
        Math.min(
          Math.pow(config.radiusMultiplier || 1.6, roundsElapsed),
          Math.pow(config.radiusMultiplier || 1.6, CITY_PARCEL_SEARCH_MAX_ATTEMPTS()),
        );

      return distanceMeters(pLat, pLng, lat, lng) <= widened;
    })
    .map((parcel) => ({
      ...parcel,
      riderEarning: computeRiderEarning(parcel.fareBreakdown, config),
    }));

  return {
    parcels: matched,
    // Why the list looks the way it does — the app turns this into a sentence.
    reason: busy ? "ON_A_JOB" : matched.length ? "OK" : "NONE_NEARBY",
    canAccept: !busy,
  };
}

/**
 * First rider to accept wins.
 *
 * The whole claim is one conditional update. Checking availability and then
 * writing would let two riders who tapped at the same moment both succeed,
 * and one of them would ride to a parcel that is no longer theirs.
 */
export async function acceptAtomic({ deliveryId, cityParcelId, idempotencyKey = null }) {
  const oid = toOid(deliveryId);
  if (!oid) {
    const err = new Error("Invalid delivery account");
    err.statusCode = 400;
    throw err;
  }

  const rider = await Delivery.findById(oid)
    .select("isVerified isParcelService name phone location lastLocationAt")
    .lean();

  if (!rider?.isVerified) {
    const err = new Error("Your account is still pending approval.");
    err.statusCode = 403;
    throw err;
  }
  if (!rider.isParcelService) {
    const err = new Error("Parcel delivery is not enabled on your account.");
    err.statusCode = 403;
    throw err;
  }

  // A double-tap or a retried request must not produce two accepts.
  if (idempotencyKey) {
    try {
      const redis = getRedisClient();
      if (redis) {
        const hit = await redis.get(`idem:cityparcel_accept:${cityParcelId}:${idempotencyKey}`);
        if (hit) {
          const existing = await CityParcel.findById(cityParcelId).lean();
          return { parcel: existing, duplicate: true };
        }
      }
    } catch {
      /* idempotency is a nicety, not a requirement */
    }
  }

  // "Already mine" is checked before the busy gate, because the rider's
  // active job may BE this parcel — a double-tap or a retry after a dropped
  // response. Ordering it after the gate makes a retry fail with "finish your
  // current job", which is both wrong and impossible to act on.
  const existing = await CityParcel.findById(cityParcelId)
    .select("deliveryPartnerId")
    .lean();

  if (existing && String(existing.deliveryPartnerId) === String(oid)) {
    const own = await CityParcel.findById(cityParcelId)
      .populate("customerId", "name phone")
      .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber");
    return { parcel: own, duplicate: true };
  }

  if (await deliveryPartnerHasActiveJob(oid)) {
    const err = new Error("Finish your current job before taking another.");
    err.statusCode = 409;
    throw err;
  }

  const config = await CityParcelConfig.getConfig();

  // Riders must be near the pickup to claim it — otherwise the nearest-rider
  // promise to the customer means nothing.
  const coords = rider.location?.coordinates;
  const parcelPeek = await CityParcel.findById(cityParcelId)
    .select("pickupAddress status")
    .lean();
  if (!parcelPeek) {
    const err = new Error("That job no longer exists");
    err.statusCode = 404;
    throw err;
  }
  if (Array.isArray(coords) && coords.length >= 2) {
    const [rLng, rLat] = coords.map(Number);
    const gap = distanceMeters(
      Number(parcelPeek.pickupAddress.lat),
      Number(parcelPeek.pickupAddress.lng),
      rLat,
      rLng,
    );
    if (gap > config.baseSearchRadiusKm * 1000) {
      const err = new Error(
        `You need to be within ${config.baseSearchRadiusKm} km of the pickup to accept this.`,
      );
      err.statusCode = 403;
      throw err;
    }
  }

  const now = new Date();
  const claimed = await CityParcel.findOneAndUpdate(
    {
      _id: cityParcelId,
      status: S.SEARCHING,
      deliveryPartnerId: null,
      // No window guard, for the same reason the availability query has none:
      // the broadcast round paces the push, it does not decide whether an
      // unclaimed job can still be taken. Guarding here made jobs visible in
      // the rider's list but impossible to accept, which is worse than
      // hiding them.
      skippedBy: { $nin: [oid] },
    },
    {
      $set: { deliveryPartnerId: oid, status: S.ACCEPTED, acceptedAt: now },
      $unset: { searchExpiresAt: 1 },
    },
    { new: true },
  ).populate("customerId", "name phone");

  if (!claimed) {
    const latest = await CityParcel.findById(cityParcelId).select("status deliveryPartnerId searchExpiresAt skippedBy").lean();

    // The rider already owns this job. A double-tap or a retried request
    // after a flaky response should land them on the job, not tell them
    // someone else took it. The Redis idempotency check above covers this
    // when Redis is available; this covers it when it is not.
    if (latest && String(latest.deliveryPartnerId) === String(oid)) {
      const own = await CityParcel.findById(cityParcelId)
        .populate("customerId", "name phone")
        .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber");
      return { parcel: own, duplicate: true };
    }

    let message = "This job is no longer available";
    if (!latest) message = "That job no longer exists";
    else if (latest.deliveryPartnerId) message = "Another rider got there first.";

    else if ((latest.skippedBy || []).some((id) => String(id) === String(oid)))
      message = "You skipped this job earlier.";

    const err = new Error(message);
    err.statusCode = 409;
    throw err;
  }

  await recordEvent({
    cityParcelId: claimed._id,
    status: S.ACCEPTED,
    previousStatus: S.SEARCHING,
    actor: CITY_PARCEL_EVENT_ACTOR.RIDER,
    actorId: oid,
    note: `${rider.name} accepted the job`,
  });

  await markDeliveryPartnerBusy(oid);

  // Retract the offer from everyone else so it stops flashing on their phone.
  const others = await getParcelRiderIdsNearPickup(
    Number(claimed.pickupAddress.lat),
    Number(claimed.pickupAddress.lng),
    config.baseSearchRadiusKm,
  );
  for (const id of others) {
    if (String(id) === String(oid)) continue;
    emitToDelivery(id, {
      event: "cityparcel:retract",
      payload: { cityParcelId: String(claimed._id) },
    });
  }

  emitToAdmins("cityparcel:status:update", claimed);
  emitToCustomer(claimed.customerId?._id || claimed.customerId, {
    event: "cityparcel:status:update",
    payload: {
      cityParcelId: String(claimed._id),
      status: S.ACCEPTED,
      parcel: claimed,
      rider: { name: rider.name, phone: rider.phone },
    },
  });

  notifyRiderAssigned(claimed, oid);
  notifyCustomerOfStatus(claimed, { riderName: rider.name });

  if (idempotencyKey) {
    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.set(
          `idem:cityparcel_accept:${cityParcelId}:${idempotencyKey}`,
          "1",
          "EX",
          86400,
        );
      }
    } catch {
      /* ignore */
    }
  }

  return { parcel: claimed, duplicate: false };
}

/** A rider passing on a job — they stop seeing it, everyone else still does. */
export async function skipJob({ deliveryId, cityParcelId }) {
  const oid = toOid(deliveryId);
  if (!oid) return { ok: false };

  await CityParcel.findOneAndUpdate(
    { _id: cityParcelId, status: S.SEARCHING },
    { $addToSet: { skippedBy: oid } },
  );

  return { ok: true };
}
