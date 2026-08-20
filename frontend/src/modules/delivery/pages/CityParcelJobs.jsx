import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package, MapPin, IndianRupee, Loader2, RefreshCw, ArrowLeft, Bike, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { unwrapList } from "@core/api/unwrap";
import { cityParcelApi } from "../services/cityParcelApi";
import {
  getOrderSocket,
  onCityParcelBroadcast,
  onCityParcelRetract,
} from "@core/services/orderSocket";
import { createSocketTokenReader } from "@core/utils/authStorage";
import { STORAGE_KEYS } from "@core/utils/storage";

const getDeliveryToken = createSocketTokenReader(STORAGE_KEYS.AUTH_DELIVERY);

/**
 * Every city delivery nobody has taken yet.
 *
 * The offer alert only fires while a rider has the app open and is free at
 * that moment. Anyone who was mid-job, offline, or simply not looking never
 * saw it — and the job then sat unclaimed with no way to find it. This is
 * that list: open to any eligible rider, first to accept wins, and it
 * disappears the instant somebody does.
 */
const CityParcelJobs = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await cityParcelApi.getAvailable({ forceRefresh: true });
      setJobs(unwrapList(res, "parcels"));
    } catch (err) {
      if (!quiet) toast.error(err?.response?.data?.message || "Couldn't load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    const getToken = getDeliveryToken;
    getOrderSocket(getToken);

    // A new booking lands: pull it in without the rider doing anything.
    const offNew = onCityParcelBroadcast(getToken, () => load(true));

    // Someone else took it. Drop it immediately rather than leaving a row
    // that fails the moment it is tapped.
    const offGone = onCityParcelRetract(getToken, (payload) => {
      const id = payload?.cityParcelId;
      if (!id) return;
      setJobs((rows) => rows.filter((j) => String(j._id) !== String(id)));
    });

    // Fallback for a dropped socket.
    const poll = setInterval(() => load(true), 20000);
    return () => {
      offNew();
      offGone();
      clearInterval(poll);
    };
  }, [load]);

  const accept = async (job) => {
    setAcceptingId(job._id);
    try {
      const key =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}`;
      await cityParcelApi.accept(job._id, key);
      toast.success("Job accepted");
      navigate(`/delivery/city-parcel/${job._id}`);
    } catch (err) {
      const msg = err?.response?.data?.message;
      toast.error(msg || "Couldn't accept this job");
      // Whatever went wrong — taken, expired, already busy — the list is
      // now out of date.
      load(true);
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 pt-4">
      <header className="mb-4 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-slate-700" />
        </button>
        <div className="flex-1">
          <h1 className="text-[19px] font-bold text-slate-900">Open Deliveries</h1>
          <p className="text-[12px] text-slate-500">
            {jobs.length
              ? `${jobs.length} waiting for a rider`
              : "Nothing waiting right now"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="grid h-9 w-9 place-items-center rounded-full bg-slate-100"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("h-4 w-4 text-slate-600", loading && "animate-spin")} />
        </button>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center">
          <Package className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-[15px] font-semibold text-slate-800">
            No open deliveries
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            New bookings near you appear here straight away. Stay online to get them.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isCod = String(job.paymentMethod).toUpperCase() === "COD";
            const busy = acceptingId === job._id;

            return (
              <article
                key={job._id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                      {job.referenceId}
                    </p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[19px] font-bold text-slate-900">
                      <IndianRupee className="h-4 w-4" />
                      {Number(job.riderEarning || 0).toFixed(0)}
                    </p>
                    <p className="text-[11px] text-slate-400">you earn</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-600">
                    {job.distanceKm} km
                  </span>
                </div>

                <div className="mt-3 flex gap-2.5">
                  <div className="flex flex-col items-center pt-1.5">
                    <span className="h-2 w-2 rounded-full bg-slate-900" />
                    <span className="my-1 w-px flex-1 bg-slate-200" />
                    <span className="h-2 w-2 rounded-full border border-slate-300" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="truncate text-[13px] font-semibold text-slate-900">
                      {job.pickupAddress?.fullAddress}
                    </p>
                    <p className="truncate text-[13px] text-slate-600">
                      {job.dropAddress?.fullAddress}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3 text-[12px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" />
                    {job.package?.packageType} · {job.package?.weightKg} kg
                  </span>
                  {isCod ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                      <Wallet className="h-3.5 w-3.5" />
                      Collect ₹{Number(job.codCollection?.amount || 0).toFixed(0)}
                    </span>
                  ) : (
                    <span className="text-emerald-600">Prepaid</span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => accept(job)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-[14px] font-bold text-white transition active:scale-[0.99] disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bike className="h-4 w-4" />
                  )}
                  {busy ? "Accepting…" : "Accept this job"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CityParcelJobs;
