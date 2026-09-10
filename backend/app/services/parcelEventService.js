import ParcelEvent, { PARCEL_EVENT_ACTOR } from "../models/parcelEvent.js";
import logger from "./logger.js";

/**
 * Appends one row to an outstation parcel's timeline.
 *
 * Deliberately fire-and-forget from the caller's point of view: a failed
 * event write must never undo or block a real status change (the parcel
 * already moved; a missing log line is a smaller problem than a rider stuck
 * mid-transition because logging hiccuped). Callers still `await` it so it
 * finishes before the response goes out, but nothing here throws outward —
 * see the try/catch below.
 */
export async function recordParcelEvent({
  parcelId,
  status,
  previousStatus = null,
  actor = PARCEL_EVENT_ACTOR.SYSTEM,
  actorId = null,
  note = "",
  meta = {},
}) {
  try {
    return await ParcelEvent.create({
      parcelId,
      status,
      previousStatus,
      actor,
      actorId,
      at: new Date(),
      note,
      meta,
    });
  } catch (err) {
    logger.warn("[parcelEventService] event write failed", {
      parcelId: String(parcelId),
      status,
      message: err?.message,
    });
    return null;
  }
}

export { PARCEL_EVENT_ACTOR };
