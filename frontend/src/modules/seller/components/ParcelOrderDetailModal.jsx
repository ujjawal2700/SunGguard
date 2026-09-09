import React, { useState } from "react";
import {
  X,
  MapPin,
  Package,
  User,
  Truck,
  CreditCard,
  Calendar,
  Navigation,
} from "lucide-react";
import { toast } from "sonner";
import Badge from "@shared/components/ui/Badge";
import { parcelStatusVariant } from "../hooks/useSellerParcels";
import { sellerApi } from "../services/sellerApi";
import { openParcelRazorpayCheckout } from "../../customer/utils/parcelRazorpay";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";

const DetailRow = ({ label, value }) => (
  <div className="flex justify-between gap-3 text-sm py-1.5 border-b border-slate-50 last:border-0">
    <span className="text-slate-500 font-medium shrink-0">{label}</span>
    <span className="text-slate-800 font-bold text-right break-words">{value ?? "—"}</span>
  </div>
);

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const codStatusLabel = (status) => {
  switch (String(status || "").toUpperCase()) {
    case "COLLECT_PENDING":
      return "Waiting for rider to collect";
    case "RIDER_HOLDING":
      return "Cash with rider";
    case "WITH_SELLER":
      return "Cash with seller — remit to admin";
    case "REMITTED_TO_ADMIN":
      return "Remitted to admin";
    default:
      return "Not applicable";
  }
};

