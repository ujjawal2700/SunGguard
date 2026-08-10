import React, { useMemo, useState } from "react";
import { RefreshCw, MapPin } from "lucide-react";
import PageHeader from "@shared/components/ui/PageHeader";
import Badge from "@shared/components/ui/Badge";
import { useSellerParcels, ACTIVE_PARCEL_STATUSES, parcelStatusVariant } from "../hooks/useSellerParcels";
import ParcelOrderDetailModal from "../components/ParcelOrderDetailModal";

const TRACK_TABS = ["All Active", "Accepted", "In Transit", "Delivered"];

const SellerParcelTracking = () => {
  const { parcels, loading, refresh } = useSellerParcels();
  const [tab, setTab] = useState("All Active");
  const [selectedParcel, setSelectedParcel] = useState(null);

  const tracked = useMemo(() => {
    const list = parcels.filter((p) => {
      const status = String(p.status || "").toUpperCase();
      if (tab === "All Active") return ACTIVE_PARCEL_STATUSES.has(status);
      if (tab === "Accepted") return status === "ACCEPTED" || status === "SEARCHING";
      if (tab === "In Transit") {
        return ["RIDER_ASSIGNED", "PICKUP_REACHED", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(status);
      }
      if (tab === "Delivered") return status === "DELIVERED";
      return true;
    });
    return list;
  }, [parcels, tab]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Track Orders" subtitle="Live status of parcel deliveries" />
        <button
          type="button"
          onClick={() => refresh(false)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TRACK_TABS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(label)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              tab === label
                ? "bg-primary text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-500">
          Loading tracking data...
        </div>
      ) : tracked.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No parcels in this tracking view.
        </div>
      ) : (
        <div className="space-y-3">
          {tracked.map((parcel) => (
            <button
              key={parcel._id}
              type="button"
              onClick={() => setSelectedParcel(parcel)}
              className="w-full text-left rounded-2xl border border-slate-100 bg-white p-5 shadow-sm hover:border-primary/40 hover:shadow-md transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <p className="text-sm font-black text-slate-800">
                  #{String(parcel._id).slice(-6).toUpperCase()}
                </p>
                <Badge variant={parcelStatusVariant(parcel.status)}>{parcel.status}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <p className="text-slate-600 flex items-start gap-2">
                  <MapPin size={14} className="shrink-0 mt-0.5 text-primary" />
                  <span>
                    <span className="block text-[10px] font-black uppercase text-slate-400">From</span>
                    {parcel.pickupAddress?.fullAddress || "—"}
                  </span>
                </p>
                <p className="text-slate-600 flex items-start gap-2">
                  <MapPin size={14} className="shrink-0 mt-0.5 text-red-500" />
                  <span>
                    <span className="block text-[10px] font-black uppercase text-slate-400">To</span>
                    {parcel.dropAddress?.fullAddress || parcel.destinationCity || "—"}
                  </span>
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedParcel && (
        <ParcelOrderDetailModal
          parcel={selectedParcel}
          onClose={() => setSelectedParcel(null)}
        />
      )}
    </div>
  );
};

export default SellerParcelTracking;
