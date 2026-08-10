import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { customerApi } from "../services/customerApi";
import { hasValidStoredAuthToken } from "@core/utils/authStorage";
import { getJSON, setJSON, remove, STORAGE_KEYS } from "@core/utils/storage";

const LocationContext = createContext(undefined);
const STORAGE_KEY = STORAGE_KEYS.LOCATION;
// 30 days — refresh the cached coordinates if a user comes back to a stale tab
// after roughly a month so we don't keep serving locations from a previous
// address indefinitely.
const LOCATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const EMPTY_LOCATION = {
  name: "",
  time: "",
  city: "",
  state: "",
  pincode: "",
  latitude: null,
  longitude: null,
};

/** Old hardcoded Indore seed — treat as unset so users get the location prompt. */
const LEGACY_DEFAULT = {
  latitude: 22.711140989838025,
  longitude: 75.9001552518043,
};

export const isValidDeliveryLocation = (loc) =>
  Number.isFinite(Number(loc?.latitude)) &&
  Number.isFinite(Number(loc?.longitude));

const isLegacyDefaultLocation = (loc) => {
  if (!isValidDeliveryLocation(loc)) return false;
  return (
    Math.abs(Number(loc.latitude) - LEGACY_DEFAULT.latitude) < 1e-5 &&
    Math.abs(Number(loc.longitude) - LEGACY_DEFAULT.longitude) < 1e-5
  );
};

