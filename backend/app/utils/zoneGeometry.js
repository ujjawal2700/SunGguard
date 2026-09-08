/**
 * Polygon maths for delivery zones.
 *
 * A zone is drawn by an admin as a ring of points on a map. Two shapes of the
 * same ring are kept: `points` ([{lat, lng}], the order the admin drew them)
 * for the map UI to render and re-edit, and a GeoJSON Polygon for MongoDB's
 * 2dsphere index. These helpers convert between the two and answer the one
 * question the rest of the app asks: is this coordinate inside that zone.
 */

/** Metres per degree of latitude. Good enough for city-scale zones. */
const M_PER_DEG_LAT = 111320;

const isFiniteNumber = (value) => Number.isFinite(Number(value));

/**
 * Coerces raw request input into a clean ring of points.
 * Returns [] when the input cannot make a polygon, so callers validate once.
 */
export const normalizePoints = (input) => {
  if (!Array.isArray(input)) return [];

  const points = [];
  for (const raw of input) {
    if (!raw) continue;
    const lat = Number(Array.isArray(raw) ? raw[0] : raw.lat);
    const lng = Number(Array.isArray(raw) ? raw[1] : raw.lng);
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return [];
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return [];
    points.push({ lat, lng });
  }

  // A ring that repeats its first point at the end is still a triangle; drop
  // the duplicate so callers count real corners.
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) points.pop();
  }

  return points;
};

/**
 * Twice the signed planar area, in squared degrees. Sign carries the winding:
 * positive is counter-clockwise with lng as x and lat as y.
 */
const signedDoubleArea = (points) => {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.lng * b.lat - b.lng * a.lat;
  }
  return sum;
};

export const centroidOf = (points) => {
  if (!points.length) return null;
  const total = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length,
  };
};

/**
 * Approximate area in km². The ring is projected to metres about its own
 * centroid before the shoelace, which holds to well under a percent at the
 * size a delivery zone is ever drawn.
 */
export const areaSqKm = (points) => {
  if (points.length < 3) return 0;

  const centroid = centroidOf(points);
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((centroid.lat * Math.PI) / 180);

  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const ax = a.lng * mPerDegLng;
    const ay = a.lat * M_PER_DEG_LAT;
    const bx = b.lng * mPerDegLng;
    const by = b.lat * M_PER_DEG_LAT;
    sum += ax * by - bx * ay;
  }

  return Math.abs(sum / 2) / 1_000_000;
};

/**
 * Builds the GeoJSON Polygon MongoDB indexes.
 *
 * The ring is forced counter-clockwise and explicitly closed. MongoDB reads
 * winding order to decide which side of the ring is "inside", so a clockwise
 * ring is not a cosmetic difference — it selects the rest of the planet.
 */
export const pointsToPolygon = (points) => {
  if (points.length < 3) return null;

  const ring = signedDoubleArea(points) < 0 ? [...points].reverse() : points;
  const coordinates = ring.map((p) => [p.lng, p.lat]);
  coordinates.push([ring[0].lng, ring[0].lat]);

  return { type: "Polygon", coordinates: [coordinates] };
};

/** Unpacks a stored GeoJSON Polygon back into drawable points. */
export const polygonToPoints = (polygon) => {
  const ring = polygon?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return [];

  const points = ring.map(([lng, lat]) => ({ lat, lng }));
  points.pop(); // drop the closing repeat
  return points;
};

/**
 * Ray casting. Used as the fallback when a 2dsphere query is unavailable —
 * the in-memory Mongo used by the test suite has no geo index.
 */
export const isPointInPolygon = (lat, lng, points) => {
  if (points.length < 3) return false;

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
