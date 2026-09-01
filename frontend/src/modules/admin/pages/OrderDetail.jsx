import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useSettings } from '@core/context/SettingsContext';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import Badge from '@shared/components/ui/Badge';
import StatusBadge from '@shared/components/ui/StatusBadge';
import { adminApi } from '../services/adminApi';
import {
    ChevronLeft,
    Box,
    Truck,
    User,
    Building2,
    Calendar,
    Clock,
    ShoppingBag,
    Printer,
    Download,
    Mail,
    Phone,
    Copy,
    CreditCard,
    AlertCircle,
    Package,
    Navigation,
    Store,
    Info,
    MapPin,
    ArrowLeft,
    CheckCircle2,
    XCircle,
    RotateCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';

const OrderDetail = () => {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { settings } = useSettings();
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const invoiceRef = useRef(null);

    const fetchDetail = async () => {
        setIsLoading(true);
        try {
            const response = await adminApi.getOrderDetails(orderId);
            if (response.data.success) {
                setOrder(response.data.result);
            }
        } catch (error) {
            showToast("Failed to load order details", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatusUpdate = async (newStatus) => {
        try {
            await adminApi.updateOrderStatus(orderId, { status: newStatus });
            showToast(`Order status updated to ${newStatus}`, "success");
            fetchDetail();
        } catch (error) {
            console.error("Failed to update status:", error);
            showToast("Failed to update status", "error");
        }
    };

    const handleApproveCancelRefund = async () => {
        try {
            await adminApi.approveCancelRefund(orderId);
            showToast("Cancel approved. Amount credited to customer wallet.", "success");
            fetchDetail();
        } catch (error) {
            showToast(
                error?.response?.data?.message || "Failed to approve cancel refund",
                "error",
            );
        }
    };

    const handleRejectCancelRequest = async () => {
        try {
            await adminApi.rejectCancelRequest(orderId);
            showToast("Cancel request rejected. Order continues.", "success");
            fetchDetail();
        } catch (error) {
            showToast(
                error?.response?.data?.message || "Failed to reject cancel request",
                "error",
            );
        }
    };

    useEffect(() => {
        if (orderId) {
            fetchDetail();
        }
    }, [orderId]);

    const copyToClipboard = (text, label) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        showToast(`${label} copied to clipboard`, 'success');
    };

    const handlePrintInvoice = async () => {
        const element = invoiceRef.current;
        if (!element) return;
        
        showToast("Generating PDF Invoice...", "info");
        
        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                allowTaint: true,
                backgroundColor: "#ffffff",
                onclone: (clonedDoc) => {
                    const styleSheets = clonedDoc.styleSheets;
                    for (let i = 0; i < styleSheets.length; i++) {
                        try {
                            const rules = styleSheets[i].cssRules || styleSheets[i].rules;
                            for (let j = rules.length - 1; j >= 0; j--) {
                                if (rules[j].cssText && rules[j].cssText.includes('oklch')) {
                                    styleSheets[i].deleteRule(j);
                                }
                            }
                        } catch (e) {}
                    }
                    
                    const style = clonedDoc.createElement('style');
                    style.innerHTML = `
                        :root {
                            --primary: #0C831F !important;
                            --secondary: #64748b !important;
                            --background: #ffffff !important;
                            --foreground: #0f172a !important;
                        }
                    `;
                    clonedDoc.head.appendChild(style);
                }
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Invoice_${order.orderId}.pdf`);
            showToast("Invoice downloaded successfully", "success");
        } catch (error) {
            console.error("PDF generation failed:", error);
            showToast("Failed to generate PDF", "error");
        }
    };

    if (isLoading) {
        return (
            <div className="h-[70vh] flex flex-col items-center justify-center gap-3">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Loading Order Details...</p>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
                <AlertCircle className="h-12 w-12 text-rose-400" />
                <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Order Record Not Found</h2>
                    <p className="text-xs text-slate-500 mt-1">The requested order ID does not exist or has been archived.</p>
                </div>
                <button onClick={() => navigate(-1)} className="ds-btn ds-btn-md bg-primary text-white mt-2">
                    Back to Orders
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 md:space-y-8">
            {/* Control Bar Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="Go back"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <div className="flex items-center flex-wrap gap-2.5">
                            <h1 className="ds-h1 font-mono">Order #{order.orderId}</h1>
                            <StatusBadge status={order.status} />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            <span>•</span>
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center flex-wrap gap-3">
                    {/* Status Update Dropdown */}
                    <div className="relative inline-block w-40">
                        <select
                            value={order.status}
                            onChange={(e) => handleStatusUpdate(e.target.value)}
                            className="ds-select w-full text-xs font-semibold"
                        >
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="packed">Packed</option>
                            <option value="out_for_delivery">Out for Delivery</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>

                    <button 
                        onClick={handlePrintInvoice}
                        className="ds-btn ds-btn-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-sm"
                    >
                        <Printer className="h-4 w-4" />
                        <span>Print Invoice</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Items & Fulfillment */}
                <div className="lg:col-span-2 space-y-6">
                    {order.cancelRequestStatus === "requested" && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                                    Cancellation Refund Requested
                                </p>
                                <p className="text-xs text-amber-900 dark:text-amber-200 mt-1 font-medium">
                                    Customer requested cancellation. Approve to cancel order and credit funds to their wallet.
                                </p>
                                {order.cancelReason && (
                                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 italic">Reason: "{order.cancelReason}"</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleRejectCancelRequest}
                                    className="ds-btn ds-btn-sm bg-white dark:bg-slate-900 border border-amber-200 text-slate-700 dark:text-slate-200"
                                >
                                    Reject
                                </button>
                                <button
                                    type="button"
                                    onClick={handleApproveCancelRefund}
                                    className="ds-btn ds-btn-sm bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                    Approve Refund
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Ordered Items Table Card */}
                    <Card
                        title="Ordered Items"
                        subtitle="List of products in this order"
                        headerAction={
                            <Badge variant="primary">
                                {order.items?.length || 0} Items
                            </Badge>
                        }
                        className="p-0 overflow-hidden"
                    >
                        <div className="overflow-x-auto">
                            <table className="ds-table w-full text-left">
                                <thead className="ds-table-header">
                                    <tr>
                                        <th className="ds-table-header-cell">Item</th>
                                        <th className="ds-table-header-cell text-center">Unit Price</th>
                                        <th className="ds-table-header-cell text-center">Quantity</th>
                                        <th className="ds-table-header-cell text-right">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {order.items?.map((item) => (
                                        <tr key={item._id} className="ds-table-row">
                                            <td className="ds-table-cell py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200/60 dark:border-slate-700 overflow-hidden flex-shrink-0">
                                                        {item.image ? (
                                                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Package className="h-5 w-5 text-slate-400" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs md:text-sm font-semibold text-slate-900 dark:text-white">{item.name}</p>
                                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {String(item.product?._id || item.product).slice(-8)}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="ds-table-cell py-3.5 text-center font-mono font-medium">
                                                ₹{item.price}
                                            </td>
                                            <td className="ds-table-cell py-3.5 text-center">
                                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-semibold font-mono">
                                                    x{item.quantity}
                                                </span>
                                            </td>
                                            <td className="ds-table-cell py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                                                ₹{Number(item.price * item.quantity).toLocaleString('en-IN')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Order Financials Summary */}
                        <div className="p-5 bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 flex flex-col items-end gap-2 text-right">
                            <div className="flex items-center justify-between w-full max-w-[260px] text-xs">
                                <span className="text-slate-500 font-medium">Items Subtotal</span>
                                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">₹{Number(order.pricing?.subtotal || 0).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex items-center justify-between w-full max-w-[260px] text-xs">
                                <span className="text-slate-500 font-medium">Delivery Fee</span>
                                <span className="font-mono font-semibold text-emerald-600">₹{Number(order.pricing?.deliveryFee || 0).toLocaleString('en-IN')}</span>
                            </div>
                            {Number(order.pricing?.discount || 0) > 0 && (
                                <div className="flex items-center justify-between w-full max-w-[260px] text-xs">
                                    <span className="text-slate-500 font-medium">Discount</span>
                                    <span className="font-mono font-semibold text-rose-600">-₹{Number(order.pricing?.discount).toLocaleString('en-IN')}</span>
                                </div>
                            )}
                            <div className="h-px w-full max-w-[260px] bg-slate-200 dark:bg-slate-700 my-1" />
                            <div className="flex items-center justify-between w-full max-w-[260px]">
                                <span className="text-xs font-bold text-slate-900 dark:text-white">Grand Total</span>
                                <span className="text-lg font-bold text-primary font-mono">₹{Number(order.pricing?.total || 0).toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                    </Card>

                    {/* Merchant & Store Card */}
                    <Card
                        title="Merchant / Store Details"
                        subtitle="Fulfillment store handling this order"
                    >
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 flex items-center justify-center text-orange-600 text-lg font-bold">
                                {order.seller?.shopName?.[0] || 'S'}
                            </div>
                            <div>
                                <h3 className="text-sm md:text-base font-bold text-slate-900 dark:text-white">{order.seller?.shopName || 'Store Partner'}</h3>
                                <p className="text-xs text-emerald-600 font-semibold mt-0.5">Verified Anchor Partner</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Owner: {order.seller?.name || 'Partner'}</p>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right Column: Customer & Delivery Info */}
                <div className="space-y-6">
                    {/* Customer Profile Card */}
                    <Card title="Customer Information">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">
                                    {order.customer?.name?.[0] || 'C'}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">{order.customer?.name || 'Customer'}</p>
                                    <p className="text-xs text-slate-400 font-mono">ID: {String(order.customer?._id || '').slice(-8)}</p>
                                </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                                {order.customer?.email && (
                                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                                        <span>{order.customer.email}</span>
                                    </div>
                                )}
                                {order.customer?.phone && (
                                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                                        <span>{order.customer.phone}</span>
                                    </div>
                                )}
                            </div>

                            {/* Delivery Address */}
                            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Delivery Address</span>
                                    {order?.address?.location?.lat && order?.address?.location?.lng && (
                                        <button
                                            type="button"
                                            onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${order.address.location.lat},${order.address.location.lng}`, "_blank")}
                                            className="text-[10px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                                        >
                                            <MapPin className="h-3 w-3" /> Map
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                                    {order.address?.address}{order.address?.landmark && `, ${order.address.landmark}`}{order.address?.city && `, ${order.address.city}`}
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* Delivery Partner Card */}
                    <Card title="Delivery Rider">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600">
                                    <Truck className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">
                                        {order.deliveryBoy?.name || "Unassigned"}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        {order.deliveryBoy?.phone || "No driver assigned yet"}
                                    </p>
                                </div>
                            </div>
                            <Badge variant={order.deliveryBoy ? "success" : "gray"}>
                                {order.deliveryBoy ? "Assigned" : "Pending"}
                            </Badge>
                        </div>
                    </Card>

                    {/* Payment Info Card */}
                    <Card title="Payment & Settlement">
                        <div className="space-y-3 text-xs">
                            <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                                <span className="text-slate-500 font-medium">Payment Method</span>
                                <span className="font-semibold text-slate-900 dark:text-white uppercase font-mono">{order.payment?.method || 'CASH / COD'}</span>
                            </div>
                            <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                                <span className="text-slate-500 font-medium">Payment Status</span>
                                <StatusBadge status={order.payment?.status || 'pending'} kind="payment" />
                            </div>
                            {order.payment?.transactionId && (
                                <div className="flex items-center justify-between py-1">
                                    <span className="text-slate-500 font-medium">Transaction ID</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{order.payment.transactionId}</span>
                                        <button onClick={() => copyToClipboard(order.payment.transactionId, 'Transaction ID')} className="text-slate-400 hover:text-primary">
                                            <Copy className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>

            {/* Hidden Printable Invoice Template */}
            <div className="fixed -left-[9999px] top-0">
                <div 
                    ref={invoiceRef}
                    className="w-[800px] bg-white p-1"
                    style={{ backgroundColor: "#f8fafc" }}
                >
                    <div style={{ 
                        backgroundColor: "#ffffff", 
                        margin: "40px",
                        padding: "65px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        fontFamily: "'Inter', system-ui, sans-serif",
                        color: "#1e293b",
                        minHeight: "1050px"
                    }}>
                        <div style={{ textAlign: "center", marginBottom: "40px" }}>
                            {settings?.logoUrl ? (
                                <img src={settings.logoUrl} alt="Logo" width="130" style={{ display: "inline-block", marginBottom: "16px" }} crossOrigin="anonymous" />
                            ) : (
                                <div style={{ fontSize: "26px", fontWeight: "900", color: "#0f172a", marginBottom: "4px" }}>{settings?.appName || 'App'}</div>
                            )}
                            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "800", textTransform: "uppercase", letterSpacing: "2px" }}>Tax Invoice / Order Receipt</div>
                        </div>

                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "40px", borderBottom: "1px solid #f1f5f9", paddingBottom: "20px" }}>
                            <tr>
                                <td width="50%" style={{ verticalAlign: "bottom" }}>
                                    <div style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a" }}>INVOICE</div>
                                </td>
                                <td width="50%" align="right" style={{ verticalAlign: "bottom" }}>
                                    <div style={{ fontSize: "13px", fontWeight: "700", marginBottom: "4px" }}>Order Ref: <span style={{ color: "#0C831F" }}>#{order.orderId}</span></div>
                                    <div style={{ fontSize: "11px", color: "#64748b" }}>Date: {new Date(order.createdAt).toLocaleDateString()}</div>
                                </td>
                            </tr>
                        </table>

                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "40px" }}>
                            <tr>
                                <td width="48%" style={{ verticalAlign: "top", paddingRight: "20px" }}>
                                    <div style={{ fontSize: "10px", fontWeight: "800", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Billed To</div>
                                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a", marginBottom: "6px" }}>{order.customer?.name}</div>
                                    <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.6" }}>
                                        {order.address?.address},<br />
                                        {order.address?.city}
                                    </div>
                                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "10px" }}>Phone: {order.customer?.phone}</div>
                                </td>
                                <td width="4%"></td>
                                <td width="48%" style={{ verticalAlign: "top", paddingLeft: "20px" }}>
                                    <div style={{ fontSize: "10px", fontWeight: "800", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Fulfilled By</div>
                                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a", marginBottom: "6px" }}>{order.seller?.shopName || 'Partner Merchant'}</div>
                                    <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.6" }}>
                                        {settings?.address || 'Inventory Fulfillment Center'}
                                    </div>
                                    <div style={{ fontSize: "11px", color: "#0C831F", marginTop: "10px", fontWeight: "700" }}>{settings?.taxId ? `GSTIN: ${settings.taxId}` : 'Tax Verified Partner'}</div>
                                </td>
                            </tr>
                        </table>

                        <table width="100%" cellPadding="12" cellSpacing="0" style={{ borderCollapse: "collapse", marginBottom: "40px" }}>
                            <thead>
                                <tr style={{ backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
                                    <th align="left" style={{ fontSize: "11px", fontWeight: "800", color: "#475569", textTransform: "uppercase" }}>Item Description</th>
                                    <th align="center" style={{ fontSize: "11px", fontWeight: "800", color: "#475569", textTransform: "uppercase" }}>Unit Price</th>
                                    <th align="center" style={{ fontSize: "11px", fontWeight: "800", color: "#475569", textTransform: "uppercase" }}>Qty</th>
                                    <th align="right" style={{ fontSize: "11px", fontWeight: "800", color: "#475569", textTransform: "uppercase" }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.items?.map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                        <td style={{ fontSize: "13px", fontWeight: "600", color: "#0f172a" }}>{item.name}</td>
                                        <td align="center" style={{ fontSize: "12px", color: "#475569" }}>₹{item.price}</td>
                                        <td align="center" style={{ fontSize: "12px", fontWeight: "700" }}>{item.quantity}</td>
                                        <td align="right" style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>₹{item.price * item.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "40px" }}>
                            <tr>
                                <td width="55%"></td>
                                <td width="45%">
                                    <table width="100%" cellPadding="6" cellSpacing="0">
                                        <tr>
                                            <td style={{ fontSize: "12px", color: "#64748b" }}>Subtotal:</td>
                                            <td align="right" style={{ fontSize: "13px", fontWeight: "600" }}>₹{order.pricing?.subtotal || 0}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ fontSize: "12px", color: "#64748b" }}>Delivery Fee:</td>
                                            <td align="right" style={{ fontSize: "13px", fontWeight: "600", color: "#0C831F" }}>+₹{order.pricing?.deliveryFee || 0}</td>
                                        </tr>
                                        <tr>
                                            <td colSpan="2"><div style={{ height: "1px", backgroundColor: "#e2e8f0", margin: "8px 0" }} /></td>
                                        </tr>
                                        <tr>
                                            <td style={{ fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>Grand Total:</td>
                                            <td align="right" style={{ fontSize: "20px", fontWeight: "800", color: "#0C831F" }}>₹{order.pricing?.total || 0}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "30px", textAlign: "center", fontSize: "11px", color: "#94a3b8" }}>
                            Thank you for shopping with us! For inquiries, contact support.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderDetail;
