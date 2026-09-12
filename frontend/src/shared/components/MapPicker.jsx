import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  GoogleMap,
  Marker,
  Autocomplete,
  Polygon,
} from "@react-google-maps/api";
import { Search, MapPin, Navigation, Loader2 } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Input from "./ui/Input";
import { useMapsLoader } from "@core/maps/useMapsLoader";
import { isPointInPolygon } from "@shared/utils/zoneGeometry";

const mapContainerStyle = {
  width: "100%",
  height: "340px",
};

const defaultCenter = {
  lat: 20.5937, // India center
  lng: 78.9629,
};

const ADDRESS_COMPONENT_PRIORITY = {
  locality: [
    "sublocality_level_1",
    "sublocality",
    "neighborhood",
    "locality",
    "administrative_area_level_3",
  ],
  city: [
    "locality",
    // UK-style responses name the town here rather than in `locality`.
    "postal_town",
    "administrative_area_level_3",
    "administrative_area_level_2",
  ],
  state: ["administrative_area_level_1"],
  pincode: ["postal_code"],
};

/**
 * First component matching any of `types`, in the order `types` lists them —
 * so a more specific match is preferred over a broader one.
 */
const getAddressComponent = (components = [], types = []) => {
  for (const type of types) {
    const match = components.find((component) => component.types?.includes(type));
    if (match?.long_name) return match.long_name;
  }
  return "";
};

/**
 * Reads the address parts out of a whole geocoder response.
 *
 * Google returns several results per coordinate, ordered specific to broad,
 * and the most specific one is often a building or a Plus Code that carries
 * no city or postal code at all. Reading only `results[0]` therefore returned
 * a blank city often enough that callers kept whatever stale value the form
 * already held. Scanning every result until each field is found fixes that at
 * the source.
 */
const extractAddressDetails = (results) => {
  const list = Array.isArray(results) ? results : [results].filter(Boolean);
  const found = { locality: "", city: "", state: "", pincode: "" };

  for (const result of list) {
    const components = result?.address_components || [];
    for (const key of Object.keys(found)) {
      if (!found[key]) {
        found[key] = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY[key]);
      }
    }
    if (Object.values(found).every(Boolean)) break;
  }

  return found;
};

const parseLatLng = (loc) => {
  if (!loc) return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (isNaN(lat) || isNaN(lng) || loc.lat === null || loc.lng === null) {
    return null;
  }
  return { lat, lng };
};

