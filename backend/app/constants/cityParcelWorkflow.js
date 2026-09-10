/**
 * Constants for the City Parcel module.
 *
 * This is a SEPARATE, ADDITIVE module. It does not modify, wrap, or share
 * state with the existing pickup-service parcel flow (`models/parcel.js`,
 * `controller/parcelController.js`, `services/parcelWorkflowService.js`).
 * Those files are untouched and keep working exactly as they do today.
 *
 * What this module does:
 *
 *   A customer books a delivery between two points they choose themselves.
 *   One rider collects at point A and hands the parcel to a named receiver
 *   at point B, verified at the door with an OTP plus a name and phone
 *   check. If that handover fails for any reason, the same rider carries
 *   the parcel back to the customer who booked it.
 *
 * Vocabulary — fixed, because mixing these up is how a return gets sent to
 * the wrong end of the route:
 *
 *   customer   The person who books and pays. Hands the parcel over at
 *              point A, and takes it back if delivery fails. Stored as
 *              `customerId`, matching the existing schema convention.
 *
 *   receiver   The person waiting at point B. Has no account and pays
 *              nothing. Receives an OTP by SMS and takes the parcel.
 *
 * "Sender" is deliberately never used — the model already says customer,
 * and a second word for the same person invites bugs.
 */

/**
 * Statuses for a city parcel.
 *
 * Names are shared with the pickup-service flow where the meaning is
 * genuinely the same (REQUESTED, SEARCHING, ACCEPTED …) so that rider-facing
 * UI can read either without a translation layer. They are NOT the same
 * enum object and changing one has no effect on the other.
 */
export const CITY_PARCEL_STATUS = {
  /** Booked. Awaiting payment confirmation for online methods. */
  REQUESTED: "REQUESTED",
  /** Broadcasting to riders near point A. */
  SEARCHING: "SEARCHING",
  /** A rider claimed it. */
  ACCEPTED: "ACCEPTED",
  /** Rider is moving toward point A. */
  RIDER_ASSIGNED: "RIDER_ASSIGNED",
  /** Rider is at point A. */
  PICKUP_REACHED: "PICKUP_REACHED",
  /** Pickup OTP verified and photo taken. Custody has transferred. */
  PICKED_UP: "PICKED_UP",
  /** Optional hold between A and B. Reserved — no UI in v1. */
  AT_WAYPOINT: "AT_WAYPOINT",
  /** Moving toward point B. The receiver's delivery OTP is issued here. */
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  /** Rider is at point B. The proximity gate arms at this point. */
  DROP_REACHED: "DROP_REACHED",
  /** Handed to the receiver and verified. Terminal. */
  DELIVERED: "DELIVERED",
  /** An attempt at point B did not produce a handover. */
  DELIVERY_FAILED: "DELIVERY_FAILED",
  /** Rider is carrying the parcel back to the customer. */
  RETURN_IN_TRANSIT: "RETURN_IN_TRANSIT",
  /** Customer took their parcel back, verified by return OTP. Terminal. */
  RETURNED: "RETURNED",
  /** Cancelled before a rider took custody. Terminal. */
  CANCELLED: "CANCELLED",
};

export const CITY_PARCEL_STATUSES = Object.values(CITY_PARCEL_STATUS);

/** Statuses no transition may leave. */
export const CITY_PARCEL_TERMINAL_STATUSES = [
  CITY_PARCEL_STATUS.DELIVERED,
  CITY_PARCEL_STATUS.RETURNED,
  CITY_PARCEL_STATUS.CANCELLED,
];

/**
 * Statuses in which the rider physically holds the parcel. Used to decide
 * whether a cancellation is still allowed and whether the rider counts as
 * busy.
 */
export const CITY_PARCEL_IN_CUSTODY_STATUSES = [
  CITY_PARCEL_STATUS.PICKED_UP,
  CITY_PARCEL_STATUS.AT_WAYPOINT,
  CITY_PARCEL_STATUS.OUT_FOR_DELIVERY,
  CITY_PARCEL_STATUS.DROP_REACHED,
  CITY_PARCEL_STATUS.DELIVERY_FAILED,
  CITY_PARCEL_STATUS.RETURN_IN_TRANSIT,
];

/** Statuses that mean a rider is on an active city-parcel job. */
export const CITY_PARCEL_ACTIVE_STATUSES = [
  CITY_PARCEL_STATUS.ACCEPTED,
  CITY_PARCEL_STATUS.RIDER_ASSIGNED,
  CITY_PARCEL_STATUS.PICKUP_REACHED,
  ...CITY_PARCEL_IN_CUSTODY_STATUSES,
];

/**
 * Why a delivery attempt at point B failed.
 *
 * Five distinct causes, one outcome: the parcel goes back to the customer.
 * The cause is recorded for reporting and disputes — it never changes the
 * destination.
 */
export const CITY_PARCEL_ATTEMPT_OUTCOME = {
  /** Receiver is present and declines to take it. */
  REFUSED: "REFUSED",
  /** No answer on the phone or at the door. */
  NO_ANSWER: "NO_ANSWER",
  /** Nobody by that name is at the address. */
  WRONG_ADDRESS: "WRONG_ADDRESS",
  /** OTP attempts exhausted, or the receiver never got the SMS. */
  OTP_FAILED: "OTP_FAILED",
  /** Someone is there, but not the receiver, and alternates are not allowed. */
  NAME_MISMATCH: "NAME_MISMATCH",
};

