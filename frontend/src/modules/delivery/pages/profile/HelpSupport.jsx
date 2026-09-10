import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MessageCircle,
  PlusCircle,
  X,
  Send,
  AlertTriangle,
  IndianRupee,
  Truck,
  CreditCard,
  Car,
  IdCard,
  ShieldAlert,
  Smartphone,
  MoreHorizontal,
  Clock,
  CheckCircle2,
} from "lucide-react";
import Card from "@/shared/components/ui/Card";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { deliveryApi } from "../../services/deliveryApi";

const COMPLAINT_CATEGORIES = [
  { id: "earnings", label: "Earnings / Payout", icon: IndianRupee, subject: "Earnings issue" },
  { id: "delivery", label: "Order delivery", icon: Truck, subject: "Order delivery issue" },
  { id: "payment", label: "Payment / COD", icon: CreditCard, subject: "Payment issue" },
  { id: "vehicle", label: "Vehicle issue", icon: Car, subject: "Vehicle issue" },
  { id: "account", label: "Account / Documents", icon: IdCard, subject: "Account issue" },
  { id: "safety", label: "Safety", icon: ShieldAlert, subject: "Safety concern" },
  { id: "app", label: "App / technical", icon: Smartphone, subject: "App issue" },
  { id: "other", label: "Something else", icon: MoreHorizontal, subject: "General complaint" },
];

const statusTone = (status) => {
  if (status === "closed") return "bg-slate-100 text-slate-600";
  if (status === "processing") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
};

