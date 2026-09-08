/**
 * Field rules shared by the porter admin forms.
 *
 * Two layers, because they catch different mistakes:
 *
 *   Masks run on every keystroke and simply refuse characters that can never
 *   belong — a letter typed into a phone box, an eleventh digit in a pincode.
 *   Nothing invalid ever reaches component state, so there is no error to
 *   show and nothing to clear.
 *
 *   Validators run on submit and judge the finished value: a phone that is
 *   only six digits is not wrong to type, it is wrong to save.
 *
 * Both mirror what the server enforces. The server is the authority; these
 * exist so an admin is corrected while typing rather than by a red toast
 * after a round trip.
 */

/* ── Masks ──────────────────────────────────────────────────────────────── */

export const maskDigits = (value, max) =>
  String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, max);

/** Indian mobile: ten digits, no more. */
export const maskPhone = (value) => maskDigits(value, 10);

/** Indian PIN: six digits, no more. */
export const maskPincode = (value) => maskDigits(value, 6);

/**
 * A name, place or person.
 *
 * Digits stay allowed — "Balaji 24x7 Couriers" and "Warehouse 2" are real
 * names. What the validator refuses is a value with no letter in it at all,
 * which is the actual mistake: a phone number typed into the name box.
 */
export const maskName = (value, max = 80) =>
  String(value ?? "")
    .replace(/[^\p{L}\p{N}\s&.,'’\-/()]/gu, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, max);

/**
 * Money and rates. Keeps one optional decimal point and drops everything a
 * number cannot contain — including the `e`, `+` and `-` that a native
 * number input silently accepts.
 */
export const maskAmount = (value, { decimals = 2, max = 9 } = {}) => {
  const cleaned = String(value ?? "").replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  const head = whole.slice(0, max);
  if (!rest.length) return head;
  return `${head}.${rest.join("").slice(0, decimals)}`;
};

/** Whole counts — quantities, sort order, minutes. */
export const maskInteger = (value, max = 6) => maskDigits(value, max);

/* ── Validators ─────────────────────────────────────────────────────────── */

const PHONE = /^[6-9]\d{9}$/;
const PINCODE = /^[1-9]\d{5}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const HAS_LETTER = /\p{L}/u;

/**
 * A required name. Rejects an all-digits value, which is how a phone number
 * ends up saved as a warehouse name.
 */
export const checkName = (value, label, { min = 2, max = 80 } = {}) => {
  const text = String(value ?? "").trim();
  if (!text) return `${label} is required`;
  if (text.length < min) return `${label} must be at least ${min} characters`;
  if (text.length > max) return `${label} cannot exceed ${max} characters`;
  if (!HAS_LETTER.test(text)) return `${label} must contain letters, not just numbers`;
  return null;
};

/** Free text that is required but not a name — an address line, say. */
export const checkText = (value, label, { min = 3, max = 200 } = {}) => {
  const text = String(value ?? "").trim();
  if (!text) return `${label} is required`;
  if (text.length < min) return `${label} looks too short`;
  if (text.length > max) return `${label} cannot exceed ${max} characters`;
  return null;
};

/** `required: false` lets a field stay blank but still be judged if filled. */
export const checkPhone = (value, label = "Phone", { required = false } = {}) => {
  const text = String(value ?? "").trim();
  if (!text) return required ? `${label} is required` : null;
  if (!PHONE.test(text)) return `${label} must be a 10-digit number starting 6-9`;
  return null;
};

export const checkPincode = (value, label = "Pincode", { required = false } = {}) => {
  const text = String(value ?? "").trim();
  if (!text) return required ? `${label} is required` : null;
  if (!PINCODE.test(text)) return `${label} must be 6 digits`;
  return null;
};

export const checkEmail = (value, label = "Email", { required = false } = {}) => {
  const text = String(value ?? "").trim();
  if (!text) return required ? `${label} is required` : null;
  if (!EMAIL.test(text)) return `${label} is not a valid email address`;
  return null;
};

export const checkAmount = (
  value,
  label,
  { required = true, min = 0, max = 1000000 } = {},
) => {
  const text = String(value ?? "").trim();
  if (!text) return required ? `${label} is required` : null;

  const num = Number(text);
  if (!Number.isFinite(num)) return `${label} must be a number`;
  if (num < min) return `${label} cannot be less than ${min}`;
  if (num > max) return `${label} cannot exceed ${max.toLocaleString("en-IN")}`;
  return null;
};

/** Latitude/longitude, as picked on a map rather than typed. */
export const checkCoords = (lat, lng, label = "Location") => {
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
    return `Pick the ${label.toLowerCase()} on the map`;
  }
  if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
    return `${label} coordinates are out of range`;
  }
  return null;
};

/**
 * First failure from a list of checks, or null when they all pass.
 * Order the list the way the form reads, so the message points at the field
 * the admin will look at first.
 */
export const firstError = (...errors) => errors.find(Boolean) || null;
