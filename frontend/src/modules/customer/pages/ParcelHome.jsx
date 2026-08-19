import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Shield, TrendingUp, ArrowRight, Package, Truck, MapPin, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cityParcelApi } from "../services/cityParcelApi";
import { parcelApi } from "../services/parcelApi";
import { createSocketTokenReader } from "@core/utils/authStorage";
import { STORAGE_KEYS } from "@core/utils/storage";
import {
  getOrderSocket,
  onCityParcelStatusUpdate,
  onCityParcelDecisionNeeded,
} from "@core/services/orderSocket";
import { toast } from "sonner";
import {
  Card, Label, Data, Barcode, StatusChip, ServiceToggle, PrimaryButton,
  EmptyNote,
} from "../components/sunguard/kit";

const getCustomerToken = createSocketTokenReader(STORAGE_KEYS.AUTH_CUSTOMER);

/**
 * The parcel home.
 *
 * Two products, unequal by design: local delivery gets the booking surface,
 * outstation gets a single confident card. Presenting them as equal tiles
 * forces a choice before the customer understands the difference.
 */

const SERVICES = [
  { value: "local", label: "Local Delivery" },
  { value: "outstation", label: "Outstation" },
];

const STATUS_TONE = {
  REQUESTED: { tone: "idle", label: "Awaiting Pickup" },
  SEARCHING: { tone: "warn", label: "Finding Rider" },
  ACCEPTED: { tone: "transit", label: "Rider Assigned" },
  RIDER_ASSIGNED: { tone: "transit", label: "On The Way" },
  PICKUP_REACHED: { tone: "transit", label: "At Pickup" },
  PICKED_UP: { tone: "transit", label: "In Transit" },
  OUT_FOR_DELIVERY: { tone: "transit", label: "In Transit" },
  DROP_REACHED: { tone: "transit", label: "At Drop" },
  DELIVERY_FAILED: { tone: "fail", label: "Needs You" },
  RETURN_IN_TRANSIT: { tone: "warn", label: "Coming Back" },
  DELIVERED: { tone: "done", label: "Delivered" },
  RETURNED: { tone: "idle", label: "Returned" },
  CANCELLED: { tone: "idle", label: "Cancelled" },
};

const LIVE = new Set([
  "REQUESTED", "SEARCHING", "ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED",
  "PICKED_UP", "OUT_FOR_DELIVERY", "DROP_REACHED", "DELIVERY_FAILED",
  "RETURN_IN_TRANSIT",
]);

/* -------------------------------------------------------------------------- */

const ProgressLeg = ({ from, to, active }) => (
  <div className="flex items-center gap-2">
    <span
      className={cn(
        "h-2.5 w-2.5 shrink-0 rounded-full",
        active ? "bg-sg-accent" : "border border-sg-line-strong",
      )}
    />
    <div className="relative h-px flex-1 bg-sg-line-strong">
      {active ? (
        <span className="absolute inset-y-0 left-0 w-1/2 bg-sg-accent" />
      ) : null}
      <span
        className={cn(
          "absolute -top-2.5 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full",
          active ? "bg-sg-accent text-sg-accent-ink" : "bg-sg-surface-2 text-sg-ink-3",
        )}
      >
        {active ? <Truck className="h-3 w-3" /> : <Package className="h-3 w-3" />}
      </span>
    </div>
    <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-sg-line-strong" />
  </div>
);

