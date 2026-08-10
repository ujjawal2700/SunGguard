import React, { useState } from "react";
import { Package, RefreshCw } from "lucide-react";
import PageHeader from "@shared/components/ui/PageHeader";
import { useAuth } from "@core/context/AuthContext";
import { useSellerParcels } from "../hooks/useSellerParcels";
import ParcelOrderCard from "../components/ParcelOrderCard";
import ParcelOrderDetailModal from "../components/ParcelOrderDetailModal";

const SellerParcels = () => {
  const { user } = useAuth();
  const { parcels, loading, refresh } = useSellerParcels();
  const [selectedParcel, setSelectedParcel] = useState(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Orders"
          subtitle={`All parcel orders within your ${user?.serviceRadius || 5} km service radius`}
        />
        <button
          type="button"
          onClick={() => refresh(false)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-500">
          Loading orders...
        </div>
      ) : parcels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <Package className="mx-auto mb-3 text-slate-300" size={32} />
          <p className="text-sm font-bold text-slate-700">No parcel orders yet</p>
          <p className="text-xs text-slate-500 mt-1">
            New parcels in your radius will appear here and auto-accept to your shop.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {parcels.map((parcel) => (
            <ParcelOrderCard
              key={parcel._id}
              parcel={parcel}
              onClick={() => setSelectedParcel(parcel)}
            />
          ))}
        </div>
      )}

      {selectedParcel && (
        <ParcelOrderDetailModal
          parcel={selectedParcel}
          onClose={() => setSelectedParcel(null)}
          onUpdated={(updated) => {
            setSelectedParcel(updated);
            refresh(true);
          }}
        />
      )}
    </div>
  );
};

export default SellerParcels;
