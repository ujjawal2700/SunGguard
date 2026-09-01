import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import StatusBadge from '@shared/components/ui/StatusBadge';
import { adminApi } from '../services/adminApi';
import {
    Users,
    Store,
    Truck,
    BarChart3,
    Activity,
    RotateCw,
    Loader2,
    ArrowUpRight,
    ShoppingBag,
    Package,
    ArrowRight,
    TrendingUp,
    Sparkles,
    Eye,
    Wallet,
    Calendar
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const Dashboard = () => {
    const navigate = useNavigate();
    const [statsData, setStatsData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [timeRange, setTimeRange] = useState('7d');

    const fetchStats = async (isManual = false) => {
        if (isManual) setIsRefreshing(true);
        try {
            const res = await adminApi.getStats();
            if (res.data.success) {
                setStatsData(res.data.result);
            }
        } catch (error) {
            console.error("Dashboard Stats Error:", error);
            toast.error("Failed to fetch dashboard data");
        } finally {
            setLoading(false);
            if (isManual) setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="h-[75vh] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-11 w-11 text-primary animate-spin" />
                <p className="text-sm font-bold uppercase tracking-wider text-slate-400">Loading Command Center...</p>
            </div>
        );
    }

    const overview = statsData?.overview || {};
    const chartData = statsData?.charts?.ordersOverTime || [
        { date: 'Mon', count: 24, revenue: 14200 },
        { date: 'Tue', count: 35, revenue: 21500 },
        { date: 'Wed', count: 42, revenue: 28900 },
        { date: 'Thu', count: 38, revenue: 24100 },
        { date: 'Fri', count: 56, revenue: 38700 },
        { date: 'Sat', count: 72, revenue: 49800 },
        { date: 'Sun', count: 68, revenue: 46200 },
    ];

    const categoryBreakdown = statsData?.charts?.categoryBreakdown || [
        { name: 'Grocery & Staples', count: 45, color: '#3B82F6' },
        { name: 'Fruits & Veggies', count: 28, color: '#10B981' },
        { name: 'Dairy & Breakfast', count: 18, color: '#F59E0B' },
        { name: 'Snacks & Beverages', count: 14, color: '#8B5CF6' },
    ];

    const recentOrders = statsData?.recentOrders || [];
    const topProducts = statsData?.topProducts || [];

    return (
        <div className="space-y-6 md:space-y-8">
            {/* Top Welcome Hero Banner */}
            <div className="relative rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-[#111827] p-6 md:p-9 text-white overflow-hidden shadow-2xl border border-slate-700/60">
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary/25 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
                <div className="absolute bottom-0 right-1/3 w-64 h-64 bg-orange-500/15 rounded-full blur-2xl pointer-events-none" />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-2.5">
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-bold backdrop-blur-md">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span>Executive Intelligence Hub</span>
                        </div>
                        <h1 className="text-2xl md:text-4xl font-black tracking-tight text-white">
                            Welcome back, Admin 👋
                        </h1>
                        <p className="text-sm md:text-base text-slate-300 max-w-xl font-normal">
                            Here is what's happening across your store catalog, verified seller partners, and fleet deliveries today.
                        </p>
                    </div>

                    {/* Quick action buttons cluster */}
                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                        <button
                            onClick={() => navigate('/admin/orders/all')}
                            className="px-4.5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-sm font-bold text-white transition-all backdrop-blur-sm flex items-center gap-2.5 shadow-sm"
                        >
                            <ShoppingBag className="h-4.5 w-4.5" />
                            <span>Live Orders</span>
                        </button>
                        <button
                            onClick={() => navigate('/admin/wallet')}
                            className="px-4.5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-sm font-bold text-white transition-all backdrop-blur-sm flex items-center gap-2.5 shadow-sm"
                        >
                            <Wallet className="h-4.5 w-4.5" />
                            <span>Wallet & Ledger</span>
                        </button>
                        <button
                            onClick={() => fetchStats(true)}
                            className="px-5 py-3 rounded-2xl bg-primary text-white hover:bg-primary/90 text-sm font-bold transition-all shadow-lg shadow-primary/30 flex items-center gap-2.5"
                        >
                            <RotateCw className={cn("h-4.5 w-4.5", isRefreshing && "animate-spin")} />
                            <span>Sync Telemetry</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* KPI Metric Cards Grid - Balanced Spacing & Larger Typography */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
                {[
                    {
                        label: 'Total Customers',
                        value: overview.totalUsers?.toLocaleString() || '0',
                        icon: Users,
                        trend: '+12.4%',
                        color: 'text-blue-600',
                        bg: 'bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800',
                        description: 'Registered platform users',
                        onClick: () => navigate('/admin/customers')
                    },
                    {
                        label: 'Active Sellers',
                        value: overview.activeSellers?.toLocaleString() || '0',
                        icon: Store,
                        trend: '+4.8%',
                        color: 'text-purple-600',
                        bg: 'bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800',
                        description: 'Verified active vendors',
                        onClick: () => navigate('/admin/sellers/active')
                    },
                    {
                        label: 'Total Orders',
                        value: overview.totalOrders?.toLocaleString() || '0',
                        icon: ShoppingBag,
                        trend: '+18.2%',
                        color: 'text-amber-600',
                        bg: 'bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800',
                        description: 'Lifetime orders placed',
                        onClick: () => navigate('/admin/orders/all')
                    },
                    {
                        label: 'Total Revenue',
                        value: `₹${Number(overview.totalRevenue || 0).toLocaleString('en-IN')}`,
                        icon: TrendingUp,
                        trend: '+22.5%',
                        color: 'text-emerald-600',
                        bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800',
                        description: 'Gross marketplace volume',
                        onClick: () => navigate('/admin/wallet')
                    }
                ].map((item, idx) => (
                    <div
                        key={idx}
                        onClick={item.onClick}
                        className="group relative bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-lg hover:border-primary/40 transition-all cursor-pointer overflow-hidden flex flex-col justify-between"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider">{item.label}</span>
                            <div className={cn("p-3 rounded-2xl border shadow-sm", item.bg)}>
                                <item.icon className="h-5 w-5" />
                            </div>
                        </div>

                        <div className="mt-4">
                            <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
                                {item.value}
                            </h3>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="inline-flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg">
                                    <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" />
                                    {item.trend}
                                </span>
                                <span className="text-xs text-slate-400 font-medium truncate">{item.description}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Section: Area Revenue + Donut Category Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue & Orders Velocity Area Chart */}
                <Card className="lg:col-span-2 p-6 md:p-7 overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
                        <div>
                            <h3 className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
                                <BarChart3 className="h-5 w-5 text-primary" />
                                Revenue & Order Velocity
                            </h3>
                            <p className="text-xs md:text-sm text-slate-500 mt-1">Real-time daily transaction volume and growth progression</p>
                        </div>

                        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl">
                            {['7d', '30d', '1y'].map((range) => (
                                <button
                                    key={range}
                                    onClick={() => setTimeRange(range)}
                                    className={cn(
                                        "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all uppercase",
                                        timeRange === range
                                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                                            : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                                    )}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="h-[320px] w-full pt-6">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 15, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748B', fontWeight: 600 }} />
                                <YAxis
                                    width={65}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 12, fill: '#64748B', fontWeight: 600 }}
                                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#0F172A',
                                        borderColor: '#1E293B',
                                        borderRadius: '16px',
                                        color: '#FFFFFF',
                                        fontSize: '13px',
                                        fontWeight: '700',
                                        padding: '10px 14px'
                                    }}
                                    formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Revenue']}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="var(--primary)"
                                    strokeWidth={3.5}
                                    fillOpacity={1}
                                    fill="url(#revenueGrad)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Category Share Donut */}
                <Card className="p-6 md:p-7 flex flex-col justify-between rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
                    <div>
                        <h3 className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
                            <Activity className="h-5 w-5 text-purple-600" />
                            Category Volume Share
                        </h3>
                        <p className="text-xs md:text-sm text-slate-500 mt-1">Breakdown by product categories</p>
                    </div>

                    <div className="h-[220px] w-full flex items-center justify-center my-3">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryBreakdown}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={65}
                                    outerRadius={95}
                                    paddingAngle={5}
                                    dataKey="count"
                                >
                                    {categoryBreakdown.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        {categoryBreakdown.slice(0, 4).map((cat, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2.5">
                                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                                    <span className="text-slate-700 dark:text-slate-200 font-semibold">{cat.name}</span>
                                </div>
                                <span className="font-bold text-slate-900 dark:text-white font-mono">{cat.count}%</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* Bottom Section: Recent Live Orders & Top Products */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Orders Table */}
                <Card className="lg:col-span-2 p-0 overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
                                <ShoppingBag className="h-5 w-5 text-primary" />
                                Recent Live Orders
                            </h3>
                            <p className="text-xs md:text-sm text-slate-500 mt-1">Latest incoming orders across all vendors</p>
                        </div>
                        <button
                            onClick={() => navigate('/admin/orders/all')}
                            className="text-sm font-bold text-primary hover:underline flex items-center gap-1.5"
                        >
                            View All <ArrowRight className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                <tr>
                                    <th className="px-6 py-4.5 text-sm font-bold text-slate-500 uppercase tracking-wider">Order ID</th>
                                    <th className="px-6 py-4.5 text-sm font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                                    <th className="px-6 py-4.5 text-sm font-bold text-slate-500 uppercase tracking-wider">Total</th>
                                    <th className="px-6 py-4.5 text-sm font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4.5 text-sm font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {recentOrders.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-16 text-center text-base text-slate-400 font-semibold">
                                            No recent orders recorded
                                        </td>
                                    </tr>
                                ) : (
                                    recentOrders.slice(0, 6).map((order) => (
                                        <tr key={order._id || order.orderId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-6 py-4.5 text-base font-bold text-slate-900 dark:text-white font-mono">
                                                #{order.orderId}
                                            </td>
                                            <td className="px-6 py-4.5 text-base text-slate-700 dark:text-slate-200 font-medium">
                                                {order.customer?.name || "Customer"}
                                            </td>
                                            <td className="px-6 py-4.5 text-base font-bold text-slate-900 dark:text-white font-mono">
                                                ₹{Number(order.pricing?.total || order.total || 0).toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-6 py-4.5">
                                                <StatusBadge status={order.status} />
                                            </td>
                                            <td className="px-6 py-4.5 text-right">
                                                <button
                                                    onClick={() => navigate(`/admin/orders/${order.orderId}`)}
                                                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-primary transition-colors"
                                                >
                                                    <Eye className="h-5 w-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* Top Moving Products */}
                <Card className="p-6 md:p-7 flex flex-col justify-between rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
                    <div>
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
                                    <Package className="h-5 w-5 text-emerald-600" />
                                    Top Fast-Moving Items
                                </h3>
                                <p className="text-xs md:text-sm text-slate-500 mt-1">Highest order volume items</p>
                            </div>
                        </div>

                        <div className="space-y-4 mt-5">
                            {topProducts.length === 0 ? (
                                <p className="py-12 text-center text-sm text-slate-400 font-medium">No product velocity data yet</p>
                            ) : (
                                topProducts.slice(0, 5).map((prod, idx) => (
                                    <div key={idx} className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="h-11 w-11 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200/80 dark:border-slate-700">
                                                <img
                                                    src={prod.mainImage || prod.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100"}
                                                    alt={prod.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{prod.name}</p>
                                                <p className="text-xs text-slate-400 font-mono font-medium">₹{prod.price}</p>
                                            </div>
                                        </div>
                                        <Badge variant="primary" className="font-mono text-xs font-bold shrink-0">
                                            {prod.salesCount || prod.stock || 12} sold
                                        </Badge>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <button
                        onClick={() => navigate('/admin/products')}
                        className="mt-5 w-full py-3 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-bold text-slate-800 dark:text-slate-200 transition-colors"
                    >
                        View Full Inventory
                    </button>
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;
