import React from "react";
import { createPortal } from "react-dom";
import { MapPin, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Blocking centered location gate — shown on first open until GPS or manual pick.
 */
const LocationPromptModal = ({
  isOpen,
  isFetchingLocation = false,
  locationError = null,
  onUseCurrent,
  onChooseManual,
}) => {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="location-prompt"
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-prompt-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="w-full max-w-[340px] rounded-2xl bg-white px-6 py-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MapPin size={28} strokeWidth={2.25} />
              </div>
              <h2
                id="location-prompt-title"
                className="text-[17px] font-bold tracking-tight text-slate-900"
              >
                Location Access Required
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                We need your location to show you products available near you and
                enable delivery services. Location access is required to continue.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onUseCurrent}
                disabled={isFetchingLocation}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-[14px] font-bold text-white shadow-md shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-70"
              >
                {isFetchingLocation ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Detecting...
                  </>
                ) : (
                  "Allow Location Access"
                )}
              </button>

              <button
                type="button"
                onClick={onChooseManual}
                disabled={isFetchingLocation}
                className="w-full rounded-xl bg-slate-100 px-4 py-3.5 text-[14px] font-bold text-slate-800 transition-all hover:bg-slate-200 active:scale-[0.98] disabled:opacity-70"
              >
                Enter Location Manually
              </button>
            </div>

            {locationError && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800">
                {locationError}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default LocationPromptModal;
