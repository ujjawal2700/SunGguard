import express from "express";
import { adminGetPorterDashboard } from "../controller/porterDashboardController.js";
import {
  adminGetPorterRiderPayouts,
  adminGetPorterWalletOverview,
  adminGetPorterWalletWithdrawals,
} from "../controller/porterPayoutsController.js";
import {
  adminListZones,
  adminGetZone,
  adminCreateZone,
  adminUpdateZone,
  adminDeleteZone,
  publicListActiveZones,
} from "../controller/deliveryZoneController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

import {
  adminListBanners,
  adminGetBanner,
  adminCreateBanner,
  adminUpdateBanner,
  adminToggleStatus,
  adminDeleteBanner,
  getActivePorterBanners,
  trackClick,
} from "../controller/porterBannerController.js";

import {
  adminListPorterCustomers,
  adminGetPorterCustomerById,
  adminUpdatePorterCustomerStatus,
} from "../controller/admin/porterCustomerController.js";

import {
  adminListCashDeposits,
  adminReviewCashDeposit,
  adminGetFleetCashHoldings,
  adminGetCashPayoutDestination,
  adminUpdateCashPayoutDestination,
  adminGetPorterCashOverview,
  adminGetPorterCashSettings,
  adminUpdatePorterCashSettings,
  adminSetRiderCashLimit,
} from "../controller/riderCashController.js";

import {
  adminGetGstSettings,
  adminUpdateGstSettings,
  adminGetGstReport,
  adminGetGstLedger,
  getBookingInvoice,
  getBookingPayments,
  getMyTransactions,
} from "../controller/porterFinanceController.js";
import { verifyToken as requireAuth } from "../middleware/authMiddleware.js";

/**
 * The porter desk: the parcel-side dashboard and the delivery zones drawn to
 * serve it. Mounted on its own prefix rather than under /admin so it cannot
 * shadow, or be shadowed by, the admin auth router.
 */

const router = express.Router();

const adminOnly = [verifyToken, allowRoles("admin", "parcel_admin")];

// Customer / Public - Active Porter Banners
router.get("/banners/active", getActivePorterBanners);
router.post("/banners/:id/click", trackClick);

// Public — active delivery zones (rider onboarding/profile zone picker,
// customer outstation pickup-zone validation). No admin rights required.
router.get("/zones/active", publicListActiveZones);

// Admin Porter Dashboard & Payouts
router.get("/admin/dashboard", ...adminOnly, adminGetPorterDashboard);
router.get("/admin/rider-payouts", ...adminOnly, adminGetPorterRiderPayouts);

// Admin Porter Wallet — revenue vs rider earning vs admin margin, plus the
// rider wallet/withdrawal picture (see controller comments for what is and
// isn't porter-attributable).
router.get("/admin/wallet/overview", ...adminOnly, adminGetPorterWalletOverview);
router.get("/admin/wallet/withdrawals", ...adminOnly, adminGetPorterWalletWithdrawals);

// Rider COD cash: what each rider is still holding, and the deposit requests
// waiting on a decision. Approving a deposit is what moves the covered
// bookings to REMITTED_TO_ADMIN — nothing else does.
router.get("/admin/cash-holdings", ...adminOnly, adminGetFleetCashHoldings);
router.get("/admin/cash-deposits", ...adminOnly, adminListCashDeposits);
router.patch("/admin/cash-deposits/:id/review", ...adminOnly, adminReviewCashDeposit);
// Where those deposits should be sent. Admin sets it here; the rider app
// reads it (read-only) on the deposit form.
router.get(
  "/admin/cash-payout-destination",
  ...adminOnly,
  adminGetCashPayoutDestination,
);
router.put(
  "/admin/cash-payout-destination",
  ...adminOnly,
  adminUpdateCashPayoutDestination,
);

/* --------------------------------------------------------------------------
   Rider COD cash limits
   --------------------------------------------------------------------------
   How much cash each rider may hold, what they are holding, and what is left.
   Replaces the old Cash Collection aggregation, which read a `limit` field
   that has never existed on the Delivery model — so every rider showed a
   ₹5,000 limit that nothing could change and nothing enforced.
   ------------------------------------------------------------------------ */
router.get("/admin/cash-overview", ...adminOnly, adminGetPorterCashOverview);
router.get("/admin/cash-settings", ...adminOnly, adminGetPorterCashSettings);
router.put("/admin/cash-settings", ...adminOnly, adminUpdatePorterCashSettings);
// Null / empty clears the override and returns the rider to the global limit;
// 0 is a real limit meaning this rider may carry no cash at all.
router.patch("/admin/riders/:id/cash-limit", ...adminOnly, adminSetRiderCashLimit);

/* --------------------------------------------------------------------------
   GST
   ------------------------------------------------------------------------ */
router.get("/admin/gst-settings", ...adminOnly, adminGetGstSettings);
router.put("/admin/gst-settings", ...adminOnly, adminUpdateGstSettings);
router.get("/admin/gst-report", ...adminOnly, adminGetGstReport);
// Line-by-line, for export to an accountant.
router.get("/admin/gst-ledger", ...adminOnly, adminGetGstLedger);

/* --------------------------------------------------------------------------
   Invoices and payment history
   --------------------------------------------------------------------------
   Deliberately NOT under /admin: a customer downloads their own invoice from
   the same endpoint an admin uses, and the service scopes the read by role.
   One code path means the money on the invoice cannot differ depending on who
   printed it.
   ------------------------------------------------------------------------ */
router.get("/invoice/:kind/:id", requireAuth, getBookingInvoice);
router.get("/payments/:kind/:id", requireAuth, getBookingPayments);
router.get("/my-transactions", requireAuth, getMyTransactions);

// Admin Porter Delivery Zones
router.get("/admin/zones", ...adminOnly, adminListZones);
router.post("/admin/zones", ...adminOnly, adminCreateZone);
router.get("/admin/zones/:id", ...adminOnly, adminGetZone);
router.put("/admin/zones/:id", ...adminOnly, adminUpdateZone);
router.delete("/admin/zones/:id", ...adminOnly, adminDeleteZone);

// Admin Porter Customers — who booked through Porter, their real spend, and
// account status. Deactivating here blocks the customer's login app-wide.
router.get("/admin/customers", ...adminOnly, adminListPorterCustomers);
router.get("/admin/customers/:id", ...adminOnly, adminGetPorterCustomerById);
router.patch("/admin/customers/:id/status", ...adminOnly, adminUpdatePorterCustomerStatus);

// Admin Porter Banners
router.get("/admin/banners", ...adminOnly, adminListBanners);
router.post("/admin/banners", ...adminOnly, adminCreateBanner);
router.get("/admin/banners/:id", ...adminOnly, adminGetBanner);
router.put("/admin/banners/:id", ...adminOnly, adminUpdateBanner);
router.patch("/admin/banners/:id/status", ...adminOnly, adminToggleStatus);
router.delete("/admin/banners/:id", ...adminOnly, adminDeleteBanner);

export default router;
