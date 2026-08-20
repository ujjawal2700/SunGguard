import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { User, Phone, ShieldCheck, Send, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ParcelProofCapture from "../ParcelProofCapture";
import ProximityBanner from "./ProximityBanner";
import { cityParcelApi } from "../../services/cityParcelApi";
import { unwrap } from "@core/api/unwrap";

/**
 * The handover at point B.
 *
 * Four things are captured together, because each proves something the
 * others do not:
 *
 *   name       the person expected this parcel
 *   phone      it is the right person at the right address
 *   OTP        they were reachable and consented
 *   photo      condition and context, for disputes
 *
 * plus a silent proximity check that proves the rider is actually there.
 * An OTP alone only shows that somebody read a number down a phone line.
 */

const OTP_LENGTH = 6;

const DeliveryVerifySheet = ({ parcel, riderLocation, onDone, onFailedAttempt }) => {
  const [otp, setOtp] = useState("");
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [proofImage, setProofImage] = useState("");
  const [receivedByName, setReceivedByName] = useState("");
  const [relation, setRelation] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);

  const [proximity, setProximity] = useState({ state: "checking" });
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const otpRef = useRef(null);

  const cityParcelId = parcel?._id;
  const expectedLast4 = parcel?.receiver?.phoneLast4 || "";
  const allowAlternate = Boolean(parcel?.receiver?.allowAlternate);

  /* ---------------- proximity ---------------- */

  const runProximityCheck = useCallback(async () => {
    if (!cityParcelId) return;
    setProximity((p) => ({ ...p, state: "checking" }));
    try {
      const { data } = await cityParcelApi.checkProximity(cityParcelId, {
        lat: riderLocation?.lat,
        lng: riderLocation?.lng,
        accuracyM: riderLocation?.accuracyM,
      });
      const result = unwrap({ data });
      const stateByReason = {
        OK: "ok",
        TOO_FAR: "far",
        NO_FIX: "nofix",
        STALE_FIX: "stale",
      };
      setProximity({
        state: stateByReason[result?.reason] || "error",
        distanceMeters: result?.distanceMeters,
        limit: result?.limit,
        message: result?.passed ? "" : result?.message,
        passed: Boolean(result?.passed),
      });
    } catch {
      // A failed check must not block the rider — the server re-checks on
      // submit anyway, so this is only an early warning.
      setProximity({ state: "error", message: "We'll check again when you submit." });
    }
  }, [cityParcelId, riderLocation?.lat, riderLocation?.lng, riderLocation?.accuracyM]);

  useEffect(() => {
    runProximityCheck();
  }, [runProximityCheck]);

  /* ---------------- otp ---------------- */

  const sendOtp = useCallback(
    async (resend = false) => {
      setSendingOtp(true);
      try {
        const { data } = await cityParcelApi.sendDeliveryOtp(cityParcelId, { resend });
        const payload = unwrap({ data });
        toast.success(
          resend ? "New code sent to the receiver" : "Code sent to the receiver",
        );
        // Pre-launch the backend runs in mock mode and hands the code back
        // so the flow is testable without a live SMS account.
        if (payload?.devCode) {
          toast.info(`Test mode code: ${payload.devCode}`, { duration: 8000 });
        }
        otpRef.current?.focus();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Could not send the code");
      } finally {
        setSendingOtp(false);
      }
    },
    [cityParcelId],
  );

  /* ---------------- validation ---------------- */

  const phoneMatches = !expectedLast4 || phoneLast4 === expectedLast4;
  const proximityBlocking = proximity.state === "far" || proximity.state === "nofix" || proximity.state === "stale";

  const blockers = useMemo(() => {
    const list = [];
    if (!nameConfirmed) list.push("Confirm the receiver's name");
    if (phoneLast4.length !== 4) list.push("Enter the last 4 digits of their number");
    else if (!phoneMatches) list.push("Those digits don't match");
    if (otp.length !== OTP_LENGTH) list.push(`Enter the ${OTP_LENGTH}-digit code`);
    if (!proofImage) list.push("Take a photo");
    if (proximityBlocking && overrideReason.trim().length < 5) {
      list.push("Explain why you're completing from here");
    }
    return list;
  }, [nameConfirmed, phoneLast4, phoneMatches, otp, proofImage, proximityBlocking, overrideReason]);

  const canSubmit = blockers.length === 0 && !submitting;

  /* ---------------- submit ---------------- */

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await cityParcelApi.verifyDelivery(cityParcelId, {
        otp,
        nameConfirmed: true,
        phoneLast4,
        proofImage,
        location: riderLocation,
        receivedByName: receivedByName.trim(),
        relationToReceiver: relation.trim(),
        overrideReason: proximityBlocking ? overrideReason.trim() : "",
      });

      const payload = unwrap({ data });
      if (payload?.payoutWithheld) {
        toast.warning(
          "Delivered. Your payment is on hold until support reviews the location.",
          { duration: 7000 },
        );
      } else {
        toast.success("Delivered");
      }
      onDone?.(payload?.parcel);
    } catch (err) {
      const res = err?.response?.data;
      const reason = res?.data?.reason || res?.reason;

      if (reason === "PROXIMITY_FAILED") {
        setShowOverride(true);
        await runProximityCheck();
      }
      toast.error(res?.message || "Could not complete the delivery");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <ProximityBanner
        state={proximity.state}
        distanceMeters={proximity.distanceMeters}
        limit={proximity.limit}
        message={proximity.message}
        onRefresh={runProximityCheck}
        refreshing={proximity.state === "checking"}
      />

      {/* ---- who ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Check who you're handing it to
        </p>

        <div className="flex items-center gap-2.5">
          <User className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-slate-900 truncate">
              {parcel?.receiver?.name || "Receiver"}
            </p>
            <p className="text-[12px] text-slate-500">
              {allowAlternate
                ? "Anyone at the address may collect this"
                : "Only this person may collect this"}
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={nameConfirmed}
            onChange={(e) => setNameConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-900"
          />
          <span className="text-[13px] leading-snug text-slate-700">
            I asked their name and it matches
          </span>
        </label>

        <div>
          <label className="flex items-center gap-2 text-[13px] text-slate-700 mb-1.5">
            <Phone className="h-3.5 w-3.5 text-slate-400" />
            Last 4 digits of their number
          </label>
          <input
            inputMode="numeric"
            maxLength={4}
            value={phoneLast4}
            onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
            className={cn(
              "w-28 rounded-lg border px-3 py-2 text-[16px] font-mono tracking-[0.3em] outline-none",
              phoneLast4.length === 4 && !phoneMatches
                ? "border-rose-300 bg-rose-50 text-rose-900"
                : "border-slate-200 focus:border-slate-400",
            )}
          />
          {phoneLast4.length === 4 && !phoneMatches ? (
            <p className="text-[12px] text-rose-600 mt-1">
              That doesn't match. If this isn't the right person, report a failed attempt.
            </p>
          ) : null}
        </div>

        {allowAlternate ? (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <input
              value={receivedByName}
              onChange={(e) => setReceivedByName(e.target.value)}
              placeholder="Collected by (if different)"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400"
            />
            <input
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              placeholder="Relation"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400"
            />
          </div>
        ) : null}
      </section>

      {/* ---- code ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Their code
          </p>
          <button
            type="button"
            onClick={() => sendOtp(true)}
            disabled={sendingOtp}
            className="text-[12px] font-semibold text-slate-700 underline underline-offset-2 disabled:opacity-50"
          >
            {sendingOtp ? "Sending…" : "Resend"}
          </button>
        </div>

        <input
          ref={otpRef}
          inputMode="numeric"
          maxLength={OTP_LENGTH}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
          placeholder="——————"
          className="w-full rounded-lg border border-slate-200 px-3 py-3 text-center text-[22px] font-mono tracking-[0.4em] outline-none focus:border-slate-400"
        />

        <button
          type="button"
          onClick={() => sendOtp(false)}
          disabled={sendingOtp}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 py-2 text-[13px] font-semibold text-slate-700 disabled:opacity-50"
        >
          {sendingOtp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send code to receiver
        </button>
      </section>

      {/* ---- photo ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5">
        <ParcelProofCapture
          label="Photo at the door"
          hint="Show the parcel where you handed it over"
          value={proofImage}
          onChange={setProofImage}
        />
      </section>

      {/* ---- override ---- */}
      {(proximityBlocking || showOverride) && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-amber-900">
                Completing from here needs a reason
              </p>
              <p className="text-[12px] text-amber-800 leading-snug mt-0.5">
                Support will review this and your payment is held until they do.
              </p>
            </div>
          </div>
          <textarea
            rows={2}
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="e.g. Gated society, guard won't allow entry past the gate"
            className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-[13px] outline-none focus:border-amber-400"
          />
        </section>
      )}

      {/* ---- actions ---- */}
      <div className="space-y-2">
        {blockers.length > 0 ? (
          <p className="text-[12px] text-slate-500 text-center">{blockers[0]}</p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={cn(
            "w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold transition",
            canSubmit
              ? "bg-slate-900 text-white active:scale-[0.99]"
              : "bg-slate-200 text-slate-400",
          )}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Confirm delivery
        </button>

        <button
          type="button"
          onClick={onFailedAttempt}
          className="w-full rounded-xl border border-slate-200 py-2.5 text-[13px] font-semibold text-slate-600"
        >
          Can't deliver this
        </button>
      </div>
    </div>
  );
};

export default DeliveryVerifySheet;
