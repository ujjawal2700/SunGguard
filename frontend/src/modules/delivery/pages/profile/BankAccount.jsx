import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Landmark,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Smartphone,
  QrCode,
  Upload,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import axiosInstance from "@core/api/axios";
import { useAuth } from "@core/context/AuthContext";
import { deliveryApi } from "../../services/deliveryApi";
import { cn } from "@/lib/utils";

/**
 * Where this rider's withdrawals get paid.
 *
 * This screen used to render the same hardcoded "RAHUL KUMAR / HDFC" account
 * to every rider, with a button that did nothing — and the backend had no
 * endpoint to change payout details after signup anyway. It is now the real
 * record: whatever is saved here is exactly what the admin sees attached to
 * the rider's withdrawal request.
 */

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_PATTERN = /^[\w.\-]{2,60}@[a-zA-Z]{2,20}$/;

const emptyForm = {
  accountHolder: "",
  accountNumber: "",
  ifsc: "",
  bankName: "",
  upiId: "",
  qrImageUrl: "",
};

const BankAccount = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    setForm({
      accountHolder: user.accountHolder || "",
      accountNumber: user.accountNumber || "",
      ifsc: user.ifsc || "",
      bankName: user.bankName || "",
      upiId: user.upiId || "",
      qrImageUrl: user.qrImageUrl || "",
    });
  }, [user]);

  const setField = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const hasBank = Boolean(
    form.accountHolder.trim() && form.accountNumber.trim() && form.ifsc.trim(),
  );
  const hasUpi = Boolean(form.upiId.trim());
  const hasQr = Boolean(form.qrImageUrl.trim());
  const hasAnyMethod = hasBank || hasUpi || hasQr;

  const maskedAccount = useMemo(() => {
    const digits = String(form.accountNumber || "").replace(/\s/g, "");
    if (!digits) return "Not added yet";
    return `${"X".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  }, [form.accountNumber]);

  const handleQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image of your QR");
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
      setForm((prev) => ({ ...prev, qrImageUrl: url }));
      toast.success("QR uploaded");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not upload the QR image");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const accountDigits = form.accountNumber.replace(/\s/g, "");
    if (accountDigits && !/^\d{9,18}$/.test(accountDigits)) {
      toast.error("Account number must be 9 to 18 digits");
      return;
    }
    if (form.ifsc.trim() && !IFSC_PATTERN.test(form.ifsc.trim().toUpperCase())) {
      toast.error("Enter a valid IFSC code (e.g. HDFC0001234)");
      return;
    }
    if (form.upiId.trim() && !UPI_PATTERN.test(form.upiId.trim())) {
      toast.error("Enter a valid UPI ID (e.g. name@bank)");
      return;
    }
    if (accountDigits && !form.ifsc.trim()) {
      toast.error("Bank account needs an IFSC code too");
      return;
    }
    if (!hasAnyMethod) {
      toast.error("Add a bank account, a UPI ID, or a QR image");
      return;
    }

    setSaving(true);
    try {
      await deliveryApi.updatePayoutDetails({
        accountHolder: form.accountHolder.trim(),
        accountNumber: accountDigits,
        ifsc: form.ifsc.trim().toUpperCase(),
        bankName: form.bankName.trim(),
        upiId: form.upiId.trim(),
        qrImageUrl: form.qrImageUrl.trim(),
      });
      toast.success("Payout details saved");
      refreshUser?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save payout details");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Payout Details</h1>
        </div>
      </div>

      <form onSubmit={handleSave} className="p-4 max-w-lg mx-auto space-y-6">
        {/* Card visual reflecting what is actually saved */}
        <div
          className="text-white p-6 rounded-2xl shadow-xl relative overflow-hidden"
          style={{
            background:
              "linear-gradient(to bottom right, var(--brand-900), var(--brand-700))",
          }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="flex justify-between items-start mb-8 relative z-10">
            <Landmark size={32} className="text-white/90" />
            <span
              className={cn(
                "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border flex items-center",
                hasAnyMethod
                  ? "bg-emerald-500/25 text-emerald-100 border-emerald-300/40"
                  : "bg-amber-500/25 text-amber-100 border-amber-300/40",
              )}
            >
              {hasAnyMethod ? (
                <>
                  <CheckCircle2 size={12} className="mr-1" /> Payout ready
                </>
              ) : (
                <>
                  <AlertTriangle size={12} className="mr-1" /> Not set
                </>
              )}
            </span>
          </div>

          <div className="space-y-1 relative z-10">
            <p className="text-white/70 text-xs uppercase tracking-wider">Account Number</p>
            <p className="font-mono text-2xl tracking-widest text-white">{maskedAccount}</p>
          </div>

          <div className="flex justify-between items-end mt-8 relative z-10">
            <div>
              <p className="text-white/70 text-xs uppercase tracking-wider mb-1">
                Account Holder
              </p>
              <p className="font-bold text-lg text-white">
                {form.accountHolder || user?.name || "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white font-bold">{form.bankName || "—"}</p>
              <p className="text-white/70 text-xs">{form.ifsc || "—"}</p>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl flex items-start">
          <AlertTriangle size={20} className="text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-yellow-800 font-bold text-sm mb-1">
              This is where your money is sent
            </h4>
            <p className="text-xs text-yellow-700 leading-relaxed">
              Admin sees exactly these details on your withdrawal request. Keep them
              correct — a wrong account or UPI ID means a failed payout.
            </p>
          </div>
        </div>

        {/* Bank */}
        <div>
          <h3 className="ds-h4 text-gray-900 mb-3 flex items-center gap-2">
            <Landmark size={16} className="text-gray-500" /> Bank account
          </h3>
          <div className="space-y-4">
            <Input
              label="Account holder name"
              placeholder="Name as printed in the bank"
              value={form.accountHolder}
              onChange={setField("accountHolder")}
            />
            <Input
              label="Account number"
              placeholder="9 to 18 digits"
              inputMode="numeric"
              value={form.accountNumber}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  accountNumber: e.target.value.replace(/[^\d]/g, ""),
                }))
              }
            />
            <Input
              label="IFSC code"
              placeholder="HDFC0001234"
              value={form.ifsc}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, ifsc: e.target.value.toUpperCase() }))
              }
            />
            <Input
              label="Bank name (optional)"
              placeholder="HDFC Bank"
              value={form.bankName}
              onChange={setField("bankName")}
            />
          </div>
        </div>

        {/* UPI */}
        <div>
          <h3 className="ds-h4 text-gray-900 mb-3 flex items-center gap-2">
            <Smartphone size={16} className="text-gray-500" /> UPI
          </h3>
          <Input
            label="UPI ID"
            placeholder="yourname@bank"
            value={form.upiId}
            onChange={setField("upiId")}
            helperText="Fastest way to get paid."
          />
        </div>

        {/* QR */}
        <div>
          <h3 className="ds-h4 text-gray-900 mb-3 flex items-center gap-2">
            <QrCode size={16} className="text-gray-500" /> Your collect QR
          </h3>

          {form.qrImageUrl ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-4">
              <img
                src={form.qrImageUrl}
                alt="Your payment QR"
                className="h-24 w-24 rounded-lg object-contain bg-gray-50"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">QR uploaded</p>
                <p className="text-xs text-gray-500 mb-2">
                  Admin can scan this to pay you directly.
                </p>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, qrImageUrl: "" }))}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"
                >
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 text-center">
              <QrCode size={28} className="mx-auto text-gray-400" />
              <p className="mt-2 text-xs text-gray-500">
                Upload a screenshot of your UPI QR (JPG/PNG, under 5MB)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleQrUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <>
                    <Loader2 size={15} className="mr-2 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload size={15} className="mr-2" /> Choose image
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={saving || uploading || !hasAnyMethod}
        >
          {saving ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <CreditCard size={16} className="mr-2" /> Save payout details
            </>
          )}
        </Button>
        {!hasAnyMethod && (
          <p className="text-center text-xs text-gray-500 -mt-3">
            Add a bank account, a UPI ID, or a QR to enable withdrawals.
          </p>
        )}
      </form>
    </div>
  );
};

export default BankAccount;
