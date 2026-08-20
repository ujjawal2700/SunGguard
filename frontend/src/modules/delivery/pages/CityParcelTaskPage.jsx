import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  MapPin, Package, Navigation2, Phone, Loader2, IndianRupee, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { cityParcelApi } from "../services/cityParcelApi";
import ParcelProofCapture from "../components/ParcelProofCapture";
import ProximityBanner from "../components/cityparcel/ProximityBanner";
import DeliveryVerifySheet from "../components/cityparcel/DeliveryVerifySheet";
import FailedAttemptSheet from "../components/cityparcel/FailedAttemptSheet";
import ReturnLegCard from "../components/cityparcel/ReturnLegCard";
import {
  getCurrentPositionWithCache,
  saveDeliveryPartnerLocation,
} from "../utils/deliveryLastLocation";
import { unwrapList } from "@core/api/unwrap";

/**
 * A rider's whole job on one screen: ride to A, collect, ride to B, hand over.
 * If the handover fails, the same screen turns into the return leg.
 *
 * Milestones that need no proof advance with one tap. The two that transfer
 * custody -- collecting and handing over -- each open their own verified step.
 */

const SIMPLE_STEPS = {
  ACCEPTED: { next: "RIDER_ASSIGNED", label: "Start riding to pickup" },
  RIDER_ASSIGNED: { next: "PICKUP_REACHED", label: "I'm at the pickup" },
  PICKED_UP: { next: "OUT_FOR_DELIVERY", label: "Start riding to drop" },
  OUT_FOR_DELIVERY: { next: "DROP_REACHED", label: "I'm at the drop" },
};

