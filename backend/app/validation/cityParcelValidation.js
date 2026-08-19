/**
 * Joi schemas for the City Parcel module.
 *
 * The model is the last line of defence, not the first. These schemas reject
 * a malformed booking before it reaches Mongoose, and give the customer a
 * usable message instead of a cast error.
 */
import Joi from "joi";
import {
  CITY_PARCEL_ATTEMPT_OUTCOMES,
  CITY_PARCEL_CUSTOMER_CHOICES,
} from "../constants/cityParcelWorkflow.js";

const trimmed = Joi.string().trim();

/** Indian mobile: 10 digits starting 6-9, with an optional +91 / 0 prefix. */
const phone = trimmed
  .pattern(/^(?:\+?91[-\s]?|0)?[6-9]\d{9}$/)
  .messages({
    "string.pattern.base": "Enter a valid 10-digit mobile number",
  });

const lat = Joi.number().min(-90).max(90).required();
const lng = Joi.number().min(-180).max(180).required();

const addressSchema = Joi.object({
  fullAddress: trimmed.min(5).max(500).required().messages({
    "string.min": "Address looks too short to find",
    "any.required": "Pick a location on the map",
  }),
  lat,
  lng,
  addressNote: trimmed.max(200).allow("").optional(),
});

const packageSchema = Joi.object({
  packageType: trimmed.min(1).max(60).required(),
  weightKg: Joi.number().min(0.1).max(100).required().messages({
    "number.max": "That is heavier than we can carry on a bike",
  }),
  description: trimmed.max(500).allow("").optional(),
  declaredValue: Joi.number().min(0).max(1000000).optional(),
});

const receiverSchema = Joi.object({
  name: trimmed.min(2).max(80).required().messages({
    "any.required": "We need a name for whoever is receiving this",
  }),
  phone: phone.required().messages({
    "any.required": "We need a number to send the delivery code to",
  }),
  altPhone: phone.allow("").optional(),
  allowAlternate: Joi.boolean().optional(),
});

/* ========================= Customer ========================= */

export const calculateCityFareSchema = Joi.object({
  pickupAddress: addressSchema.required(),
  dropAddress: addressSchema.required(),
  package: packageSchema.required(),
  deliverySpeed: trimmed.valid("normal", "express").optional(),
});

export const createCityParcelSchema = Joi.object({
  pickupAddress: addressSchema.required(),
  dropAddress: addressSchema.required(),
  receiver: receiverSchema.required(),
  package: packageSchema.required(),
  deliverySpeed: trimmed.valid("normal", "express").optional(),
  paymentMethod: trimmed.valid("UPI", "CARD", "WALLET", "COD").required(),
});

export const serviceabilitySchema = Joi.object({
  pickupLat: lat,
  pickupLng: lng,
  dropLat: lat,
  dropLng: lng,
});

export const cancelCityParcelSchema = Joi.object({
  reason: trimmed.max(300).allow("").optional(),
});

/**
 * The customer's answer to "we couldn't deliver — what now?".
 *
 * A new address is required for exactly the two choices that need one, and
 * rejected for the others so a stale address cannot ride along unnoticed.
 */
export const failureResponseSchema = Joi.object({
  choice: trimmed
    .valid(...CITY_PARCEL_CUSTOMER_CHOICES.filter((c) => c !== "NONE"))
    .required(),
  newAddress: addressSchema.optional(),
})
  .when(
    Joi.object({ choice: Joi.valid("RETURN_TO_NEW_ADDRESS", "RETRY_NEW_ADDRESS") }).unknown(),
    {
      then: Joi.object({
        newAddress: addressSchema.required().messages({
          "any.required": "Tell us which address to use instead",
        }),
      }),
      otherwise: Joi.object({ newAddress: Joi.forbidden() }),
    },
  );

/* ========================= Rider ========================= */

/** Attached to any rider action that the proximity gate applies to. */
const riderLocationSchema = Joi.object({
  lat,
  lng,
  accuracyM: Joi.number().min(0).max(10000).optional(),
});

export const riderVerifyPickupSchema = Joi.object({
  otp: trimmed
    .pattern(/^\d{4,8}$/)
    .required()
    .messages({ "string.pattern.base": "The code is 6 digits" }),
  proofImage: trimmed.required().messages({
    "any.required": "Take a photo of the parcel before you leave",
  }),
  location: riderLocationSchema.required(),
});

