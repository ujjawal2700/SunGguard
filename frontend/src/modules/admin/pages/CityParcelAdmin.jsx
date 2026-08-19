import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, ShieldAlert, UserPlus, RefreshCw, Save, MapPin, X, Check,
  AlertTriangle, IndianRupee,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { cityParcelAdminApi } from "../services/cityParcelAdminApi";

/**
 * City Parcel operations console.
 *
 * Three jobs, in the order they hurt when missing:
 *   1. release the payouts held behind a proximity override
 *   2. rescue a parcel the rider search gave up on
 *   3. set the rate card, which otherwise runs on schema defaults
 */

const TABS = [
  { value: "attention", label: "Needs Attention" },
  { value: "all", label: "All Parcels" },
  { value: "pricing", label: "Rate Card" },
];

const STATUS_TONE = {
  DELIVERED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RETURNED: "bg-slate-100 text-slate-600 border-slate-200",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
  DELIVERY_FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  RETURN_IN_TRANSIT: "bg-amber-50 text-amber-700 border-amber-200",
  REQUESTED: "bg-amber-50 text-amber-700 border-amber-200",
  SEARCHING: "bg-amber-50 text-amber-700 border-amber-200",
};

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

const Chip = ({ status }) => (
  <span
    className={cn(
      "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide",
      STATUS_TONE[status] || "bg-blue-50 text-blue-700 border-blue-200",
    )}
  >
    {String(status || "").replace(/_/g, " ")}
  </span>
);

/* ----------------------------------------------------------- assign modal --*/