const CityParcelTaskPage = () => {
  const { cityParcelId } = useParams();
  const navigate = useNavigate();

  const [parcel, setParcel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [location, setLocation] = useState(null);
  const [mode, setMode] = useState("task"); // task | failed
  const [pickupOtp, setPickupOtp] = useState("");
  const [pickupProof, setPickupProof] = useState("");
  const [verifyingPickup, setVerifyingPickup] = useState(false);

  /* ---------------- location ---------------- */

  useEffect(() => {
    const apply = (pos) => {
      const next = {
        lat: pos.coords?.latitude ?? pos.lat,
        lng: pos.coords?.longitude ?? pos.lng,
        accuracyM: pos.coords?.accuracy ?? pos.accuracyM,
      };
      setLocation(next);
      if (next.lat && next.lng) saveDeliveryPartnerLocation(next.lat, next.lng);
    };

    getCurrentPositionWithCache(apply, () => {});

    if (typeof navigator === "undefined" || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(apply, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 20000,
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  /* ---------------- data ---------------- */

  const load = useCallback(async () => {
    try {
      const { data } = await cityParcelApi.getAssigned({ forceRefresh: true });
      const list = unwrapList({ data }, "parcels");
      const found = list.find((p) => String(p._id) === String(cityParcelId));
      if (!found) {
        toast.error("This job is no longer assigned to you");
        navigate("/delivery/dashboard", { replace: true });
        return;
      }
      setParcel(found);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load this job");
    } finally {
      setLoading(false);
    }
  }, [cityParcelId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------------- actions ---------------- */

  const advance = async () => {
    const step = SIMPLE_STEPS[parcel?.status];
    if (!step) return;
    setAdvancing(true);
    try {
      await cityParcelApi.updateStatus(cityParcelId, {
        status: step.next,
        location,
      });
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update");
    } finally {
      setAdvancing(false);
    }
  };

  const verifyPickup = async () => {
    if (pickupOtp.length < 4 || !pickupProof) return;
    setVerifyingPickup(true);
    try {
      await cityParcelApi.verifyPickup(cityParcelId, {
        otp: pickupOtp,
        proofImage: pickupProof,
        location,
      });
      toast.success("Collected — the receiver has been sent their code");
      setPickupOtp("");
      setPickupProof("");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not confirm pickup");
    } finally {
      setVerifyingPickup(false);
    }
  };

  const target = useMemo(() => {
    if (!parcel) return null;
    if (parcel.status === "RETURN_IN_TRANSIT") {
      return parcel.returnLeg?.returnAddress || parcel.pickupAddress;
    }
    return ["ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED"].includes(parcel.status)
      ? parcel.pickupAddress
      : parcel.dropAddress;
  }, [parcel]);

  const openMaps = () => {
    if (!target?.lat) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`,
      "_blank",
      "noopener",
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!parcel) return null;

  const step = SIMPLE_STEPS[parcel.status];
  const isCod = String(parcel.paymentMethod).toUpperCase() === "COD";

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 pt-4 space-y-4">
      {/* header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
            {parcel.referenceId}
          </p>
          <h1 className="text-[19px] font-semibold text-slate-900 leading-tight">
            City delivery
          </h1>
        </div>
        <div className="text-right shrink-0">
          <p className="inline-flex items-center gap-0.5 text-[17px] font-semibold text-slate-900">
            <IndianRupee className="h-3.5 w-3.5" />
            {(parcel.riderEarning ?? 0).toFixed(0)}
          </p>
          <p className="text-[11px] text-slate-400">you earn</p>
        </div>
      </header>

      {/* route */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
        {[
          { label: "Pickup", addr: parcel.pickupAddress, done: Boolean(parcel.pickedUpAt) },
          { label: "Drop", addr: parcel.dropAddress, done: parcel.status === "DELIVERED" },
        ].map((leg) => (
          <div key={leg.label} className="flex items-start gap-2.5">
            <MapPin
              className={cn(
                "h-4 w-4 mt-0.5 shrink-0",
                leg.done ? "text-emerald-500" : "text-slate-400",
              )}
            />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">
                {leg.label}
              </p>
              <p className="text-[13px] text-slate-800 leading-snug">
                {leg.addr?.fullAddress}
              </p>
              {leg.addr?.addressNote ? (
                <p className="text-[12px] text-slate-500">{leg.addr.addressNote}</p>
              ) : null}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-1 border-t border-slate-100 text-[12px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Package className="h-3.5 w-3.5" />
            {parcel.package?.packageType} · {parcel.package?.weightKg} kg
          </span>
          <span>{parcel.distanceKm} km</span>
        </div>
      </div>

      {isCod && !parcel.pickedUpAt ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <p className="text-[13px] font-semibold text-amber-900">
            Collect ₹{(parcel.codCollection?.amount ?? 0).toFixed(0)} cash at pickup
          </p>
        </div>
      ) : null}

      {target?.lat ? (
        <button
          type="button"
          onClick={openMaps}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-[13px] font-semibold text-slate-700"
        >
          <Navigation2 className="h-3.5 w-3.5" />
          Navigate
        </button>
      ) : null}

      {/* ---- the step the rider is actually on ---- */}

      {mode === "failed" ? (
        <FailedAttemptSheet
          parcel={parcel}
          riderLocation={location}
          onBack={() => setMode("task")}
          onDone={async () => {
            setMode("task");
            await load();
          }}
        />
      ) : parcel.status === "RETURN_IN_TRANSIT" ? (
        <ReturnLegCard
          parcel={parcel}
          riderLocation={location}
          onDone={() => navigate("/delivery/dashboard")}
        />
      ) : parcel.status === "PICKUP_REACHED" ? (
        <div className="space-y-4">
          <ProximityBanner
            state={location?.lat ? "ok" : "nofix"}
            message={location?.lat ? "" : "Turn GPS on to confirm you're here"}
          />
          <section className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Customer's pickup code
            </p>
            <input
              inputMode="numeric"
              maxLength={6}
              value={pickupOtp}
              onChange={(e) => setPickupOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="——————"
              className="w-full rounded-lg border border-slate-200 px-3 py-3 text-center text-[22px] font-mono tracking-[0.4em] outline-none focus:border-slate-400"
            />
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-3.5">
            <ParcelProofCapture
              label="Photo of the parcel"
              hint="Take this before you leave"
              value={pickupProof}
              onChange={setPickupProof}
            />
          </section>
          <button
            type="button"
            onClick={verifyPickup}
            disabled={pickupOtp.length < 4 || !pickupProof || verifyingPickup}
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold",
              pickupOtp.length >= 4 && pickupProof && !verifyingPickup
                ? "bg-slate-900 text-white active:scale-[0.99]"
                : "bg-slate-200 text-slate-400",
            )}
          >
            {verifyingPickup ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm pickup
          </button>
        </div>
      ) : parcel.status === "DROP_REACHED" || parcel.status === "DELIVERY_FAILED" ? (
        <DeliveryVerifySheet
          parcel={parcel}
          riderLocation={location}
          onFailedAttempt={() => setMode("failed")}
          onDone={() => navigate("/delivery/dashboard")}
        />
      ) : step ? (
        <button
          type="button"
          onClick={advance}
          disabled={advancing}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-[15px] font-semibold text-white active:scale-[0.99] disabled:opacity-60"
        >
          {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {step.label}
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}

      {parcel.customerId?.phone && !parcel.pickedUpAt ? (
        <a
          href={`tel:${parcel.customerId.phone}`}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-[13px] font-semibold text-slate-600"
        >
          <Phone className="h-3.5 w-3.5" />
          Call customer
        </a>
      ) : null}
    </div>
  );
};

export default CityParcelTaskPage;
