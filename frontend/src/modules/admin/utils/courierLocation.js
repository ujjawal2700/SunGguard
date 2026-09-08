import {
  checkCoords,
  checkName,
  checkPhone,
  checkPincode,
  checkText,
  firstError,
} from "./formRules";

export function composeCourierFullAddress(location = {}) {
  const flatNo = String(location.flatNo || "").trim();
  const address = String(location.address || "").trim();
  const landmark = String(location.landmark || "").trim();
  const city = String(location.city || "").trim();
  const state = String(location.state || "").trim();
  const pincode = String(location.pincode || "").trim();

  return [
    flatNo ? `Flat ${flatNo}` : "",
    address,
    landmark ? `Near ${landmark}` : "",
    city,
    state,
    pincode,
  ]
    .filter(Boolean)
    .join(", ");
}

export const emptyCourierLocation = () => ({
  flatNo: "",
  address: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  fullAddress: "",
  lat: null,
  lng: null,
  phone: "",
});

export function courierLocationFromCompany(company = {}) {
  const loc = company.location || {};
  const location = {
    flatNo: loc.flatNo || "",
    address: loc.address || "",
    landmark: loc.landmark || "",
    city: loc.city || "",
    state: loc.state || "",
    pincode: loc.pincode || "",
    fullAddress: loc.fullAddress || "",
    lat: loc.lat ?? null,
    lng: loc.lng ?? null,
    phone: loc.phone || "",
  };
  if (!location.fullAddress) {
    location.fullAddress = composeCourierFullAddress(location);
  }
  return location;
}

export function buildCourierLocationPayload(location = {}) {
  const fullAddress =
    String(location.fullAddress || "").trim() || composeCourierFullAddress(location);
  return {
    flatNo: String(location.flatNo || "").trim(),
    address: String(location.address || "").trim(),
    landmark: String(location.landmark || "").trim(),
    city: String(location.city || "").trim(),
    state: String(location.state || "").trim(),
    pincode: String(location.pincode || "").trim(),
    fullAddress,
    lat: location.lat,
    lng: location.lng,
    phone: String(location.phone || "").replace(/\D/g, "").slice(-10),
  };
}

/**
 * Checks the courier office address before it is sent.
 *
 * Presence alone used to be enough here, so a pincode of "abc" and a
 * four-digit phone both saved cleanly. The format rules now match the Joi
 * schema the server enforces, so the two cannot disagree.
 */
export function validateCourierLocationForm(location = {}) {
  return firstError(
    checkText(location.address, "Street / building address", { min: 3 }),
    checkName(location.city, "City"),
    checkName(location.state, "State"),
    checkPincode(location.pincode, "Pincode", { required: true }),
    checkPhone(location.phone, "Contact phone"),
    checkCoords(location.lat, location.lng, "Courier office location"),
  );
}