export const LocationProvider = ({ children }) => {
  const [currentLocation, setCurrentLocation] = useState(EMPTY_LOCATION);
  const [locationHydrated, setLocationHydrated] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [locationError, setLocationError] = useState(null);
  // Start open so first paint can show the gate as soon as hydration completes.
  const [promptOpen, setPromptOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const hasLocation = isValidDeliveryLocation(currentLocation);
  const needsLocation = locationHydrated && !hasLocation;

  const updateLocation = (
    newLoc,
    { persist = true, updateSavedHome = false } = {},
  ) => {
    setCurrentLocation(newLoc);

    if (updateSavedHome) {
      setSavedAddresses((prev) =>
        prev.map((addr) =>
          addr.label === "Home" ? { ...addr, address: newLoc.name } : addr,
        ),
      );
    }

    if (isValidDeliveryLocation(newLoc)) {
      setPromptOpen(false);
      setDrawerOpen(false);
      if (persist) {
        const payload = {
          address: newLoc.name,
          city: newLoc.city,
          state: newLoc.state,
          pincode: newLoc.pincode,
          latitude: newLoc.latitude,
          longitude: newLoc.longitude,
          time: newLoc.time,
        };
        setJSON(STORAGE_KEY, payload, { ttlMs: LOCATION_TTL_MS });
      }
    }
  };

  const addAddress = (newAddress) => {
    setSavedAddresses((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        label: newAddress.label || "Other",
        address: newAddress.address,
        phone: newAddress.phone || "N/A",
        isCurrent: false,
      },
    ]);
  };

  const fetchAndCacheLocation = useCallback(
    () =>
      new Promise((resolve) => {
        if (
          typeof window === "undefined" ||
          !("navigator" in window) ||
          !navigator.geolocation
        ) {
          const message = "Geolocation is not supported on this device";
          setLocationError(message);
          resolve({ ok: false, error: message });
          return;
        }

        setIsFetchingLocation(true);
        setLocationError(null);

        const fallbackFromCoords = (latitude, longitude) => ({
          name: `Lat ${Number(latitude).toFixed(5)}, Lng ${Number(longitude).toFixed(5)}`,
          time: "12-15 mins",
          city: "",
          state: "",
          pincode: "",
          latitude,
          longitude,
        });

        const handleLocationSuccess = async (latitude, longitude) => {
          try {
            let liveLocation = fallbackFromCoords(latitude, longitude);
            const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

            if (apiKey) {
              const params = new URLSearchParams({
                latlng: `${latitude},${longitude}`,
                key: apiKey,
              });

              const response = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
              );

              if (!response.ok) {
                throw new Error("Failed to fetch address from Google Maps");
              }

              const data = await response.json();

              if (data.status === "REQUEST_DENIED") {
                throw new Error(
                  data.error_message ||
                    "Geocoding API rejected (check API key restrictions)",
                );
              }
              if (data.status === "OVER_QUERY_LIMIT") {
                throw new Error("Geocoding API quota exceeded");
              }
              if (!data.results || data.results.length === 0) {
                throw new Error(
                  data.error_message || "No address found for current location",
                );
              }

              const components = data.results[0].address_components || [];
              const getComponent = (types) =>
                components.find((c) => types.every((t) => c.types.includes(t)))
                  ?.long_name;

              const premise = getComponent(["premise"]);
              const neighborhood = getComponent(["neighborhood"]);
              const sublocality = getComponent([
                "sublocality_level_1",
                "sublocality",
              ]);
              const locality = getComponent(["locality"]);
              const state = getComponent(["administrative_area_level_1"]);
              const pincode = getComponent(["postal_code"]);
              const country = getComponent(["country"]);

              const displayParts = [];
              if (premise) displayParts.push(premise);
              if (neighborhood) displayParts.push(neighborhood);
              if (sublocality && sublocality !== neighborhood)
                displayParts.push(sublocality);
              if (locality) displayParts.push(locality);

              let statePincode = "";
              if (state) statePincode += state;
              if (pincode) statePincode += (statePincode ? " " : "") + pincode;
              if (statePincode) displayParts.push(statePincode);
              if (country) displayParts.push(country);

              const friendlyName =
                displayParts.join(", ") || data.results[0].formatted_address;

              liveLocation = {
                name: friendlyName,
                time: "12-15 mins",
                city: locality || "",
                state: state || "",
                pincode: pincode || "",
                latitude,
                longitude,
              };
            }

            updateLocation(liveLocation, {
              persist: true,
              updateSavedHome: false,
            });
            resolve({ ok: true, location: liveLocation });
          } catch (err) {
            const loc = fallbackFromCoords(latitude, longitude);
            updateLocation(loc, { persist: true, updateSavedHome: false });
            resolve({
              ok: true,
              location: loc,
              warning: err?.message || "Unable to fetch address",
            });
          } finally {
            setIsFetchingLocation(false);
          }
        };

        const handleLocationError = (error) => {
          const message =
            typeof error === "string"
              ? error
              : error.message || "Location permission denied";
          setLocationError(message);
          setIsFetchingLocation(false);
          resolve({ ok: false, error: message });
        };

        if (window.Flutter) {
          import("../../../lib/appZetoBridge")
            .then(async (m) => {
              const AppZetoBridge = m.default;
              const coords = await AppZetoBridge.getLocation();
              if (coords && coords.lat && coords.lng) {
                handleLocationSuccess(coords.lat, coords.lng);
              } else {
                handleLocationError("Native location failed");
              }
            })
            .catch(() => handleLocationError("Bridge not found"));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) =>
            handleLocationSuccess(
              position.coords.latitude,
              position.coords.longitude,
            ),
          handleLocationError,
          {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0,
          },
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const refreshAddresses = useCallback(async () => {
    if (!hasValidStoredAuthToken("auth_customer")) return;
    try {
      const { data } = await customerApi.getProfile();
      const profile = data?.result ?? data?.data ?? data;
      const raw = Array.isArray(profile?.addresses) ? profile.addresses : [];
      setSavedAddresses(
        raw.map((addr, idx) => ({
          id: addr._id ?? String(idx),
          label:
            (addr.label || "Home").charAt(0).toUpperCase() +
            (addr.label || "home").slice(1),
          address:
            addr.fullAddress ||
            [addr.landmark, addr.city, addr.state, addr.pincode]
              .filter(Boolean)
              .join(", ") ||
            "",
          location:
            addr?.location &&
            typeof addr.location.lat === "number" &&
            typeof addr.location.lng === "number" &&
            Number.isFinite(addr.location.lat) &&
            Number.isFinite(addr.location.lng)
              ? { lat: addr.location.lat, lng: addr.location.lng }
              : null,
          placeId: typeof addr?.placeId === "string" ? addr.placeId : null,
          phone: profile?.phone ?? "",
          isCurrent: idx === 0,
        })),
      );
    } catch {
      // keep existing in-memory addresses
    }
  }, []);

  useEffect(() => {
    refreshAddresses();
  }, [refreshAddresses]);

  // Hydrate from cache only — never seed a city by default.
  useEffect(() => {
    const parsed = getJSON(STORAGE_KEY, null);
    const addressName = parsed?.address || parsed?.name;
    const candidate = parsed
      ? {
          name: addressName || "",
          time: parsed.time || "12-15 mins",
          city: parsed.city || "",
          state: parsed.state || "",
          pincode: parsed.pincode || "",
          latitude: parsed.latitude,
          longitude: parsed.longitude,
        }
      : null;

    if (
      candidate &&
      isValidDeliveryLocation(candidate) &&
      !isLegacyDefaultLocation(candidate)
    ) {
      updateLocation(candidate, { persist: false, updateSavedHome: false });
    } else if (candidate && isLegacyDefaultLocation(candidate)) {
      remove(STORAGE_KEY);
      setCurrentLocation(EMPTY_LOCATION);
    } else {
      setCurrentLocation(EMPTY_LOCATION);
    }
    setLocationHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gate the app until a real location is chosen.
  useEffect(() => {
    if (!locationHydrated) return;
    if (!hasLocation) {
      setPromptOpen(true);
      setDrawerOpen(false);
      return;
    }
    setPromptOpen(false);
    setDrawerOpen(false);
  }, [locationHydrated, hasLocation]);

  const openLocationPicker = useCallback(() => {
    if (!hasLocation) {
      setPromptOpen(true);
      setDrawerOpen(false);
      return;
    }
    setDrawerOpen(true);
  }, [hasLocation]);

  const handleUseCurrent = useCallback(async () => {
    const result = await fetchAndCacheLocation();
    if (!result?.ok) {
      setPromptOpen(true);
    }
  }, [fetchAndCacheLocation]);

  const handleChooseManual = useCallback(() => {
    setPromptOpen(false);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    if (!isValidDeliveryLocation(currentLocation)) {
      setDrawerOpen(false);
      setPromptOpen(true);
      return;
    }
    setDrawerOpen(false);
  }, [currentLocation]);

  const locationValue = useMemo(
    () => ({
      currentLocation,
      savedAddresses,
      updateLocation,
      addAddress,
      refreshAddresses,
      isFetchingLocation,
      locationError,
      refreshLocation: fetchAndCacheLocation,
      hasLocation,
      needsLocation,
      locationHydrated,
      openLocationPicker,
      // UI gate controls (used by LocationGate)
      promptOpen,
      drawerOpen,
      handleUseCurrent,
      handleChooseManual,
      handleDrawerClose,
    }),
    [
      currentLocation,
      savedAddresses,
      refreshAddresses,
      isFetchingLocation,
      locationError,
      fetchAndCacheLocation,
      hasLocation,
      needsLocation,
      locationHydrated,
      openLocationPicker,
      promptOpen,
      drawerOpen,
      handleUseCurrent,
      handleChooseManual,
      handleDrawerClose,
    ],
  );

  return (
    <LocationContext.Provider value={locationValue}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
};
