import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import Badge from '@shared/components/ui/Badge';
import StatusBadge from '@shared/components/ui/StatusBadge';
import Pagination from '@shared/components/ui/Pagination';
import EmptyState from '@shared/components/ui/EmptyState';
import { adminApi } from '../services/adminApi';
import {
    Search,
    Filter,
    Truck,
    Eye,
    Download,
    Calendar,
    ArrowUpRight,
    Package,
    IndianRupee,
    ChevronDown,
    ShoppingBag,
    Clock,
    CheckCircle2,
    RotateCw,
    XCircle,
    Inbox
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getLegacyStatusFromOrder,
    adminRouteMatchesOrder,
} from '@/shared/utils/orderStatus';

const OrdersList = () => {
    const { status = 'all' } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState('All Time');
    const [orders, setOrders] = useState([]);
    const [summary, setSummary] = useState({
        totalOrders: 0,
        totalAmount: 0,
        pending: 0,
        confirmed: 0,
        packed: 0,
        outForDelivery: 0,
        delivered: 0,
        cancelled: 0,
        returned: 0,
        activeOrders: 0,
    });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);

    const fetchOrders = async (requestedPage = 1) => {
        setIsLoading(true);
        try {
            const params = { page: requestedPage, limit: pageSize };
            if (status !== 'all') params.status = status;
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (dateRange !== 'All Time') {
                params.dateFilter = dateRange.toLowerCase().replace(/ /g, '_');
            }
            const response = await adminApi.getOrders(params);
            if (response.data.success) {
                const payload = response.data.result || {};
                const dbOrders = Array.isArray(payload.items) ? payload.items : (response.data.results || []);
                const formatted = dbOrders.map(o => ({
                    id: o.orderId || 'UNSET',
                    _id: o._id,
                    customer: o.customer?.name || 'Customer',
                    seller: o.seller?.shopName || 'Store Partner',
                    items: o.items?.length || 0,
                    amount: o.pricing?.total || 0,
                    status: getLegacyStatusFromOrder(o),
                    workflowStatus: o.workflowStatus,
                    workflowVersion: o.workflowVersion,
                    returnStatus: o.returnStatus,
                    date: new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
                    payment: o.payment?.method === 'cod' ? 'COD' : 'Online',
                }));
                setOrders(formatted);
                setSummary({
                    totalOrders: Number(payload.summary?.totalOrders || payload.total || formatted.length || 0),
                    totalAmount: Number(payload.summary?.totalAmount || 0),
                    pending: Number(payload.summary?.pending || 0),
                    confirmed: Number(payload.summary?.confirmed || 0),
                    packed: Number(payload.summary?.packed || 0),
                    outForDelivery: Number(payload.summary?.outForDelivery || 0),
                    delivered: Number(payload.summary?.delivered || 0),
                    cancelled: Number(payload.summary?.cancelled || 0),
                    returned: Number(payload.summary?.returned || 0),
                    activeOrders: Number(payload.summary?.activeOrders || 0),
                });
                if (typeof payload.total === 'number') {
                    setTotal(payload.total);
                } else {
                    setTotal(formatted.length);
                }
                if (typeof payload.page === 'number') {
                    setPage(payload.page);
                } else {
                    setPage(requestedPage);
                }
            }
        } catch (error) {
            console.error("Fetch orders error:", error);
            showToast("Failed to load orders", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatusUpdate = async (orderId, newStatus) => {
        try {
            await adminApi.updateOrderStatus(orderId, { status: newStatus });
            showToast(`Order status updated to ${newStatus}`, "success");
            fetchOrders(page);
        } catch (error) {
            console.error("Failed to update status:", error);
            showToast("Failed to update status", "error");
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchOrders(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [pageSize, status, searchTerm, dateRange]);

    const handleExport = () => {
        if (orders.length === 0) {
            showToast('No orders to export', 'warning');
            return;
        }

        const headers = ['Order ID', 'Date', 'Customer', 'Seller', 'Items', 'Amount', 'Status', 'Payment'];
        const csvContent = [
            headers.join(','),
            ...orders.map(o => [
                String(o.id || ''),
                String(o.date || '').replace(/,/g, ''),
                String(o.customer || '').replace(/,/g, ''),
                String(o.seller || '').replace(/,/g, ''),
                o.items,
                o.amount,
                o.status,
                o.payment
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `orders-${status}-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Orders export generated successfully', 'success');
    };

    const stats = useMemo(() => {
        return [
            { 
                label: 'Gross Volume', 
                value: `₹${Number(summary.totalAmount || 0).toLocaleString('en-IN')}`, 
                trend: '+12.5%', 
                icon: IndianRupee, 
                color: 'text-emerald-600',
                bg: 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800'
            },
            { 
                label: 'Active Pipeline', 
                value: summary.activeOrders, 
                trend: '+5 Today', 
                icon: ShoppingBag, 
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800'
            },
            { 
                label: 'Average Fulfillment', 
                value: '18m', 
                trend: '-2m faster', 
                icon: Clock, 
                color: 'text-amber-600',
                bg: 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800'
            },
            { 
                label: 'Success Rate', 
                value: '98.4%', 
                trend: '+0.4%', 
                icon: CheckCircle2, 
                color: 'text-purple-600',
                bg: 'bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800'
            },
        ];
    }, [summary]);

    const pageTitle = status === 'all' 
        ? 'All Orders' 
        : status.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    return (
        <div className="space-y-6 md:space-y-8">
            <PageHeader
                title={pageTitle}
                description="Live monitor and dispatch control for all customer orders."
                icon={ShoppingBag}
                badge={
                    <Badge variant="primary" className="font-mono">
                        {total} Total
                    </Badge>
                }
                actions={
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExport}
                            className="ds-btn ds-btn-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-sm"
                        >
                            <Download className="h-3.5 w-3.5" />
                            <span>Export CSV</span>
                        </button>
                        <div className="relative">
                            <button
                                onClick={() => setIsDateMenuOpen(!isDateMenuOpen)}
                                className="ds-btn ds-btn-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-sm"
                            >
                                <Calendar className="h-3.5 w-3.5 text-primary" />
                                <span>{dateRange}</span>
                                <ChevronDown className="h-3 w-3 text-slate-400" />
                            </button>

                            <AnimatePresence>
                                {isDateMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsDateMenuOpen(false)} />
                                        <motion.div
                                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                            className="absolute right-0 mt-2 w-44 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-1.5 z-20"
                                        >
                                            {['All Time', 'Today', 'Yesterday', 'Last 7 Days', 'This Month'].map((range) => (
                                                <button
                                                    key={range}
                                                    onClick={() => {
                                                        setDateRange(range);
                                                        setIsDateMenuOpen(false);
                                                    }}
                                                    className={cn(
                                                        "w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                                                        dateRange === range 
                                                            ? "bg-primary/10 text-primary" 
                                                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                    )}
                                                >
                                                    {range}
                                                </button>
                                            ))}
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                }
            />

            {/* Metrics Overview */}
            <div className="ds-grid-stats">
                {stats.map((stat, i) => (
                    <StatCard
                        key={i}
                        label={stat.label}
                        value={stat.value}
                        icon={stat.icon}
                        trend={stat.trend}
                        trendDirection="up"
                        color={stat.color}
                        bg={stat.bg}
                    />
                ))}
            </div>

            {/* Orders Table Container */}
            <Card className="p-0 overflow-hidden">
                {/* Search & Filter Bar */}
                <div className="p-4 md:p-5 border-b border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/20">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search Order ID, customer, store..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="ds-input w-full pl-9"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fetchOrders(page)}
                            className="ds-btn ds-btn-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                        >
                            <RotateCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin text-primary")} />
                            <span>Refresh</span>
                        </button>
                    </div>
                </div>

                {/* Table Content */}
                <div className="overflow-x-auto">
                    <table className="ds-table w-full text-left">
                        <thead className="ds-table-header">
                            <tr>
                                <th className="ds-table-header-cell">Order Details</th>
                                <th className="ds-table-header-cell">Customer</th>
                                <th className="ds-table-header-cell">Store / Partner</th>
                                <th className="ds-table-header-cell">Status Workflow</th>
                                <th className="ds-table-header-cell text-right">Amount</th>
                                <th className="ds-table-header-cell text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="6" className="py-16 text-center">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <div className="h-7 w-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                            <p className="text-xs font-semibold text-slate-400">Loading order records...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : orders.length > 0 ? (
                                orders.map((order) => (
                                    <tr 
                                        key={order.id} 
                                        onClick={() => navigate(`/admin/orders/view/${order.id}`)}
                                        className="ds-table-row hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                                    >
                                        <td className="ds-table-cell py-4.5 px-6">
                                            <div className="flex items-center gap-3.5">
                                                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                                                    <Package className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <span className="text-base font-bold text-slate-900 dark:text-white font-mono hover:text-primary transition-colors">
                                                        #{order.id}
                                                    </span>
                                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-normal">
                                                        <span>{order.items} {order.items > 1 ? 'items' : 'item'}</span>
                                                        <span>•</span>
                                                        <span>{order.date}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="ds-table-cell py-4.5 px-6 text-base font-semibold text-slate-900 dark:text-white">
                                            {order.customer}
                                        </td>
                                        <td className="ds-table-cell py-4.5 px-6 text-base font-normal text-slate-700 dark:text-slate-300">
                                            {order.seller}
                                        </td>
                                        <td className="ds-table-cell py-4.5 px-6" onClick={(e) => e.stopPropagation()}>
                                            <div className="relative inline-block w-40">
                                                <select
                                                    value={order.status}
                                                    onChange={(e) => handleStatusUpdate(order._id, e.target.value)}
                                                    className="w-full text-xs font-semibold py-2 pl-3 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 appearance-none cursor-pointer focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
                                                >
                                                    <option value="pending">Pending</option>
                                                    <option value="confirmed">Confirmed</option>
                                                    <option value="packed">Packed</option>
                                                    <option value="out_for_delivery">Out for Delivery</option>
                                                    <option value="delivered">Delivered</option>
                                                    <option value="cancelled">Cancelled</option>
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-slate-400" />
                                            </div>
                                        </td>
                                        <td className="ds-table-cell py-4.5 px-6 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
                                                    ₹{Number(order.amount).toLocaleString('en-IN')}
                                                </span>
                                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                                                    {order.payment}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="ds-table-cell py-4.5 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => navigate(`/admin/orders/view/${order.id}`)}
                                                className="p-2 rounded-xl text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                                                title="View Order Details"
                                            >
                                                <Eye className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="py-12">
                                        <EmptyState
                                            icon={Inbox}
                                            title="No Orders Found"
                                            description="No orders currently match the selected status or search filter."
                                        />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-800/10">
                    <Pagination
                        page={page}
                        totalPages={Math.ceil(total / pageSize) || 1}
                        total={total}
                        pageSize={pageSize}
                        onPageChange={(p) => fetchOrders(p)}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setPage(1);
                        }}
                        loading={isLoading}
                    />
                </div>
            </Card>
        </div>
    );
};

export default OrdersList;
