import mongoose from "mongoose";
import crypto from "crypto";
import { CITY_PARCEL_OTP_TYPES } from "../constants/cityParcelWorkflow.js";

/**
 * Hashed, expiring, attempt-limited verification codes for city parcels.
 *
 * Mirrors `models/orderOtp.js`, which is the proven pattern in this codebase.
 * Deliberately NOT the plaintext `otp` string field the pickup-service parcel
 * uses: this module needs three codes over a parcel's life, going to two
 * different phones, and one of those phones belongs to someone with no
 * account. A single plaintext field on the parent document cannot express
 * that, and leaks the code to anyone who can read the parcel.
 */
const cityParcelOtpSchema = new mongoose.Schema(
  {
    cityParcelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CityParcel",
      required: true,
      index: true,
    },

    /**
     * pickup       to the customer, verified by the rider at point A
     * delivery     to the receiver, verified by the rider at point B
     * return_drop  to the customer again, when a failed parcel comes back
     */
    type: {
      type: String,
      enum: CITY_PARCEL_OTP_TYPES,
      required: true,
      index: true,
    },

    codeHash: { type: String, required: true },
    /** Indexed below with a TTL, so no `index: true` here. */
    expiresAt: { type: Date, required: true },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },

    lastSentAt: { type: Date, default: null },
    resendCount: { type: Number, default: 0 },
    maxResends: { type: Number, default: 3 },

    consumedAt: { type: Date, default: null },

    /** Which phone this code went to. Useful for support and for audit. */
    sentToPhone: { type: String, default: "" },
    /**
     * Which delivery attempt this code belongs to. A retry after a failed
     * attempt issues a fresh code rather than reusing the dead one.
     */
    attemptNo: { type: Number, default: 1 },
  },
  { timestamps: true },
);

cityParcelOtpSchema.index({ cityParcelId: 1, type: 1, consumedAt: 1 });
/** Codes are worthless once expired; let Mongo reap them. */
cityParcelOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

cityParcelOtpSchema.statics.hashCode = function hashCode(plain) {
  return crypto.createHash("sha256").update(String(plain)).digest("hex");
};

/** Constant-time compare, so a wrong code cannot be found by timing. */
cityParcelOtpSchema.methods.matches = function matches(plain) {
  const candidate = Buffer.from(
    crypto.createHash("sha256").update(String(plain)).digest("hex"),
  );
  const stored = Buffer.from(String(this.codeHash));
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
};

cityParcelOtpSchema.methods.isExpired = function isExpired(now = new Date()) {
  return Boolean(this.expiresAt && this.expiresAt <= now);
};

cityParcelOtpSchema.methods.isSpent = function isSpent() {
  return Boolean(this.consumedAt) || this.attempts >= this.maxAttempts;
};

export default mongoose.model("CityParcelOtp", cityParcelOtpSchema);
