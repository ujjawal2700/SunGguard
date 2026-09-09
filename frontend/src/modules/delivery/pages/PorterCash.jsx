import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  IndianRupee,
  RotateCw,
  Upload,
  Loader2,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
  Smartphone,
  Landmark,
  Banknote,
  MoreHorizontal,
  Copy,
  QrCode,
} from "lucide-react";
import { toast } from "sonner";
import Card from "@/shared/components/ui/Card";
import Button from "@/shared/components/ui/Button";
import axiosInstance from "@core/api/axios";
import { deliveryApi } from "../services/deliveryApi";
import { cn } from "@/lib/utils";

/**
 * Parcel COD cash the rider is physically holding, and handing it back.
 *
 * Cash collected on a parcel pickup used to have nowhere to go — the booking
 * moved to RIDER_HOLDING and stayed there forever, because the only code that
 * could clear it was a seller-side flow no parcel could reach. This screen is
 * the rider half of the replacement: declare what was paid back, how, with a
 * photo of the proof. An admin reviews it, and only their approval clears the
 * bookings. Nothing here settles itself.
 *
 * Distinct from the older "COD Cash" screen, which is grocery-order cash.
 */

const RUPEE = "₹";

const METHODS = [
  { key: "UPI", label: "UPI", icon: Smartphone, hint: "Paid to the company UPI ID" },
  { key: "BANK_TRANSFER", label: "Bank", icon: Landmark, hint: "NEFT / IMPS transfer" },
  { key: "CASH", label: "Cash", icon: Banknote, hint: "Handed over at the office" },
  { key: "OTHER", label: "Other", icon: MoreHorizontal, hint: "Anything else" },
];

