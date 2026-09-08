import { reverseGeocode } from "./mapsGeocodeService.js";
import logger from "./logger.js";

/**
 * Fills in the address labels a saved location left blank, from its own
 * coordinates.
 *
 * The coordinates are the part that matters — riders navigate by them — and
 * they are always picked on a map. The city, state and pincode beside them
 * are typed, so they go missing, or worse, stay behind from an earlier
 * address while the pin moves somewhere else entirely.
 *
 * Only blanks are filled. A value the admin actually entered is left alone:
 * local naming varies ("Bhopal" vs "Bhopal District" vs a locality name) and
 * silently rewriting a deliberate entry would be worse than accepting it.
 *
 * Never throws. A geocoder outage must not stop a warehouse being saved —
 * the record is still usable without a city label.
 */
export async function backfillAddressLabels(record = {}) {
  const { lat, lng } = record;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return {};

  const missing = ["city", "state", "pincode"].filter(
    (key) => !String(record[key] || "").trim(),
  );
  if (!missing.length) return {};

  try {
    // reverseGeocode nests the parsed parts under `components`; the top level
    // carries the raw formatted address and place id.
    const { components = {} } = await reverseGeocode(Number(lat), Number(lng));
    const filled = {};
    for (const key of missing) {
      const value = String(components[key] || "").trim();
      if (value) filled[key] = value;
    }
    return filled;
  } catch (error) {
    logger.warn("Address backfill skipped", { message: error?.message });
    return {};
  }
}
