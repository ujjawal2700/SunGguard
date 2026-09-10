import React, { useCallback, useEffect, useState } from "react";
import { MapPinned, Loader2, Search, Navigation, Check, X } from "lucide-react";
import { toast } from "sonner";
import Card from "@shared/components/ui/Card";
import { adminPorterApi } from "../../services/api/porterApi";
import { cn } from "@/lib/utils";

/**
 * Which delivery zones each rider works.
 *
 * Zone gating for local deliveries used to rely entirely on the rider's live
 * GPS — a rider was offered whatever zone they happened to be standing in.
 * That is right for a fleet that roams, and remains the default. But it gave
 * the operation no way to STAFF an area: whoever drifted past picked the work
 * up, and a zone with nobody nearby simply went unserved.
 *
 * Assigning zones here is a hard restriction. An assigned rider sees local
 * jobs from those zones only, wherever they are standing. A rider with no
 * assignment keeps the GPS behaviour. Outstation parcels are unaffected —
 * that product is unzoned by design.
 */

const PorterRiderZones = () => {
  const [riders, setRiders] = useState([]);
  const [zones, setZones] = useState([]);
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { rider, selected: Set }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 25 };
      if (search.trim()) params.search = search.trim();
      if (zoneFilter) params.zoneId = zoneFilter;
      const res = await adminPorterApi.getRiderZones(params);
      const data = res.data?.result || {};
      setRiders(data.items || []);
      setZones(data.zones || []);
      setMeta({ total: data.total || 0, totalPages: data.totalPages || 1 });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Couldn't load riders");
    } finally {
      setLoading(false);
    }
  }, [page, search, zoneFilter]);

  // Debounced so a search does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, 350);
    return () => clearTimeout(timer);
  }, [load]);

  const openEditor = (rider) =>
    setEditing({ rider, selected: new Set(rider.zones.map((z) => z.id)) });

  const toggleZone = (zoneId) =>
    setEditing((prev) => {
      const next = new Set(prev.selected);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return { ...prev, selected: next };
    });

  const save = async () => {
    setSaving(true);
    try {
      await adminPorterApi.setRiderZones(editing.rider.id, [...editing.selected]);
      toast.success(
        editing.selected.size
          ? `${editing.rider.name} now works ${editing.selected.size} zone${editing.selected.size === 1 ? "" : "s"}`
          : `${editing.rider.name} now follows their live location`,
      );
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not save zones");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <MapPinned className="h-5 w-5 text-primary" />
          Rider Zones
        </h1>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">
          Assign riders to the zones they work. An assigned rider is offered local jobs from
          those zones only. A rider with no assignment is matched on their live location.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search rider..."
            className="w-56 rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <select
          value={zoneFilter}
          onChange={(e) => {
            setZoneFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <option value="">All zones</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              Covering {zone.name}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden" contentClassName="p-0">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : riders.length === 0 ? (
          <p className="py-16 text-center text-xs font-semibold text-slate-400">
            No riders match.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {riders.map((rider) => (
              <div key={rider.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      rider.isOnline ? "bg-emerald-500" : "bg-slate-300",
                    )}
                    title={rider.isOnline ? "Online" : "Offline"}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {rider.name}
                    </p>
                    <p className="font-mono text-[11px] text-slate-400">{rider.phone}</p>
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-1.5">
                  {rider.scope === "LIVE_LOCATION" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800">
                      <Navigation className="h-3 w-3" /> Live location
                    </span>
                  ) : (
                    rider.zones.map((zone) => (
                      <span
                        key={zone.id}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                        style={{ backgroundColor: zone.color || "#2563EB" }}
                      >
                        {zone.name}
                      </span>
                    ))
                  )}
                </div>

                <button
                  onClick={() => openEditor(rider)}
                  className="shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs dark:border-slate-800">
            <span className="text-slate-400">
              Page {page} of {meta.totalPages} · {meta.total} riders
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700"
              >
                Previous
              </button>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Zones for {editing.rider.name}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Pick none to match this rider on their live location instead.
                </p>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
              {zones.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">
                  No active zones. Draw one under Delivery Zones first.
                </p>
              )}
              {zones.map((zone) => {
                const on = editing.selected.has(zone.id);
                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => toggleZone(zone.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors",
                      on
                        ? "border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-800"
                        : "border-slate-200 dark:border-slate-700",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-sm"
                        style={{ backgroundColor: zone.color || "#2563EB" }}
                      />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {zone.name}
                      </span>
                      {zone.city && (
                        <span className="text-[11px] text-slate-400">{zone.city}</span>
                      )}
                    </span>
                    {on && <Check className="h-4 w-4 text-slate-900 dark:text-white" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                disabled={saving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save zones
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PorterRiderZones;
