import React, { useEffect, useState } from "react";
import {
  X, Loader2, MapPin, Package, User, Bike, IndianRupee, Camera,
  ShieldCheck, ShieldAlert, RotateCcw, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { unwrap } from "@core/api/unwrap";
import { cityParcelAdminApi } from "../../services/cityParcelAdminApi";

/**
 * Everything known about one parcel, including its full event log.
 *
 * Support gets given a waybill number and asked what happened. That question
 * is only answerable from the timeline — who did what, when, and from where —
 * so the log is the centre of this panel rather than a footnote.
 */

const ACTOR_TONE = {
  customer: "bg-blue-50 text-blue-700",
  rider: "bg-emerald-50 text-emerald-700",
  admin: "bg-violet-50 text-violet-700",
  system: "bg-slate-100 text-slate-600",
};

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
const when = (d) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";

const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-1.5">
    <span className="shrink-0 text-[12px] text-slate-500">{label}</span>
    <span className="text-right text-[13px] font-medium text-slate-900">{children}</span>
  </div>
);

const Section = ({ title, icon: Icon, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4">
    <h3 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {title}
    </h3>
    {children}
  </section>
);

const ParcelDetailDrawer = ({ cityParcelId, onClose }) => {
  const [parcel, setParcel] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    cityParcelAdminApi
      .getOne(cityParcelId)
      .then((res) => {
        if (!alive) return;
        const payload = unwrap(res) || {};
        setParcel(payload.parcel || null);
        setTimeline(payload.timeline || []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [cityParcelId]);

  // Escape closes, as it does in every other panel of this kind.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const v = parcel?.dropVerification;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-slate-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white px-5 py-4">
          <div>
            <p className="font-mono text-[15px] font-bold text-slate-900">
              {parcel?.referenceId || "…"}
            </p>
            <p className="text-[12px] text-slate-500">
              {parcel ? `Booked ${when(parcel.createdAt)}` : "Loading"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </header>

        {loading ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : !parcel ? (
          <p className="p-8 text-center text-sm text-slate-500">Parcel not found.</p>
        ) : (
          <div className="space-y-3 p-4">
            <Section title="Route" icon={MapPin}>
              <div className="space-y-2.5">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Pickup</p>
                  <p className="text-[13px] text-slate-800">
                    {parcel.pickupAddress?.fullAddress}
                  </p>
                  {parcel.pickupAddress?.addressNote ? (
                    <p className="text-[12px] text-slate-500">
                      {parcel.pickupAddress.addressNote}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Drop</p>
                  <p className="text-[13px] text-slate-800">
                    {parcel.dropAddress?.fullAddress}
                  </p>
                  {parcel.dropAddress?.addressNote ? (
                    <p className="text-[12px] text-slate-500">
                      {parcel.dropAddress.addressNote}
                    </p>
                  ) : null}
                </div>
                <Row label="Distance">{parcel.distanceKm} km</Row>
              </div>
            </Section>

            <div className="grid gap-3 sm:grid-cols-2">
              <Section title="Customer" icon={User}>
                <Row label="Name">{parcel.customerId?.name || "—"}</Row>
                <Row label="Phone">{parcel.customerId?.phone || "—"}</Row>
                {/* Who actually handed the parcel over, when the booker
                    was filling in for someone else. */}
                {parcel.sender?.name || parcel.sender?.phone ? (
                  <>
                    <Row label="Handed over by">{parcel.sender?.name || "—"}</Row>
                    <Row label="Their phone">{parcel.sender?.phone || "—"}</Row>
                  </>
                ) : null}
              </Section>
              <Section title="Receiver" icon={User}>
                <Row label="Name">{parcel.receiver?.name || "—"}</Row>
                <Row label="Phone">{parcel.receiver?.phone || "—"}</Row>
                {parcel.receiver?.altPhone ? (
                  <Row label="Alternate phone">{parcel.receiver.altPhone}</Row>
                ) : null}
                <Row label="Anyone may collect">
                  {parcel.receiver?.allowAlternate ? "Yes" : "No"}
                </Row>
                {parcel.receiver?.receivedByName ? (
                  <Row label="Collected by">
                    {parcel.receiver.receivedByName}
                    {parcel.receiver.relationToReceiver
                      ? ` (${parcel.receiver.relationToReceiver})`
                      : ""}
                  </Row>
                ) : null}
              </Section>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Section title="Package" icon={Package}>
                <Row label="Type">{parcel.package?.packageType}</Row>
                <Row label="Weight">{parcel.package?.weightKg} kg</Row>
                {parcel.package?.description ? (
                  <Row label="Contents">{parcel.package.description}</Row>
                ) : null}
              </Section>
              <Section title="Rider" icon={Bike}>
                {parcel.deliveryPartnerId ? (
                  <>
                    <Row label="Name">{parcel.deliveryPartnerId.name}</Row>
                    <Row label="Phone">{parcel.deliveryPartnerId.phone}</Row>
                    <Row label="Accepted">{when(parcel.acceptedAt)}</Row>
                  </>
                ) : (
                  <p className="text-[13px] text-slate-400">Not assigned</p>
                )}
              </Section>
            </div>

            <Section title="Money" icon={IndianRupee}>
              <Row label="Fare">{money(parcel.fare)}</Row>
              <Row label="Payment">
                {parcel.paymentMethod} · {parcel.paymentStatus}
              </Row>
              {parcel.paymentStatus === "REFUNDED" ? (
                <Row label="Refund">
                  {money(parcel.payableFare || parcel.fare)} refunded to the customer's original payment method
                </Row>
              ) : null}
              {/* COD cash: where it is, not just that the booking was COD.
                  RIDER_HOLDING means the rider still has it and owes a
                  deposit; REMITTED_TO_ADMIN means an approved deposit
                  cleared it. */}
              {String(parcel.paymentMethod).toUpperCase() === "COD" ? (
                <>
                  <Row label="Cash to collect">
                    {money(parcel.codCollection?.amount ?? parcel.fare)}
                  </Row>
                  <Row label="Cash status">
                    {(parcel.codCollection?.status || "—").replace(/_/g, " ")}
                  </Row>
                  {parcel.codCollection?.collectedAt ? (
                    <Row label="Collected">{when(parcel.codCollection.collectedAt)}</Row>
                  ) : null}
                  {parcel.codCollection?.remittedAt ? (
                    <Row label="Remitted">{when(parcel.codCollection.remittedAt)}</Row>
                  ) : null}
                </>
              ) : null}
              {parcel.codOnlineQr?.paidAt ? (
                <Row label="Paid by QR">{when(parcel.codOnlineQr.paidAt)}</Row>
              ) : null}
              <Row label="Rider earning">{money(parcel.riderEarning)}</Row>
              {Number(parcel.riderReturnEarning) > 0 ? (
                <Row label="Return leg pay">{money(parcel.riderReturnEarning)}</Row>
              ) : null}
              {parcel.payoutWithheld ? (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
                  Payout held pending review
                </p>
              ) : null}
            </Section>

            {/* Verification — the answer to "was this really delivered?" */}
            <Section
              title="Doorstep verification"
              icon={v?.proximityPassed ? ShieldCheck : ShieldAlert}
            >
              {v?.otpVerifiedAt || v?.nameConfirmed ? (
                <>
                  <Row label="Code verified">{when(v.otpVerifiedAt)}</Row>
                  <Row label="Name confirmed">{v.nameConfirmed ? "Yes" : "No"}</Row>
                  <Row label="Phone digits">{v.phoneLast4 || "—"}</Row>
                  <Row label="Distance from drop">
                    {Number.isFinite(v.distanceMeters) ? `${v.distanceMeters} m` : "—"}
                    {Number.isFinite(v.gpsAccuracyM) ? ` (±${v.gpsAccuracyM} m)` : ""}
                  </Row>
                  <Row label="Location check">
                    <span className={v.proximityPassed ? "text-emerald-600" : "text-amber-700"}>
                      {v.proximityPassed ? "Passed" : "Overridden"}
                    </span>
                  </Row>
                  {v.overrideReason ? (
                    <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-700">
                      <span className="font-semibold">Rider&apos;s reason: </span>
                      {v.overrideReason}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-[13px] text-slate-400">Not yet delivered</p>
              )}
            </Section>

            {(parcel.attemptHistory || []).length > 0 ? (
              <Section
                title={`Failed attempts (${parcel.attemptHistory.length})`}
                icon={RotateCcw}
              >
                <div className="space-y-2">
                  {parcel.attemptHistory.map((a) => (
                    <div key={a.attemptNo} className="rounded-lg bg-rose-50 px-3 py-2">
                      <p className="text-[12px] font-semibold text-rose-800">
                        Attempt {a.attemptNo} · {String(a.outcome || "").replace(/_/g, " ")}
                      </p>
                      <p className="text-[11px] text-rose-700">
                        {when(a.at)} · waited {a.waitedMinutes} min
                        {a.calledAt ? " · called" : " · no call recorded"}
                      </p>
                      {a.note ? (
                        <p className="mt-0.5 text-[12px] text-slate-700">{a.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}

            {parcel.returnLeg?.status && parcel.returnLeg.status !== "NONE" ? (
              <Section title="Return" icon={RotateCcw}>
                <Row label="Status">{parcel.returnLeg.status.replace(/_/g, " ")}</Row>
                <Row label="Customer chose">
                  {(parcel.returnLeg.customerChoice || "—").replace(/_/g, " ")}
                </Row>
                <Row label="Rider paid">{money(parcel.returnLeg.riderPayout)}</Row>
                <Row label="Customer charged">{money(parcel.returnLeg.customerCharge)}</Row>
              </Section>
            ) : null}

            {parcel.pickupProofImage ||
            parcel.deliveryProofImage ||
            parcel.returnProofImage ? (
              <Section title="Photo proof" icon={Camera}>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["Pickup", parcel.pickupProofImage],
                    ["Delivery", parcel.deliveryProofImage],
                    ["Return", parcel.returnProofImage],
                  ]
                    .filter(([, url]) => url)
                    .map(([label, url]) => (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {label} photo
                      </a>
                    ))}
                </div>
              </Section>
            ) : null}

            {/* ---- the log ---- */}
            <Section title={`Event log (${timeline.length})`} icon={Clock}>
              {timeline.length === 0 ? (
                <p className="text-[13px] text-slate-400">No events recorded.</p>
              ) : (
                <ol className="space-y-0">
                  {timeline.map((e, i) => (
                    <li key={e._id || i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                        {i < timeline.length - 1 ? (
                          <span className="w-px flex-1 bg-slate-200" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[12px] font-semibold text-slate-900">
                            {String(e.status).replace(/_/g, " ")}
                          </span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                              ACTOR_TONE[e.actor] || ACTOR_TONE.system,
                            )}
                          >
                            {e.actor}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-slate-400">{when(e.at)}</p>
                        {e.note ? (
                          <p className="mt-0.5 text-[12px] text-slate-700">{e.note}</p>
                        ) : null}
                        {Number.isFinite(e.location?.lat) ? (
                          <a
                            href={`https://maps.google.com/?q=${e.location.lat},${e.location.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-blue-600 hover:underline"
                          >
                            <MapPin className="h-3 w-3" />
                            {e.location.lat.toFixed(5)}, {e.location.lng.toFixed(5)}
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParcelDetailDrawer;