const HelpSupport = () => {
  const navigate = useNavigate();

  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [myTickets, setMyTickets] = useState([]);
  const [ticketData, setTicketData] = useState({
    subject: "",
    description: "",
    priority: "medium",
    category: "other",
    relatedOrderId: "",
  });

  const fetchMyTickets = useCallback(async () => {
    try {
      setTicketsLoading(true);
      const res = await deliveryApi.getMyTickets();
      const list = res.data?.result || res.data?.results || [];
      setMyTickets(Array.isArray(list) ? list : []);
    } catch {
      setMyTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyTickets();
  }, [fetchMyTickets]);

  const openComplaint = (categoryId = "other") => {
    const cat = COMPLAINT_CATEGORIES.find((c) => c.id === categoryId) || COMPLAINT_CATEGORIES[COMPLAINT_CATEGORIES.length - 1];
    setTicketData({
      subject: cat.subject,
      description: "",
      priority: categoryId === "safety" || categoryId === "payment" ? "high" : "medium",
      category: cat.id,
      relatedOrderId: "",
    });
    setIsTicketModalOpen(true);
  };

  const handleTicketSubmit = async (e) => {
    e.preventDefault();
    try {
      setTicketLoading(true);
      const res = await deliveryApi.createTicket(ticketData);
      if (res.data.success) {
        const ticket = res.data.result;
        toast.success("Complaint sent to admin. We will respond soon.");
        setIsTicketModalOpen(false);
        setTicketData({ subject: "", description: "", priority: "medium", category: "other", relatedOrderId: "" });
        await fetchMyTickets();
        if (ticket?._id) {
          navigate(`/delivery/profile/help-support/chat?ticketId=${ticket._id}`);
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to submit complaint");
    } finally {
      setTicketLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Help & Support</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Primary complaint CTA */}
        <button
          type="button"
          onClick={() => openComplaint("other")}
          className="w-full text-left rounded-2xl p-5 text-white shadow-lg relative overflow-hidden"
          style={{ background: "linear-gradient(to bottom right, var(--brand-900), var(--brand-600))" }}
        >
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-white/75">Raise a complaint</p>
              <p className="text-lg font-black mt-1">Tell admin what went wrong</p>
              <p className="text-xs text-white/80 mt-1 font-medium">
                Earnings, order, vehicle, safety — anything. Admin will reply.
              </p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <AlertTriangle size={22} />
            </div>
          </div>
        </button>

        {/* Quick categories */}
        <section>
          <h2 className="text-sm font-semibold text-gray-800 mb-3 px-1">Complaint type</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {COMPLAINT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => openComplaint(cat.id)}
                className="bg-white p-3 rounded-xl border border-gray-200 flex flex-col items-center text-center gap-2 hover:border-primary/40 hover:bg-gray-50 transition-colors"
              >
                <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                  <cat.icon size={18} />
                </div>
                <span className="text-[11px] font-bold text-gray-800 leading-tight">{cat.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* New complaint */}
        <section>
          <Card className="p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => openComplaint("other")}>
            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 mb-3">
              <PlusCircle size={24} />
            </div>
            <h4 className="font-bold text-gray-800">New Complaint</h4>
            <p className="text-xs text-gray-500 mt-1">Write details</p>
          </Card>
        </section>

        {/* My complaints */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-semibold text-gray-800">My complaints</h2>
            <button
              type="button"
              onClick={fetchMyTickets}
              className="text-[10px] font-bold uppercase tracking-wider text-primary"
            >
              Refresh
            </button>
          </div>
          {ticketsLoading ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-400">
              Loading…
            </div>
          ) : myTickets.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-2">
              <p className="text-sm font-bold text-gray-700">No complaints yet</p>
              <p className="text-xs text-gray-500">When you raise one, it appears here and admin can reply.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {myTickets.map((ticket) => (
                <button
                  key={ticket._id}
                  type="button"
                  onClick={() => navigate(`/delivery/profile/help-support/chat?ticketId=${ticket._id}`)}
                  className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 hover:border-gray-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{ticket.subject}</p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ticket.description}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {ticket.category && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
                            {ticket.category}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                          <Clock size={11} />
                          {ticket.createdAt
                            ? new Date(ticket.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                            : ""}
                        </span>
                      </div>
                    </div>
                    <span className={cn("text-[10px] font-black uppercase px-2 py-1 rounded-full shrink-0", statusTone(ticket.status))}>
                      {ticket.status === "processing" ? "In progress" : ticket.status}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-primary mt-3 flex items-center gap-1">
                    <MessageCircle size={12} /> Open chat with admin
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Complaint modal */}
      <AnimatePresence>
        {isTicketModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTicketModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl overflow-hidden z-10 max-h-[92vh] overflow-y-auto"
            >
              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-black text-gray-800">Raise a complaint</h2>
                    <p className="text-sm text-gray-500 font-medium">Admin will see this and can reply</p>
                  </div>
                  <button
                    onClick={() => setIsTicketModalOpen(false)}
                    className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleTicketSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Category</label>
                    <div className="flex flex-wrap gap-2">
                      {COMPLAINT_CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() =>
                            setTicketData((prev) => ({
                              ...prev,
                              category: cat.id,
                              subject: prev.subject?.trim() ? prev.subject : cat.subject,
                            }))
                          }
                          className={cn(
                            "px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors",
                            ticketData.category === cat.id
                              ? "bg-primary text-white border-primary"
                              : "bg-white text-gray-600 border-gray-200",
                          )}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Subject</label>
                    <input
                      type="text"
                      required
                      value={ticketData.subject}
                      onChange={(e) => setTicketData({ ...ticketData, subject: e.target.value })}
                      placeholder="Short summary of your complaint"
                      className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold outline-none ring-1 ring-transparent focus:ring-primary/20 transition-all"
                    />
                  </div>

                  {(ticketData.category === "delivery" || ticketData.category === "payment") && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
                        Order ID (optional)
                      </label>
                      <input
                        type="text"
                        value={ticketData.relatedOrderId}
                        onChange={(e) => setTicketData({ ...ticketData, relatedOrderId: e.target.value })}
                        placeholder="e.g. ORD-123456"
                        className="w-full bg-gray-50 border-none rounded-2xl px-5 py-3.5 text-sm font-bold outline-none ring-1 ring-transparent focus:ring-primary/20 transition-all"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    {["low", "medium", "high"].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setTicketData({ ...ticketData, priority: p })}
                        className={cn(
                          "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                          ticketData.priority === p
                            ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-brand-100"
                            : "bg-white text-gray-400 border-gray-100 hover:bg-gray-50",
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">What happened?</label>
                    <textarea
                      required
                      value={ticketData.description}
                      onChange={(e) => setTicketData({ ...ticketData, description: e.target.value })}
                      placeholder="Explain your complaint clearly. Include order ID if useful."
                      className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold min-h-[140px] outline-none ring-1 ring-transparent focus:ring-primary/20 transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={ticketLoading}
                    className="w-full h-14 bg-primary hover:bg-[#0b721b] text-white text-base font-black rounded-2xl shadow-xl shadow-brand-100 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {ticketLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        SUBMITTING...
                      </>
                    ) : (
                      <>
                        <Send size={18} /> SUBMIT TO ADMIN
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-center text-gray-400 font-medium flex items-center justify-center gap-1">
                    <CheckCircle2 size={12} /> Admin will reply from the Support Desk
                  </p>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HelpSupport;
