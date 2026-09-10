import React, { useState, useMemo, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Modal from '@shared/components/ui/Modal';
import { useToast } from '@shared/components/ui/Toast';
import {
    HiOutlinePlus,
    HiOutlineTicket,
    HiOutlineMagnifyingGlass,
    HiOutlineFunnel,
    HiOutlineTrash,
    HiOutlinePencilSquare,
    HiOutlineCalendarDays,
    HiOutlineUsers,
    HiOutlineBanknotes,
    HiOutlineClock,
    HiOutlineCheckCircle,
    HiOutlineXMark,
    HiOutlineEye
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { adminApi } from '../services/adminApi';

const CouponManagement = () => {
    const { showToast } = useToast();
    const today = new Date().toISOString().split('T')[0];
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [editingCoupon, setEditingCoupon] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [isLoading, setIsLoading] = useState(false);

    const [coupons, setCoupons] = useState([]);

    // This admin is a delivery (Porter) operations desk only — Quick Commerce
    // product-order coupons are not something this deployment creates, so
    // "Product Orders" is deliberately not offered as a scope here. The
    // underlying `Coupon` model/engine still supports it (untouched) in case
    // Quick is ever switched back on; only this creation form is scoped down.
    const APPLIES_TO_OPTIONS = [
        { value: 'porter_local', label: 'Local Delivery' },
        { value: 'porter_outstation', label: 'Outstation Delivery' },
    ];

    // couponType strategies that only mean something against a product cart
    // (categories, item counts, monthly product spend). A porter fare has no
    // items or categories, so a porter-only coupon is restricted to the two
    // strategies that are actually implemented for it.
    const PORTER_COUPON_TYPES = ['generic', 'min_order_value'];
    const COUPON_TYPE_OPTIONS = [
        { value: 'generic', label: 'Generic Discount' },
        { value: 'min_order_value', label: 'Minimum Fare Coupon' },
        { value: 'bulk_order', label: 'Bulk Order Discount', orderOnly: true },
        { value: 'free_delivery', label: 'Free Delivery Coupon', orderOnly: true },
        { value: 'category_based', label: 'Category-Based Coupon', orderOnly: true },
        { value: 'monthly_volume', label: 'Monthly Volume Coupon', orderOnly: true },
    ];
    const COUPON_TYPE_LABELS = COUPON_TYPE_OPTIONS.reduce((acc, opt) => {
        acc[opt.value] = opt.label;
        return acc;
    }, {});

    // This deployment's admin sidebar runs porter-only right now (see
    // Sidebar.jsx SHOW_QUICK_TAB) — defaulting a new coupon to both porter
    // scopes, with "Product Orders" left unchecked, means a fresh coupon
    // works for delivery bookings without the admin having to know that
    // scope checkbox exists.
    const emptyFormData = {
        code: '',
        title: '',
        couponType: 'generic',
        discountType: 'percentage',
        discountValue: '',
        minOrderValue: '',
        maxDiscount: '',
        usageLimit: '',
        perUserLimit: '1',
        validFrom: '',
        validTill: '',
        description: '',
        appliesTo: ['porter_local', 'porter_outstation'],
    };

    const [formData, setFormData] = useState(emptyFormData);

    const hasPorterScope = formData.appliesTo.some((s) => s === 'porter_local' || s === 'porter_outstation');
    const hasOrderScope = formData.appliesTo.includes('order');
    // Porter-only: no product-order strategies, no free-delivery discount kind.
    const porterOnly = hasPorterScope && !hasOrderScope;
    const visibleCouponTypeOptions = porterOnly
        ? COUPON_TYPE_OPTIONS.filter((opt) => !opt.orderOnly)
        : COUPON_TYPE_OPTIONS;

    const toggleAppliesTo = (value) => {
        setFormData((prev) => {
            const has = prev.appliesTo.includes(value);
            const nextAppliesTo = has
                ? prev.appliesTo.filter((v) => v !== value)
                : [...prev.appliesTo, value];
            const nextIsPorterOnly =
                nextAppliesTo.some((s) => s === 'porter_local' || s === 'porter_outstation') &&
                !nextAppliesTo.includes('order');
            const nextDiscountType =
                nextIsPorterOnly && prev.discountType === 'free_delivery' ? 'percentage' : prev.discountType;
            const nextCouponType =
                nextIsPorterOnly && !PORTER_COUPON_TYPES.includes(prev.couponType) ? 'generic' : prev.couponType;
            return {
                ...prev,
                appliesTo: nextAppliesTo,
                discountType: nextDiscountType,
                couponType: nextCouponType,
            };
        });
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchCoupons();
        }, 500);
        return () => clearTimeout(timer);
    }, [statusFilter, searchTerm]);

    const fetchCoupons = async () => {
        try {
            setIsLoading(true);
            const res = await adminApi.getCoupons({
                status: statusFilter === 'all' ? undefined : statusFilter,
                search: searchTerm.trim() || undefined,
            });
            if (res.data.success) {
                const list = res.data.result || res.data.results || [];
                setCoupons(list);
            }
        } catch (error) {
            showToast('Failed to load coupons', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const stats = useMemo(() => {
        const now = new Date();
        const active = coupons.filter(c => {
            const from = c.validFrom ? new Date(c.validFrom) : null;
            const till = c.validTill ? new Date(c.validTill) : null;
            return c.isActive && (!from || from <= now) && (!till || till >= now);
        });
        const expiringSoon = coupons.filter(c => {
            if (!c.validTill) return false;
            const till = new Date(c.validTill);
            const diffDays = (till - now) / (1000 * 60 * 60 * 24);
            return diffDays >= 0 && diffDays <= 7;
        });
        return {
            total: coupons.length,
            active: active.length,
            totalRedeemed: coupons.reduce((acc, c) => acc + (c.usedCount || 0), 0),
            expiringSoon: expiringSoon.length,
        };
    }, [coupons]);

    const filteredCoupons = coupons;

    const handleOpenModal = (coupon = null) => {
        if (coupon) {
            setEditingCoupon(coupon);
            const appliesTo = Array.isArray(coupon.appliesTo) && coupon.appliesTo.length > 0 ? coupon.appliesTo : ['order'];
            const isPorterOnly =
                appliesTo.some((s) => s === 'porter_local' || s === 'porter_outstation') && !appliesTo.includes('order');
            setFormData({
                code: coupon.code || '',
                title: coupon.title || '',
                couponType:
                    isPorterOnly && !PORTER_COUPON_TYPES.includes(coupon.couponType)
                        ? 'generic'
                        : coupon.couponType || 'generic',
                discountType:
                    isPorterOnly && coupon.discountType === 'free_delivery'
                        ? 'percentage'
                        : coupon.discountType || 'percentage',
                discountValue: coupon.discountValue ?? '',
                minOrderValue: coupon.minOrderValue ?? '',
                maxDiscount: coupon.maxDiscount ?? '',
                usageLimit: coupon.usageLimit ?? '',
                perUserLimit: coupon.perUserLimit ?? '1',
                validFrom: coupon.validFrom ? coupon.validFrom.substring(0, 10) : '',
                validTill: coupon.validTill ? coupon.validTill.substring(0, 10) : '',
                description: coupon.description || '',
                appliesTo,
            });
        } else {
            setEditingCoupon(null);
            setFormData(emptyFormData);
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.appliesTo || formData.appliesTo.length === 0) {
            showToast('Select at least one "Applies To" scope', 'error');
            return;
        }
        if (formData.validTill && formData.validFrom && formData.validTill <= formData.validFrom) {
            showToast('End date must be after the start date', 'error');
            return;
        }
        try {
            const payload = {
                ...formData,
                discountValue: Number(formData.discountValue),
                minOrderValue: formData.minOrderValue ? Number(formData.minOrderValue) : 0,
                maxDiscount: formData.maxDiscount ? Number(formData.maxDiscount) : undefined,
                usageLimit: formData.usageLimit ? Number(formData.usageLimit) : undefined,
                perUserLimit: formData.perUserLimit ? Number(formData.perUserLimit) : 1,
                validFrom: formData.validFrom,
                validTill: formData.validTill,
            };

            if (editingCoupon?._id) {
                await adminApi.updateCoupon(editingCoupon._id, payload);
                showToast('Coupon updated successfully', 'success');
            } else {
                await adminApi.createCoupon(payload);
                showToast('Delivery coupon created!', 'success');
            }
            setIsModalOpen(false);
            setEditingCoupon(null);
            const res = await adminApi.getCoupons();
            if (res.data.success) {
                const list = res.data.result || res.data.results || [];
                setCoupons(list);
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to save coupon', 'error');
        }
    };

    const handleDelete = async (id) => {
        try {
            await adminApi.deleteCoupon(id);
            setCoupons(coupons.filter(c => c._id !== id));
            setDeleteTarget(null);
            showToast('Coupon removed', 'warning');
        } catch (error) {
            showToast('Failed to delete coupon', 'error');
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            {/* Header Area */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Delivery Coupons
                    </h1>
                    <p className="ds-description mt-1">Discount codes for local and outstation delivery bookings.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-6 py-3.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
                >
                    <HiOutlinePlus className="h-5 w-5" />
                    CREATE DELIVERY COUPON
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Total Coupons', value: stats.total, icon: HiOutlineTicket, color: 'indigo' },
                    { label: 'Active Codes', value: stats.active, icon: HiOutlineCheckCircle, color: 'emerald' },
                    { label: 'Redemptions', value: stats.totalRedeemed.toLocaleString(), icon: HiOutlineUsers, color: 'amber' },
                    { label: 'Expiring Soon', value: stats.expiringSoon, icon: HiOutlineClock, color: 'rose' },
                ].map((s, i) => (
                    <Card key={i} className="p-6 border-none shadow-xl ring-1 ring-slate-100 bg-white group hover:ring-primary/20 transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <div className={cn("p-2.5 rounded-2xl",
                                s.color === 'indigo' && "bg-brand-50 text-brand-600",
                                s.color === 'emerald' && "bg-brand-50 text-brand-600",
                                s.color === 'amber' && "bg-amber-50 text-amber-600",
                                s.color === 'rose' && "bg-rose-50 text-rose-600",
                            )}>
                                <s.icon className="h-6 w-6" />
                            </div>
                        </div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{s.label}</h4>
                        <h3 className="text-2xl font-black text-slate-900">{s.value}</h3>
                    </Card>
                ))}
            </div>

            {/* Main Content Area */}
            <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                {/* Table Filters */}
                <div className="p-4 border-b border-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="relative group flex-1 max-w-md">
                            <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                placeholder="Search by code or description..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-2xl text-xs font-bold outline-none ring-1 ring-transparent focus:ring-primary/10 transition-all"
                            />
                        </div>
                        <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                            {['all', 'active', 'expired'].map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setStatusFilter(filter)}
                                    className={cn(
                                        "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                        statusFilter === filter ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    {filter}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Coupons Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Coupon Code</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Offerings</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Performance</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Validity</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {isLoading && (
                                <tr>
                                    <td colSpan="6" className="text-center py-12 text-slate-400 text-sm">
                                        Loading coupons...
                                    </td>
                                </tr>
                            )}
                            {!isLoading && filteredCoupons.map((c) => (
                                <tr key={c._id} className="group hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4.5">
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                                                <HiOutlineTicket className="h-6 w-6" />
                                            </div>
                                            <div>
                                                <span className="text-base font-bold text-slate-900 font-mono tracking-wider bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">{c.code}</span>
                                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1">{c.title}</p>
                                                <p className="text-xs font-normal text-slate-400 mt-0.5 line-clamp-2">{c.description}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4.5">
                                        <div className="space-y-1">
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                                                {c.discountType === 'percentage' ? `${c.discountValue}% OFF` : c.discountType === 'free_delivery' ? 'Free Delivery' : `₹${c.discountValue} OFF`}
                                            </p>
                                            {c.minOrderValue > 0 && (
                                                <p className="text-xs text-slate-500 font-medium">Min. Fare: ₹{c.minOrderValue}</p>
                                            )}
                                            <p className="text-xs text-slate-400 font-normal">
                                                Type: {COUPON_TYPE_LABELS[c.couponType] || 'Generic Discount'}
                                            </p>
                                            <div className="flex flex-wrap gap-1 pt-1">
                                                {(Array.isArray(c.appliesTo) && c.appliesTo.length > 0 ? c.appliesTo : ['order']).map((scope) => (
                                                    <Badge key={scope} variant="secondary" className="text-[9px] px-1.5 py-0.5 font-bold">
                                                        {scope === 'porter_local' ? 'Local' : scope === 'porter_outstation' ? 'Outstation' : 'Orders'}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4.5">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <span className="text-xs text-slate-500 font-medium">Redeemed</span>
                                                <span className="text-sm font-bold text-slate-900 font-mono">{c.usedCount || 0}{c.usageLimit ? `/${c.usageLimit}` : ''}</span>
                                            </div>
                                            <div className="h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary rounded-full transition-all duration-1000"
                                                    style={{ width: c.usageLimit ? `${((c.usedCount || 0) / c.usageLimit) * 100}%` : '0%' }}
                                                />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4.5">
                                        <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                                            <HiOutlineCalendarDays className="h-4 w-4 text-slate-400" />
                                            <span>
                                                {c.validFrom ? new Date(c.validFrom).toLocaleDateString() : '—'} - {c.validTill ? new Date(c.validTill).toLocaleDateString() : '—'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4.5 text-center">
                                        <Badge variant={c.isActive ? 'success' : 'secondary'} className="text-xs font-semibold px-2.5 py-0.5">
                                            {c.isActive ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-6">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleOpenModal(c)}
                                                className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                                            >
                                                <HiOutlinePencilSquare className="h-5 w-5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteTarget(c)}
                                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                            >
                                                <HiOutlineTrash className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredCoupons.length === 0 && (
                    <div className="p-20 text-center">
                        <div className="h-20 w-20 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-6">
                            <HiOutlineTicket className="h-10 w-10 text-slate-200" />
                        </div>
                        <h3 className="text-lg font-black text-slate-900">No codes found</h3>
                        <p className="text-sm font-bold text-slate-400 mt-2">Try adjusting your filters or create a new promotion.</p>
                    </div>
                )}
            </Card>

            {/* Delete confirmation dialog */}
            <AnimatePresence>
                {deleteTarget && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
                        >
                            <div className="p-6 text-center">
                                <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
                                    <HiOutlineTrash className="w-6 h-6" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">Delete coupon?</h3>
                                <p className="text-slate-500 text-sm mb-6">
                                    Are you sure you want to remove{' '}
                                    <span className="font-semibold text-slate-900">{deleteTarget.code}</span>? This action cannot be undone.
                                </p>
                                <div className="flex gap-3 justify-center">
                                    <button
                                        onClick={() => setDeleteTarget(null)}
                                        className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleDelete(deleteTarget._id)}
                                        className="px-4 py-2.5 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-700 transition-colors"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal for Create/Edit */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={
                    editingCoupon
                        ? "Modify Coupon"
                        : porterOnly
                            ? "New Delivery Coupon"
                            : "New Coupon"
                }
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Promo Code</label>
                            <input
                                required
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                placeholder="E.G. SUMMER50"
                                className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black uppercase tracking-widest outline-none ring-1 ring-transparent focus:ring-primary/20"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Discount Kind</label>
                            <select
                                value={formData.discountType}
                                onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black outline-none"
                            >
                                <option value="percentage">Percentage (%)</option>
                                <option value="fixed">Fixed Amount (₹)</option>
                                {!hasPorterScope && <option value="free_delivery">Free Delivery</option>}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Headline (optional)</label>
                        <input
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="E.G. Flat 10% off local delivery"
                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black outline-none ring-1 ring-transparent focus:ring-primary/20"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery Type</label>
                        <div className="flex flex-wrap gap-3">
                            {APPLIES_TO_OPTIONS.map((opt) => (
                                <label
                                    key={opt.value}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[11px] font-bold cursor-pointer transition-all ring-1",
                                        formData.appliesTo.includes(opt.value)
                                            ? "bg-primary/10 text-primary ring-primary/30"
                                            : "bg-slate-50 text-slate-500 ring-transparent hover:ring-slate-200"
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        checked={formData.appliesTo.includes(opt.value)}
                                        onChange={() => toggleAppliesTo(opt.value)}
                                        className="accent-primary"
                                    />
                                    {opt.label}
                                </label>
                            ))}
                        </div>
                        <p className="text-[10px] text-slate-400">
                            Pick which delivery bookings this coupon works on — local, outstation, or both together over the same date range.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coupon Strategy</label>
                        <select
                            value={formData.couponType}
                            onChange={(e) => setFormData({ ...formData, couponType: e.target.value })}
                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black outline-none"
                        >
                            {visibleCouponTypeOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-slate-400">
                            {porterOnly
                                ? "A delivery fare has no items or categories, so only a plain discount or a minimum-fare condition apply here."
                                : "Choose the logic: bulk order, MOV, free delivery, specific categories, or monthly volume buyers."}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Discount Value</label>
                            <input
                                required
                                type="number"
                                onWheel={(e) => e.target.blur()}
                                value={formData.discountValue}
                                onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {hasPorterScope ? 'Minimum Fare' : 'Min Order Requirement'}
                            </label>
                            <input
                                required
                                type="number"
                                onWheel={(e) => e.target.blur()}
                                value={formData.minOrderValue}
                                onChange={(e) => setFormData({ ...formData, minOrderValue: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Max Discount (optional)</label>
                            <input
                                type="number"
                                onWheel={(e) => e.target.blur()}
                                value={formData.maxDiscount}
                                onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Uses (optional)</label>
                            <input
                                type="number"
                                onWheel={(e) => e.target.blur()}
                                value={formData.usageLimit}
                                onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Per User Limit</label>
                            <input
                                type="number"
                                min={1}
                                onWheel={(e) => e.target.blur()}
                                value={formData.perUserLimit}
                                onChange={(e) => setFormData({ ...formData, perUserLimit: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Date</label>
                            <input
                                required
                                type="date"
                                min={today}
                                value={formData.validFrom}
                                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">End Date</label>
                            <input
                                required
                                type="date"
                                min={formData.validFrom || today}
                                value={formData.validTill}
                                onChange={(e) => setFormData({ ...formData, validTill: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black outline-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                        <textarea
                            required
                            rows={3}
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Briefly describe this delivery offer..."
                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black outline-none resize-none"
                        />
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1 py-4 bg-slate-100 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest"
                        >
                            CANCEL
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-4 bg-primary text-primary-foreground rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                        >
                            {editingCoupon ? 'SAVE CHANGES' : 'CREATE COUPON'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default CouponManagement;
