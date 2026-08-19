import CityParcel from "../models/cityParcel.js";
import CityParcelEvent from "../models/cityParcelEvent.js";
import {
  CITY_PARCEL_STATUS as S,
  CITY_PARCEL_TERMINAL_STATUSES,
  CITY_PARCEL_EVENT_ACTOR,
} from "../constants/cityParcelWorkflow.js";

/**
 * The only place a city parcel's status may change.
 *
 * The existing pickup-service flow validates status changes against a flat
 * allow-list, which permits ACCEPTED -> OUT_FOR_DELIVERY and skips pickup
 * entirely. That is survivable for a hub drop. It is not survivable here,
 * because this flow branches: a failed delivery can go BACKWARDS to another
 * attempt, or FORWARDS to a return. An allow-list cannot express that
 * difference, so it lets both happen from anywhere.
 *
 * Every transition also writes a CityParcelEvent, so the timeline the
 * customer sees can never drift from the parcel's actual state.
 */

/** from -> set of allowed next statuses */
const TRANSITIONS = {
  [S.REQUESTED]: new Set([S.SEARCHING, S.CANCELLED]),

  // Search can fall back to REQUESTED when every radius round is exhausted;
  // an admin then assigns a rider by hand.
  [S.SEARCHING]: new Set([S.ACCEPTED, S.REQUESTED, S.CANCELLED]),

  [S.ACCEPTED]: new Set([S.RIDER_ASSIGNED, S.PICKUP_REACHED, S.CANCELLED]),
  [S.RIDER_ASSIGNED]: new Set([S.PICKUP_REACHED, S.CANCELLED]),
  [S.PICKUP_REACHED]: new Set([S.PICKED_UP, S.CANCELLED]),

  // Once the rider holds the parcel, cancelling is no longer a state change
  // the customer can make — it becomes a return.
  [S.PICKED_UP]: new Set([S.AT_WAYPOINT, S.OUT_FOR_DELIVERY]),
  [S.AT_WAYPOINT]: new Set([S.OUT_FOR_DELIVERY]),

  [S.OUT_FOR_DELIVERY]: new Set([S.DROP_REACHED]),
  [S.DROP_REACHED]: new Set([S.DELIVERED, S.DELIVERY_FAILED]),

  // The one non-linear edge in the whole flow. A retry goes back out for
  // delivery with a fresh OTP; a return goes forward. Which one depends on
  // what the customer chose, enforced by the caller.
  [S.DELIVERY_FAILED]: new Set([S.OUT_FOR_DELIVERY, S.RETURN_IN_TRANSIT]),

  [S.RETURN_IN_TRANSIT]: new Set([S.RETURNED]),

  [S.DELIVERED]: new Set(),
  [S.RETURNED]: new Set(),
  [S.CANCELLED]: new Set(),
};

export function canTransition(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;
  const allowed = TRANSITIONS[from];
  return allowed ? allowed.has(to) : false;
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(
      `City parcel cannot move from ${from} to ${to}`,
    );
    err.statusCode = 409;
    err.code = "INVALID_CITY_PARCEL_TRANSITION";
    throw err;
  }
}

export function isTerminal(status) {
  return CITY_PARCEL_TERMINAL_STATUSES.includes(status);
}

/** Which statuses a parcel in `from` could legally reach next. */
export function nextStatuses(from) {
  return Array.from(TRANSITIONS[from] || []);
}

/**
 * Append a timeline row. Called for you by `transition`; exported for the
 * few events that carry information without changing status — a resend, a
 * customer's reply to a failed attempt.
 */
export async function recordEvent({
  cityParcelId,
  status,
  previousStatus = null,
  actor = CITY_PARCEL_EVENT_ACTOR.SYSTEM,
  actorId = null,
  location = null,
  note = "",
  meta = {},
}) {
  return CityParcelEvent.create({
    cityParcelId,
    status,
    previousStatus,
    actor,
    actorId,
    at: new Date(),
    location: location
      ? {
          lat: Number.isFinite(Number(location.lat)) ? Number(location.lat) : null,
          lng: Number.isFinite(Number(location.lng)) ? Number(location.lng) : null,
          accuracyM: Number.isFinite(Number(location.accuracyM))
            ? Number(location.accuracyM)
            : null,
        }
      : { lat: null, lng: null, accuracyM: null },
    note,
    meta,
  });
}

/**
 * Move a parcel to a new status, atomically and only if the transition is
 * legal from wherever it actually is right now.
 *
 * The status guard lives in the query, not in a read-then-write. Two riders
 * hitting "picked up" at the same moment, or a customer cancelling while a
 * rider accepts, would otherwise both succeed and leave the parcel in a
 * state neither of them expects.
 *
 * @param {object}   opts
 * @param {string}   opts.cityParcelId
 * @param {string}   opts.to             target status
 * @param {string[]} [opts.expectedFrom] restrict to these current statuses
 * @param {object}   [opts.set]          extra $set fields to apply
 * @param {object}   [opts.push]         extra $push operations
 * @param {object}   [opts.unset]        extra $unset fields
 * @returns {Promise<object>} the updated parcel document
 */
export async function transition({
  cityParcelId,
  to,
  expectedFrom = null,
  set = {},
  push = null,
  unset = null,
  actor = CITY_PARCEL_EVENT_ACTOR.SYSTEM,
  actorId = null,
  location = null,
  note = "",
  meta = {},
}) {
  const current = await CityParcel.findById(cityParcelId)
    .select("status")
    .lean();

  if (!current) {
    const err = new Error("City parcel not found");
    err.statusCode = 404;
    throw err;
  }

  const from = current.status;

  if (Array.isArray(expectedFrom) && !expectedFrom.includes(from)) {
    const err = new Error(
      `This parcel is ${from}, not ${expectedFrom.join(" or ")}`,
    );
    err.statusCode = 409;
    err.code = "UNEXPECTED_CITY_PARCEL_STATE";
    throw err;
  }

  assertTransition(from, to);

  // The status guard below is what makes this safe under concurrency: if
  // anything moved the parcel between the read above and this write, the
  // update matches nothing and we report the conflict instead of clobbering.
  const guardStatuses = Array.isArray(expectedFrom) ? expectedFrom : [from];

  const update = { $set: { ...set, status: to } };
  if (push) update.$push = push;
  if (unset) update.$unset = unset;

  const updated = await CityParcel.findOneAndUpdate(
    { _id: cityParcelId, status: { $in: guardStatuses } },
    update,
    { new: true },
  );

  if (!updated) {
    const latest = await CityParcel.findById(cityParcelId)
      .select("status")
      .lean();
    const err = new Error(
      `This parcel changed to ${latest?.status ?? "unknown"} while you were working on it`,
    );
    err.statusCode = 409;
    err.code = "CITY_PARCEL_STATE_CONFLICT";
    throw err;
  }

  // The event is a record of what happened, not part of the transaction.
  // A failed write here must not undo a delivery that physically occurred.
  try {
    await recordEvent({
      cityParcelId,
      status: to,
      previousStatus: from,
      actor,
      actorId,
      location,
      note,
      meta,
    });
  } catch (err) {
    console.warn(
      "[cityParcelStateMachine] event write failed",
      String(cityParcelId),
      err?.message,
    );
  }

  return updated;
}

export { TRANSITIONS };
