import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Phone, Loader2, RefreshCw, CheckCircle2, Circle,
  AlertTriangle, Home, MapPinned, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { cityParcelApi } from "../services/cityParcelApi";
import { createSocketTokenReader } from "@core/utils/authStorage";
import { STORAGE_KEYS } from "@core/utils/storage";
import {
  getOrderSocket,
  onCityParcelStatusUpdate,
  onCityParcelDecisionNeeded,
} from "@core/services/orderSocket";
import {
  Card, Label, Data, Barcode, StatusChip, Perforation,
  PrimaryButton, GhostButton,
} from "../components/sunguard/kit";

const getCustomerToken = createSocketTokenReader(STORAGE_KEYS.AUTH_CUSTOMER);

/**
 * Tracking a local delivery, from booking through to the door.
 *
 * Three things share this screen because a customer opening it wants one of
 * them and shouldn't have to hunt: where the parcel is, the code they may
 * need to read out, and — if the handover failed — the decision only they
 * can make.
 */

const STATUS_META = {
  REQUESTED: { tone: "idle", label: "Booked" },
  SEARCHING: { tone: "warn", label: "Finding Rider" },
  ACCEPTED: { tone: "transit", label: "Rider Assigned" },
  RIDER_ASSIGNED: { tone: "transit", label: "On The Way" },
  PICKUP_REACHED: { tone: "transit", label: "At Your Door" },
  PICKED_UP: { tone: "transit", label: "Collected" },
  OUT_FOR_DELIVERY: { tone: "transit", label: "In Transit" },
  DROP_REACHED: { tone: "transit", label: "At The Drop" },
  DELIVERED: { tone: "done", label: "Delivered" },
  DELIVERY_FAILED: { tone: "fail", label: "Couldn't Deliver" },
  RETURN_IN_TRANSIT: { tone: "warn", label: "Coming Back" },
  RETURNED: { tone: "idle", label: "Returned To You" },
  CANCELLED: { tone: "idle", label: "Cancelled" },
};

const MILESTONES = [
  { key: "REQUESTED", label: "Booked" },
  { key: "ACCEPTED", label: "Rider assigned" },
  { key: "PICKED_UP", label: "Collected from you" },
  { key: "OUT_FOR_DELIVERY", label: "On the way to drop" },
  { key: "DELIVERED", label: "Handed to receiver" },
];

const ORDER = [
  "REQUESTED", "SEARCHING", "ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED",
  "PICKED_UP", "OUT_FOR_DELIVERY", "DROP_REACHED", "DELIVERED",
];

/* ------------------------------------------------------- consignment note --*/

