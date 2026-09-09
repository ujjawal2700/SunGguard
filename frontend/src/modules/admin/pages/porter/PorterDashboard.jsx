import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Package,
    Truck,
    Wallet,
    TrendingUp,
    Loader2,
    RotateCw,
    ArrowRight,
    AlertTriangle,
    Layers,
    Route,
    Boxes,
    Users,
    ShieldCheck,
    Star,
    Banknote,
} from "lucide-react";
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import Card from "@shared/components/ui/Card";
import StatusBadge from "@shared/components/ui/StatusBadge";
import { adminPorterApi } from "../../services/api/porterApi";
import { cn } from "@/lib/utils";

const RANGES = [
    { label: "7D", days: 7 },
    { label: "14D", days: 14 },
    { label: "30D", days: 30 },
];

const rupees = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

/** "2026-09-08" → "8 Sep". Kept local so the axis never shows an ISO string. */
const shortDate = (iso) => {
    const date = new Date(`${iso}T00:00:00Z`);
    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    });
};

const tooltipStyle = {
    backgroundColor: "#0F172A",
    borderColor: "#1E293B",
    borderRadius: "16px",
    color: "#FFFFFF",
    fontSize: "13px",
    fontWeight: 700,
    padding: "10px 14px",
};

/** The counters that mean someone has to do something. */
const ATTENTION = [
    { key: "unassigned", label: "Unassigned", hint: "No rider yet" },
    { key: "failed", label: "Delivery failed", hint: "Needs a return call" },
    { key: "withheldPayouts", label: "Payouts withheld", hint: "Blocked rider pay" },
    { key: "refundRequests", label: "Refund requests", hint: "Awaiting a decision" },
    { key: "cashDepositsPending", label: "Cash deposits", hint: "Awaiting review" },
];

