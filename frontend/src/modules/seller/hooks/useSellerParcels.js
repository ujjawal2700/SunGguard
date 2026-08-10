import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getOrderSocket } from "@/core/services/orderSocket";
import { useAuth } from "@core/context/AuthContext";
import { sellerApi } from "../services/sellerApi";

export function useSellerParcels({ silentErrors = false } = {}) {
  const { user } = useAuth();
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchParcels = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await sellerApi.getParcels();
        if (res.data?.success) {
          const payload = res.data.results ?? res.data.result ?? [];
          setParcels(Array.isArray(payload) ? payload : []);
        }
      } catch (error) {
        if (!silent && !silentErrors) {
          toast.error(error.response?.data?.message || "Failed to load parcels");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [silentErrors],
  );

  useEffect(() => {
    fetchParcels(false);
  }, [fetchParcels]);

  useEffect(() => {
    const socket = getOrderSocket();
    const sellerId = user?.id || user?._id;
    if (!socket || !sellerId) return undefined;

    const onAutoAssigned = () => fetchParcels(true);
    const onStatusUpdate = () => fetchParcels(true);
    const onParcelNewEvent = () => fetchParcels(true);

    socket.on("parcel:auto-assigned", onAutoAssigned);
    socket.on("parcel:status:update", onStatusUpdate);
    socket.on("parcel:new", onParcelNewEvent);

    return () => {
      socket.off("parcel:auto-assigned", onAutoAssigned);
      socket.off("parcel:status:update", onStatusUpdate);
      socket.off("parcel:new", onParcelNewEvent);
    };
  }, [user, fetchParcels]);

  return { parcels, loading, refresh: fetchParcels };
}

export const ACTIVE_PARCEL_STATUSES = new Set([
  "ACCEPTED",
  "RIDER_ASSIGNED",
  "PICKUP_REACHED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "SEARCHING",
]);

export function parcelStatusVariant(status) {
  const value = String(status || "").toUpperCase();
  if (value === "DELIVERED") return "success";
  if (value === "CANCELLED") return "error";
  if (value === "ACCEPTED" || value === "SEARCHING") return "warning";
  return "gray";
}
