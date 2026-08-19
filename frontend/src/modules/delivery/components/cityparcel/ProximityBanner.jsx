import React from "react";
import { MapPin, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tells the rider, before they try to submit, whether the app believes they
 * are at the address.
 *
 * This is deliberately informative rather than punitive. A rider standing at
 * a real door with a bad GPS fix must be able to see WHY the app disagrees
 * and what to do about it, instead of hitting a button that silently refuses.
 */
const ProximityBanner = ({
  state,          // "checking" | "ok" | "far" | "nofix" | "stale" | "error"
  distanceMeters,
  limit,
  message,
  onRefresh,
  refreshing = false,
}) => {
  const tone = {
    checking: {
      icon: Loader2,
      spin: true,
      cls: "bg-slate-50 border-slate-200 text-slate-600",
      title: "Checking your location…",
    },
    ok: {
      icon: CheckCircle2,
      cls: "bg-emerald-50 border-emerald-200 text-emerald-800",
      title: "You're at the address",
    },
    far: {
      icon: AlertTriangle,
      cls: "bg-amber-50 border-amber-200 text-amber-900",
      title: "You look far from the address",
    },
    nofix: {
      icon: MapPin,
      cls: "bg-amber-50 border-amber-200 text-amber-900",
      title: "Can't read your location",
    },
    stale: {
      icon: MapPin,
      cls: "bg-amber-50 border-amber-200 text-amber-900",
      title: "Your location is out of date",
    },
    error: {
      icon: AlertTriangle,
      cls: "bg-slate-50 border-slate-200 text-slate-600",
      title: "Location check unavailable",
    },
  }[state] || {
    icon: MapPin,
    cls: "bg-slate-50 border-slate-200 text-slate-600",
    title: "Location",
  };

  const Icon = tone.icon;

  return (
    <div className={cn("rounded-xl border px-3 py-2.5 flex items-start gap-2.5", tone.cls)}>
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", tone.spin && "animate-spin")} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-tight">{tone.title}</p>
        {message ? (
          <p className="text-[12px] leading-snug mt-0.5 opacity-90">{message}</p>
        ) : null}
        {state === "ok" && Number.isFinite(distanceMeters) ? (
          <p className="text-[12px] mt-0.5 opacity-80">
            About {Math.round(distanceMeters)} m away
            {Number.isFinite(limit) ? ` (within ${limit} m)` : ""}
          </p>
        ) : null}
      </div>
      {onRefresh && state !== "checking" ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold underline underline-offset-2 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          Refresh
        </button>
      ) : null}
    </div>
  );
};

export default ProximityBanner;
