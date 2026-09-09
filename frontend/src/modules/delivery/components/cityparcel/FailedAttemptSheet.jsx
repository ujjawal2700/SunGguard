import React, { useEffect, useRef, useState } from "react";
import { PhoneCall, Clock, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ParcelProofCapture from "../ParcelProofCapture";
import { cityParcelApi } from "../../services/cityParcelApi";
import { unwrap } from "@core/api/unwrap";

/**
 * Reporting that a handover could not happen.
 *
 * The customer is about to be told their parcel is coming back, so "I tried"
 * has to be evidence rather than a claim: a call placed from the app, time
 * actually waited, and a photo of the door are all recorded on the attempt.
 */

const OUTCOMES = [
  { value: "NO_ANSWER", label: "No answer", hint: "Nobody came to the door or picked up" },
  { value: "REFUSED", label: "They refused it", hint: "The receiver is here but won't take it" },
  { value: "WRONG_ADDRESS", label: "Wrong address", hint: "Nobody by that name is here" },
  { value: "NAME_MISMATCH", label: "Different person", hint: "Someone else, and they're not allowed to collect" },
  { value: "OTP_FAILED", label: "Code didn't work", hint: "They never got it, or it kept failing" },
];

const FailedAttemptSheet = ({ parcel, riderLocation, minWaitMinutes = 5, onDone, onBack }) => {
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [calledAt, setCalledAt] = useState(null);
  const [waitedSeconds, setWaitedSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef(Date.now());

  // The wait is measured from when this screen opened, not typed in by hand.
  useEffect(() => {
    const id = setInterval(() => {
      setWaitedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const waitedMinutes = Math.floor(waitedSeconds / 60);
  const needsWait = outcome === "NO_ANSWER";
  const waitSatisfied = !needsWait || waitedMinutes >= minWaitMinutes;
  const canSubmit = outcome && photoUrl && waitSatisfied && !submitting;

  /**
   * The receiver's number is deliberately never sent to the rider app — only
   * the last four digits, for the read-back check — so this dialled
   * `receiver.phone`, which is always undefined, and silently did nothing.
   * The customer (sender) is reachable, and is who the rider needs when a
   * handover fails anyway, so that is who this calls.
   */
  const customerPhone = parcel?.customerId?.phone || "";
  const callCustomer = () => {
    setCalledAt(new Date().toISOString());
    if (customerPhone) window.location.href = `tel:${customerPhone}`;
    else toast.info("Call the customer, then come back here");
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await cityParcelApi.reportFailedAttempt(parcel._id, {
        outcome,
        note: note.trim(),
        photoUrl,
        calledAt,
        waitedMinutes,
        location: riderLocation,
      });
      const payload = unwrap({ data });
      toast.success(
        payload?.isLastAttempt
          ? "Logged. We've asked the customer where to return it."
          : "Logged. We've asked the customer what to do.",
      );
      onDone?.(payload?.parcel);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not log this");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to delivery
      </button>

      <div>
        <h2 className="text-[17px] font-semibold text-slate-900">What happened?</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">
          We'll ask the customer what to do next. You keep the parcel for now.
        </p>
      </div>

      <div className="space-y-2">
        {OUTCOMES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setOutcome(item.value)}
            className={cn(
              "w-full text-left rounded-xl border px-3.5 py-3 transition",
              outcome === item.value
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-800",
            )}
          >
            <p className="text-[14px] font-semibold">{item.label}</p>
            <p
              className={cn(
                "text-[12px] mt-0.5",
                outcome === item.value ? "text-white/70" : "text-slate-500",
              )}
            >
              {item.hint}
            </p>
          </button>
        ))}
      </div>

      {needsWait ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[13px] text-slate-700">
              <Clock className="h-4 w-4 text-slate-400" />
              Waited
            </span>
            <span
              className={cn(
                "font-mono text-[15px] font-semibold tabular-nums",
                waitSatisfied ? "text-emerald-600" : "text-slate-900",
              )}
            >
              {String(Math.floor(waitedSeconds / 60)).padStart(2, "0")}:
              {String(waitedSeconds % 60).padStart(2, "0")}
            </span>
          </div>

          {!waitSatisfied ? (
            <p className="text-[12px] text-amber-700 leading-snug">
              Give them {minWaitMinutes} minutes and try calling before marking this
              unreachable.
            </p>
          ) : null}

          <button
            type="button"
            onClick={callCustomer}
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold",
              calledAt ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700",
            )}
          >
            <PhoneCall className="h-3.5 w-3.5" />
            {calledAt ? "Called — call again" : "Call the customer"}
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <ParcelProofCapture
          label="Photo of the door"
          hint="So we can show the customer you were there"
          value={photoUrl}
          onChange={setPhotoUrl}
        />
      </div>

      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything else worth noting (optional)"
        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] outline-none focus:border-slate-400"
      />

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold",
          canSubmit ? "bg-rose-600 text-white active:scale-[0.99]" : "bg-slate-200 text-slate-400",
        )}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Report failed attempt
      </button>
    </div>
  );
};

export default FailedAttemptSheet;
