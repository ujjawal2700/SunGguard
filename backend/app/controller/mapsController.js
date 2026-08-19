import handleResponse from "../utils/helper.js";
import {
  geocodeAddress,
  geocodePlaceId,
  reverseGeocode,
} from "../services/mapsGeocodeService.js";

export const geocodeAddressController = async (req, res) => {
  try {
    const address = String(req.query.address || "").trim();
    const placeId = String(req.query.placeId || "").trim();
    const country = req.query.country ? String(req.query.country).trim() : undefined;

    if (!placeId && (!address || address.length < 3)) {
      return handleResponse(res, 400, "address or placeId query param is required", {
        error: { code: "ADDRESS_REQUIRED", message: "address query param is required" },
      });
    }

    const result = placeId
      ? await geocodePlaceId(placeId)
      : await geocodeAddress(address, { country });

    return handleResponse(res, 200, "Geocoded", {
      location: { lat: result.lat, lng: result.lng },
      formattedAddress: result.formattedAddress,
      placeId: result.placeId,
      types: result.types,
    });
  } catch (e) {
    const status = e.statusCode || 500;
    return handleResponse(res, status, e.message || "Geocoding failed", {
      error: {
        code: e.code || "GEOCODE_FAILED",
        message: e.message || "Geocoding failed",
      },
    });
  }
};

/**
 * Coordinates -> address. This is what makes "detect my location" produce
 * something a customer recognises instead of a pair of numbers.
 *
 * Kept server-side like forward geocoding so the API key is never shipped to
 * a client and the shared cache absorbs repeat lookups from the same spot.
 */
export const reverseGeocodeController = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const result = await reverseGeocode(lat, lng);

    return handleResponse(res, 200, "Address found", {
      location: { lat: result.lat, lng: result.lng },
      formattedAddress: result.formattedAddress,
      placeId: result.placeId,
      components: result.components || {},
    });
  } catch (e) {
    const status = e.statusCode || 500;
    return handleResponse(res, status, e.message || "Reverse geocoding failed", {
      error: {
        code: e.code || "REVERSE_GEOCODE_FAILED",
        message: e.message || "Reverse geocoding failed",
      },
    });
  }
};