const ParcelOrderDetailModal = ({ parcel: initialParcel, onClose, onUpdated }) => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";
  const [parcel, setParcel] = useState(initialParcel);
  const [paying, setPaying] = useState(false);

  if (!parcel) return null;

  const customer =
    parcel.customerId && typeof parcel.customerId === "object"
      ? parcel.customerId
      : null;
  const rider =
    parcel.deliveryPartnerId && typeof parcel.deliveryPartnerId === "object"
      ? parcel.deliveryPartnerId
      : null;
  const pkg = parcel.packageDetails || {};
  const fareBreakdown = parcel.fareBreakdown || {};
  const pickup = parcel.pickupAddress || {};
  const drop = parcel.dropAddress || {};
  const isCod = String(parcel.paymentMethod || "").toUpperCase() === "COD";
  const collectAmount = Number(
    parcel.codSettlement?.collectAmount || parcel.fare || 0,
  );
  const codStatus = parcel.codSettlement?.status || "NOT_APPLICABLE";
  const needsRemit =
    isCod &&
    parcel.status === "DELIVERED" &&
    (codStatus === "WITH_SELLER" || codStatus === "RIDER_HOLDING") &&
    parcel.paymentStatus !== "PAID";

  const handleRemitToAdmin = async () => {
    if (paying) return;
    setPaying(true);
    try {
      const createRes = await sellerApi.createParcelCodRemit(parcel._id);
      if (!createRes.data?.success) {
        throw new Error(createRes.data?.message || "Failed to start remittance");
      }
      const { razorpay, collectAmount: amount } = createRes.data.result || {};
      if (!razorpay?.orderId) {
        throw new Error("Razorpay order missing");
      }

      const payment = await openParcelRazorpayCheckout({
        keyId: razorpay.keyId,
        orderId: razorpay.orderId,
        amount: razorpay.amount,
        currency: razorpay.currency || "INR",
        name: appName,
        description: `COD remit to admin · ₹${Number(amount || collectAmount).toFixed(2)}`,
        prefill: {
          name: user?.name || user?.shopName || "",
          email: user?.email || "",
          contact: user?.phone || "",
        },
      });

      const verifyRes = await sellerApi.verifyParcelCodRemit({
        parcelId: parcel._id,
        ...payment,
      });
      if (!verifyRes.data?.success) {
        throw new Error(verifyRes.data?.message || "Failed to verify remittance");
      }

      const updated = verifyRes.data.result || verifyRes.data;
      setParcel(updated);
      onUpdated?.(updated);
      toast.success("COD remitted to admin successfully");
    } catch (error) {
      if (error?.message === "Payment cancelled") {
        toast.info("Payment cancelled");
      } else {
        toast.error(error?.response?.data?.message || error.message || "Remit failed");
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Parcel Order Detail
            </p>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              #{String(parcel._id).slice(-6).toUpperCase()}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={parcelStatusVariant(parcel.status)}>{parcel.status}</Badge>
              {parcel.deliverySpeed === "express" ? (
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
                  Express · 10 min
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-600">
                  Normal · 30 min
                </span>
              )}
              {isCod && (
                <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
                  COD
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          <div className="rounded-2xl bg-slate-900 text-white p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">
                Total Fare
              </p>
              <p className="text-2xl font-black mt-1">
                ₹{Number(parcel.fare || 0).toFixed(2)}
              </p>
            </div>
            <div className="text-right text-xs text-slate-300 space-y-1">
              <p>Payment: <span className="font-bold text-white">{parcel.paymentMethod || "—"}</span></p>
              <p>Status: <span className="font-bold text-white">{parcel.paymentStatus || "—"}</span></p>
            </div>
          </div>

          {isCod && (
            <section className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <CreditCard size={14} /> COD Settlement
              </h3>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 space-y-1">
                <DetailRow label="Collect amount" value={`₹${collectAmount.toFixed(2)}`} />
                <DetailRow label="Cash status" value={codStatusLabel(codStatus)} />
                <DetailRow
                  label="Rider collected"
                  value={formatDate(parcel.codSettlement?.riderCollectedAt)}
                />
                <DetailRow
                  label="Handed to seller"
                  value={formatDate(parcel.codSettlement?.handedToSellerAt)}
                />
                <DetailRow
                  label="Remitted to admin"
                  value={formatDate(parcel.codSettlement?.remittedAt)}
                />
              </div>
              {needsRemit && (
                <p className="text-[11px] text-amber-800 font-medium px-1">
                  Rider handed cash to your hub. Pay the same amount to admin via Razorpay.
                </p>
              )}
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <MapPin size={14} className="text-primary" /> Pickup
            </h3>
            <div className="rounded-2xl border border-slate-100 p-4 space-y-1">
              <DetailRow label="Name" value={pickup.name} />
              <DetailRow label="Phone" value={pickup.phone} />
              <DetailRow label="Address" value={pickup.fullAddress} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Navigation size={14} className="text-red-500" /> Drop / Courier
            </h3>
            <div className="rounded-2xl border border-slate-100 p-4 space-y-1">
              <DetailRow label="Courier" value={parcel.courierCompany || "—"} />
              <DetailRow label="Destination City" value={parcel.destinationCity} />
              <DetailRow label="Name" value={drop.name} />
              <DetailRow label="Phone" value={drop.phone} />
              <DetailRow label="Address" value={drop.fullAddress} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Package size={14} /> Package
            </h3>
            <div className="rounded-2xl border border-slate-100 p-4 space-y-1">
              <DetailRow
                label="Weight"
                value={`${Number(pkg.weight ?? parcel.weight ?? 0)} kg`}
              />
              <DetailRow label="Description" value={pkg.description || "—"} />
              <DetailRow
                label="Delivery Speed"
                value={
                  parcel.deliverySpeed === "express" ? "Express (10 min)" : "Normal (30 min)"
                }
              />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Calendar size={14} /> Schedule
            </h3>
            <div className="rounded-2xl border border-slate-100 p-4 space-y-1">
              <DetailRow label="Pickup Window" value={parcel.pickupWindow || "—"} />
              <DetailRow label="Booked At" value={formatDate(parcel.createdAt)} />
              <DetailRow
                label="Distance"
                value={`${Number(parcel.distance || 0)} km`}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <CreditCard size={14} /> Fare Breakdown
            </h3>
            <div className="rounded-2xl border border-slate-100 p-4 space-y-1">
              <DetailRow label="Distance Fare" value={`₹${Number(fareBreakdown.distanceFare || 0).toFixed(2)}`} />
              <DetailRow label="Weight Fare" value={`₹${Number(fareBreakdown.weightFare || 0).toFixed(2)}`} />
              <DetailRow label="Platform Charge" value={`₹${Number(fareBreakdown.platformCharge || 0).toFixed(2)}`} />
              <DetailRow label="Express Charge" value={`₹${Number(fareBreakdown.expressCharge || 0).toFixed(2)}`} />
              <DetailRow label="Total" value={`₹${Number(parcel.fare || 0).toFixed(2)}`} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <User size={14} /> Customer
            </h3>
            <div className="rounded-2xl border border-slate-100 p-4 space-y-1">
              <DetailRow label="Name" value={customer?.name || pickup.name || "—"} />
              <DetailRow
                label="Phone"
                value={customer?.phone || pickup.phone || "—"}
              />
            </div>
          </section>

          {rider && (
            <section className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Truck size={14} /> Delivery Partner
              </h3>
              <div className="rounded-2xl border border-slate-100 p-4 space-y-1">
                <DetailRow label="Name" value={rider.name} />
                <DetailRow label="Phone" value={rider.phone} />
              </div>
            </section>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 space-y-2">
          {needsRemit && (
            <button
              type="button"
              disabled={paying}
              onClick={handleRemitToAdmin}
              className="w-full py-3 rounded-xl bg-amber-600 text-white text-xs font-black uppercase tracking-widest hover:bg-amber-700 disabled:opacity-60"
            >
              {paying
                ? "Processing..."
                : `Pay Admin ₹${collectAmount.toFixed(2)} via Razorpay`}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParcelOrderDetailModal;
