import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ShieldAlert, ChevronRight } from "lucide-react";
import { deliveryApi } from "../services/deliveryApi";
import { cn } from "@/lib/utils";

/**
 * Tells a rider, on the screen where jobs appear, that their cash limit has
 * paused new work — and what to do about it.
 *
 * Without this, a blocked rider sees an empty job list that looks exactly like
 * a quiet afternoon. The job feeds do return a reason, but the dashboard
 * renders every empty feed with the same "no jobs nearby" state, so the one
 * piece of information that would get them working again never reaches them.
 *
 * Self-contained on purpose: it fetches its own status rather than threading
 * through the dashboard's job-polling state, so the dashboard's logic is not
 * touched and the banner cannot break job loading if the status call fails.
 * Re-checks when `refreshKey` changes, which the dashboard bumps on each poll.
 */
const CashLimitBanner = ({ to = "/delivery/porter-cash", refreshKey = 0, className = "" }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    deliveryApi
      .getCashStatus()
      .then((res) => {
        if (!cancelled) setStatus(res.data?.result || null);
      })
      .catch(() => {
        // A banner is advisory. If the status call fails, show nothing rather
        // than an error — the job feed itself still works.
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!status || (!status.blocked && !status.warning)) return null;

  const blocked = Boolean(status.blocked);
  const Icon = blocked ? Lock : ShieldAlert;

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99]",
        blocked ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50",
        className,
      )}
    >
      <Icon
        size={18}
        className={cn("mt-0.5 shrink-0", blocked ? "text-red-600" : "text-amber-600")}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-bold", blocked ? "text-red-900" : "text-amber-900")}>
          {blocked ? "New jobs are paused" : "You are close to your cash limit"}
        </p>
        <p
          className={cn(
            "mt-0.5 text-xs leading-relaxed",
            blocked ? "text-red-800" : "text-amber-800",
          )}
        >
          {status.reason}
        </p>
        <p
          className={cn(
            "mt-1.5 text-xs font-bold",
            blocked ? "text-red-700" : "text-amber-700",
          )}
        >
          {blocked && Number(status.pendingDepositAmount) > 0
            ? "View deposit status"
            : "Deposit cash now"}
        </p>
      </div>
      <ChevronRight
        size={18}
        className={cn("mt-0.5 shrink-0", blocked ? "text-red-400" : "text-amber-400")}
      />
    </button>
  );
};

export default CashLimitBanner;
