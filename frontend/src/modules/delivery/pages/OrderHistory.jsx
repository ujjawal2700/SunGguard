import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Calendar,
  MapPin,
  ChevronRight,
  Filter,
  Package,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../services/deliveryApi";
import { toast } from "sonner";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "rejected", label: "Rejected" },
  { key: "returns", label: "Returns" },
];

const displayOrderStatus = (order) => {
  const raw = String(order?.workflowStatus || order?.status || "active").toLowerCase();
  if (raw === "delivered") return "delivered";
  if (raw === "cancelled") return "cancelled";
  if (raw === "rejected") return "rejected";
  if (order?.kind === "parcel") {
    return raw.replace(/_/g, " ");
  }
  if (order?.workflowStatus === "DELIVERED" || order?.status === "delivered") return "delivered";
  if (order?.workflowStatus === "CANCELLED" || order?.status === "cancelled") return "cancelled";
  return raw || "active";
};

const statusBadgeClass = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "delivered") return "bg-emerald-100 text-emerald-700";
  if (s === "cancelled") return "bg-red-100 text-red-700";
  if (s === "rejected") return "bg-orange-100 text-orange-700";
  if (s.includes("search") || s.includes("request")) return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
};

const OrderHistory = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const prevFilterRef = useRef(filter);
  const fetchSeqRef = useRef(0);
  const visibilityAbortRef = useRef(null);

  useEffect(() => {
    visibilityAbortRef.current?.abort();
    const filterChanged = prevFilterRef.current !== filter;
    prevFilterRef.current = filter;
    if (filterChanged) {
      setOrders([]);
    }

    const abortController = new AbortController();
    const runSeq = ++fetchSeqRef.current;

    setLoading(true);
    (async () => {
      try {
        const response = await deliveryApi.getOrderHistory(
          { status: filter },
          { signal: abortController.signal },
        );
        if (runSeq !== fetchSeqRef.current) return;
        const list =
          response.data?.results ?? response.data?.result ?? [];
        setOrders(Array.isArray(list) ? list : []);
      } catch (error) {
        if (
          error?.code === "ERR_CANCELED" ||
          error?.name === "CanceledError" ||
          error?.name === "AbortError"
        ) {
          return;
        }
        if (runSeq !== fetchSeqRef.current) return;
        toast.error("Failed to fetch order history");
      } finally {
        if (runSeq === fetchSeqRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      abortController.abort();
      visibilityAbortRef.current?.abort();
    };
  }, [filter]);

  useEffect(() => {
    let sawHidden = false;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        sawHidden = true;
        return;
      }
      if (!sawHidden || document.visibilityState !== "visible") return;
      sawHidden = false;

      visibilityAbortRef.current?.abort();
      const ac = new AbortController();
      visibilityAbortRef.current = ac;
      const runSeq = ++fetchSeqRef.current;
      setLoading(true);
      (async () => {
        try {
          const response = await deliveryApi.getOrderHistory(
            { status: filter },
            { signal: ac.signal },
          );
          if (runSeq !== fetchSeqRef.current) return;
          const list =
            response.data?.results ?? response.data?.result ?? [];
          setOrders(Array.isArray(list) ? list : []);
        } catch (error) {
          if (
            error?.code === "ERR_CANCELED" ||
            error?.name === "CanceledError" ||
            error?.name === "AbortError"
          ) {
            return;
          }
          if (runSeq !== fetchSeqRef.current) return;
          toast.error("Failed to fetch order history");
        } finally {
          if (runSeq === fetchSeqRef.current) {
            setLoading(false);
          }
        }
      })();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      visibilityAbortRef.current?.abort();
    };
  }, [filter]);

  const initialLoading = loading && orders.length === 0;
  const refreshing = loading && orders.length > 0;

  const filteredOrders = (orders || []).filter((order) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const oid = String(order.orderId ?? "");
    return (
      oid.toLowerCase().includes(q) ||
      order.customer?.name?.toLowerCase().includes(q) ||
      order.seller?.shopName?.toLowerCase().includes(q) ||
      order.pickupAddress?.fullAddress?.toLowerCase().includes(q)
    );
  });

  const openOrderDetail = (order) => {
    if (order.kind === "parcel") {
      if (order.historyRole === "rejected") {
        toast.info(`Parcel ${order.orderId} — you rejected this offer (${displayOrderStatus(order)})`);
        return;
      }
      navigate(`/delivery/parcel-task/${order._id}`);
      return;
    }
    const id = order.orderId || order._id;
    if (!id) {
      toast.error("Missing order reference");
      return;
    }
    navigate(`/delivery/order-details/${encodeURIComponent(String(id))}`);
  };

  return (
    <div className="bg-gray-50/50 min-h-screen pb-24">
      <div className="bg-white shadow-sm p-4 sticky top-0 z-30 backdrop-blur-md bg-white/90">
        <h1 className="ds-h2 text-gray-900 mb-4">Order History</h1>

        <div className="mb-4">
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search ID, customer, store..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all border border-transparent focus:border-primary/20"
            />
          </div>
        </div>

        <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`snap-start h-9 px-4 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                filter === item.key
                  ? "bg-primary text-primary-foreground border-transparent shadow-lg shadow-primary/25"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {refreshing && (
          <div className="flex items-center justify-center gap-2 py-1 text-xs font-medium text-primary">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Updating…</span>
          </div>
        )}
        {initialLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order) => {
                const statusLabel = displayOrderStatus(order);
                const earnings = Math.round(
                  Number(
                    order.earnings ??
                      order.riderEarnings ??
                      (order.kind === "parcel"
                        ? 0
                        : (order.pricing?.total || 0) * 0.1),
                  ),
                );
                return (
                  <motion.div
                    key={`${order.kind || "order"}-${order._id}`}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => openOrderDetail(order)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openOrderDetail(order);
                        }
                      }}
                      className="hover:shadow-md transition-shadow cursor-pointer group"
                    >
                      <div className="p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start mb-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 min-w-0 flex-wrap">
                              <span className="font-bold text-gray-900 text-sm group-hover:text-primary transition-colors break-all">
                                #{order.orderId}
                              </span>
                              {order.kind === "parcel" && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-slate-100 text-slate-600 inline-flex items-center gap-1">
                                  <Package size={10} /> Parcel
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${statusBadgeClass(statusLabel)}`}
                              >
                                {statusLabel}
                              </span>
                            </div>
                            <div className="flex items-center text-gray-400 text-xs">
                              <Calendar size={12} className="mr-1" />
                              {new Date(order.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                              })}
                              ,{" "}
                              {new Date(order.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                          <div className="text-left sm:text-right shrink-0">
                            <span className="block font-bold text-lg text-brand-600 whitespace-nowrap">
                              ₹{earnings}
                            </span>
                            <span className="ds-caption text-gray-400">
                              {order.kind === "parcel" && order.historyRole === "rejected"
                                ? "Rejected"
                                : "Earnings"}
                            </span>
                          </div>
                        </div>

                        <div className="border-t border-b border-gray-50 py-3 my-3 space-y-2">
                          <div className="flex items-start">
                            <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 mr-2 flex-shrink-0" />
                            <div>
                              <p className="ds-caption text-gray-500 mb-0.5">
                                {order.kind === "parcel" ? "Hub / Store" : "Store"}
                              </p>
                              <p className="text-sm font-medium text-gray-800 line-clamp-1">
                                {order.seller?.shopName ||
                                  order.pickupAddress?.fullAddress ||
                                  "Unknown Store"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start">
                            <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 mr-2 flex-shrink-0" />
                            <div>
                              <p className="ds-caption text-gray-500 mb-0.5">Customer</p>
                              <p className="text-sm font-medium text-gray-800 line-clamp-1">
                                {order.customer?.name || "Customer"}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center text-xs text-gray-500">
                          <div className="flex flex-wrap items-center gap-2">
                            {Number(order.distance) > 0 && (
                              <span className="flex items-center bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                <MapPin size={12} className="mr-1 text-gray-400" />
                                {Number(order.distance).toFixed(1)} km
                              </span>
                            )}
                            {order.paymentMethod && (
                              <span className="flex items-center bg-gray-50 px-2 py-1 rounded border border-gray-100 uppercase font-bold">
                                {order.paymentMethod}
                              </span>
                            )}
                            {order.deliverySpeed === "express" && (
                              <span className="flex items-center bg-amber-50 text-amber-700 px-2 py-1 rounded border border-amber-100 font-bold uppercase">
                                Express
                              </span>
                            )}
                          </div>
                          <div className="flex items-center text-primary font-bold group-hover:underline self-end sm:self-auto">
                            View Details <ChevronRight size={14} className="ml-0.5" />
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Filter size={32} className="text-gray-400" />
                </div>
                <h3 className="ds-h3 text-gray-900">No Orders Found</h3>
                <p className="text-gray-500 text-sm">
                  Delivered, cancelled, rejected and active jobs will show here.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default OrderHistory;