const PorterDashboard = () => {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [days, setDays] = useState(14);

    const fetchDashboard = useCallback(
        async (isManual = false) => {
            if (isManual) setRefreshing(true);
            try {
                const res = await adminPorterApi.getPorterDashboard({ days });
                if (res.data.success) setData(res.data.result);
            } catch (error) {
                console.error("Porter dashboard error:", error);
                toast.error(
                    error?.response?.data?.message || "Failed to load porter data",
                );
            } finally {
                setLoading(false);
                if (isManual) setRefreshing(false);
            }
        },
        [days],
    );

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    if (loading) {
        return (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Loading porter desk…
                </p>
            </div>
        );
    }

    const overview = data?.overview || {};
    const breakdown = data?.breakdown || {};
    const attention = data?.needsAttention || {};
    const trend = data?.trend || [];
    const recent = data?.recent || [];

    const trendChart = trend.map((row) => ({ ...row, label: shortDate(row.date) }));
    const attentionTotal = ATTENTION.reduce(
        (sum, item) => sum + (attention[item.key] || 0),
        0,
    );

    const kpis = [
        {
            label: "Total Parcels",
            value: Number(overview.totalParcels || 0).toLocaleString("en-IN"),
            icon: Package,
            tint: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-900",
            note: `${overview.activeParcels || 0} still in flight`,
        },
        {
            label: "Delivered",
            value: Number(overview.deliveredParcels || 0).toLocaleString("en-IN"),
            icon: Truck,
            tint: "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-900",
            note: `${overview.cancelledParcels || 0} cancelled`,
        },
        {
            label: "Revenue",
            value: rupees(overview.revenue),
            icon: Wallet,
            tint: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-900",
            note: `${rupees(overview.riderPayout)} to riders`,
        },
        {
            label: "Margin",
            value: rupees(overview.margin),
            icon: TrendingUp,
            tint: "bg-violet-500/10 text-violet-600 border-violet-200 dark:border-violet-900",
            note: `${overview.distanceKm || 0} km covered`,
        },
    ];

    return (
        <div className="space-y-6 md:space-y-8">
            {/* Header */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-700/60 bg-gradient-to-r from-slate-900 via-slate-800 to-[#111827] p-6 text-white shadow-2xl md:p-9">
                <div className="pointer-events-none absolute -mr-20 -mt-20 right-0 top-0 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />

                <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
                    <div className="space-y-2.5">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-bold backdrop-blur-md">
                            <Boxes className="h-4 w-4 text-primary" />
                            <span>Porter Desk</span>
                        </div>
                        <h1 className="text-2xl font-black tracking-tight text-white md:text-4xl">
                            Parcel operations
                        </h1>
                        <p className="max-w-xl text-sm text-slate-300 md:text-base">
                            Pickup-service and city-parcel bookings, added together and shown
                            side by side, for the last {days} days.
                        </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5 rounded-2xl bg-white/10 p-1.5 backdrop-blur-sm">
                            {RANGES.map((range) => (
                                <button
                                    key={range.days}
                                    onClick={() => setDays(range.days)}
                                    className={cn(
                                        "rounded-xl px-3.5 py-1.5 text-xs font-bold uppercase transition",
                                        days === range.days
                                            ? "bg-white text-slate-900"
                                            : "text-slate-300 hover:text-white",
                                    )}
                                >
                                    {range.label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => navigate("/admin/porter/zones")}
                            className="flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/10 px-4.5 py-3 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
                        >
                            <Layers className="h-4.5 w-4.5" />
                            <span>Zones ({overview.zones?.active ?? 0})</span>
                        </button>
                        <button
                            onClick={() => fetchDashboard(true)}
                            className="flex items-center gap-2.5 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-primary/90"
                        >
                            <RotateCw className={cn("h-4.5 w-4.5", refreshing && "animate-spin")} />
                            <span>Refresh</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
                {kpis.map((kpi) => (
                    <div
                        key={kpi.label}
                        className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 md:text-sm">
                                {kpi.label}
                            </span>
                            <div className={cn("rounded-2xl border p-3 shadow-sm", kpi.tint)}>
                                <kpi.icon className="h-5 w-5" />
                            </div>
                        </div>
                        <div className="mt-4">
                            <h3 className="font-mono text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-4xl">
                                {kpi.value}
                            </h3>
                            <p className="mt-2 truncate text-xs font-medium text-slate-400">
                                {kpi.note}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Needs attention */}
            <Card
                className={cn(
                    "p-5",
                    attentionTotal > 0 && "border-amber-300/70 dark:border-amber-900",
                )}
            >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                        <AlertTriangle
                            className={cn(
                                "h-5 w-5",
                                attentionTotal > 0 ? "text-amber-500" : "text-slate-300",
                            )}
                        />
                        <div>
                            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                                Needs attention
                            </h3>
                            <p className="text-xs text-slate-500">
                                {attentionTotal === 0
                                    ? "Nothing is waiting on an operator."
                                    : `${attentionTotal} item${attentionTotal === 1 ? "" : "s"} waiting on an operator.`}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                        {ATTENTION.map((item) => {
                            const count = attention[item.key] || 0;
                            return (
                                <div
                                    key={item.key}
                                    title={item.hint}
                                    className={cn(
                                        "rounded-xl px-3 py-2 text-center",
                                        count > 0
                                            ? "bg-amber-50 dark:bg-amber-950/40"
                                            : "bg-slate-50 dark:bg-slate-800/60",
                                    )}
                                >
                                    <p
                                        className={cn(
                                            "font-mono text-lg font-extrabold",
                                            count > 0
                                                ? "text-amber-700 dark:text-amber-400"
                                                : "text-slate-400",
                                        )}
                                    >
                                        {count}
                                    </p>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        {item.label}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </Card>

            {/* Fleet & quality */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
                {[
                    {
                        label: "Total Porters",
                        value: Number(overview.fleet?.total || 0).toLocaleString("en-IN"),
                        icon: Users,
                        tint: "bg-sky-500/10 text-sky-600 border-sky-200 dark:border-sky-900",
                        note: `${overview.fleet?.online || 0} online right now`,
                    },
                    {
                        label: "Verified Riders",
                        value: Number(overview.fleet?.verified || 0).toLocaleString("en-IN"),
                        icon: ShieldCheck,
                        tint: "bg-teal-500/10 text-teal-600 border-teal-200 dark:border-teal-900",
                        note: overview.fleet?.total
                            ? `${Math.round(((overview.fleet?.verified || 0) / overview.fleet.total) * 100)}% of fleet KYC-verified`
                            : "No porters yet",
                    },
                    {
                        label: "Customer Rating",
                        value: overview.rating?.count ? overview.rating.average.toFixed(1) : "—",
                        icon: Star,
                        tint: "bg-yellow-500/10 text-yellow-600 border-yellow-200 dark:border-yellow-900",
                        note: overview.rating?.count
                            ? `From ${overview.rating.count} review${overview.rating.count === 1 ? "" : "s"}`
                            : "No reviews yet",
                    },
                    {
                        label: "Pending Cash Deposits",
                        value: Number(attention.cashDepositsPending || 0).toLocaleString("en-IN"),
                        icon: Banknote,
                        tint: "bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-900",
                        note: "COD deposits awaiting review",
                    },
                ].map((kpi) => (
                    <div
                        key={kpi.label}
                        className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 md:text-sm">
                                {kpi.label}
                            </span>
                            <div className={cn("rounded-2xl border p-3 shadow-sm", kpi.tint)}>
                                <kpi.icon className="h-5 w-5" />
                            </div>
                        </div>
                        <div className="mt-4">
                            <h3 className="font-mono text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-4xl">
                                {kpi.value}
                            </h3>
                            <p className="mt-2 truncate text-xs font-medium text-slate-400">
                                {kpi.note}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="overflow-hidden rounded-3xl p-6 shadow-sm lg:col-span-2 md:p-7">
                    <div className="border-b border-slate-100 pb-5 dark:border-slate-800">
                        <h3 className="flex items-center gap-2.5 text-lg font-extrabold text-slate-900 dark:text-white md:text-xl">
                            <Route className="h-5 w-5 text-primary" />
                            Bookings & revenue
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 md:text-sm">
                            Daily parcel volume across both porter modules
                        </p>
                    </div>

                    <div className="h-[300px] w-full pt-6">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={trendChart}
                                margin={{ top: 10, right: 20, left: 5, bottom: 5 }}
                            >
                                <defs>
                                    <linearGradient id="porterRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="#E2E8F0"
                                    opacity={0.6}
                                />
                                <XAxis
                                    dataKey="label"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 12, fill: "#64748B", fontWeight: 600 }}
                                />
                                <YAxis
                                    width={60}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 12, fill: "#64748B", fontWeight: 600 }}
                                    tickFormatter={(v) => (v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`)}
                                />
                                <Tooltip
                                    contentStyle={tooltipStyle}
                                    formatter={(value) => [rupees(value), "Revenue"]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="var(--primary)"
                                    strokeWidth={3}
                                    fill="url(#porterRevenue)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Module split */}
                <Card className="flex flex-col rounded-3xl p-6 shadow-sm md:p-7">
                    <div>
                        <h3 className="flex items-center gap-2.5 text-lg font-extrabold text-slate-900 dark:text-white md:text-xl">
                            <Boxes className="h-5 w-5 text-emerald-600" />
                            Module split
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 md:text-sm">
                            Pickup service vs city parcel
                        </p>
                    </div>

                    <div className="h-[180px] w-full pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={trendChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                                <XAxis dataKey="label" hide />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    allowDecimals={false}
                                    tick={{ fontSize: 11, fill: "#64748B", fontWeight: 600 }}
                                />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Bar dataKey="pickup" stackId="a" fill="#2563EB" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="city" stackId="a" fill="#10B981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                        {[
                            {
                                name: "Pickup service",
                                color: "#2563EB",
                                total: breakdown.pickup?.total || 0,
                                revenue: breakdown.pickup?.revenue || 0,
                            },
                            {
                                name: "City parcel",
                                color: "#10B981",
                                total: breakdown.city?.total || 0,
                                revenue: breakdown.city?.revenue || 0,
                            },
                        ].map((row) => (
                            <div key={row.name} className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2.5">
                                    <span
                                        className="h-3 w-3 shrink-0 rounded-full"
                                        style={{ backgroundColor: row.color }}
                                    />
                                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                                        {row.name}
                                    </span>
                                </span>
                                <span className="text-right">
                                    <span className="block font-mono font-bold text-slate-900 dark:text-white">
                                        {row.total}
                                    </span>
                                    <span className="block font-mono text-[11px] text-slate-400">
                                        {rupees(row.revenue)}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* Recent parcels */}
            <Card className="overflow-hidden rounded-3xl p-0 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
                    <div>
                        <h3 className="flex items-center gap-2.5 text-lg font-extrabold text-slate-900 dark:text-white">
                            <Package className="h-5 w-5 text-primary" />
                            Latest parcels
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 md:text-sm">
                            Newest bookings from both porter modules
                        </p>
                    </div>
                    <button
                        onClick={() => navigate("/admin/city-parcels")}
                        className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
                    >
                        City parcels <ArrowRight className="h-4 w-4" />
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50">
                            <tr>
                                {["Module", "Customer", "Rider", "Fare", "Status"].map((head) => (
                                    <th
                                        key={head}
                                        className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500"
                                    >
                                        {head}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {recent.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="py-16 text-center text-sm font-semibold text-slate-400"
                                    >
                                        No parcels booked in this window
                                    </td>
                                </tr>
                            ) : (
                                recent.map((row) => (
                                    <tr
                                        key={`${row.source}-${row.id}`}
                                        className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                                    >
                                        <td className="px-6 py-4">
                                            <span
                                                className={cn(
                                                    "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wide",
                                                    row.source === "city"
                                                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                                                        : "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
                                                )}
                                            >
                                                {row.source === "city" ? "City" : "Pickup"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-medium text-slate-700 dark:text-slate-200">
                                            {row.customer}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-500">
                                            {row.rider || <span className="text-slate-300">Unassigned</span>}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-sm font-bold text-slate-900 dark:text-white">
                                            {rupees(row.fare)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={row.status} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default PorterDashboard;
