import { useJsApiLoader } from "@react-google-maps/api";

/**
 * The one place Google Maps is loaded.
 *
 * `useJsApiLoader` keeps a single global loader. Calling it twice with any
 * difference — a different `id`, or a different `libraries` array — throws
 * "Loader must not be called again with different options" and takes the
 * whole page down with it.
 *
 * That is easy to trip: one screen wants `places` for autocomplete, another
 * wants `geometry` for distance maths, and the moment a user visits both in
 * one session the second one crashes. Fixing it per-component does not hold,
 * because the next component to need a library reintroduces it.
 *
 * So the id and the library list are fixed here, as the union of everything
 * the app uses, and every screen loads maps through this hook. Adding a
 * library means adding it to LIBRARIES below — never at a call site.
 */

const LOADER_ID = "google-map-script";

/**
 * Frozen module-level constant. A fresh array literal on each render is a
 * new reference, which the loader reads as different options.
 */
const LIBRARIES = Object.freeze(["places", "geometry"]);

export function useMapsLoader() {
  return useJsApiLoader({
    id: LOADER_ID,
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES,
  });
}

/** True when a key is configured at all — lets a screen degrade gracefully. */
export function hasMapsKey() {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
}

export default useMapsLoader;