export const riderVerifyDeliverySchema = Joi.object({
  otp: trimmed
    .pattern(/^\d{4,8}$/)
    .required()
    .messages({ "string.pattern.base": "The code is 6 digits" }),
  /** The combined check: the rider confirms identity as well as the code. */
  nameConfirmed: Joi.boolean().valid(true).required().messages({
    "any.only": "Confirm you checked who you are handing this to",
  }),
  phoneLast4: trimmed.pattern(/^\d{4}$/).required(),
  proofImage: trimmed.required(),
  location: riderLocationSchema.required(),
  /** Only when the named receiver is absent and the customer allowed it. */
  receivedByName: trimmed.max(80).allow("").optional(),
  relationToReceiver: trimmed.max(60).allow("").optional(),
  /** Required only when the proximity gate failed. */
  overrideReason: trimmed.max(300).allow("").optional(),
});

export const riderFailedAttemptSchema = Joi.object({
  outcome: trimmed.valid(...CITY_PARCEL_ATTEMPT_OUTCOMES).required(),
  note: trimmed.max(300).allow("").optional(),
  photoUrl: trimmed.required().messages({
    "any.required": "Photograph the door so we can show the customer",
  }),
  calledAt: Joi.date().optional(),
  waitedMinutes: Joi.number().min(0).max(240).required(),
  location: riderLocationSchema.required(),
});

export const riderVerifyReturnSchema = Joi.object({
  otp: trimmed.pattern(/^\d{4,8}$/).required(),
  proofImage: trimmed.required(),
  location: riderLocationSchema.required(),
});

export const riderUpdateStatusSchema = Joi.object({
  status: trimmed
    .valid(
      "RIDER_ASSIGNED",
      "PICKUP_REACHED",
      "OUT_FOR_DELIVERY",
      "DROP_REACHED",
    )
    .required(),
  location: riderLocationSchema.optional(),
});

export const sendDeliveryOtpSchema = Joi.object({
  resend: Joi.boolean().optional(),
});

/* ========================= Admin ========================= */

export const adminOverrideDecisionSchema = Joi.object({
  approve: Joi.boolean().required(),
  note: trimmed.max(300).allow("").optional(),
});

export const adminAssignRiderSchema = Joi.object({
  deliveryPartnerId: trimmed
    .pattern(/^[a-f\d]{24}$/i)
    .required()
    .messages({ "string.pattern.base": "Pick a delivery partner" }),
});

export const adminUpdateCityConfigSchema = Joi.object({
  baseFare: Joi.number().min(0).optional(),
  perKmCharge: Joi.number().min(0).optional(),
  weightCharge: Joi.number().min(0).optional(),
  minFare: Joi.number().min(0).optional(),
  platformCharge: Joi.number().min(0).optional(),
  expressCharge: Joi.number().min(0).optional(),
  freeWaitMinutes: Joi.number().min(0).optional(),
  perMinuteWaiting: Joi.number().min(0).optional(),
  riderBaseFareSharePercent: Joi.number().min(0).max(100).optional(),
  riderDistanceFareSharePercent: Joi.number().min(0).max(100).optional(),
  returnRiderPayoutPercent: Joi.number().min(0).max(200).optional(),
  returnCustomerChargePercent: Joi.number().min(0).max(200).optional(),
  maxTripDistanceKm: Joi.number().min(1).max(200).optional(),
  maxWeightKg: Joi.number().min(0.1).max(100).optional(),
  baseSearchRadiusKm: Joi.number().min(1).max(100).optional(),
  radiusMultiplier: Joi.number().min(1).max(5).optional(),
  dropProximityMeters: Joi.number().min(20).max(2000).optional(),
  allowProximityOverride: Joi.boolean().optional(),
  maxLocationAgeSeconds: Joi.number().min(15).max(3600).optional(),
  maxDeliveryAttempts: Joi.number().min(1).max(5).optional(),
  customerResponseWindowMinutes: Joi.number().min(5).max(1440).optional(),
  minWaitAtDropMinutes: Joi.number().min(0).max(60).optional(),
  deliverySlaMinutesPerKm: Joi.number().min(1).max(60).optional(),
  deliverySlaFloorMinutes: Joi.number().min(5).max(600).optional(),
  packageDescriptionPlaceholder: trimmed.max(200).optional(),
  isEnabled: Joi.boolean().optional(),
}).min(1);
