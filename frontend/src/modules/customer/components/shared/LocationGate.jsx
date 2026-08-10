import React from "react";
import { useLocation } from "../../context/LocationContext";
import LocationDrawer from "./LocationDrawer";
import LocationPromptModal from "./LocationPromptModal";

/** Renders the first-open location prompt + picker drawer. */
const LocationGate = () => {
  const {
    hasLocation,
    needsLocation,
    locationHydrated,
    isFetchingLocation,
    locationError,
    promptOpen,
    drawerOpen,
    handleUseCurrent,
    handleChooseManual,
    handleDrawerClose,
  } = useLocation();

  // Show as soon as hydration finishes and no real location is set.
  // Also honor promptOpen so "manual → back" reopens the center popup.
  const showPrompt =
    locationHydrated &&
    !drawerOpen &&
    (needsLocation || Boolean(promptOpen && !hasLocation));

  return (
    <>
      <LocationPromptModal
        isOpen={showPrompt}
        isFetchingLocation={isFetchingLocation}
        locationError={locationError}
        onUseCurrent={handleUseCurrent}
        onChooseManual={handleChooseManual}
      />
      <LocationDrawer
        isOpen={Boolean(drawerOpen)}
        onClose={handleDrawerClose}
        required={!hasLocation}
      />
    </>
  );
};

export default LocationGate;
