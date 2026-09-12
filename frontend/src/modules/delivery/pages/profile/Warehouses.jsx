import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Warehouse, Phone, MapPin, Navigation, Loader2 } from "lucide-react";
import { deliveryApi } from "../../services/deliveryApi";

/**
 * Every active warehouse in the rider's own zone, nearest first.
 *
 * Outstation dispatch only ever routes a rider to a warehouse in their own
 * zone (see tryAutoAssignParcelToWarehouse in parcelWorkflowService.js), so
 * this is purely a reference list — it never shows one a rider could not
 * actually be assigned to.
 */
const Warehouses = () => {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    deliveryApi
      .getMyWarehouses()
      .then((res) => {
        if (cancelled) return;
        if (res.data?.success) {
          setWarehouses(res.data.results || []);
          setError("");
        } else {
          setError(res.data?.message || "Couldn't load warehouses");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.message || "Couldn't load warehouses");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Nearby Warehouses</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={22} className="animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center text-sm text-gray-500">
            {error}
          </div>
        )}

        {!loading && !error && warehouses.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <Warehouse size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-gray-600">No warehouses in your zone yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Set your work zone from Personal Details, or check back once your zone has one.
            </p>
          </div>
        )}

        {!loading &&
          warehouses.map((w, index) => (
            <div key={w._id} className="bg-white rounded-xl shadow-sm p-4 flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-purple-50 text-purple-600 shrink-0">
                <Warehouse size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-900 truncate">{w.name}</p>
                  {index === 0 && (
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Nearest
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 flex items-start gap-1">
                  <MapPin size={12} className="mt-0.5 shrink-0" />
                  <span>
                    {w.address}
                    {w.city ? `, ${w.city}` : ""}
                  </span>
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  {Number.isFinite(w.distanceMeters) && (
                    <span className="text-[11px] font-bold text-gray-400 flex items-center gap-1">
                      <Navigation size={11} />
                      {w.distanceMeters >= 1000
                        ? `${(w.distanceMeters / 1000).toFixed(1)} km`
                        : `${w.distanceMeters} m`}
                    </span>
                  )}
                  {w.phone && (
                    <a
                      href={`tel:${w.phone}`}
                      className="text-[11px] font-bold text-primary flex items-center gap-1"
                    >
                      <Phone size={11} />
                      {w.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default Warehouses;
