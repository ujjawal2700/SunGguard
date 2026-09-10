import React, { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadPorterInvoice } from "@shared/utils/porterInvoicePdf";

/**
 * Download a porter booking's invoice as a PDF.
 *
 * One component for the customer app and the admin panel. The two
 * authenticate through different API modules, so the fetch is injected
 * (`fetchInvoice`) rather than imported — but the invoice itself is built by
 * the same server endpoint and laid out by the same renderer, so both sides
 * always produce the identical document.
 *
 * The request only goes out on click. Prefetching an invoice for every booking
 * in a list would cost a round trip per row for a button most people never
 * press.
 */
const InvoiceDownloadButton = ({
  fetchInvoice,
  label = "Download invoice",
  variant = "outline",
  size = "md",
  className = "",
  onDownloaded,
}) => {
  const [busy, setBusy] = useState(false);

  const handleClick = async (event) => {
    // Invoice buttons often sit inside a clickable row or card; the download
    // must not also open whatever the row opens.
    event?.stopPropagation?.();
    if (busy) return;

    setBusy(true);
    try {
      const invoice = await downloadPorterInvoice(fetchInvoice);
      toast.success(`Invoice ${invoice.invoiceNo} downloaded`);
      onDownloaded?.(invoice);
    } catch (error) {
      toast.error(
        error?.response?.data?.message || error?.message || "Could not download the invoice",
      );
    } finally {
      setBusy(false);
    }
  };

  const styles = {
    outline:
      "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
    solid: "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900",
    ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  };
  const sizes = {
    sm: "px-2.5 py-1.5 text-[11px] gap-1.5",
    md: "px-3.5 py-2 text-xs gap-2",
    lg: "px-4 py-3 text-sm gap-2",
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-busy={busy}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-bold transition-all active:scale-[0.98] disabled:cursor-wait disabled:opacity-60",
        styles[variant] || styles.outline,
        sizes[size] || sizes.md,
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <FileDown className="h-3.5 w-3.5" />
      )}
      {busy ? "Preparing..." : label}
    </button>
  );
};

export default InvoiceDownloadButton;
