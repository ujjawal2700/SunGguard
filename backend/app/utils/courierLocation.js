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

export function parseCourierLocation(body = {}) {
  const source = body?.location && typeof body.location === "object" ? body.location : body;

  const flatNo = String(source.flatNo || "").trim();
  const address = String(source.address || "").trim();
  const landmark = String(source.landmark || "").trim();
  const city = String(source.city || "").trim();
  const state = String(source.state || "").trim();
  const pincode = String(source.pincode || "").trim();
  const phone = String(source.phone || "").replace(/\D/g, "").slice(-10);

  const latRaw = source.lat;
  const lngRaw = source.lng;
  const lat =
    latRaw !== undefined && latRaw !== null && latRaw !== ""
      ? Number(latRaw)
      : null;
  const lng =
    lngRaw !== undefined && lngRaw !== null && lngRaw !== ""
      ? Number(lngRaw)
      : null;

  const location = {
    flatNo,
    address,
    landmark,
    city,
    state,
    pincode,
    phone: phone || "",
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    fullAddress: "",
  };

  location.fullAddress =
    String(source.fullAddress || "").trim() || composeCourierFullAddress(location);

  return location;
}

export function isCourierLocationEmpty(location = {}) {
  return (
    !String(location.flatNo || "").trim() &&
    !String(location.address || "").trim() &&
    !String(location.landmark || "").trim() &&
    !String(location.city || "").trim() &&
    !String(location.state || "").trim() &&
    !String(location.pincode || "").trim() &&
    !String(location.phone || "").trim() &&
    !Number.isFinite(location.lat) &&
    !Number.isFinite(location.lng)
  );
}

export function validateCourierLocation(location) {
  // Office location is optional. Only validate when the admin actually
  // provides some address details (e.g. the "Other" option leaves it blank).
  if (isCourierLocationEmpty(location)) {
    return null;
  }
  if (!location.address) {
    return "Street / building address is required";
  }
  if (!location.city) {
    return "City is required";
  }
  if (!location.state) {
    return "State is required";
  }
  if (!location.pincode) {
    return "Pincode is required";
  }
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    return "Please select the courier office location on the map";
  }
  return null;
}
