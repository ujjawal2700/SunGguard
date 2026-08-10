import React, { useMemo } from "react";
import PageHeader from "@shared/components/ui/PageHeader";
import { useSellerParcels } from "../hooks/useSellerParcels";

const SellerParcelReports = () => {
  const { parcels, loading } = useSellerParcels();

  const report = useMemo(() => {
    const byStatus = {};
    let totalFare = 0;
    let deliveredFare = 0;

    for (const parcel of parcels) {
      const status = String(parcel.status || "UNKNOWN").toUpperCase();
      byStatus[status] = (byStatus[status] || 0) + 1;
      const fare = Number(parcel.fare) || 0;
      totalFare += fare;
      if (status === "DELIVERED") deliveredFare += fare;
    }

    return {
      byStatus: Object.entries(byStatus).sort((a, b) => b[1] - a[1]),
      totalFare,
      deliveredFare,
      totalCount: parcels.length,
    };
  }, [parcels]);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Parcel service performance summary" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-400">Total Parcels</p>
          <p className="text-2xl font-black text-slate-800 mt-1">
            {loading ? "—" : report.totalCount}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-400">Total Booking Value</p>
          <p className="text-2xl font-black text-slate-800 mt-1">
            {loading ? "—" : `₹${report.totalFare.toFixed(0)}`}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-400">Delivered Value</p>
          <p className="text-2xl font-black text-primary mt-1">
            {loading ? "—" : `₹${report.deliveredFare.toFixed(0)}`}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-800 mb-4">Status Breakdown</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : report.byStatus.length === 0 ? (
          <p className="text-sm text-slate-500">No parcel data yet.</p>
        ) : (
          <div className="space-y-3">
            {report.byStatus.map(([status, count]) => {
              const pct = report.totalCount ? Math.round((count / report.totalCount) * 100) : 0;
              return (
                <div key={status}>
                  <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                    <span>{status}</span>
                    <span>
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SellerParcelReports;