export const CITY_PARCEL_ATTEMPT_OUTCOMES = Object.values(
  CITY_PARCEL_ATTEMPT_OUTCOME,
);

/** Lifecycle of the leg that carries a failed parcel back to the customer. */
export const CITY_PARCEL_RETURN_STATUS = {
  NONE: "NONE",
  /** Waiting on the customer to say what they want done. */
  PENDING_CUSTOMER: "PENDING_CUSTOMER",
  IN_TRANSIT: "IN_TRANSIT",
  RETURNED: "RETURNED",
  /** The customer will not take it back either. Needs an admin. */
  CUSTOMER_UNREACHABLE: "CUSTOMER_UNREACHABLE",
  ABANDONED: "ABANDONED",
};

export const CITY_PARCEL_RETURN_STATUSES = Object.values(
  CITY_PARCEL_RETURN_STATUS,
);

/**
 * What the customer told us to do after we reported a failed attempt.
 * RETURN_* ends the job; RETRY_* puts the parcel back OUT_FOR_DELIVERY.
 */
export const CITY_PARCEL_CUSTOMER_CHOICE = {
  NONE: "NONE",
  /** Bring it back to point A. */
  RETURN_TO_PICKUP: "RETURN_TO_PICKUP",
  /** Bring it back, but somewhere else — the customer may be at work. */
  RETURN_TO_NEW_ADDRESS: "RETURN_TO_NEW_ADDRESS",
  RETRY_SAME: "RETRY_SAME",
  RETRY_NEW_ADDRESS: "RETRY_NEW_ADDRESS",
  /** Let whoever is at the address take it. */
  RELEASE_TO_ANYONE: "RELEASE_TO_ANYONE",
};

export const CITY_PARCEL_CUSTOMER_CHOICES = Object.values(
  CITY_PARCEL_CUSTOMER_CHOICE,
);

export const CITY_PARCEL_RETURN_CHOICES = [
  CITY_PARCEL_CUSTOMER_CHOICE.RETURN_TO_PICKUP,
  CITY_PARCEL_CUSTOMER_CHOICE.RETURN_TO_NEW_ADDRESS,
];

export const CITY_PARCEL_RETRY_CHOICES = [
  CITY_PARCEL_CUSTOMER_CHOICE.RETRY_SAME,
  CITY_PARCEL_CUSTOMER_CHOICE.RETRY_NEW_ADDRESS,
  CITY_PARCEL_CUSTOMER_CHOICE.RELEASE_TO_ANYONE,
];

/** Who caused a state change, for the event audit trail. */
export const CITY_PARCEL_EVENT_ACTOR = {
  CUSTOMER: "customer",
  RIDER: "rider",
  ADMIN: "admin",
  SYSTEM: "system",
};

export const CITY_PARCEL_EVENT_ACTORS = Object.values(
  CITY_PARCEL_EVENT_ACTOR,
);

/** Codes issued during a parcel's life. Each goes to a different phone. */
export const CITY_PARCEL_OTP_TYPE = {
  /** To the customer, verified by the rider at point A. */
  PICKUP: "pickup",
  /** To the receiver, verified by the rider at point B. */
  DELIVERY: "delivery",
  /** To the customer again, when a failed parcel comes back. */
  RETURN_DROP: "return_drop",
};

export const CITY_PARCEL_OTP_TYPES = Object.values(CITY_PARCEL_OTP_TYPE);

/* ==========================================================================
   Tunables. Every one of these is also settable per-deployment in
   CityParcelConfig; the env values below are the fallback defaults.
   ========================================================================== */

/** How long one broadcast round waits before widening the radius. */
export const CITY_PARCEL_SEARCH_TIMEOUT_MS = () =>
  parseInt(process.env.CITY_PARCEL_SEARCH_TIMEOUT_MS || "60000", 10);

/** How many widening rounds before we give up and hand it to an admin. */
export const CITY_PARCEL_SEARCH_MAX_ATTEMPTS = () =>
  parseInt(process.env.CITY_PARCEL_SEARCH_MAX_ATTEMPTS || "3", 10);

/** Delivery attempts at point B before the parcel goes back automatically. */
export const CITY_PARCEL_MAX_DELIVERY_ATTEMPTS = () =>
  parseInt(process.env.CITY_PARCEL_MAX_DELIVERY_ATTEMPTS || "2", 10);

/** How long the customer has to answer the failed-attempt prompt. */
export const CITY_PARCEL_CUSTOMER_RESPONSE_WINDOW_MS = () =>
  parseInt(process.env.CITY_PARCEL_CUSTOMER_RESPONSE_WINDOW_MS || "1800000", 10);

/** How long a delivery OTP stays valid. */
export const CITY_PARCEL_OTP_TTL_MS = () =>
  parseInt(process.env.CITY_PARCEL_OTP_TTL_MS || "3600000", 10);

/**
 * How long an unpaid online booking stays eligible to be resumed rather than
 * duplicated. A customer who cancels the Razorpay sheet and taps Pay again
 * within this window gets the SAME booking row re-priced and a fresh gateway
 * order opened on it; past this window a fresh booking is created instead,
 * since enough time has passed that resuming it invisibly could surprise
 * the customer with a stale route or price.
 */
export const CITY_PARCEL_RESUMABLE_BOOKING_WINDOW_MS = () =>
  parseInt(process.env.CITY_PARCEL_RESUMABLE_BOOKING_WINDOW_MS || "3600000", 10);
