import React from "react";
import { MapPin } from "lucide-react";
import Badge from "@shared/components/ui/Badge";
import { parcelStatusVariant } from "../hooks/useSellerParcels";

const isCodPendingRemit = (parcel) => {
  if (String(parcel.paymentMethod || "").toUpperCase() !== "COD") return false;
  if (parcel.status !== "DELIVERED") return false;
  const codStatus = parcel.codSettlement?.status;
  return codStatus === "WITH_SELLER" || codStatus === "RIDER_HOLDING";
};

const ParcelOrderCard = ({ parcel, compact = false, onClick }) => (
  <div
    role={onClick ? "button" : undefined}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick}
    onKeyDown={
      onClick
        ? (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClick();
            }
          }
        : undefined
    }
    className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition ${
      onClick ? "cursor-pointer hover:border-primary/40 hover:shadow-md" : ""
    }`}
  >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
          Parcel #{String(parcel._id).slice(-6).toUpperCase()}
        </p>
        <p className="text-lg font-black text-slate-800 mt-1">
          ₹{Number(parcel.fare || 0).toFixed(2)}
        </p>
        {parcel.deliverySpeed === "express" ? (
          <span className="mt-1.5 inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
            Express · 10 min
          </span>
        ) : (
          <span className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-600">
            Normal · 30 min
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <Badge variant={parcelStatusVariant(parcel.status)}>{parcel.status}</Badge>
        {String(parcel.paymentMethod || "").toUpperCase() === "COD" && (
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            COD
          </span>
        )}
      </div>
    </div>

    {!compact && (
      <>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Pickup</p>
            <p className="font-semibold text-slate-700 flex items-start gap-2">
              <MapPin size={14} className="shrink-0 mt-0.5 text-primary" />
              {parcel.pickupAddress?.fullAddress || "—"}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Drop / Courier</p>
            <p className="font-semibold text-slate-700">
              {parcel.courierCompany || parcel.destinationCity || "—"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {parcel.dropAddress?.fullAddress || ""}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500 font-medium">
          <span>Weight: {parcel.weight} kg</span>
          <span>Distance: {parcel.distance} km</span>
          {parcel.sellerId ? (
            <span className="text-primary font-bold">Assigned to you</span>
          ) : (
            <span className="text-amber-600 font-bold">In your radius</span>
          )}
        </div>

        {isCodPendingRemit(parcel) && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">
              COD cash with you — remit to admin
            </p>
            <p className="text-base font-black text-amber-900 mt-0.5">
              ₹{Number(parcel.codSettlement?.collectAmount || parcel.fare || 0).toFixed(2)}
            </p>
            <p className="text-[11px] text-amber-700/80 font-medium mt-0.5">
              Open details to pay admin via Razorpay
            </p>
          </div>
        )}
      </>
    )}
  </div>
);

export default ParcelOrderCard;
