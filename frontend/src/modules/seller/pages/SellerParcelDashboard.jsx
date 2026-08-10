import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Package, Truck, CheckCircle, IndianRupee, ArrowRight } from "lucide-react";
import PageHeader from "@shared/components/ui/PageHeader";
import { useAuth } from "@core/context/AuthContext";
import { useSellerParcels, ACTIVE_PARCEL_STATUSES } from "../hooks/useSellerParcels";
import ParcelOrderCard from "../components/ParcelOrderCard";
import ParcelOrderDetailModal from "../components/ParcelOrderDetailModal";

const StatCard = ({ label, value, icon: Icon, className = "bg-slate-50 text-slate-600" }) => (
  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <p className="text-2xl font-black text-slate-800 mt-1">{value}</p>
      </div>
      <div className={`p-3 rounded-xl ${className}`}>
        <Icon size={22} />
      </div>
    </div>
  </div>
);

const SellerParcelDashboard = () => {
  const { user } = useAuth();
  const { parcels, loading } = useSellerParcels();
  const [selectedParcel, setSelectedParcel] = useState(null);

  const stats = useMemo(() => {
    const total = parcels.length;
    const active = parcels.filter((p) => ACTIVE_PARCEL_STATUSES.has(String(p.status).toUpperCase())).length;
    const delivered = parcels.filter((p) => String(p.status).toUpperCase() === "DELIVERED").length;
    const revenue = parcels
      .filter((p) => String(p.status).toUpperCase() === "DELIVERED")
      .reduce((sum, p) => sum + (Number(p.fare) || 0), 0);
    return { total, active, delivered, revenue };
  }, [parcels]);

  const recent = parcels.slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parcel Dashboard"
        subtitle={`Overview of parcel bookings within ${user?.serviceRadius || 5} km`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Parcels" value={loading ? "—" : stats.total} icon={Package} />
        <StatCard label="Active" value={loading ? "—" : stats.active} icon={Truck} className="bg-amber-50 text-amber-600" />
        <StatCard label="Delivered" value={loading ? "—" : stats.delivered} icon={CheckCircle} className="bg-emerald-50 text-emerald-600" />
        <StatCard
          label="Delivered Revenue"
          value={loading ? "—" : `₹${stats.revenue.toFixed(0)}`}
          icon={IndianRupee}
          className="bg-primary/10 text-primary"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-slate-800">Recent Parcel Orders</h2>
        <Link
          to="/seller/orders"
          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
        >
          View all <ArrowRight size={14} />
        </Link>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-500">
          Loading...
        </div>
      ) : recent.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <Package className="mx-auto mb-3 text-slate-300" size={32} />
          <p className="text-sm font-bold text-slate-700">No parcel orders yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recent.map((parcel) => (
            <ParcelOrderCard
              key={parcel._id}
              parcel={parcel}
              compact
              onClick={() => setSelectedParcel(parcel)}
            />
          ))}
        </div>
      )}

      {selectedParcel && (
        <ParcelOrderDetailModal
          parcel={selectedParcel}
          onClose={() => setSelectedParcel(null)}
        />
      )}
    </div>
  );
};

export default SellerParcelDashboard;
