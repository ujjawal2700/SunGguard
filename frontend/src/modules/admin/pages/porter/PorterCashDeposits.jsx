import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Banknote,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCw,
  ImageIcon,
  AlertTriangle,
  Package,
  X,
  Smartphone,
  Landmark,
  Upload,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import Card from "@shared/components/ui/Card";
import axiosInstance from "@core/api/axios";
import { adminPorterApi } from "../../services/api/porterApi";
import { cn } from "@/lib/utils";

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_PATTERN = /^[\w.\-]{2,60}@[a-zA-Z]{2,20}$/;

const emptyPayoutForm = {
  upiId: "",
  qrImageUrl: "",
  bankAccountHolder: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankName: "",
};

/**
 * Rider COD cash: what the fleet is still holding, and the deposits waiting
 * on a decision.
 *
 * Approving here is the ONLY thing in the system that moves parcel COD
 * bookings to REMITTED_TO_ADMIN. Before this existed, cash collected at a
 * pickup had no path back — riders held it on the books indefinitely, and the
 * old admin cash screen could not see parcel cash at all. Rejecting leaves
 * every booking held, so the rider can raise a corrected request.
 */

const rupees = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const TABS = [
  { key: "PENDING", label: "Awaiting Review" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_STYLE = {
  PENDING: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  APPROVED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  REJECTED: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400",
};

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const PorterCashDeposits = () => {
  const [holdings, setHoldings] = useState(null);
  const [deposits, setDeposits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("PENDING");
  const [page, setPage] = useState(1);

  const [review, setReview] = useState(null); // { deposit, approve }
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [proofPreview, setProofPreview] = useState("");

  // Where riders should send deposits. Editable here; the rider app reads
  // this same value (read-only) on its deposit form.
  const [payoutEditing, setPayoutEditing] = useState(false);
  const [payoutForm, setPayoutForm] = useState(emptyPayoutForm);
  const [payoutSaved, setPayoutSaved] = useState(emptyPayoutForm);
  const [payoutLoading, setPayoutLoading] = useState(true);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const qrInputRef = useRef(null);

  /**
   * Holdings barely change between tab switches, so it is fetched with the
   * list only on an explicit refresh or a decision — not on every paging tap.
   */
  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminPorterApi.getCashDeposits({ status: tab, page, limit: 20 });
      if (res.data.success) setDeposits(res.data.result);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Couldn't load deposits");
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  const fetchHoldings = useCallback(async () => {
    try {
      const res = await adminPorterApi.getCashHoldings();
      if (res.data.success) setHoldings(res.data.result);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Couldn't load cash holdings");
    }
  }, []);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  const fetchPayout = useCallback(async () => {
    setPayoutLoading(true);
    try {
      const res = await adminPorterApi.getCashPayoutDestination();
      const data = { ...emptyPayoutForm, ...(res.data?.result || {}) };
      setPayoutSaved(data);
      setPayoutForm(data);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Couldn't load deposit destination");
    } finally {
      setPayoutLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayout();
  }, [fetchPayout]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchDeposits(), fetchHoldings(), fetchPayout()]);
    setRefreshing(false);
  };

  const handleQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image of the QR");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setQrUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axiosInstance.post("/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url = res.data?.result?.url || res.data?.result?.secureUrl || "";
      if (!url) throw new Error("Upload did not return a URL");
      setPayoutForm((prev) => ({ ...prev, qrImageUrl: url }));
      toast.success("QR uploaded — remember to save");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not upload the QR image");
    } finally {
      setQrUploading(false);
      if (qrInputRef.current) qrInputRef.current.value = "";
    }
  };

  const handleSavePayout = async () => {
    const upi = payoutForm.upiId.trim();
    if (upi && !UPI_PATTERN.test(upi)) {
      toast.error("Enter a valid UPI ID (e.g. admin@bank)");
      return;
    }
    const accountDigits = payoutForm.bankAccountNumber.replace(/\s/g, "");
    if (accountDigits && !/^\d{9,18}$/.test(accountDigits)) {
      toast.error("Account number must be 9 to 18 digits");
      return;
    }
    const ifsc = payoutForm.bankIfsc.trim().toUpperCase();
    if (ifsc && !IFSC_PATTERN.test(ifsc)) {
      toast.error("Enter a valid IFSC code (e.g. HDFC0001234)");
      return;
    }
    if (accountDigits && (!ifsc || !payoutForm.bankAccountHolder.trim())) {
      toast.error("A bank account needs the holder name and IFSC too");
      return;
    }
    if (!upi && !payoutForm.qrImageUrl && !accountDigits) {
      toast.error("Add at least a UPI ID, a QR, or a bank account");
      return;
    }

    setPayoutSaving(true);
    try {
      const payload = {
        upiId: upi,
        qrImageUrl: payoutForm.qrImageUrl.trim(),
        bankAccountHolder: payoutForm.bankAccountHolder.trim(),
        bankAccountNumber: accountDigits,
        bankIfsc: ifsc,
        bankName: payoutForm.bankName.trim(),
      };
      const res = await adminPorterApi.updateCashPayoutDestination(payload);
      const saved = { ...emptyPayoutForm, ...(res.data?.result || payload) };
      setPayoutSaved(saved);
      setPayoutForm(saved);
      setPayoutEditing(false);
      toast.success("Deposit destination updated — riders will see this now");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not save the deposit destination");
    } finally {
      setPayoutSaving(false);
    }
  };

  const hasPayoutConfigured = Boolean(
    payoutSaved.upiId ||
      payoutSaved.qrImageUrl ||
      (payoutSaved.bankAccountNumber && payoutSaved.bankIfsc),
  );

  const handleReview = async () => {
    if (!review) return;
    // A rejection without a reason leaves the rider with nothing to correct.
    if (!review.approve && !adminNote.trim()) {
      toast.error("Tell the rider why this was rejected");
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminPorterApi.reviewCashDeposit(review.deposit.id, {
        approve: review.approve,
        adminNote: adminNote.trim(),
      });
      const result = res.data?.result || {};
      toast.success(
        review.approve
          ? `Cleared ${rupees(review.deposit.amount)} across ${
              (result.parcelsRemitted || 0) + (result.cityParcelsRemitted || 0)
            } bookings`
          : "Deposit rejected",
      );
      setReview(null);
      setAdminNote("");
      await Promise.all([fetchDeposits(), fetchHoldings()]);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not record the decision");
    } finally {
      setSubmitting(false);
    }
  };

  const pending = deposits?.pending || { amount: 0, count: 0 };

  const stats = [
    {
      label: "Cash With Riders",
      value: rupees(holdings?.totalHeld),
      icon: Banknote,
      tint: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-900",
      note: `${holdings?.items?.length || 0} riders holding collected cash`,
    },
    {
      label: "Awaiting Review",
      value: rupees(pending.amount),
      icon: Clock,
      tint: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-900",
      note: `${pending.count} deposit${pending.count === 1 ? "" : "s"} to check`,
    },
    {
      label: "Riders Holding",
      value: String(holdings?.items?.length || 0),
      icon: Users,
      tint: "bg-slate-500/10 text-slate-600 border-slate-200 dark:border-slate-700",
      note: "Cash not yet deposited",
    },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Rider Cash Deposits
            </h1>
            <span className="rounded-md bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
              Porter Ops
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            COD cash riders collected at pickup. Approving a deposit is what clears those bookings.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 self-start rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90"
        >
          <RotateCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} className={cn("border", stat.tint.split(" ").slice(-2).join(" "))}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {stat.label}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                  {stat.value}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{stat.note}</p>
              </div>
              <span className={cn("rounded-xl p-2.5", stat.tint)}>
                <stat.icon className="h-5 w-5" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Where riders send this cash. This drives what the rider app shows on
          its own deposit form — without it, a rider has no destination on
          screen and has to be told out-of-band where to transfer. */}
      <Card className="overflow-hidden" contentClassName="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Deposit destination
            </h2>
            <p className="text-[11px] text-slate-400">
              What riders see on their deposit screen. Update this if it ever changes.
            </p>
          </div>
          {!payoutEditing && (
            <button
              onClick={() => {
                setPayoutForm(payoutSaved);
                setPayoutEditing(true);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            >
              <Pencil className="h-3.5 w-3.5" />
              {hasPayoutConfigured ? "Edit" : "Set up"}
            </button>
          )}
        </div>

        {payoutLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !payoutEditing ? (
          <div className="p-4">
            {!hasPayoutConfigured ? (
              <p className="flex items-center gap-2 text-xs font-semibold text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Nothing set — riders can't see where to send cash yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {payoutSaved.upiId && (
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">UPI</p>
                      <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        {payoutSaved.upiId}
                      </p>
                    </div>
                  </div>
                )}
                {payoutSaved.qrImageUrl && (
                  <div className="flex items-center gap-2">
                    <img
                      src={payoutSaved.qrImageUrl}
                      alt="Payment QR"
                      className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover"
                    />
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">QR</p>
                      <a
                        href={payoutSaved.qrImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        View
                      </a>
                    </div>
                  </div>
                )}
                {payoutSaved.bankAccountNumber && (
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Bank</p>
                      <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        {payoutSaved.bankAccountNumber}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {payoutSaved.bankIfsc}
                        {payoutSaved.bankName ? ` · ${payoutSaved.bankName}` : ""}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">
                  UPI ID
                </label>
                <input
                  value={payoutForm.upiId}
                  onChange={(e) =>
                    setPayoutForm((prev) => ({ ...prev, upiId: e.target.value }))
                  }
                  placeholder="admin@okhdfc"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">
                  Payment QR
                </label>
                {payoutForm.qrImageUrl ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={payoutForm.qrImageUrl}
                      alt="QR"
                      className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPayoutForm((prev) => ({ ...prev, qrImageUrl: "" }))}
                      className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                      aria-label="Remove QR"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={qrUploading}
                    onClick={() => qrInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {qrUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {qrUploading ? "Uploading…" : "Upload QR image"}
                  </button>
                )}
                <input
                  ref={qrInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleQrUpload}
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">
                  Account holder
                </label>
                <input
                  value={payoutForm.bankAccountHolder}
                  onChange={(e) =>
                    setPayoutForm((prev) => ({ ...prev, bankAccountHolder: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">
                  Bank name
                </label>
                <input
                  value={payoutForm.bankName}
                  onChange={(e) =>
                    setPayoutForm((prev) => ({ ...prev, bankName: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">
                  Account number
                </label>
                <input
                  value={payoutForm.bankAccountNumber}
                  onChange={(e) =>
                    setPayoutForm((prev) => ({ ...prev, bankAccountNumber: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">
                  IFSC
                </label>
                <input
                  value={payoutForm.bankIfsc}
                  onChange={(e) =>
                    setPayoutForm((prev) => ({
                      ...prev,
                      bankIfsc: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="HDFC0001234"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                disabled={payoutSaving}
                onClick={() => {
                  setPayoutForm(payoutSaved);
                  setPayoutEditing(false);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-50 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={payoutSaving || qrUploading}
                onClick={handleSavePayout}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {payoutSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Deposit queue */}
        <Card className="overflow-hidden lg:col-span-2" contentClassName="p-0">
          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 p-4 dark:border-slate-800">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setPage(1);
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  tab === t.key
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex h-52 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : (deposits?.items || []).length === 0 ? (
            <p className="py-16 text-center text-xs font-semibold text-slate-400">
              {tab === "PENDING" ? "Nothing to review — the fleet is settled up" : "No deposits here"}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {deposits.items.map((row) => (
                <div key={row.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {rupees(row.amount)}
                        <span className="ml-2 text-xs font-semibold text-slate-500">
                          {row.rider}
                        </span>
                      </p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {row.riderPhone || "—"} · {row.method?.replace("_", " ")} ·{" "}
                        {formatDate(row.createdAt)}
                      </p>
                      {row.reference && (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                          Ref: {row.reference}
                        </p>
                      )}
                      {row.note && (
                        <p className="mt-1 text-[11px] text-slate-500">“{row.note}”</p>
                      )}
                    </div>

                    <span
                      className={cn(
                        "rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase",
                        STATUS_STYLE[row.status],
                      )}
                    >
                      {row.status}
                    </span>
                  </div>

                  {/* Which bookings this deposit clears */}
                  {row.items?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {row.items.map((item) => (
                        <span
                          key={item.refId}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          <Package className="h-3 w-3" />
                          {item.label} · {rupees(item.amount)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {row.proofImageUrl ? (
                      <button
                        onClick={() => setProofPreview(row.proofImageUrl)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        View proof
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        No proof attached
                      </span>
                    )}

                    {row.status === "PENDING" && (
                      <>
                        <button
                          onClick={() => {
                            setReview({ deposit: row, approve: true });
                            setAdminNote("");
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-500 hover:text-white dark:bg-emerald-950/40 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setReview({ deposit: row, approve: false });
                            setAdminNote("");
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-500 hover:text-white dark:bg-rose-950/40 dark:text-rose-400"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </>
                    )}

                    {row.adminNote && (
                      <span className="text-[11px] text-slate-500">Note: {row.adminNote}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {deposits?.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-800">
              <p className="text-xs text-slate-500">
                Page {deposits.page} of {deposits.totalPages} · {deposits.total} deposits
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700"
                >
                  Previous
                </button>
                <button
                  disabled={page >= deposits.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Who is holding what */}
        <Card className="overflow-hidden" contentClassName="p-0">
          <div className="border-b border-slate-100 p-4 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Cash with riders</h2>
            <p className="text-[11px] text-slate-400">
              Collected but not yet deposited, highest first.
            </p>
          </div>

          {(holdings?.items || []).length === 0 ? (
            <p className="py-14 text-center text-xs font-semibold text-slate-400">
              No rider is holding cash.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {holdings.items.map((rider) => (
                <div key={rider.riderId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {rider.name}
                    </p>
                    <p className="font-mono text-[11px] text-slate-400">
                      {rider.phone || "—"} · {rider.heldJobs} job
                      {rider.heldJobs === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-xs font-bold text-slate-900 dark:text-white">
                    {rupees(rider.heldAmount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Decision dialog */}
      {review && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {review.approve ? "Approve this deposit?" : "Reject this deposit?"}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {review.approve
                ? `Confirms you received ${rupees(review.deposit.amount)} from ${
                    review.deposit.rider
                  }. The ${review.deposit.items?.length || 0} booking(s) it covers will be marked remitted.`
                : `${review.deposit.rider} keeps holding ${rupees(
                    review.deposit.amount,
                  )} and can submit a corrected deposit.`}
            </p>

            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={3}
              placeholder={review.approve ? "Note (optional)" : "Reason for rejection"}
              className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                disabled={submitting}
                onClick={() => setReview(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-50 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={submitting}
                onClick={handleReview}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60",
                  review.approve ? "bg-emerald-600" : "bg-rose-600",
                )}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {review.approve ? "Approve & clear" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof viewer */}
      {proofPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setProofPreview("")}
        >
          <div className="relative max-h-full max-w-lg overflow-auto">
            <button
              onClick={() => setProofPreview("")}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={proofPreview} alt="Deposit proof" className="rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
};

export default PorterCashDeposits;