const MapPicker = ({
  isOpen,
  onClose,
  onConfirm,
  initialLocation = null,
  initialRadius = 5,
  maxRadius = 20,
  preferCurrentLocationOnOpen = false,
  title = "Select Shop Location",
  searchPlaceholder = "Search for your shop area...",
  showRadius = true,
  radiusLabel = "Service Radius (km)",
  descriptionText = "Customers within this radius from your shop will be able to see and order from you.",
  /**
   * Optional zone ring ([{lat, lng}, ...]) the pin must land inside. Drawn as
   * a read-only overlay so the boundary is visible while picking, and
   * enforced on click/drag and on confirm — a point outside it is refused
   * rather than silently saved and rejected later by the server.
   *
   * Use `boundary` when there is exactly one zone to pin inside (e.g. an
   * admin who has already picked which zone a warehouse belongs to). Use
   * `boundaries` — a list of `{ points, name?, color? }` zones — when the
   * picker itself has to decide, from all of them, which one (if any) the
   * dropped pin falls inside (e.g. a customer choosing an outstation pickup
   * point anywhere the platform serves). The two are mutually exclusive;
   * `boundary` wins if both are somehow given.
   */
  boundary = null,
  boundaries = null,
  boundaryLabel = "the selected zone",
}) => {
  const initialCoords = parseLatLng(initialLocation);
  const [center, setCenter] = useState(initialCoords || defaultCenter);
  const [marker, setMarker] = useState(initialCoords);
  const [radius, setRadius] = useState(initialRadius);
  const [address, setAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const mapRef = useRef(null);
  const autocompleteRef = useRef(null);
  const circleRef = useRef(null);
  const suppressMapClickUntilRef = useRef(0);

  useEffect(() => {
    const handleGlobalPointerDown = (e) => {
      const isPac = e.target instanceof Element && Boolean(e.target.closest('.pac-container, .pac-item'));
      if (isPac) {
        suppressMapClickUntilRef.current = Date.now() + 600;
      }
    };

    window.addEventListener("pointerdown", handleGlobalPointerDown, true);
    window.addEventListener("mousedown", handleGlobalPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
      window.removeEventListener("mousedown", handleGlobalPointerDown, true);
    };
  }, []);

  const clearCircleOverlay = useCallback(() => {
    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }
  }, []);

  const handleMapLoad = useCallback((mapInstance) => {
    mapRef.current = mapInstance;
  }, []);

  const { isLoaded, loadError } = useMapsLoader();

  useEffect(() => {
    if (initialLocation) {
      const coords = parseLatLng(initialLocation);
      if (coords) {
        setCenter(coords);
        setMarker(coords);
      }
    }
  }, [initialLocation]);

  useEffect(() => {
    if (!isOpen) return;

    setRadius(initialRadius);

    if (preferCurrentLocationOnOpen) {
      getCurrentLocation({ silent: true, fallbackToInitial: true });
      return;
    }

    const coords = parseLatLng(initialLocation);
    if (coords) {
      setCenter(coords);
      setMarker(coords);
    } else if (Array.isArray(boundary) && boundary.length >= 3) {
      // No pin yet — centre on the zone so the boundary is visible right away
      // instead of the admin panning across the whole map to find it.
      const centroid = boundary.reduce(
        (acc, p) => ({ lat: acc.lat + p.lat / boundary.length, lng: acc.lng + p.lng / boundary.length }),
        { lat: 0, lng: 0 },
      );
      setCenter(centroid);
      setMarker(null);
    } else {
      setCenter(defaultCenter);
      setMarker(null);
    }
  }, [isOpen, initialLocation, initialRadius, preferCurrentLocationOnOpen, boundary]);

  const hasBoundaries = Array.isArray(boundaries) && boundaries.length > 0;

  const isInsideBoundary = useCallback(
    (point) => {
      if (Array.isArray(boundary) && boundary.length) {
        return isPointInPolygon(point.lat, point.lng, boundary);
      }
      if (hasBoundaries) {
        return boundaries.some((zone) => isPointInPolygon(point.lat, point.lng, zone?.points || []));
      }
      return true;
    },
    [boundary, hasBoundaries, boundaries],
  );

  const onMapClick = useCallback((e) => {
    if (Date.now() < suppressMapClickUntilRef.current) return;
    const newPos = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };
    if (!isInsideBoundary(newPos)) {
      alert(`That point is outside ${boundaryLabel}. Pick a point inside the zone boundary shown on the map.`);
      return;
    }
    clearCircleOverlay();
    setMarker(newPos);
  }, [clearCircleOverlay, isInsideBoundary, boundaryLabel]);

  const onMarkerDragEnd = useCallback((e) => {
    const newPos = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };
    if (!isInsideBoundary(newPos)) {
      alert(`That point is outside ${boundaryLabel}. Pick a point inside the zone boundary shown on the map.`);
      // Snap back — the marker's visual position already moved with the
      // drag gesture, so the state has to be re-set to force it back.
      setMarker((prev) => (prev ? { ...prev } : prev));
      return;
    }
    clearCircleOverlay();
    setMarker(newPos);
  }, [clearCircleOverlay, isInsideBoundary, boundaryLabel]);

  const handlePlaceChanged = () => {
    suppressMapClickUntilRef.current = Date.now() + 600;
    if (autocompleteRef.current) {
      /**
       * `getPlace()` can hand back `undefined` — Google fires `place_changed`
       * whenever the field is committed, including before the widget has
       * resolved a prediction, which is exactly what selecting with the
       * keyboard hits. Reading `.geometry` off it threw a TypeError that killed
       * this handler, so the pin silently stayed on the map's default centre
       * and the form saved those coordinates instead. On the warehouse picker
       * that meant every hub was filed at the default city no matter what the
       * admin searched for — and the outstation first-mile distance, and so the
       * fare, is measured from that hub.
       *
       * Guarded the same way `ZoneMapEditor` already guards its own handler.
       */
      const place = autocompleteRef.current.getPlace();
      if (place?.geometry?.location) {
        clearCircleOverlay();
        const newPos = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        setCenter(newPos);
        setMarker(newPos);
        setAddress(place.formatted_address || "");
      }
    }
  };

  const getCurrentLocation = ({
    silent = false,
    fallbackToInitial = false,
  } = {}) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearCircleOverlay();
          const newPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCenter(newPos);
          setMarker(newPos);
        },
        () => {
          if (fallbackToInitial && initialLocation) {
            const coords = parseLatLng(initialLocation);
            setCenter(coords || defaultCenter);
            setMarker(coords);
            return;
          }

          if (!silent) {
            alert("Unable to retrieve your location. Please select manually.");
          }
        },
      );
      return;
    }

    if (fallbackToInitial && initialLocation) {
      const coords = parseLatLng(initialLocation);
      setCenter(coords || defaultCenter);
      setMarker(coords);
      return;
    }

    if (!silent) {
      alert("Unable to retrieve your location. Please select manually.");
    }
  };

  useEffect(() => {
    return () => {
      clearCircleOverlay();
      mapRef.current = null;
    };
  }, [clearCircleOverlay]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google?.maps) {
      return;
    }

    clearCircleOverlay();

    if (!marker || !showRadius) {
      return;
    }

    circleRef.current = new window.google.maps.Circle({
      map: mapRef.current,
      center: marker,
      radius: radius * 1000,
      fillColor: "var(--primary)",
      fillOpacity: 0.1,
      strokeColor: "var(--primary)",
      strokeOpacity: 0.5,
      strokeWeight: 2,
      clickable: false,
      editable: false,
      zIndex: 1,
    });

    return () => {
      clearCircleOverlay();
    };
  }, [isLoaded, marker, radius, showRadius, clearCircleOverlay]);

  const handleConfirm = async () => {
    if (!marker || typeof marker.lat !== 'number' || typeof marker.lng !== 'number') {
      alert("Please select a location on the map.");
      return;
    }

    if (!isInsideBoundary(marker)) {
      alert(`That point is outside ${boundaryLabel}. Pick a point inside the zone boundary shown on the map.`);
      return;
    }

    setIsGeocoding(true);
    try {
      // Reverse geocode only on confirmation to save costs
      const geocoder = new window.google.maps.Geocoder();
      // Every result, not just the first: the closest match is often a
      // building with no city or postal code on it.
      const results = await new Promise((resolve, reject) => {
        geocoder.geocode({ location: marker }, (found, status) => {
          if (status === "OK" && found?.length) resolve(found);
          else reject(status);
        });
      });

      onConfirm({
        ...marker,
        ...(showRadius ? { radius } : {}),
        address: results[0].formatted_address,
        ...extractAddressDetails(results),
        // Lets a caller tell "the geocoder had no city" apart from "the
        // lookup failed", so it knows whether a blank field is trustworthy.
        geocoded: true,
      });
      onClose();
    } catch (error) {
      console.error("Geocoding failed:", error);
      // Fallback: confirm without address
      onConfirm({
        ...marker,
        ...(showRadius ? { radius } : {}),
        address: address || "Custom Location",
      });
      onClose();
    } finally {
      setIsGeocoding(false);
    }
  };

  if (loadError) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Select Location">
        <div className="p-8 text-center text-red-500">
          Failed to load Google Maps. Please check your API key and connection.
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <div className="flex justify-between w-full items-center">
          <div className="text-sm text-gray-500">
            {marker && typeof marker.lat === 'number' && typeof marker.lng === 'number'
              ? `${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}`
              : "No location selected"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm} 
              disabled={!marker || typeof marker.lat !== 'number' || typeof marker.lng !== 'number' || isGeocoding}
            >
              {isGeocoding ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Confirm Location
            </Button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            {isLoaded && (
              <Autocomplete
                onLoad={(ref) => (autocompleteRef.current = ref)}
                onPlaceChanged={handlePlaceChanged}
                options={{
                  componentRestrictions: { country: "IN" },
                  fields: ["geometry", "formatted_address"],
                }}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder={searchPlaceholder}
                    className="pl-10"
                  />
                </div>
              </Autocomplete>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={getCurrentLocation}
            title="Use current location">
            <Navigation className="w-4 h-4" />
          </Button>
        </div>

        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-inner relative">
          {!isLoaded ? (
            <div className="h-[340px] flex items-center justify-center bg-gray-50">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <GoogleMap
              onLoad={handleMapLoad}
              mapContainerStyle={mapContainerStyle}
              center={center}
              zoom={15}
              onClick={onMapClick}
              options={{
                disableDefaultUI: true,
                zoomControl: true,
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: false,
              }}>
              {marker && typeof marker.lat === 'number' && typeof marker.lng === 'number' && (
                <Marker
                  key={`${marker.lat.toFixed(6)}-${marker.lng.toFixed(6)}`}
                  position={marker}
                  draggable={true}
                  onDragEnd={onMarkerDragEnd}
                  animation={window.google.maps.Animation.DROP}
                />
              )}
              {Array.isArray(boundary) && boundary.length >= 3 && (
                <Polygon
                  paths={boundary}
                  options={{
                    fillColor: "#2563EB",
                    fillOpacity: 0.08,
                    strokeColor: "#2563EB",
                    strokeOpacity: 0.7,
                    strokeWeight: 2,
                    clickable: false,
                    zIndex: 0,
                  }}
                />
              )}
              {!boundary &&
                hasBoundaries &&
                boundaries.map((zone, i) => {
                  const points = zone?.points || [];
                  if (points.length < 3) return null;
                  const color = zone?.color || "#2563EB";
                  return (
                    <Polygon
                      key={zone?._id || i}
                      paths={points}
                      options={{
                        fillColor: color,
                        fillOpacity: 0.08,
                        strokeColor: color,
                        strokeOpacity: 0.7,
                        strokeWeight: 2,
                        clickable: false,
                        zIndex: 0,
                      }}
                    />
                  );
                })}
            </GoogleMap>
          )}
        </div>

        {showRadius && (
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">
                {radiusLabel}
              </label>
              <span className="text-sm font-bold text-primary">{radius} km</span>
            </div>
            <input
              type="range"
              min="1"
              max={maxRadius}
              step="1"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>1 km</span>
              <span>{maxRadius} km</span>
            </div>
            <p className="text-xs text-gray-500 flex items-start gap-1">
              <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {descriptionText}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default MapPicker;

