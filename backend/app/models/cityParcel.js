import mongoose from "mongoose";
import crypto from "crypto";
import { gstBreakdownFields } from "./shared/gstSchemas.js";
import {
  CITY_PARCEL_STATUS,
  CITY_PARCEL_STATUSES,
  CITY_PARCEL_ATTEMPT_OUTCOMES,
  CITY_PARCEL_RETURN_STATUS,
  CITY_PARCEL_RETURN_STATUSES,
  CITY_PARCEL_CUSTOMER_CHOICE,
  CITY_PARCEL_CUSTOMER_CHOICES,
  CITY_PARCEL_ACTIVE_STATUSES,
  CITY_PARCEL_IN_CUSTODY_STATUSES,
} from "../constants/cityParcelWorkflow.js";

/**
 * A point-to-point city delivery.
 *
 * Separate collection from `models/parcel.js` by design. The pickup-service
 * parcel ends at a courier hub and nobody signs for it; this one ends in a
 * verified handover to a named person, and comes back if that fails. They
 * share a rider pool and a payment provider, nothing else. Keeping them
 * apart means neither can break the other.
 */

const addressSchema = new mongoose.Schema(
  {
    fullAddress: { type: String, required: true, trim: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    /** Flat number, floor, landmark — what the rider needs at the door. */
    addressNote: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const packageSchema = new mongoose.Schema(
  {
    packageType: { type: String, required: true, trim: true },
    weightKg: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true, default: "" },
    /** Customer's own valuation. Informational in v1 — no claims workflow. */
    declaredValue: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const cityParcelSchema = new mongoose.Schema(
  {
    /**
     * Short human-readable reference shown in the UI and quoted in support
     * chats. Unique, so the generator below has to be collision-proof rather
     * than merely unlikely — a clash here is a failed booking.
     */
    referenceId: {
      type: String,
      unique: true,
    },

    /* ================= The two people ================= */

    /**
     * The person who books and pays. Hands the parcel over at point A, and
     * takes it back if delivery fails. Never called "sender" anywhere.
     */
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * Who is actually standing at point A with the parcel.
     *
     * Usually the account holder, but not always — people book on behalf of
     * a shop, a relative, or a colleague. The booking form has always asked
     * for this and then thrown it away, so the rider arrived with only the
     * account name and the admin could not answer "who handed this over".
     * Defaults are empty rather than required so older bookings still load.
     */
    sender: {
      name: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
    },

    /**
     * The person waiting at point B. No account, no payment, no app —
     * they receive an OTP by SMS and take the parcel.
     */
    receiver: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      altPhone: { type: String, trim: true, default: "" },
      /**
       * Customer's decision, made at booking: may anyone at the address
       * take it, or only the named person? When false, an absent receiver
       * is a failed attempt rather than a judgement call for the rider.
       */
      allowAlternate: { type: Boolean, default: false },
      /** Filled at handover when someone other than `name` takes it. */
      receivedByName: { type: String, trim: true, default: "" },
      relationToReceiver: { type: String, trim: true, default: "" },
    },

    /* ================= The route ================= */

    /** Point A. The customer picks this themselves. */
    pickupAddress: { type: addressSchema, required: true },
    /** Point B. The customer picks this themselves. */
    dropAddress: { type: addressSchema, required: true },

    /** Optional hold between A and B. Reserved — nothing renders it in v1. */
    waypoint: {
      enabled: { type: Boolean, default: false },
      fullAddress: { type: String, trim: true, default: "" },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      reachedAt: { type: Date, default: null },
      departedAt: { type: Date, default: null },
    },

    package: { type: packageSchema, required: true },

    /**
     * The delivery zone the pickup fell inside, resolved once at booking.
     *
     * Only riders inside this zone are offered the job. Null means the parcel
     * predates zone gating, or was booked while no zone was configured — those
     * stay visible to every eligible rider, because retro-fencing a live job
     * would strand it with nobody able to see it.
     */
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryZone",
      default: null,
      index: true,
    },

    /** Road distance A to B in km, from the routing service at booking time. */
    distanceKm: { type: Number, required: true, min: 0 },

    deliverySpeed: {
      type: String,
      enum: ["normal", "express"],
      default: "normal",
      index: true,
    },

    /* ================= Money ================= */

    /**
     * The customer always pays, at booking. There is no receiver-pays mode
     * in this module and no seller in the settlement chain.
     *
     * This is the GRAND TOTAL — tax included. Everything downstream that
     * quotes money to a human (the Razorpay order, the COD amount the rider
     * collects, the invoice total) reads this one field, so keeping the tax
     * inside it is what stops the three from ever disagreeing. The pre-tax
     * value lives in `fareBreakdown.taxableAmount`, and the rider's share is
     * computed from the pre-tax line items, so no rider is ever paid a
     * percentage of somebody's GST.
     */
    fare: { type: Number, required: true, min: 0 },
    fareBreakdown: {
      baseFare: { type: Number, default: 0 },
      distanceFare: { type: Number, default: 0 },
      weightFare: { type: Number, default: 0 },
      platformCharge: { type: Number, default: 0 },
      expressCharge: { type: Number, default: 0 },
      waitingCharge: { type: Number, default: 0 },
      returnCharge: { type: Number, default: 0 },
      surgeMultiplier: { type: Number, default: 1 },
      minFareApplied: { type: Boolean, default: false },
      ...gstBreakdownFields,
    },

    /** Coupon applied at booking time, if any. Discount comes out of admin
     *  margin only — `fare` (and everything derived from it, like rider
     *  earning) is untouched; `payableFare` is what the customer is actually
     *  charged and what payment/COD collection must read. */
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
      index: true,
    },
    couponSnapshot: { type: Object, default: null },
    discountAmount: { type: Number, default: 0 },
    payableFare: { type: Number, default: 0 },

    paymentMethod: {
      type: String,
      enum: ["UPI", "CARD", "WALLET", "COD"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
      default: "PENDING",
      index: true,
    },
    razorpayOrderId: { type: String, default: null, index: true },
    razorpayPaymentId: { type: String, default: null },

    /**
     * COD means the rider collects from the CUSTOMER at pickup, then remits
     * to admin directly. No seller hub sits in the middle, unlike the
     * pickup-service flow.
     */
    codCollection: {
      amount: { type: Number, default: 0 },
      status: {
        type: String,
        enum: [
          "NOT_APPLICABLE",
          "COLLECT_PENDING",
          "RIDER_HOLDING",
          "REMITTED_TO_ADMIN",
        ],
        default: "NOT_APPLICABLE",
        index: true,
      },
      collectedAt: { type: Date, default: null },
      remittedAt: { type: Date, default: null },
    },

    /**
     * A COD customer choosing to pay digitally at pickup instead.
     *
     * When this is paid the booking stops being COD — `paymentMethod` becomes
     * UPI and `codCollection` goes back to NOT_APPLICABLE — so the money
     * lands with admin directly and never enters the rider deposit pipeline.
     */
    codOnlineQr: {
      qrId: { type: String, default: null },
      imageUrl: { type: String, default: null },
      /** Paise, matching what Razorpay was asked to collect. */
      amount: { type: Number, default: 0 },
      createdAt: { type: Date, default: null },
      paidAt: { type: Date, default: null },
      paymentId: { type: String, default: null },
    },

    /** Credited to the rider on DELIVERED, plus any return-leg payout. */
    riderEarning: { type: Number, default: 0 },
    riderReturnEarning: { type: Number, default: 0 },
    /** Held back when a delivery completes past a failed proximity check. */
    payoutWithheld: { type: Boolean, default: false, index: true },

    /* ================= Assignment ================= */

    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      default: null,
      index: true,
    },
    acceptedAt: { type: Date, default: null },
    searchExpiresAt: { type: Date, default: null, index: true },
    searchMeta: {
      radiusKm: { type: Number, default: 5 },
      attempt: { type: Number, default: 1 },
      lastBroadcastAt: { type: Date, default: null },
    },
    skippedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "Delivery" }],

    /* ================= Status ================= */

    status: {
      type: String,
      enum: CITY_PARCEL_STATUSES,
      default: CITY_PARCEL_STATUS.REQUESTED,
      index: true,
    },

    pickedUpAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: "" },

    /* ================= SLA ================= */

    pickupEta: { type: Date, default: null },
    deliveryEta: { type: Date, default: null },
    deliveryDeadline: { type: Date, default: null },

    /* ================= Proof ================= */

    pickupProofImage: { type: String, default: "" },
    deliveryProofImage: { type: String, default: "" },
    returnProofImage: { type: String, default: "" },

    /* ================= The handover at point B ================= */

    /**
     * One combined check, not a menu. OTP, name, and phone are all recorded
     * on every delivery, alongside the proximity snapshot that proves the
     * rider was actually there.
     *
     * The OTP proves WHO. The proximity proves WHERE. Neither substitutes
     * for the other: a rider can phone a receiver from three streets away
     * and read out a code without ever arriving.
     */
    dropVerification: {
      otpVerifiedAt: { type: Date, default: null },
      /** Rider confirms on screen that the person named themselves correctly. */
      nameConfirmed: { type: Boolean, default: false },
      /** Last 4 digits the rider read back. Never the full number. */
      phoneLast4: { type: String, default: "" },

      /** Snapshot of the proximity gate at the moment of submission. */
      riderLat: { type: Number, default: null },
      riderLng: { type: Number, default: null },
      distanceMeters: { type: Number, default: null },
      gpsAccuracyM: { type: Number, default: null },
      locationAgeSeconds: { type: Number, default: null },
      proximityPassed: { type: Boolean, default: false },

      /** Set when the rider completes despite a failed gate. */
      overrideReason: { type: String, trim: true, default: "" },
      overrideApprovedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null,
      },
      overrideApprovedAt: { type: Date, default: null },
      overrideRejectedAt: { type: Date, default: null },
    },

    /* ================= When it goes wrong ================= */

    /**
     * Five causes, one outcome. The cause is kept for reporting and
     * disputes; it never changes where the parcel goes.
     */
    attemptHistory: [
      {
        attemptNo: { type: Number, required: true },
        at: { type: Date, default: Date.now },
        outcome: { type: String, enum: CITY_PARCEL_ATTEMPT_OUTCOMES },
        note: { type: String, trim: true, default: "" },
        photoUrl: { type: String, default: "" },
        /** Evidence the rider actually tried, not just a claim. */
        calledAt: { type: Date, default: null },
        waitedMinutes: { type: Number, default: 0 },
        riderLat: { type: Number, default: null },
        riderLng: { type: Number, default: null },
      },
    ],

    /** The leg that carries a failed parcel back to the customer. */
    returnLeg: {
      required: { type: Boolean, default: false },
      status: {
        type: String,
        enum: CITY_PARCEL_RETURN_STATUSES,
        default: CITY_PARCEL_RETURN_STATUS.NONE,
        index: true,
      },
      /**
       * Where it goes back to. Defaults to pickupAddress — point A — but
       * the customer may nominate somewhere else, because they may be at
       * work rather than at home when we call them.
       */
      returnAddress: { type: addressSchema, default: null },
      customerChoice: {
        type: String,
        enum: CITY_PARCEL_CUSTOMER_CHOICES,
        default: CITY_PARCEL_CUSTOMER_CHOICE.NONE,
      },
      customerNotifiedAt: { type: Date, default: null },
      customerRespondedAt: { type: Date, default: null },
      /** When the auto-return default fires if the customer stays silent. */
      responseDeadlineAt: { type: Date, default: null },
      startedAt: { type: Date, default: null },
      returnedAt: { type: Date, default: null },
      /** Billed to the customer. Independent of the rider payout below. */
      customerCharge: { type: Number, default: 0 },
      /** Paid to the rider. The failure was not theirs. */
      riderPayout: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

/* ================= Indexes ================= */

cityParcelSchema.index({ customerId: 1, createdAt: -1 });
cityParcelSchema.index({ status: 1, createdAt: -1 });
cityParcelSchema.index({ deliveryPartnerId: 1, status: 1 });
cityParcelSchema.index({ status: 1, searchExpiresAt: 1 });
cityParcelSchema.index({ status: 1, deliveryDeadline: 1 });
cityParcelSchema.index({ "receiver.phone": 1 });
cityParcelSchema.index({ "returnLeg.status": 1, "returnLeg.responseDeadlineAt": 1 });
cityParcelSchema.index({ payoutWithheld: 1, status: 1 });

/* ================= Helpers ================= */

/**
 * Crockford-style base32: no I, L, O or U, so a reference read over the
 * phone to a support agent cannot be misheard as a digit or turned into a
 * word nobody wants to say out loud.
 */
const REF_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateCityParcelReference() {
  const stamp = Date.now().toString(32).toUpperCase().slice(-5);
  const bytes = crypto.randomBytes(7);
  let rand = "";
  for (const byte of bytes) rand += REF_ALPHABET[byte % REF_ALPHABET.length];
  return `CP-${stamp}${rand}`;
}

/**
 * Human-readable reference, generated once before the first save.
 *
 * Time prefix plus six crypto-random base32 characters. An earlier version
 * used Math.random over three characters and collided three times in twenty
 * thousand — which, against a unique index, is three customers who cannot
 * book.
 */
cityParcelSchema.pre("validate", function assignReference(next) {
  if (!this.referenceId) {
    this.referenceId = generateCityParcelReference();
  }
  next();
});

/**
 * Keeps `payableFare` (what payment/COD collection reads) correct even for
 * code paths that set `fare`/`discountAmount` without also setting
 * `payableFare` explicitly — it always equals `fare - discountAmount`.
 */
cityParcelSchema.pre("validate", function syncPayableFare(next) {
  if (this.isModified("fare") || this.isModified("discountAmount") || this.payableFare == null) {
    this.payableFare = Math.max(0, Number(this.fare || 0) - Number(this.discountAmount || 0));
  }
  next();
});

/**
 * Create a parcel, retrying if the generated reference happens to collide.
 *
 * Entropy alone cannot make a unique index safe — it only makes a clash
 * rare, and a rare clash is still a customer staring at a failed booking.
 * Catching the duplicate-key error and drawing a new reference makes it
 * impossible instead of unlikely. Always use this rather than `.create()`.
 */
cityParcelSchema.statics.createWithReference = async function createWithReference(
  doc,
  { maxAttempts = 5 } = {},
) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await this.create({ ...doc, referenceId: generateCityParcelReference() });
    } catch (err) {
      const isDuplicateReference =
        err?.code === 11000 && Boolean(err?.keyPattern?.referenceId);
      if (!isDuplicateReference) throw err;
      lastError = err;
    }
  }

  throw lastError;
};

