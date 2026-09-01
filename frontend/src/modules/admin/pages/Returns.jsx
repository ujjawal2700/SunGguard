import React, { useEffect, useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import StatusBadge from "@shared/components/ui/StatusBadge";
import EmptyState from "@shared/components/ui/EmptyState";
import { adminApi } from "../services/adminApi";
import { useToast } from "@shared/components/ui/Toast";
import {
  RotateCcw,
  Inbox,
  Eye,
  Calendar,
  Truck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Package,
  RotateCw,
  X,
  Loader2,
  FileText,
  User,
  Store
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

const Returns = () => {
  const { showToast } = useToast();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("All");
  const [activeQcTab, setActiveQcTab] = useState("QC Requested");
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [actionModal, setActionModal] = useState({ open: false, mode: null });
  const [actionNote, setActionNote] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [assigningPickup, setAssigningPickup] = useState(false);

  const tabs = [
    "All",
    "Requested",
    "Approved",
    "Rejected",
    "Pickup Assigned",
    "In Transit",
    "Quality Check",
    "Completed",
  ];

  const qcTabs = ["QC Requested", "QC Passed", "QC Failed"];

  const mapReturnStatusLabel = (status) => {
    switch (status) {
      case "return_requested":
        return "Requested";
      case "return_approved":
        return "Approved";
      case "return_rejected":
        return "Rejected";
      case "return_pickup_assigned":
        return "Pickup Assigned";
      case "return_in_transit":
      case "return_drop_pending":
        return "In Transit";
      case "returned":
        return "QC Requested";
      case "qc_passed":
        return "QC Passed";
      case "qc_failed":
        return "QC Failed";
      case "refund_completed":
        return "Completed";
      default:
        return status || "Unknown";
    }
  };

  const fetchReturns = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      if (!isManual) setLoading(true);
      const res = await adminApi.getReturns();
      const payload = res.data.result || {};
      const items = Array.isArray(payload.items)
        ? payload.items
        : res.data.results || [];
      setReturns(items || []);
    } catch (error) {
      console.error("Failed to fetch returns", error);
      showToast("Failed to fetch return requests", "error");
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  const filteredReturns = useMemo(() => {
    if (activeTab === "All") return returns;
    return returns.filter((r) => {
      const label = mapReturnStatusLabel(r.returnStatus);
      if (activeTab === "Quality Check") {
        return label === activeQcTab;
      }
      return label === activeTab;
    });
  }, [returns, activeTab, activeQcTab]);

  const openDetails = (ret) => {
    setSelectedReturn(ret);
    setIsDetailsOpen(true);
  };

  const handleApprove = async (orderId) => {
    try {
      await adminApi.approveReturn(orderId, {});
      showToast("Return approved", "success");
      await fetchReturns();
      setIsDetailsOpen(false);
    } catch (error) {
      console.error("Failed to approve return", error);
      showToast(
        error.response?.data?.message || "Failed to approve return",
        "error",
      );
    }
  };

  const handleReject = async () => {
    if (!actionNote.trim() || !selectedReturn) return;
    try {
      setSubmittingAction(true);
      await adminApi.rejectReturn(selectedReturn.orderId, { reason: actionNote });
      showToast("Return rejected", "success");
      setActionModal({ open: false, mode: null });
      setActionNote("");
      setIsDetailsOpen(false);
      await fetchReturns();
    } catch (error) {
      console.error("Failed to reject return", error);
      showToast(
        error.response?.data?.message || "Failed to reject return",
        "error",
      );
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAssignPickup = async (orderId) => {
    try {
      setAssigningPickup(true);
      await adminApi.assignReturnDelivery(orderId, {});
      showToast("Riders notified for return pickup", "success");
      setIsDetailsOpen(false);
      await fetchReturns();
    } catch (error) {
      console.error("Failed to assign pickup", error);
      showToast(
        error.response?.data?.message || "No nearby riders found or assignment failed",
        "error",
      );
    } finally {
      setAssigningPickup(false);
    }
  };

  const handleQcPass = async (orderId) => {
    try {
      await adminApi.updateReturnQc(orderId, { qcStatus: "qc_passed" });
      showToast("QC passed. Refund processed.", "success");
      setIsDetailsOpen(false);
      await fetchReturns();
    } catch (error) {
      console.error("Failed to complete QC", error);
      showToast(
        error.response?.data?.message || "Failed to complete QC",
        "error",
      );
    }
  };

  const handleQcFail = async () => {
    if (!actionNote.trim() || !selectedReturn) return;
    try {
      setSubmittingAction(true);
      await adminApi.updateReturnQc(selectedReturn.orderId, {
        qcStatus: "qc_failed",
        note: actionNote,
      });
      showToast("QC failed recorded", "success");
      setActionModal({ open: false, mode: null });
      setActionNote("");
      setIsDetailsOpen(false);
      await fetchReturns();
    } catch (error) {
      console.error("Failed to record QC fail", error);
      showToast(
        error.response?.data?.message || "Failed to record QC fail",
        "error",
      );
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        title="Return Requests"
        description="Review customer return requests, trigger pickups, verify QC, and process refunds."
        icon={RotateCcw}
        badge={
          <Badge variant="primary">
            {returns.length} Total
          </Badge>
        }
        actions={
          <button
            onClick={() => fetchReturns(true)}
            className="ds-btn ds-btn-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-sm"
          >
            <RotateCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Requested", icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800" },
          { label: "Approved", icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800" },
          { label: "QC Requested", icon: Inbox, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800" },
          { label: "Completed", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800" },
        ].map((card) => {
          const count = returns.filter(
            (r) => mapReturnStatusLabel(r.returnStatus) === card.label,
          ).length;
          return (
            <StatCard
              key={card.label}
              label={card.label}
              value={count}
              icon={card.icon}
              color={card.color}
              bg={card.bg}
              description={`Items currently in ${card.label.toLowerCase()}`}
            />
          );
        })}
      </div>

      {/* Tabbed Returns Container */}
      <Card className="p-0 overflow-hidden">
        {/* Main Tab Bar */}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 overflow-x-auto">
          <div className="flex px-4 md:px-6 items-center min-w-max gap-1">
            {tabs.map((tab) => {
              const tabCount = tab === 'All' ? returns.length : returns.filter(r => mapReturnStatusLabel(r.returnStatus) === tab).length;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "relative py-3.5 px-3.5 text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5",
                    activeTab === tab
                      ? "text-primary font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <span>{tab}</span>
                  {tabCount > 0 && (
                    <span className={cn(
                      "px-1.5 py-0.2 rounded-full text-[10px] font-mono",
                      activeTab === tab ? "bg-primary text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    )}>
                      {tabCount}
                    </span>
                  )}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="returns-tab-active-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quality Check Sub-tabs if active */}
        {activeTab === "Quality Check" && (
          <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 px-6 py-2 flex items-center gap-2">
            {qcTabs.map((tab) => (
              <button
                key={`qc-${tab}`}
                onClick={() => setActiveQcTab(tab)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                  activeQcTab === tab
                    ? "bg-primary/10 text-primary"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* Return Items List */}
        <div className="p-4 md:p-6">
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Loading Return Requests...</p>
            </div>
          ) : filteredReturns.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No Return Requests Found"
              description={`There are currently no return requests under '${activeTab}'.`}
            />
          ) : (
            <div className="space-y-3">
              {filteredReturns.map((ret) => (
                <div
                  key={ret._id}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 md:p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                  onClick={() => openDetails(ret)}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white font-mono hover:text-primary transition-colors">
                        Order #{ret.orderId}
                      </span>
                      <StatusBadge status={ret.returnStatus} />
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{ret.customer?.name || "Customer"}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {ret.returnRequestedAt
                          ? new Date(ret.returnRequestedAt).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "N/A"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 italic">
                      Reason: "{ret.returnReason || "No reason provided"}"
                    </p>

                    {/* Driver Tag */}
                    {(ret.returnStatus === "return_in_transit" || ret.returnStatus === "return_pickup_assigned") && ret.returnDeliveryBoy && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                        <Truck className="h-3 w-3" />
                        <span>Rider: {ret.returnDeliveryBoy.name}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center md:flex-col items-end justify-between md:justify-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-800">
                    <div className="text-right">
                      <span className="text-xs text-slate-400 uppercase tracking-wider block font-semibold text-[10px]">Refund Value</span>
                      <span className="text-sm md:text-base font-bold text-slate-900 dark:text-white font-mono">
                        ₹{Number(ret.returnRefundAmount || ret.pricing?.subtotal || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetails(ret);
                      }}
                      className="ds-btn ds-btn-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-primary hover:text-white"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Review</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Return Details Review Modal */}
      <AnimatePresence>
        {isDetailsOpen && selectedReturn && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsDetailsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-2xl relative z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Return Request: #{selectedReturn.orderId}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={selectedReturn.returnStatus} />
                    <span className="text-xs text-slate-400">
                      Amount: ₹{selectedReturn.returnRefundAmount || selectedReturn.pricing?.subtotal || 0}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsDetailsOpen(false)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                  <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Customer & Reason</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedReturn.customer?.name || "Customer"}</p>
                  <p className="text-slate-500">{selectedReturn.customer?.phone}</p>
                  <p className="text-slate-700 dark:text-slate-300 italic pt-1">"{selectedReturn.returnReason || "No details"}"</p>
                </div>

                {/* Return Items */}
                <div>
                  <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-2">Returned Items</p>
                  <div className="space-y-2">
                    {selectedReturn.items?.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Package className="h-4 w-4 text-slate-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">Qty: {item.quantity}</p>
                          </div>
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white font-mono">₹{item.price * item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Photos if any */}
                {selectedReturn.returnPhotos?.length > 0 && (
                  <div>
                    <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-2">Proof Photos</p>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedReturn.returnPhotos.map((photo, i) => (
                        <div key={i} className="h-24 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                          <img src={photo} alt="Proof" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons Footer */}
              <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                {selectedReturn.returnStatus === "return_requested" && (
                  <>
                    <button
                      onClick={() => setActionModal({ open: true, mode: "reject" })}
                      className="ds-btn ds-btn-sm bg-white dark:bg-slate-900 border border-rose-200 text-rose-600 hover:bg-rose-50"
                    >
                      Reject Return
                    </button>
                    <button
                      onClick={() => handleApprove(selectedReturn.orderId)}
                      className="ds-btn ds-btn-sm bg-primary text-white hover:bg-primary/90"
                    >
                      Approve Return
                    </button>
                  </>
                )}

                {selectedReturn.returnStatus === "return_approved" && (
                  <button
                    onClick={() => handleAssignPickup(selectedReturn.orderId)}
                    disabled={assigningPickup}
                    className="ds-btn ds-btn-sm bg-primary text-white"
                  >
                    {assigningPickup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                    <span>Assign Return Pickup Rider</span>
                  </button>
                )}

                {selectedReturn.returnStatus === "returned" && (
                  <>
                    <button
                      onClick={() => setActionModal({ open: true, mode: "qc_fail" })}
                      className="ds-btn ds-btn-sm bg-white dark:bg-slate-900 border border-rose-200 text-rose-600 hover:bg-rose-50"
                    >
                      QC Failed
                    </button>
                    <button
                      onClick={() => handleQcPass(selectedReturn.orderId)}
                      className="ds-btn ds-btn-sm bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      QC Passed → Process Refund
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reject / QC Fail Note Modal */}
      <AnimatePresence>
        {actionModal.open && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setActionModal({ open: false, mode: null })}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md relative z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {actionModal.mode === "reject" ? "Reject Return Request" : "Record QC Failure"}
              </h3>
              <p className="text-xs text-slate-500">
                Please provide a mandatory reason explaining why this return or QC is rejected.
              </p>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="Type explanation / failure reason here..."
                className="ds-textarea w-full"
                rows={3}
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setActionModal({ open: false, mode: null })}
                  className="ds-btn ds-btn-sm bg-white dark:bg-slate-900 border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={actionModal.mode === "reject" ? handleReject : handleQcFail}
                  disabled={submittingAction || !actionNote.trim()}
                  className="ds-btn ds-btn-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {submittingAction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm Rejection"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Returns;
