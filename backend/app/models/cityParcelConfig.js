import mongoose from "mongoose";
import { gstConfigSchema } from "./shared/gstSchemas.js";

/**
 * Rate card and operating thresholds for the City Parcel module.
 *
 * Deliberately a separate singleton from `models/parcelConfig.js`. The
 * pickup-service rate card prices a first mile to a courier hub; this one
 * prices a complete A-to-B trip including a possible return leg. Sharing one
 * document would force every pricing change on either product to be reasoned
 * about twice.
 */
const cityParcelConfigSchema = new mongoose.Schema(
  {
    /* ---------------- Pricing ---------------- */

    /**
     * Charged on every trip regardless of distance. This is what makes short
     * hops viable for a rider; without it a 1 km job pays almost nothing.
     */
    baseFare: { type: Number, default: 30, min: 0 },
    perKmCharge: { type: Number, default: 12, min: 0 },
    /** Per kg, applied to the declared package weight. */
    weightCharge: { type: Number, default: 10, min: 0 },
    /** Floor for the total customer fare, applied after everything else. */
    minFare: { type: Number, default: 45, min: 0 },
    /** Platform's cut, added to the customer fare. */
    platformCharge: { type: Number, default: 0, min: 0 },
    /** Added when the customer picks the faster option. */
    expressCharge: { type: Number, default: 0, min: 0 },

    /* ---------------- Tax ---------------- */

    /**
     * GST on the local fare. Deliberately independent of the outstation rate
     * card in models/parcelConfig.js — the two products are commonly brought
     * under tax at different times, and at different rates.
     */
    gst: { type: gstConfigSchema, default: () => ({}) },

    /* ---------------- Waiting ---------------- */

    /** Free wait at either end before the meter starts. */
    freeWaitMinutes: { type: Number, default: 5, min: 0 },
    perMinuteWaiting: { type: Number, default: 2, min: 0 },

    /* ---------------- Rider share ---------------- */

    riderBaseFareSharePercent: { type: Number, default: 80, min: 0, max: 100 },
    riderDistanceFareSharePercent: { type: Number, default: 80, min: 0, max: 100 },

    /* ---------------- Return leg ---------------- */

    /**
     * What the rider is paid for carrying a failed parcel back, as a
     * percentage of the original distance fare. The failure was not theirs,
     * and the leg is real work.
     */
    returnRiderPayoutPercent: { type: Number, default: 60, min: 0, max: 200 },
    /**
     * What the CUSTOMER is billed for the return, as a percentage of the
     * original fare. Defaults to zero — absorbing returns is a common
     * launch stance. Deliberately independent of the rider payout above so
     * the platform can pay the rider in full while charging nothing.
     */
    returnCustomerChargePercent: { type: Number, default: 0, min: 0, max: 200 },

    /* ---------------- Serviceability ---------------- */

    /** Longest A-to-B trip accepted as a single city delivery. */
    maxTripDistanceKm: { type: Number, default: 30, min: 1, max: 200 },
    /** Heaviest package accepted. */
    maxWeightKg: { type: Number, default: 20, min: 0.1, max: 100 },

    /* ---------------- Rider search ---------------- */

    baseSearchRadiusKm: { type: Number, default: 5, min: 1, max: 100 },
    radiusMultiplier: { type: Number, default: 1.6, min: 1, max: 5 },

    /* ---------------- Verification ---------------- */

    /**
     * How close the rider must be to point B before the app will accept a
     * delivery verification. Generous on purpose: a phone reads 5-10 m in
     * the open but 30-60 m in a stairwell, a basement, or a gated society,
     * which is exactly where parcels get delivered.
     */
    dropProximityMeters: { type: Number, default: 120, min: 20, max: 2000 },
    /**
     * Whether a rider may complete past a failed proximity check by giving a
     * reason. The delivery is flagged for admin review and the payout is
     * withheld until approved. Turning this off strands riders at real doors,
     * so it defaults on.
     */
    allowProximityOverride: { type: Boolean, default: true },
    /**
     * Refuse to gate on a GPS fix older than this. Stale coordinates are
     * worse than no coordinates — they look authoritative and are not.
     */
    maxLocationAgeSeconds: { type: Number, default: 120, min: 15, max: 3600 },

    /* ---------------- Attempts and SLA ---------------- */

    maxDeliveryAttempts: { type: Number, default: 2, min: 1, max: 5 },
    /** How long the customer has to answer the failed-attempt prompt. */
    customerResponseWindowMinutes: { type: Number, default: 30, min: 5, max: 1440 },
    /** Minimum minutes a rider must wait at the door before failing an attempt. */
    minWaitAtDropMinutes: { type: Number, default: 5, min: 0, max: 60 },

    deliverySlaMinutesPerKm: { type: Number, default: 4, min: 1, max: 60 },
    deliverySlaFloorMinutes: { type: Number, default: 30, min: 5, max: 600 },

    /* ---------------- Booking form options ---------------- */

    packageTypes: {
      type: [
        new mongoose.Schema(
          {
            value: { type: String, required: true, trim: true },
            label: { type: String, required: true, trim: true },
            isActive: { type: Boolean, default: true },
          },
          { _id: false },
        ),
      ],
      default: () => [
        { value: "document", label: "Documents", isActive: true },
        { value: "food", label: "Food", isActive: true },
        { value: "clothes", label: "Clothes", isActive: true },
        { value: "electronics", label: "Electronics", isActive: true },
        { value: "medicine", label: "Medicine", isActive: true },
        { value: "other", label: "Something else", isActive: true },
      ],
    },

    packageDescriptionPlaceholder: {
      type: String,
      default: "Keys, documents, a birthday gift...",
      trim: true,
    },

    /** Master switch. Lets ops dark-launch or pull the module without a deploy. */
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** Singleton accessor — creates the document on first read. */
cityParcelConfigSchema.statics.getConfig = async function getConfig() {
  const existing = await this.findOne();
  if (existing) return existing;
  return this.create({});
};

/**
 * Just the fields the rider-matching code needs, as plain numbers.
 * Kept separate so hot paths do not carry the whole rate card around.
 */
cityParcelConfigSchema.statics.getSearchSettings = async function getSearchSettings() {
  const config = await this.getConfig();
  return {
    baseSearchRadiusKm: config.baseSearchRadiusKm,
    radiusMultiplier: config.radiusMultiplier,
    riderBaseFareSharePercent: config.riderBaseFareSharePercent,
    riderDistanceFareSharePercent: config.riderDistanceFareSharePercent,
  };
};

/** Just the verification thresholds, for the proximity gate. */
cityParcelConfigSchema.statics.getVerificationSettings =
  async function getVerificationSettings() {
    const config = await this.getConfig();
    return {
      dropProximityMeters: config.dropProximityMeters,
      allowProximityOverride: config.allowProximityOverride,
      maxLocationAgeSeconds: config.maxLocationAgeSeconds,
      maxDeliveryAttempts: config.maxDeliveryAttempts,
      minWaitAtDropMinutes: config.minWaitAtDropMinutes,
      customerResponseWindowMinutes: config.customerResponseWindowMinutes,
    };
  };

export default mongoose.model("CityParcelConfig", cityParcelConfigSchema);
