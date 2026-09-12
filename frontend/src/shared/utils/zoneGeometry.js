/**
 * Client-side twin of backend/app/utils/zoneGeometry.js's `isPointInPolygon`.
 *
 * Kept in sync deliberately so a pin the customer/rider/admin sees rejected
 * on screen is exactly the one the server would also reject — the ring
 * (`zone.points`) comes from the same `/porter/zones/active` payload either
 * side reads, so there is only one geometry to keep in step, not two
 * definitions of "inside" that could quietly drift apart.
 */
export const isPointInPolygon = (lat, lng, points) => {
  if (!Array.isArray(points) || points.length < 3) return false;

  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    const straddles = a.lat > lat !== b.lat > lat;
    if (!straddles) continue;

    const crossingLng = ((b.lng - a.lng) * (lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (lng < crossingLng) inside = !inside;
  }

  return inside;
};

/** The zones (from a `/porter/zones/active` list) whose ring contains the point. */
export const zonesContainingPoint = (zones, lat, lng) => {
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return [];
  return (zones || []).filter((zone) => isPointInPolygon(numLat, numLng, zone.points || []));
};

/**
 * "Zone name — City", except a zone named after its own city (the common
 * case — an admin drawing one zone per city just types the city name) would
 * otherwise read as "Ujjain — Ujjain". Comparison is case/space-insensitive
 * so "Ujjain " vs "ujjain" still collapses to one.
 */
export const formatZoneLabel = (name, city) => {
  const trimmedName = String(name || "").trim();
  const trimmedCity = String(city || "").trim();
  if (!trimmedCity || trimmedCity.toLowerCase() === trimmedName.toLowerCase()) {
    return trimmedName;
  }
  return `${trimmedName} — ${trimmedCity}`;
};
