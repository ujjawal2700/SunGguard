import React, { useState } from "react";
import { CornerUpLeft, IndianRupee, Navigation2, Loader2, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ParcelProofCapture from "../ParcelProofCapture";
import ProximityBanner from "./ProximityBanner";
import { cityParcelApi } from "../../services/cityParcelApi";

/**
 * Taking a parcel back to the customer who booked it.
 *
 * The rider is paid for this leg and the amount is shown up front — the
 * failure was not theirs, and a return that looks unpaid is a return that
 * gets abandoned.
 */
const ReturnLegCard = ({ parcel, riderLocation, onDone }) => {
  const [otp, setOtp] = useState("");
  const [proofImage, setProofImage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reporting, setReporting] = useState(false);

  const address = parcel?.returnLeg?.returnAddress || parcel?.pickupAddress;
  const payout = Number(parcel?.returnLeg?.riderPayout) || 0;
  const canSubmit = otp.length >= 4 && proofImage && !submitting;

  const openMaps = () => {
    if (!address?.lat) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${address.lat},${address.lng}`,
      "_blank",
      "noopener",
    );
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await cityParcelApi.verifyReturn(parcel._id, {
        otp,
        proofImage,
        location: riderLocation,
      });
      toast.success("Returned to the customer");
      onDone?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not complete the return");
    } finally {
      setSubmitting(false);
    }
  };

  const reportUnreachable = async () => {
    setReporting(true);
    try {
      await cityParcelApi.reportCustomerUnreachable(parcel._id, {
        note: "Customer would not take the parcel back",
      });
      toast.success("Escalated to support — they'll contact you");
      onDone?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not escalate");
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3.5">
        <div className="flex items-start gap-2.5">
          <CornerUpLeft className="h-4 w-4 text-indigo-700 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-indigo-900">
              Take this back to the customer
            </p>
            <p className="text-[12px] text-indigo-800 leading-snug mt-0.5">
              {address?.fullAddress || "Pickup address"}
            </p>
            {payout > 0 ? (
              <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-900 mt-1.5">
                <IndianRupee className="h-3 w-3" />
                {payout.toFixed(2)} for this leg
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={openMaps}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-[13px] font-semibold text-slate-700"
      >
        <Navigation2 className="h-3.5 w-3.5" />
        Navigate back
      </button>

      <ProximityBanner
        state={riderLocation?.lat ? "ok" : "nofix"}
        message={
          riderLocation?.lat ? "" : "Turn GPS on so we can confirm you're at the address"
        }
      />

      <section className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Customer's return code
        </p>
        <input
          inputMode="numeric"
          maxLength={4}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="————"
          className="w-full rounded-lg border border-slate-200 px-3 py-3 text-center text-[22px] font-mono tracking-[0.4em] outline-none focus:border-slate-400"
        />
        <p className="text-[12px] text-slate-500">
          We texted this to the customer when the return started.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3.5">
        <ParcelProofCapture
          label="Photo of the handover"
          hint="Show the parcel back with the customer"
          value={proofImage}
          onChange={setProofImage}
        />
      </section>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold",
          canSubmit ? "bg-slate-900 text-white active:scale-[0.99]" : "bg-slate-200 text-slate-400",
        )}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Confirm return
      </button>

      <button
        type="button"
        onClick={reportUnreachable}
        disabled={reporting}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-[13px] font-semibold text-slate-600 disabled:opacity-50"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Customer won't take it back
      </button>
    </div>
  );
};

export default ReturnLegCard;
