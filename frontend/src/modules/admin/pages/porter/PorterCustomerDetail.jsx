import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Phone,
  Mail,
  MapPin,
  Package,
  IndianRupee,
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  Loader2,
  Ban,
  ShieldCheck,
  Truck,
  Navigation,
} from "lucide-react";
import { toast } from "sonner";
import Card from "@shared/components/ui/Card";
import ConfirmDialog from "@shared/components/ui/ConfirmDialog";
import { adminPorterApi } from "../../services/api/porterApi";
import { cn } from "@/lib/utils";

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const formatDateTime = (value) => {
  if (!value) return "Never";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const STATUS_BADGE = {
  DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  CANCELLED: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  DELIVERY_FAILED: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
};
const STATUS_BADGE_DEFAULT =
  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400";

const PorterCustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchCustomer = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminPorterApi.getCustomer(id);
      setCustomer(res?.data?.result || null);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to load customer");
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchCustomer();
  }, [id, fetchCustomer]);

  const handleToggleStatus = async () => {
    if (!customer) return;
    setUpdatingStatus(true);
    try {
      const nextActive = !customer.isActive;
      await adminPorterApi.updateCustomerStatus(customer.id, nextActive);
      toast.success(`${customer.name} marked as ${nextActive ? "active" : "inactive"}`);
      setConfirmOpen(false);
      fetchCustomer();
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to update customer status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const stats = useMemo(() => {
    if (!customer) return [];
    return [
      { label: "Total Bookings", value: customer.totalBookings, icon: Package, color: "blue" },
      { label: "Delivered", value: customer.deliveredBookings, icon: CheckCircle2, color: "emerald" },
      { label: "Cancelled", value: customer.cancelledBookings, icon: XCircle, color: "rose" },
      { label: "Avg. Order Value", value: formatMoney(customer.avgOrderValue), icon: IndianRupee, color: "amber" },
    ];
  }, [customer]);

  if (loading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Loading customer...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
        <p className="text-sm font-semibold text-slate-400">Customer not found</p>
        <button
          onClick={() => navigate("/admin/porter/customers")}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Back to Porter Customers
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/admin/porter/customers")}
            className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
          >
            <ChevronLeft className="h-5 w-5 text-slate-500" />
          </button>
          <div className="flex items-center gap-3">
            <img
              src={customer.avatar}
              alt=""
              className="h-12 w-12 rounded-xl bg-slate-100 object-cover ring-1 ring-slate-200 dark:ring-slate-700"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">{customer.name}</h1>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
                    customer.isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", customer.isActive ? "bg-emerald-500" : "bg-rose-500")} />
                  {customer.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>
                {customer.email && (
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{customer.email}</span>
                )}
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Joined {formatDateTime(customer.joinedDate)}</span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => setConfirmOpen(true)}
          className={cn(
            "flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-widest shadow-sm transition-all",
            customer.isActive
              ? "bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white dark:bg-rose-950/30"
              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white dark:bg-emerald-950/30",
          )}
        >
          {customer.isActive ? <Ban className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          {customer.isActive ? "Deactivate Account" : "Activate Account"}
        </button>
      </div>

      {/* Stats + Revenue */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden rounded-xl border-none bg-slate-900 p-6 text-white shadow-lg lg:col-span-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Lifetime Spend on Porter</p>
          <h2 className="mt-1 text-3xl font-black">{formatMoney(customer.totalSpent)}</h2>
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-white/80">
            <Package className="h-4 w-4" />
            {customer.totalBookings} total bookings
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-white/60">
            <Clock className="h-3.5 w-3.5" />
            Last booking: {formatDateTime(customer.lastBookingAt)}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div
                className={cn(
                  "mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg",
                  s.color === "blue" && "bg-blue-50 text-blue-600",
                  s.color === "emerald" && "bg-emerald-50 text-emerald-600",
                  s.color === "rose" && "bg-rose-50 text-rose-600",
                  s.color === "amber" && "bg-amber-50 text-amber-600",
                )}
              >
                <s.icon className="h-4 w-4" />
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
              <p className="mt-0.5 text-xl font-bold text-slate-900 dark:text-white">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Booking History */}
        <Card
          className="overflow-hidden lg:col-span-2"
          contentClassName="p-0"
          title="Recent Porter Bookings"
          subtitle="Pickup and city-parcel bookings, most recent first"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40">
                <tr>
                  <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Booking</th>
                  <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
                  <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Fare</th>
                  <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(customer.recentBookings || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-14 text-center text-xs font-semibold text-slate-400">
                      No bookings yet
                    </td>
                  </tr>
                ) : (
                  customer.recentBookings.map((b) => (
                    <tr
                      key={`${b.source}-${b.id}`}
                      onClick={() =>
                        navigate(
                          b.source === "city"
                            ? `/admin/city-parcels?cityParcelId=${b.id}`
                            : `/admin/parcels?parcelId=${b.id}`,
                        )
                      }
                      title="View full booking detail and status history"
                      className="cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="rounded-lg bg-slate-100 p-1.5 text-slate-500 dark:bg-slate-800">
                            {b.source === "city" ? <Navigation className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {b.source === "city" ? "City Parcel" : "Pickup Parcel"}
                              {b.referenceId ? ` · ${b.referenceId}` : ""}
                            </p>
                            <p className="max-w-[220px] truncate text-[11px] text-slate-400">
                              {b.pickup || "—"} → {b.drop || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold",
                            STATUS_BADGE[b.status] || STATUS_BADGE_DEFAULT,
                          )}
                        >
                          {b.status?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        {formatMoney(b.fare)}
                      </td>
                      <td className="px-5 py-3.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {formatDateTime(b.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Addresses + Account control */}
        <div className="space-y-4">
          <Card title="Saved Addresses">
            {(customer.addresses || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center dark:border-slate-700">
                <MapPin className="mx-auto h-8 w-8 text-slate-200" />
                <p className="mt-2 text-xs font-semibold text-slate-400">No saved addresses</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {customer.addresses.map((addr, idx) => (
                  <div
                    key={addr._id || idx}
                    className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60"
                  >
                    <span className="mb-1 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {addr.label || "other"}
                    </span>
                    <p className="text-slate-600 dark:text-slate-300">
                      {[addr.fullAddress, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="border-none bg-slate-900 text-white" title={<span className="text-white/70">Account Control</span>}>
            <p className="text-xs text-white/60">
              {customer.isActive
                ? "This customer can currently log in and book Porter deliveries."
                : "This customer is deactivated: they cannot log in or place new bookings."}
            </p>
            <button
              onClick={() => setConfirmOpen(true)}
              className={cn(
                "mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold uppercase tracking-widest transition-all",
                customer.isActive
                  ? "bg-rose-500/15 text-rose-400 hover:bg-rose-500 hover:text-white"
                  : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-white",
              )}
            >
              {customer.isActive ? <Ban className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {customer.isActive ? "Deactivate" : "Activate"}
            </button>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        onCancel={() => !updatingStatus && setConfirmOpen(false)}
        onConfirm={handleToggleStatus}
        title={customer.isActive ? "Deactivate customer?" : "Activate customer?"}
        message={
          customer.isActive
            ? `${customer.name} will not be able to log in or place new Porter bookings until reactivated.`
            : `${customer.name} will be able to log in and book Porter deliveries again.`
        }
        confirmLabel={updatingStatus ? "Updating..." : customer.isActive ? "Deactivate" : "Activate"}
        cancelLabel="Cancel"
        loading={updatingStatus}
        variant={customer.isActive ? "danger" : "primary"}
      />
    </div>
  );
};

export default PorterCustomerDetail;