const ConsignmentNote = ({ parcel, phone }) => {
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const request = async () => {
    setBusy(true);
    try {
      const { data } = await cityParcelApi.requestMyCode(parcel._id);
      const payload = data?.data || data;
      setCode(payload?.devCode || null);
      setCooldown(15);
      toast.success(`Code sent to ${payload?.sentToPhone || "your phone"}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't send a code");
    } finally {
      setBusy(false);
    }
  };

  const isReturn = parcel.status === "RETURN_IN_TRANSIT";
  const digits = String(code || "").split("");

  return (
    <Card className="overflow-hidden p-0">
      {/* dark header — the note itself */}
      <div className="bg-sg-surface-inverse px-5 py-5 text-sg-ink-inverse">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="sg-heading text-[15px]">SunGguard</p>
            <Label className="mt-0.5 !text-current opacity-55">Consignment Note</Label>
          </div>
          <span className="sg-label rounded-full border border-current/30 px-2.5 py-1 opacity-70">
            Copy 1
          </span>
        </div>

        <Data className="mt-4 block text-[22px] font-bold tracking-tight">
          {parcel.referenceId}
        </Data>

        <div className="mt-3 flex items-center justify-between gap-3">
          <Label className="!text-current opacity-55">Your Number</Label>
          <span className="sg-label text-sg-accent">Verified</span>
        </div>
      </div>

      <Perforation />

      {/* light body — the code */}
      <div className="px-5 py-5">
        <p className="sg-heading text-[17px] text-sg-ink">
          {isReturn ? "Code to take it back" : "Code for the rider"}
        </p>
        <Label className="mt-1">Sent to {phone || "your phone"}</Label>

        {digits.length ? (
          <div className="mt-4 flex gap-2.5">
            {digits.map((d, i) => (
              <span
                key={i}
                className="grid h-14 flex-1 place-items-center rounded-[var(--sg-r)] bg-sg-accent-soft text-[24px] font-bold text-sg-ink"
              >
                {d}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-[var(--sg-r)] bg-sg-surface-2 px-4 py-4 text-[13px] leading-snug text-sg-ink-2">
            Tap below and we'll text you a code. Read it out to the rider —
            never send it to anyone else.
          </p>
        )}

        <PrimaryButton
          className="mt-4"
          disabled={busy || cooldown > 0}
          onClick={request}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Send me the code"}
        </PrimaryButton>

        <div className="mt-5 flex flex-col items-center gap-2">
          <Barcode value={parcel.referenceId} height={38} className="text-sg-ink" />
          <Label className="text-center">
            {isReturn ? "Returning to sender · awaiting verification" : "Awaiting pickup verification"}
          </Label>
        </div>
      </div>
    </Card>
  );
};

/* --------------------------------------------------- failed-delivery prompt */

const CHOICES = [
  { value: "RETRY_SAME", label: "Try again", hint: "Same address, one more attempt", icon: RotateCcw },
  { value: "RELEASE_TO_ANYONE", label: "Let anyone collect", hint: "Whoever is at the address can take it", icon: CheckCircle2 },
  { value: "RETURN_TO_PICKUP", label: "Bring it back to me", hint: "Returns to your pickup address", icon: Home },
];

const FailurePrompt = ({ parcel, onResolved }) => {
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);

  const attemptsUsed = parcel.attemptHistory?.length || 0;
  const lastOutcome = parcel.attemptHistory?.[attemptsUsed - 1]?.outcome;
  const mustReturn = Boolean(parcel.returnLeg?.required);
  const options = mustReturn
    ? CHOICES.filter((c) => c.value.startsWith("RETURN"))
    : CHOICES;

  const submit = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      await cityParcelApi.respondToFailure(parcel._id, { choice });
      toast.success(
        choice.startsWith("RETURN") ? "It's on its way back to you" : "We'll try again",
      );
      onResolved?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't save that");
    } finally {
      setBusy(false);
    }
  };

  const reason = {
    NO_ANSWER: "Nobody answered the door or the phone.",
    REFUSED: "They declined to take it.",
    WRONG_ADDRESS: "Nobody by that name is at the address.",
    OTP_FAILED: "The code never worked.",
    NAME_MISMATCH: "Someone else was there, and they're not allowed to collect.",
  }[lastOutcome];

  return (
    <Card className="border-sg-fail/30 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-sg-fail" />
        <div>
          <p className="sg-heading text-[16px] text-sg-ink">
            We couldn't hand it over
          </p>
          <p className="mt-1 text-[13px] leading-snug text-sg-ink-2">
            {reason || "The delivery didn't go through."} The rider still has your
            parcel — tell us what to do.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {options.map((option) => {
          const Icon = option.icon;
          const active = choice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setChoice(option.value)}
              className={cn(
                "flex w-full items-start gap-3 rounded-[var(--sg-r)] border px-4 py-3 text-left transition",
                active
                  ? "border-sg-accent bg-sg-accent-soft"
                  : "border-sg-line bg-sg-surface-2",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  active ? "text-sg-accent" : "text-sg-ink-3",
                )}
              />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-sg-ink">
                  {option.label}
                </span>
                <span className="block text-[12px] text-sg-ink-2">{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {parcel.returnLeg?.responseDeadlineAt ? (
        <p className="mt-3 text-[12px] text-sg-ink-3">
          If we don't hear from you by{" "}
          {new Date(parcel.returnLeg.responseDeadlineAt).toLocaleTimeString("en-IN", {
            hour: "2-digit", minute: "2-digit",
          })}
          , we'll bring it back to you.
        </p>
      ) : null}

      <PrimaryButton className="mt-4" disabled={!choice || busy} onClick={submit}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Confirm
      </PrimaryButton>
    </Card>
  );
};

/* -------------------------------------------------------------------------- */

const CityParcelTracking = () => {
  const { cityParcelId } = useParams();
  const navigate = useNavigate();
  const [parcel, setParcel] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await cityParcelApi.track(cityParcelId);
      const payload = data?.data || data;
      setParcel(payload?.parcel);
      setTimeline(payload?.timeline || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't load this parcel");
      navigate("/", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [cityParcelId, navigate]);

  useEffect(() => {
    load();

    // Sockets carry the update the instant it happens; the interval is a
    // safety net for a dropped connection on a flaky mobile network, so it
    // runs far slower than it would if it were the only mechanism.
    const getToken = getCustomerToken;
    getOrderSocket(getToken);

    const offStatus = onCityParcelStatusUpdate(getToken, (payload) => {
      if (String(payload?.cityParcelId) !== String(cityParcelId)) return;
      if (payload?.parcel) setParcel(payload.parcel);
      else load();
    });

    // The customer has a deadline on this one, so refresh immediately
    // rather than waiting for the next poll.
    const offDecision = onCityParcelDecisionNeeded(getToken, (payload) => {
      if (String(payload?.cityParcelId) !== String(cityParcelId)) return;
      toast.error(payload?.message || "We couldn't deliver your parcel", {
        duration: 10000,
      });
      load();
    });

    const id = setInterval(load, 60000);
    return () => {
      offStatus();
      offDecision();
      clearInterval(id);
    };
  }, [load, cityParcelId]);

  const reachedIndex = useMemo(() => {
    if (!parcel) return -1;
    return ORDER.indexOf(parcel.status);
  }, [parcel]);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-sg-ink-3" />
      </div>
    );
  }
  if (!parcel) return null;

  const meta = STATUS_META[parcel.status] || STATUS_META.REQUESTED;
  const rider = parcel.deliveryPartnerId;
  const showNote = ["ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED", "RETURN_IN_TRANSIT"]
    .includes(parcel.status);

  return (
    <div
      className="min-h-screen bg-sg-bg"
      // Clears the floating nav, which this screen keeps.
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 7rem)" }}
    >
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-sg-line bg-sg-surface px-5 py-4">
        <button type="button" onClick={() => navigate("/")} aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-sg-ink" />
        </button>
        <h2 className="sg-heading text-[17px] text-sg-ink">Tracking</h2>
        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
      </header>

      <div className="mx-auto w-full max-w-lg space-y-4 px-5 pt-5">
        {parcel.status === "DELIVERY_FAILED" ? (
          <FailurePrompt parcel={parcel} onResolved={load} />
        ) : null}

        {showNote ? (
          <ConsignmentNote parcel={parcel} phone={parcel.customerId?.phone} />
        ) : null}

        {/* rider */}
        {rider ? (
          <Card className="flex items-center gap-3 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sg-surface-2">
              <MapPinned className="h-5 w-5 text-sg-ink" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-sg-ink">{rider.name}</p>
              <Data className="text-[12px] text-sg-ink-3">
                {rider.vehicleNumber || rider.vehicleType || "Delivery partner"}
              </Data>
            </div>
            {rider.phone ? (
              <a
                href={`tel:${rider.phone}`}
                className="grid h-10 w-10 place-items-center rounded-full bg-sg-accent text-sg-accent-ink"
                aria-label="Call rider"
              >
                <Phone className="h-4 w-4" />
              </a>
            ) : null}
          </Card>
        ) : null}

        {/* route */}
        <Card className="p-5">
          <Label>Route</Label>
          <div className="mt-3 space-y-4">
            {[
              { label: "From", addr: parcel.pickupAddress },
              { label: "To", addr: parcel.dropAddress },
            ].map((leg) => (
              <div key={leg.label}>
                <Label>{leg.label}</Label>
                <p className="mt-0.5 text-[14px] leading-snug text-sg-ink">
                  {leg.addr?.fullAddress}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-sg-line pt-3">
            <div>
              <Label>Receiver</Label>
              <p className="mt-0.5 text-[13px] text-sg-ink">{parcel.receiver?.name}</p>
            </div>
            <div className="text-right">
              <Label>Fare</Label>
              <Data className="mt-0.5 block text-[15px] font-bold text-sg-ink">
                ₹{Number(parcel.fare).toFixed(2)}
              </Data>
            </div>
          </div>
        </Card>

        {/* milestones */}
        <Card className="p-5">
          <Label>Progress</Label>
          <ol className="mt-4 space-y-0">
            {MILESTONES.map((m, i) => {
              const done = reachedIndex >= ORDER.indexOf(m.key) && reachedIndex >= 0;
              const isLast = i === MILESTONES.length - 1;
              const event = timeline.find((e) => e.status === m.key);
              return (
                <li key={m.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-sg-accent" />
                    ) : (
                      <Circle className="h-4 w-4 text-sg-line-strong" />
                    )}
                    {!isLast ? (
                      <span
                        className={cn(
                          "w-px flex-1",
                          done ? "bg-sg-accent" : "bg-sg-line-strong",
                        )}
                      />
                    ) : null}
                  </div>
                  <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-5")}>
                    <p
                      className={cn(
                        "text-[14px] font-semibold",
                        done ? "text-sg-ink" : "text-sg-ink-3",
                      )}
                    >
                      {m.label}
                    </p>
                    {event ? (
                      <Data className="text-[11px] text-sg-ink-3">
                        {new Date(event.at).toLocaleString("en-IN", {
                          day: "numeric", month: "short",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </Data>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        {["REQUESTED", "SEARCHING"].includes(parcel.status) ? (
          <GhostButton
            className="w-full"
            onClick={async () => {
              try {
                await cityParcelApi.cancel(parcel._id, {});
                toast.success("Cancelled");
                navigate("/");
              } catch (err) {
                toast.error(err?.response?.data?.message || "Couldn't cancel");
              }
            }}
          >
            Cancel this booking
          </GhostButton>
        ) : null}
      </div>
    </div>
  );
};

export default CityParcelTracking;