const ShipmentCard = ({ parcel, onOpen }) => {
  const meta = STATUS_TONE[parcel.status] || STATUS_TONE.REQUESTED;
  const moving = ["PICKED_UP", "OUT_FOR_DELIVERY", "DROP_REACHED"].includes(parcel.status);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label>Waybill ID</Label>
          <Data className="mt-0.5 block text-[15px] font-semibold text-sg-ink">
            {parcel.referenceId}
          </Data>
        </div>
        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
      </div>

      <div className="mt-4">
        <ProgressLeg active={moving} />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-sg-ink">
              {parcel.pickupAddress?.fullAddress?.split(",")[0] || "Pickup"}
            </p>
            <Data className="text-[10px] text-sg-ink-3">
              {parcel.pickedUpAt
                ? new Date(parcel.pickedUpAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit", minute: "2-digit",
                  })
                : "--:--"}
            </Data>
          </div>
          <div className="min-w-0 text-right">
            <p className="truncate text-[13px] text-sg-ink-2">
              {parcel.dropAddress?.fullAddress?.split(",")[0] || "Drop"}
            </p>
            <Data className="text-[10px] text-sg-ink-3">
              {parcel.deliveryEta
                ? new Date(parcel.deliveryEta).toLocaleTimeString("en-IN", {
                    hour: "2-digit", minute: "2-digit",
                  })
                : "--:--"}
            </Data>
          </div>
        </div>
      </div>

      {parcel.status === "DELIVERY_FAILED" ? (
        <div className="mt-3 rounded-[var(--sg-r)] bg-sg-fail-soft px-3 py-2.5">
          <p className="text-[12px] font-semibold text-sg-fail">
            We couldn't hand it to {parcel.receiver?.name || "the receiver"}
          </p>
          <p className="mt-0.5 text-[12px] text-sg-ink-2">
            Tell us what to do next before it comes back to you.
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-sg-line pt-3">
        <div className="flex items-center gap-1.5 text-sg-ink-3">
          <MapPin className="h-3.5 w-3.5" />
          <Data className="text-[11px]">{parcel.distanceKm} km</Data>
        </div>
        <button
          type="button"
          onClick={() => onOpen(parcel)}
          className="grid h-8 w-8 place-items-center rounded-full bg-sg-surface-2 text-sg-ink transition active:scale-95"
          aria-label={`Track ${parcel.referenceId}`}
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
};

/* -------------------------------------------------------------------------- */

const ParcelHome = () => {
  const navigate = useNavigate();
  const [service, setService] = useState("local");
  const [cityParcels, setCityParcels] = useState([]);
  const [outstation, setOutstation] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Neither list should be able to take the other down.
    const [city, legacy] = await Promise.allSettled([
      cityParcelApi.getHistory(),
      parcelApi.getHistory(),
    ]);

    if (city.status === "fulfilled") {
      const d = city.value?.data;
      setCityParcels(d?.data?.parcels || d?.parcels || []);
    }
    if (legacy.status === "fulfilled") {
      const d = legacy.value?.data;
      setOutstation(d?.data?.parcels || d?.parcels || d?.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();

    const getToken = getCustomerToken;
    getOrderSocket(getToken);

    // Patch the row in place rather than refetching the whole list: the
    // customer may be mid-scroll and a wholesale replace jumps under them.
    const offStatus = onCityParcelStatusUpdate(getToken, (payload) => {
      if (!payload?.cityParcelId) return;
      setCityParcels((rows) =>
        rows.map((row) =>
          String(row._id) === String(payload.cityParcelId)
            ? { ...row, ...(payload.parcel || { status: payload.status }) }
            : row,
        ),
      );
    });

    const offDecision = onCityParcelDecisionNeeded(getToken, (payload) => {
      toast.error(payload?.message || "A parcel needs your decision", {
        duration: 10000,
      });
      load();
    });

    return () => {
      offStatus();
      offDecision();
    };
  }, [load]);

  const activeLocal = useMemo(
    () => cityParcels.filter((p) => LIVE.has(p.status)),
    [cityParcels],
  );
  const activeOutstation = useMemo(
    () => outstation.filter((p) => !["DELIVERED", "CANCELLED"].includes(p.status)),
    [outstation],
  );

  const isLocal = service === "local";
  const active = isLocal ? activeLocal : activeOutstation;

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-28 pt-4">
      <ServiceToggle value={service} onChange={setService} options={SERVICES} />

      {/* ---- start a shipment ---- */}
      <Card className="mt-5 overflow-hidden p-5">
        <span className="grid h-11 w-11 place-items-center rounded-[var(--sg-r)] bg-sg-surface-2">
          <Plus className="h-5 w-5 text-sg-ink" />
        </span>

        <h1 className="sg-display mt-4 text-[28px] text-sg-ink">Start a Shipment</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-sg-ink-2">
          {isLocal
            ? "Pick up from your door and hand it to someone across the city, verified at the doorstep."
            : "We collect from you and hand it to your courier partner for the journey out of town."}
        </p>

        <PrimaryButton
          className="mt-5"
          icon={ArrowRight}
          onClick={() =>
            navigate(isLocal ? "/parcel/local" : "/parcel/outstation")
          }
        >
          Create New Booking
        </PrimaryButton>
      </Card>

      {/* ---- in-transit count ---- */}
      <Card className="mt-4 p-5">
        <div className="flex items-start justify-between">
          <Label>Parcels In Transit</Label>
          <Shield className="h-4 w-4 text-sg-ink-3" />
        </div>
        <Data className="mt-1 block text-[38px] font-bold leading-none text-sg-ink">
          {String(active.length).padStart(2, "0")}
        </Data>
        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-sg-accent">
          <TrendingUp className="h-3.5 w-3.5" />
          {active.length ? "Everything on schedule" : "Nothing on the move"}
        </p>
      </Card>

      {/* ---- active list ---- */}
      <div className="mt-7 flex items-baseline justify-between gap-3">
        <h2 className="sg-heading text-[20px] text-sg-ink">Active Shipments</h2>
        <button
          type="button"
          onClick={() => navigate("/profile/parcel-history")}
          className="sg-label text-sg-ink-3 underline-offset-4 hover:underline"
        >
          Full History
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {loading ? (
          [0, 1].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-[var(--sg-r-xl)] bg-sg-surface-2"
            />
          ))
        ) : active.length === 0 ? (
          <EmptyNote
            title="No shipments moving"
            body={
              isLocal
                ? "Book a local delivery and it will show up here."
                : "Book an outstation pickup and it will show up here."
            }
          />
        ) : isLocal ? (
          active.map((parcel) => (
            <ShipmentCard
              key={parcel._id}
              parcel={parcel}
              onOpen={(p) => navigate(`/parcel/local/track/${p._id}`)}
            />
          ))
        ) : (
          active.map((parcel) => (
            <Card key={parcel._id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label>Waybill ID</Label>
                  <Data className="mt-0.5 block text-[15px] font-semibold text-sg-ink">
                    {String(parcel._id).slice(-10).toUpperCase()}
                  </Data>
                </div>
                <StatusChip tone="transit">
                  {(parcel.status || "").replace(/_/g, " ")}
                </StatusChip>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[13px] text-sg-ink-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-sg-ink-3" />
                <span className="truncate">
                  {parcel.pickupAddress?.fullAddress?.split(",")[0]} →{" "}
                  {parcel.courierCompany || "Courier hub"}
                </span>
              </div>
              <div className="mt-3 flex items-end justify-between border-t border-sg-line pt-3">
                <div>
                  <Label>Estimated Pickup</Label>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] text-sg-ink">
                    <Clock className="h-3.5 w-3.5 text-sg-ink-3" />
                    {parcel.preferredPickupDate
                      ? new Date(parcel.preferredPickupDate).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short",
                        })
                      : "Today"}
                  </p>
                </div>
                <Barcode value={parcel._id} height={26} className="text-sg-ink-3" />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default ParcelHome;