cityParcelSchema.methods.isActive = function isActive() {
  return CITY_PARCEL_ACTIVE_STATUSES.includes(this.status);
};

/** True once the rider physically holds the parcel. */
cityParcelSchema.methods.isInRiderCustody = function isInRiderCustody() {
  return CITY_PARCEL_IN_CUSTODY_STATUSES.includes(this.status);
};

cityParcelSchema.methods.isCod = function isCod() {
  return String(this.paymentMethod || "").toUpperCase() === "COD";
};

/** How many delivery attempts have been made at point B. */
cityParcelSchema.methods.attemptCount = function attemptCount() {
  return Array.isArray(this.attemptHistory) ? this.attemptHistory.length : 0;
};

/**
 * Never send the whole document to a rider — it carries the customer's
 * payment identifiers and the receiver's full phone number.
 */
export const RIDER_SAFE_FIELDS = [
  "referenceId",
  "status",
  "pickupAddress",
  // Who the rider is meeting at point A, and the number to call.
  "sender",
  "dropAddress",
  "package",
  // Needed so the rider feed can drop jobs whose zone the rider is outside.
  "zoneId",
  "distanceKm",
  "deliverySpeed",
  "paymentMethod",
  // Without paymentStatus the rider app cannot tell an already-paid job
  // from an unpaid one, and codOnlineQr is what lets it resume a
  // doorstep pay-by-QR that is already in flight.
  "paymentStatus",
  "codOnlineQr",
  "codCollection",
  /**
   * The rider's stored payout, which is only written once the job is settled.
   * Until then it is 0, so the available-jobs feed recomputes the offer from
   * the two line items below.
   */
  "riderEarning",
  /**
   * The pre-tax line items the payout is a percentage of.
   *
   * `fetchAvailableForRider` maps `computeRiderEarning(parcel.fareBreakdown)`
   * over this projection. Without these two fields that argument was
   * undefined, the helper fell through to `Number(undefined) || 0` twice, and
   * every open city job was advertised to every rider as "earn ₹0" — which is
   * a job no rider accepts. Only these two are projected, not the whole
   * breakdown: they are all the payout maths reads, and the rest of the fare
   * is none of the rider's business.
   */
  "fareBreakdown.baseFare",
  "fareBreakdown.distanceFare",
  "pickupEta",
  "deliveryEta",
  "deliveryDeadline",
  "attemptHistory",
  "returnLeg",
  "waypoint",
  "acceptedAt",
  "pickedUpAt",
  "createdAt",
].join(" ");

export default mongoose.model("CityParcel", cityParcelSchema);