const STATUS_STYLES = {
  PENDING: { icon: Clock, cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Awaiting review" },
  APPROVED: { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Approved" },
  REJECTED: { icon: XCircle, cls: "bg-red-50 text-red-700 border-red-200", label: "Rejected" },
};

const money = (value) => `${RUPEE}${Number(value || 0).toLocaleString("en-IN")}`;

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const PorterCash = () => {
  const navigate = useNavigate();

  const [summary, setSummary] = useState({
    items: [],
    depositableAmount: 0,
    awaitingReviewAmount: 0,
    pendingDepositCount: 0,
    totalHeld: 0,
  });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  // Where admin wants this cash sent — set from the admin Cash Deposits
  // page. Read-only here; this screen only displays it.
  const [payout, setPayout] = useState(null);

  const [selected, setSelected] = useState(() => new Set());
  const [method, setMethod] = useState("UPI");
  const [reference, setReference] = useState("");
  const [proofImageUrl, setProofImageUrl] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  /** Both lists come from one refresh so the totals can never disagree. */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, historyRes, payoutRes] = await Promise.all([
        deliveryApi.getCashSummary(),
        deliveryApi.getCashDeposits({ limit: 20 }),
        deliveryApi.getCashPayoutDestination(),
      ]);

      const nextSummary = summaryRes.data?.result || {};
      setSummary({
        items: Array.isArray(nextSummary.items) ? nextSummary.items : [],
        depositableAmount: Number(nextSummary.depositableAmount || 0),
        awaitingReviewAmount: Number(nextSummary.awaitingReviewAmount || 0),
        pendingDepositCount: Number(nextSummary.pendingDepositCount || 0),
        totalHeld: Number(nextSummary.totalHeld || 0),
      });
      // Selection is rebuilt from what actually came back — a job that was
      // deposited or cancelled since the last load must not stay ticked.
      setSelected(new Set((nextSummary.items || []).map((item) => item.refId)));

      setHistory(historyRes.data?.result?.items || []);
      setPayout(payoutRes.data?.result || null);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Couldn't load your cash summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasPayoutConfigured = Boolean(
    payout &&
      (payout.upiId ||
        payout.qrImageUrl ||
        (payout.bankAccountNumber && payout.bankIfsc)),
  );

  const copyToClipboard = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually");
    }
  };

  const toggle = (refId) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(refId)) next.delete(refId);
      else next.add(refId);
      return next;
    });

  const selectedAmount = useMemo(
    () =>
      summary.items
        .filter((item) => selected.has(item.refId))
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [summary.items, selected],
  );

  const allSelected = summary.items.length > 0 && selected.size === summary.items.length;

  const handleProofUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose a photo or screenshot");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axiosInstance.post("/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url = res.data?.result?.url || res.data?.result?.secureUrl || "";
      if (!url) throw new Error("Upload did not return a URL");
      setProofImageUrl(url);
      toast.success("Proof attached");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not upload the image");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;

    if (!selected.size) {
      toast.error("Pick at least one job to deposit");
      return;
    }
    // Mirrors the server rule, so the rider is told before the round trip.
    if (method !== "CASH" && !reference.trim() && !proofImageUrl) {
      toast.error("Add the transaction reference or a payment screenshot");
      return;
    }

    setSubmitting(true);
    try {
      await deliveryApi.submitCashDeposit({
        method,
        reference: reference.trim(),
        proofImageUrl,
        note: note.trim(),
        items: summary.items
          .filter((item) => selected.has(item.refId))
          .map((item) => ({ refId: item.refId })),
      });
      toast.success("Deposit sent for approval");
      setReference("");
      setProofImageUrl("");
      setNote("");
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not submit the deposit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 pb-28">
      <div className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="flex items-center gap-2 p-4">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 transition-colors hover:bg-gray-100"
            aria-label="Go back"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex-1">
            <h1 className="ds-h3 text-gray-900">Parcel Cash Deposit</h1>
            <p className="text-xs text-gray-500">Cash you collected on parcel pickups</p>
          </div>
          <Button variant="ghost" size="icon" disabled={loading} onClick={load} aria-label="Refresh">
            <RotateCw size={18} className={loading ? "animate-spin text-gray-400" : "text-gray-600"} />
          </Button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg space-y-5 p-4"
      >
        {/* What you're holding */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Cash with you
              </p>
              <p className="mt-1 text-3xl font-extrabold text-gray-900">
                {money(summary.depositableAmount)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                Collected from customers on COD parcels. Deposit it and an admin will verify.
              </p>
            </div>
            <div className="rounded-xl bg-orange-50 p-3 text-orange-600">
              <IndianRupee size={22} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase text-gray-500">Awaiting review</p>
              <p className="text-lg font-bold text-gray-900">
                {money(summary.awaitingReviewAmount)}
              </p>
              <p className="text-[11px] text-gray-500">
                {summary.pendingDepositCount} request
                {summary.pendingDepositCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase text-gray-500">Jobs held</p>
              <p className="text-lg font-bold text-gray-900">{summary.items.length}</p>
              <p className="text-[11px] text-gray-500">not yet deposited</p>
            </div>
          </div>
        </Card>

        {/* Jobs this deposit covers */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Jobs to deposit</h3>
              <p className="text-xs text-gray-500">Untick anything you are not paying back yet.</p>
            </div>
            {summary.items.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    allSelected ? new Set() : new Set(summary.items.map((i) => i.refId)),
                  )
                }
                className="text-xs font-bold text-orange-600"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {summary.items.map((item) => {
              const isOn = selected.has(item.refId);
              return (
                <button
                  key={item.refId}
                  type="button"
                  onClick={() => toggle(item.refId)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors",
                    isOn ? "border-orange-300 bg-orange-50/60" : "border-gray-100 bg-white",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                        isOn ? "border-orange-500 bg-orange-500" : "border-gray-300 bg-white",
                      )}
                    >
                      {isOn && <CheckCircle2 size={14} className="text-white" />}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{item.label}</p>
                      <p className="text-[11px] text-gray-500">
                        Collected {formatDate(item.collectedAt)}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-extrabold text-gray-900">{money(item.amount)}</p>
                </button>
              );
            })}

            {!loading && summary.items.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                No cash pending deposit. Nice.
              </div>
            )}
          </div>
        </Card>

        {/* Where to actually send it */}
        {summary.items.length > 0 && (
          <Card className="p-5">
            <h3 className="font-bold text-gray-900">Send cash to</h3>
            <p className="text-xs text-gray-500">
              Transfer here, then fill in the reference below.
            </p>

            {!hasPayoutConfigured ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Info size={14} className="mt-0.5 shrink-0 text-amber-600" />
                <p className="text-xs font-semibold text-amber-800">
                  Admin hasn't set a deposit destination yet. Check with your admin
                  before transferring, or hand over cash in person.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {payout.upiId && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase text-gray-500">UPI ID</p>
                      <p className="truncate font-mono text-sm font-bold text-gray-900">
                        {payout.upiId}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(payout.upiId, "UPI ID")}
                      className="shrink-0 rounded-lg bg-white p-2 text-gray-500 shadow-sm"
                      aria-label="Copy UPI ID"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                )}

                {payout.qrImageUrl && (
                  <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <img
                      src={payout.qrImageUrl}
                      alt="Admin's payment QR"
                      className="h-16 w-16 shrink-0 rounded-lg border border-gray-200 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase text-gray-500">
                        Scan to pay
                      </p>
                      <a
                        href={payout.qrImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-orange-600"
                      >
                        <QrCode size={12} /> View full size
                      </a>
                    </div>
                  </div>
                )}

                {payout.bankAccountNumber && payout.bankIfsc && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase text-gray-500">
                        Bank transfer
                      </p>
                      <p className="font-mono text-sm font-bold text-gray-900">
                        {payout.bankAccountNumber}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {payout.bankIfsc}
                        {payout.bankName ? ` · ${payout.bankName}` : ""}
                        {payout.bankAccountHolder ? ` · ${payout.bankAccountHolder}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(payout.bankAccountNumber, "Account number")
                      }
                      className="shrink-0 rounded-lg bg-white p-2 text-gray-500 shadow-sm"
                      aria-label="Copy account number"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* How it was paid back */}
        {summary.items.length > 0 && (
          <Card className="p-5">
            <h3 className="font-bold text-gray-900">How did you deposit it?</h3>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {METHODS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMethod(key)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border p-3 transition-colors",
                    method === key
                      ? "border-orange-400 bg-orange-50 text-orange-700"
                      : "border-gray-200 bg-white text-gray-600",
                  )}
                >
                  <Icon size={18} />
                  <span className="text-[11px] font-bold">{label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              {METHODS.find((m) => m.key === method)?.hint}
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-[11px] font-bold uppercase text-gray-500">
                Transaction reference {method === "CASH" && "(optional)"}
              </label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="UTR / transaction ID"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-orange-400"
              />
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-[11px] font-bold uppercase text-gray-500">
                Proof photo {method === "CASH" ? "(receipt)" : "(payment screenshot)"}
              </label>

              {proofImageUrl ? (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
                  <img
                    src={proofImageUrl}
                    alt="Deposit proof"
                    className="h-16 w-16 rounded-lg border border-gray-100 object-cover"
                  />
                  <p className="flex-1 text-xs text-gray-600">Proof attached</p>
                  <button
                    type="button"
                    onClick={() => setProofImageUrl("")}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                    aria-label="Remove proof"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-bold text-gray-600 disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Uploading…
                    </>
                  ) : (
                    <>
                      <Upload size={16} /> Upload proof
                    </>
                  )}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProofUpload}
              />
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-[11px] font-bold uppercase text-gray-500">
                Note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Anything the admin should know"
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-400"
              />
            </div>

            <div className="mt-4 rounded-xl bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-gray-500">Depositing</span>
                <span className="text-xl font-extrabold text-gray-900">
                  {money(selectedAmount)}
                </span>
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting || uploading || !selected.size}
              className="mt-3 w-full"
            >
              {submitting ? "Submitting…" : "Send for approval"}
            </Button>

            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-gray-500">
              <Info size={13} className="mt-px shrink-0" />
              Your cash clears only after an admin verifies this deposit.
            </p>
          </Card>
        )}

        {/* History */}
        <Card className="p-5">
          <h3 className="mb-3 font-bold text-gray-900">Your deposits</h3>

          <div className="space-y-2">
            {history.map((row) => {
              const style = STATUS_STYLES[row.status] || STATUS_STYLES.PENDING;
              const StatusIcon = style.icon;
              return (
                <div key={row.id} className="rounded-xl border border-gray-100 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{money(row.amount)}</p>
                      <p className="text-[11px] text-gray-500">
                        {row.method?.replace("_", " ")} · {formatDate(row.createdAt)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold",
                        style.cls,
                      )}
                    >
                      <StatusIcon size={12} />
                      {style.label}
                    </span>
                  </div>

                  {row.reference && (
                    <p className="mt-1.5 text-[11px] text-gray-500">Ref: {row.reference}</p>
                  )}
                  {row.adminNote && (
                    <p className="mt-1.5 rounded-lg bg-gray-50 p-2 text-[11px] text-gray-600">
                      Admin: {row.adminNote}
                    </p>
                  )}
                </div>
              );
            })}

            {!loading && history.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                No deposits yet.
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

export default PorterCash;
