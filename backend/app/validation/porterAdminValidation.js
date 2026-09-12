import Joi from "joi";

/**
 * Joi schemas for the porter admin forms.
 *
 * These routes previously took whatever the client sent. A letter typed into
 * a charge field reached the controller as `Number("abc") || 0` and was saved
 * as a silent zero; the pricing endpoint had no fallback at all and stored
 * `NaN`. A phone or a pincode was any string of any length.
 *
 * Modelled on `adminUpdateCityConfigSchema` in ./cityParcelValidation.js,
 * which is the one porter endpoint that already did this properly.
 *
 * NOTE ON `stripUnknown`: the validate() middleware strips keys a schema does
 * not declare, so every field a controller reads must be declared here or it
 * will stop being saved.
 */

const trimmed = Joi.string().trim();

/**
 * A human name — of a company, a place, a person.
 *
 * Digits are allowed, because "Balaji 24x7" and "Warehouse 2" are real names.
 * What is rejected is a value with no letter at all, which is what a phone
 * number typed into the name box looks like.
 */
const nameString = trimmed
  .min(2)
  .max(80)
  .pattern(/\p{L}/u)
  .messages({
    "string.pattern.base": "Name must contain letters, not just numbers",
    "string.min": "Name must be at least 2 characters",
    "string.max": "Name cannot exceed 80 characters",
    "string.empty": "Name is required",
  });

/** Indian mobile. Same rule the customer-facing city parcel schema uses. */
const phone = trimmed
  .pattern(/^(?:\+?91[-\s]?|0)?[6-9]\d{9}$/)
  .messages({ "string.pattern.base": "Enter a valid 10-digit mobile number" });

/** Indian PIN: six digits, never leading zero. */
const pincode = trimmed
  .pattern(/^[1-9]\d{5}$/)
  .messages({ "string.pattern.base": "Pincode must be 6 digits" });

const email = trimmed
  .lowercase()
  .email({ tlds: { allow: false } })
  .messages({ "string.email": "Enter a valid email address" });

const lat = Joi.number().min(-90).max(90);
const lng = Joi.number().min(-180).max(180);

/** A rupee figure. Bounded so a typo cannot set a five-crore delivery fee. */
const money = (max = 100000) => Joi.number().min(0).max(max);

const percent = Joi.number().min(0).max(100);

/** Address block for a courier office. Sent flat, alongside the name. */
const courierLocationKeys = {
  flatNo: trimmed.max(40).allow(""),
  address: trimmed.min(3).max(200).messages({
    "string.min": "Street / building address looks too short",
    "string.empty": "Street / building address is required",
  }),
  landmark: trimmed.max(120).allow(""),
  city: nameString,
  state: nameString,
  pincode,
  phone: phone.allow(""),
  fullAddress: trimmed.max(400).allow(""),
  lat: lat.allow(null),
  lng: lng.allow(null),
};

/**
 * `parseCourierLocation` reads the address from `body.location` when present
 * and from the body root otherwise, and the admin form posts it flat — so
 * both shapes have to survive validation.
 */
const courierBase = {
  platformCharge: money(),
  companyCharge: money(),
  sortOrder: Joi.number().integer().min(0).max(9999),
  isActive: Joi.boolean(),
  location: Joi.object(courierLocationKeys),
  ...courierLocationKeys,
};

export const adminCreateCourierSchema = Joi.object({
  name: nameString.required(),
  ...courierBase,
  address: courierLocationKeys.address.required(),
  city: nameString.required(),
  state: nameString.required(),
  pincode: pincode.required(),
});

/** Every field optional: the form sends only what changed. */
export const adminUpdateCourierSchema = Joi.object({
  name: nameString,
  ...courierBase,
})
  .min(1)
  .messages({ "object.min": "Nothing to update" });

/** A Mongo ObjectId string — the zone a warehouse belongs to. */
const objectIdString = trimmed
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({ "string.pattern.base": "Invalid zone selected" });

export const adminCreateWarehouseSchema = Joi.object({
  name: nameString.required(),
  address: trimmed.min(3).max(200).required().messages({
    "string.min": "Address looks too short",
    "string.empty": "Warehouse address is required",
  }),
  city: nameString.allow(""),
  pincode: pincode.allow(""),
  phone: phone.allow(""),
  email: email.allow(""),
  contactPerson: nameString.allow(""),
  lat: lat.required(),
  lng: lng.required(),
  zoneId: objectIdString.allow(""),
  isActive: Joi.boolean(),
  notes: trimmed.max(500).allow(""),
});

export const adminUpdateWarehouseSchema = Joi.object({
  name: nameString,
  address: trimmed.min(3).max(200),
  city: nameString.allow(""),
  pincode: pincode.allow(""),
  phone: phone.allow(""),
  email: email.allow(""),
  contactPerson: nameString.allow(""),
  lat,
  lng,
  zoneId: objectIdString.allow(""),
  isActive: Joi.boolean(),
  notes: trimmed.max(500).allow(""),
})
  .min(1)
  .messages({ "object.min": "Nothing to update" });

/**
 * Outstation rate card. Bounds mirror models/parcelConfig.js so a value that
 * clears validation cannot then fail schema validation on save.
 */
export const adminUpdateParcelPricingSchema = Joi.object({
  baseFare: money(),
  perKmCharge: money(10000),
  weightCharge: money(10000),
  maxWeightKg: Joi.number().min(0.1).max(50),
  expressCharge: money(),
  baseSearchRadiusKm: Joi.number().min(1).max(100),
  radiusMultiplier: Joi.number().min(1).max(5),
  riderBaseFareSharePercent: percent,
  riderDistanceFareSharePercent: percent,
  riderSharePercent: percent,
  // Passed through: the controller owns their shape, and stripping unknown
  // keys inside them would quietly drop parts of a package type.
  packageTypes: Joi.array().items(Joi.object().unknown(true)),
  packageCategories: Joi.array().items(Joi.object().unknown(true)),
})
  .min(1)
  .messages({ "object.min": "Nothing to update" });

/** Cash handed back by a rider. */
export const adminSettleCashSchema = Joi.object({
  riderId: trimmed
    .pattern(/^[a-f\d]{24}$/i)
    .required()
    .messages({ "string.pattern.base": "Select a valid rider" }),
  amount: Joi.number().greater(0).max(1000000).required().messages({
    "number.base": "Amount must be a number",
    "number.greater": "Amount must be more than 0",
  }),
  // Free text, not an enum: the service stores it verbatim as a note
  // ("Method: Cash submission"), so constraining it would break the caller.
  method: trimmed.max(60).allow(""),
});
