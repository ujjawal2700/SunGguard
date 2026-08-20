import { useCallback, useRef, useState } from "react";
import axiosInstance from "@core/api/axios";
import { unwrap } from "@core/api/unwrap";

/**
 * Find where the customer is and turn it into an address.
 *
 * Two steps that fail independently and must be reported separately: the
 * browser can refuse to give coordinates (permission, no signal, insecure
 * origin), or it can give them and the lookup can fail. Collapsing both into
 * "couldn't find you" leaves someone re-tapping a button that will never work.
 */

const DENIED =
  "Location is blocked. Allow it in your browser settings, or pin the spot on the map.";
const UNAVAILABLE =
  "We couldn't get a fix on your location. Pin it on the map instead.";
const TIMEOUT =
  "Finding your location took too long. Try again, or pin it on the map.";
const NO_SUPPORT = "This browser can't share your location. Pin it on the map.";

function readPosition({ highAccuracy = true, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const err = new Error(NO_SUPPORT);
      err.code = "NO_SUPPORT";
      return reject(err);
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      (geoErr) => {
        const err = new Error(
          geoErr.code === 1 ? DENIED : geoErr.code === 3 ? TIMEOUT : UNAVAILABLE,
        );
        err.code =
          geoErr.code === 1 ? "DENIED" : geoErr.code === 3 ? "TIMEOUT" : "UNAVAILABLE";
        reject(err);
      },
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 30000 },
    );
  });
}

/** Coordinates -> address, via the server so the API key stays server-side. */
export async function lookupAddress(lat, lng) {
  const { data } = await axiosInstance.get("/maps/reverse-geocode", {
    params: { lat, lng },
  });
  const payload = unwrap({ data }) || {};
  return {
    formattedAddress: payload.formattedAddress || "",
    components: payload.components || {},
    placeId: payload.placeId || null,
  };
}

export function useCurrentLocation() {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  // A permission refusal is permanent until the user changes a browser
  // setting, so auto-detect must not keep asking on every mount.
  const deniedRef = useRef(false);

  const detect = useCallback(
    async ({ silent = false } = {}) => {
      if (deniedRef.current && silent) return null;

      setLocating(true);
      setError(null);
      try {
        const coords = await readPosition();
        let address = { formattedAddress: "", components: {} };
        try {
          address = await lookupAddress(coords.lat, coords.lng);
        } catch {
          // Coordinates alone are still useful: the pin lands correctly and
          // the customer can type the address themselves.
        }
        return { ...coords, ...address };
      } catch (err) {
        if (err.code === "DENIED") deniedRef.current = true;
        setError(err.message);
        if (!silent) throw err;
        return null;
      } finally {
        setLocating(false);
      }
    },
    [],
  );

  return { detect, locating, error, wasDenied: () => deniedRef.current };
}

export default useCurrentLocation;
