import React, { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, Autocomplete } from "@react-google-maps/api";
import { Crosshair, Loader2, Search, MapPin, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "./kit";
import { lookupAddress } from "../../hooks/useCurrentLocation";
import { useMapsLoader } from "@core/maps/useMapsLoader";

/**
 * Inline map for picking a pickup or drop point.
 *
 * Purpose-built rather than reusing shared/components/MapPicker, which is a
 * modal built around a seller's shop and its service radius. Booking needs the
 * map in the flow, not on top of it.
 *
 * Every way of choosing a spot converges on the same callback, so the caller
 * never has to care whether the customer searched, tapped, dragged, or let us
 * detect them.
 */

const INDIA = { lat: 20.5937, lng: 78.9629 };

const LocationPicker = ({
  value,
  onChange,
  onDetect,
  detecting = false,
  detectError = null,
  height = 200,
  searchPlaceholder = "Search for an area, building or landmark",
}) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useMapsLoader();

  const [resolving, setResolving] = useState(false);
  const autocompleteRef = useRef(null);
  const mapRef = useRef(null);

  const hasPin = Number.isFinite(value?.lat) && Number.isFinite(value?.lng);
  const center = hasPin ? { lat: value.lat, lng: value.lng } : INDIA;

  // Keep the map centred on the pin when it moves from outside (detect, search).
  useEffect(() => {
    if (hasPin && mapRef.current) {
      mapRef.current.panTo({ lat: value.lat, lng: value.lng });
    }
  }, [hasPin, value?.lat, value?.lng]);

  /** Any new coordinate resolves to an address before it reaches the caller. */
  const commit = useCallback(
    async (lat, lng, known = null) => {
      onChange({ ...value, lat, lng, ...(known || {}) });
      if (known) return;

      setResolving(true);
      try {
        const address = await lookupAddress(lat, lng);
        onChange({
          ...value,
          lat,
          lng,
          formattedAddress: address.formattedAddress,
          components: address.components,
        });
      } catch {
        // The pin is still correct; the customer can type the rest.
      } finally {
        setResolving(false);
      }
    },
    [onChange, value],
  );

  const onPlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    const loc = place?.geometry?.location;
    if (!loc) return;
    commit(loc.lat(), loc.lng(), {
      formattedAddress: place.formatted_address || place.name || "",
    });
  };

  if (!apiKey) {
    return (
      <div className="rounded-[var(--sg-r)] border border-dashed border-sg-line px-4 py-6 text-center">
        <Label className="text-sg-ink-3">Map unavailable</Label>
        <p className="mt-1 text-[12px] text-sg-ink-2">
          Enter the address by hand — we'll still find it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {isLoaded ? (
        <Autocomplete
          onLoad={(ref) => (autocompleteRef.current = ref)}
          onPlaceChanged={onPlaceChanged}
          options={{ componentRestrictions: { country: "in" } }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sg-ink-3" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              className="w-full rounded-[var(--sg-r)] border border-transparent bg-sg-surface-2 py-3 pl-10 pr-3 text-[14px] text-sg-ink outline-none placeholder:text-sg-ink-3 focus:border-sg-accent focus:bg-sg-surface"
            />
          </div>
        </Autocomplete>
      ) : null}

      <div
        className="relative overflow-hidden rounded-[var(--sg-r)] bg-sg-surface-2"
        style={{ height }}
      >
        {loadError ? (
          <div className="grid h-full place-items-center px-4 text-center">
            <span>
              <AlertCircle className="mx-auto h-5 w-5 text-sg-ink-3" />
              <p className="mt-1 text-[12px] text-sg-ink-2">
                Map failed to load. Type the address instead.
              </p>
            </span>
          </div>
        ) : !isLoaded ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-sg-ink-3" />
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={center}
            zoom={hasPin ? 17 : 5}
            onLoad={(map) => (mapRef.current = map)}
            onClick={(e) => commit(e.latLng.lat(), e.latLng.lng())}
            options={{
              disableDefaultUI: true,
              zoomControl: true,
              gestureHandling: "greedy",
              clickableIcons: false,
            }}
          >
            {hasPin ? (
              <Marker
                position={center}
                draggable
                onDragEnd={(e) => commit(e.latLng.lat(), e.latLng.lng())}
              />
            ) : null}
          </GoogleMap>
        )}

        <button
          type="button"
          onClick={onDetect}
          disabled={detecting}
          aria-label="Use my current location"
          className="absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full bg-sg-surface shadow-[var(--sg-shadow-lift)] disabled:opacity-60"
        >
          {detecting ? (
            <Loader2 className="h-4 w-4 animate-spin text-sg-ink" />
          ) : (
            <Crosshair className="h-4 w-4 text-sg-ink" />
          )}
        </button>

        {!hasPin && !detecting ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="sg-label rounded-full bg-sg-surface px-3 py-1.5 text-sg-ink-2 shadow-[var(--sg-shadow)]">
              Tap the map to drop a pin
            </span>
          </div>
        ) : null}
      </div>

      {resolving ? (
        <p className="flex items-center gap-1.5 text-[12px] text-sg-ink-3">
          <Loader2 className="h-3 w-3 animate-spin" />
          Looking up the address…
        </p>
      ) : hasPin && value?.formattedAddress ? (
        <p className="flex items-start gap-1.5 text-[12px] leading-snug text-sg-ink-2">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-sg-accent" />
          {value.formattedAddress}
        </p>
      ) : null}

      {detectError ? (
        <p className="flex items-start gap-1.5 text-[12px] leading-snug text-sg-warn">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          {detectError}
        </p>
      ) : null}
    </div>
  );
};

export default LocationPicker;
