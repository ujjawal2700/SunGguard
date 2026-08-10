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

export function validateCourierLocationForm(location = {}) {
  if (!String(location.address || "").trim()) {
    return "Street / building address is required";
  }
  if (!String(location.city || "").trim()) {
    return "City is required";
  }
  if (!String(location.state || "").trim()) {
    return "State is required";
  }
  if (!String(location.pincode || "").trim()) {
    return "Pincode is required";
  }
  if (!location.lat || !location.lng) {
    return "Please select the courier office location on the map";
  }
  return null;
}