const AssignModal = ({ parcel, onClose, onAssigned }) => {
  const [riders, setRiders] = useState([]);
  const [picked, setPicked] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    cityParcelAdminApi
      .listRiders()
      .then((res) => setRiders(res?.data?.data?.riders || res?.data?.riders || []))
      .catch(() => toast.error("Couldn't load riders"))
      .finally(() => setLoading(false));
  }, []);

  const assign = async () => {
    setSaving(true);
    try {
      await cityParcelAdminApi.assignRider(parcel._id, picked);
      toast.success("Rider assigned");
      onAssigned();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't assign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="font-semibold text-slate-900">Assign a rider</h3>
            <p className="font-mono text-[12px] text-slate-500">{parcel.referenceId}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : riders.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No approved parcel riders yet.
            </p>
          ) : (
            <div className="space-y-2">
              {riders.map((r) => {
                const unavailable = r.isBusy;
                return (
                  <button
                    key={r._id}
                    type="button"
                    disabled={unavailable}
                    onClick={() => setPicked(r._id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition",
                      picked === r._id
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200",
                      unavailable && "opacity-45",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">
                        {r.name}
                      </span>
                      <span className="block font-mono text-[11px] text-slate-500">
                        {r.phone} · {r.vehicleNumber || r.vehicleType || "—"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[11px] font-semibold",
                        unavailable
                          ? "text-slate-400"
                          : r.isOnline
                            ? "text-emerald-600"
                            : "text-slate-400",
                      )}
                    >
                      {unavailable ? "On a job" : r.isOnline ? "Online" : "Offline"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!picked || saving}
            onClick={assign}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Assign
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */

const CityParcelAdmin = () => {
  const [tab, setTab] = useState("attention");
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cityParcelAdminApi.list({ limit: 200 });
      setParcels(res?.data?.data?.parcels || res?.data?.parcels || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't load parcels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    cityParcelAdminApi
      .getConfig()
      .then((res) => setConfig(res?.data?.data?.config || res?.data?.config))
      .catch(() => {});
  }, [load]);

  /** Two things genuinely need a human: held payouts, and parked parcels. */
  const attention = useMemo(() => {
    const withheld = parcels.filter((p) => p.payoutWithheld);
    const parked = parcels.filter(
      (p) => !p.deliveryPartnerId && ["REQUESTED", "SEARCHING"].includes(p.status),
    );
    const stuck = parcels.filter(
      (p) => p.returnLeg?.status === "CUSTOMER_UNREACHABLE",
    );
    return { withheld, parked, stuck };
  }, [parcels]);

  const review = async (parcel, approve) => {
    setBusyId(parcel._id);
    try {
      await cityParcelAdminApi.reviewOverride(parcel._id, { approve });
      toast.success(approve ? "Approved — payout released" : "Rejected");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't save");
    } finally {
      setBusyId(null);
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const { _id, __v, createdAt, updatedAt, packageTypes, ...body } = config;
      await cityParcelAdminApi.updateConfig(body);
      toast.success("Rate card saved");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't save the rate card");
    } finally {
      setSavingConfig(false);
    }
  };

  const num = (key, label, hint) => (
    <label key={key} className="block">
      <span className="text-[12px] font-semibold text-slate-600">{label}</span>
      <input
        type="number"
        value={config?.[key] ?? ""}
        onChange={(e) => setConfig({ ...config, [key]: Number(e.target.value) })}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
      {hint ? <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );

  const attentionCount =
    attention.withheld.length + attention.parked.length + attention.stuck.length;

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">City Parcel</h1>
        <p className="mt-1 text-sm text-slate-500">
          Local point-to-point deliveries. The outstation flow is managed under
          Parcel Delivery.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              tab === t.value
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200",
            )}
          >
            {t.label}
            {t.value === "attention" && attentionCount ? (
              <span className="ml-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] text-white">
                {attentionCount}
              </span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : tab === "pricing" ? (
        !config ? (
          <p className="text-sm text-slate-500">Rate card unavailable.</p>
        ) : (
          <div className="max-w-3xl space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-1 font-semibold text-slate-900">Fares</h2>
              <p className="mb-4 text-[12px] text-slate-500">
                Base fare is charged and the rider takes a share of it — it is what
                makes short trips worth taking.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {num("baseFare", "Base fare (₹)")}
                {num("perKmCharge", "Per km (₹)")}
                {num("weightCharge", "Per kg (₹)")}
                {num("minFare", "Minimum fare (₹)")}
                {num("platformCharge", "Platform charge (₹)")}
                {num("expressCharge", "Express charge (₹)")}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-4 font-semibold text-slate-900">Rider share</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {num("riderBaseFareSharePercent", "Base fare share (%)")}
                {num("riderDistanceFareSharePercent", "Distance share (%)")}
                {num(
                  "returnRiderPayoutPercent",
                  "Return leg payout (%)",
                  "Of the original distance fare. The failed handover was not their fault.",
                )}
                {num(
                  "returnCustomerChargePercent",
                  "Return charge to customer (%)",
                  "Independent of the payout above — you can pay the rider and bill nothing.",
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-4 font-semibold text-slate-900">Verification</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {num(
                  "dropProximityMeters",
                  "Proximity gate (m)",
                  "GPS reads 30–60 m off in stairwells and basements. Too tight strands real riders.",
                )}
                {num("maxLocationAgeSeconds", "Max GPS age (s)")}
                {num("maxDeliveryAttempts", "Delivery attempts")}
                {num("minWaitAtDropMinutes", "Min wait at door (min)")}
                {num("customerResponseWindowMinutes", "Customer reply window (min)")}
                {num("maxTripDistanceKm", "Max trip (km)")}
              </div>
              <label className="mt-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(config.allowProximityOverride)}
                  onChange={(e) =>
                    setConfig({ ...config, allowProximityOverride: e.target.checked })
                  }
                  className="h-4 w-4 accent-slate-900"
                />
                <span className="text-sm text-slate-700">
                  Let riders complete past the gate with a written reason (payout held for review)
                </span>
              </label>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(config.isEnabled)}
                  onChange={(e) => setConfig({ ...config, isEnabled: e.target.checked })}
                  className="h-4 w-4 accent-slate-900"
                />
                <span className="text-sm text-slate-700">
                  City delivery is open for bookings
                </span>
              </label>
            </section>

            <button
              type="button"
              onClick={saveConfig}
              disabled={savingConfig}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingConfig ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save rate card
            </button>
          </div>
        )
      ) : tab === "attention" ? (
        <div className="space-y-6">
          {attentionCount === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500">
              Nothing needs you right now.
            </p>
          ) : null}

          {attention.withheld.length > 0 ? (
            <section>
              <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                Payouts held for review ({attention.withheld.length})
              </h2>
              <p className="mb-3 text-[12px] text-slate-500">
                These were delivered past the location check. The rider is unpaid
                until you decide.
              </p>
              <div className="space-y-3">
                {attention.withheld.map((p) => (
                  <div key={p._id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-slate-900">
                          {p.referenceId}
                        </p>
                        <p className="mt-0.5 text-[13px] text-slate-600">
                          {p.deliveryPartnerId?.name || "Rider"} · delivered to{" "}
                          {p.receiver?.name}
                        </p>
                      </div>
                      <Chip status={p.status} />
                    </div>

                    <div className="mt-3 rounded-lg bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Rider's reason
                      </p>
                      <p className="mt-1 text-[13px] text-slate-800">
                        {p.dropVerification?.overrideReason || "—"}
                      </p>
                      <p className="mt-2 flex items-center gap-1.5 font-mono text-[12px] text-slate-500">
                        <MapPin className="h-3 w-3" />
                        {p.dropVerification?.distanceMeters ?? "?"} m from the drop
                        {p.dropVerification?.gpsAccuracyM
                          ? ` · ±${p.dropVerification.gpsAccuracyM} m GPS`
                          : ""}
                      </p>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === p._id}
                        onClick={() => review(p, true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve &amp; pay
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p._id}
                        onClick={() => review(p, false)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-[13px] font-semibold text-slate-700 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {attention.parked.length > 0 ? (
            <section>
              <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
                <UserPlus className="h-4 w-4 text-rose-600" />
                No rider found ({attention.parked.length})
              </h2>
              <p className="mb-3 text-[12px] text-slate-500">
                The search widened as far as it goes and nobody accepted. These sit
                still until you assign someone.
              </p>
              <div className="space-y-3">
                {attention.parked.map((p) => (
                  <div key={p._id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-slate-900">
                          {p.referenceId}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-slate-600">
                          {p.pickupAddress?.fullAddress} → {p.dropAddress?.fullAddress}
                        </p>
                        <p className="mt-1 font-mono text-[12px] text-slate-500">
                          {p.distanceKm} km · {money(p.fare)} · booked{" "}
                          {new Date(p.createdAt).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAssignTarget(p)}
                        className="shrink-0 rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-semibold text-white"
                      >
                        Assign rider
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {attention.stuck.length > 0 ? (
            <section>
              <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                Customer won't take it back ({attention.stuck.length})
              </h2>
              <p className="mb-3 text-[12px] text-slate-500">
                The rider is holding a parcel nobody will accept. Needs a call and a
                decision on where it goes.
              </p>
              <div className="space-y-3">
                {attention.stuck.map((p) => (
                  <div key={p._id} className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
                    <p className="font-mono text-sm font-semibold text-slate-900">
                      {p.referenceId}
                    </p>
                    <p className="mt-1 text-[13px] text-slate-700">
                      Customer {p.customerId?.name} ({p.customerId?.phone}) · rider{" "}
                      {p.deliveryPartnerId?.name} ({p.deliveryPartnerId?.phone})
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Waybill</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Fare</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {parcels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    No city parcels yet.
                  </td>
                </tr>
              ) : (
                parcels.map((p) => (
                  <tr key={p._id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-[12px] font-semibold text-slate-900">
                      {p.referenceId}
                    </td>
                    <td className="max-w-[240px] px-4 py-3 text-[13px] text-slate-600">
                      <span className="block truncate">
                        {p.pickupAddress?.fullAddress}
                      </span>
                      <span className="block truncate text-slate-400">
                        → {p.dropAddress?.fullAddress}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-700">
                      {p.customerId?.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-700">
                      {p.deliveryPartnerId?.name || (
                        <span className="text-slate-400">unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-slate-900">
                      {money(p.fare)}
                    </td>
                    <td className="px-4 py-3">
                      <Chip status={p.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {assignTarget ? (
        <AssignModal
          parcel={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={load}
        />
      ) : null}
    </div>
  );
};

export default CityParcelAdmin;
