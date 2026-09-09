import express from "express";
import {
  signupDelivery,
  loginDelivery,
  verifyDeliveryOTP,
  getDeliveryProfile,
  updateDeliveryProfile,
  updateDeliveryPayoutDetails,
} from "../controller/deliveryAuthController.js";
import {
  riderGetCashSummary,
  riderCreateCashDeposit,
  riderListCashDeposits,
  riderGetCashPayoutDestination,
  riderCreateCodQr,
  riderCheckCodQr,
} from "../controller/riderCashController.js";
import {
  getDeliveryStats,
  getDeliveryEarnings,
  getDeliveryCodCashSummary,
  submitDeliveryCodCashToAdmin,
  getMyDeliveryOrders,
  requestWithdrawal,
  updateDeliveryLocation,
} from "../controller/deliveryController.js";
import { getRiderWalletSummaryController } from "../controller/adminFinanceController.js";

import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/send-signup-otp",
  upload.any(),
  signupDelivery,
);
router.post("/send-login-otp", loginDelivery);
router.post("/verify-otp", verifyDeliveryOTP);

// Profile routes
router.get("/profile", verifyToken, getDeliveryProfile);
router.put("/profile", verifyToken, updateDeliveryProfile);
router.get("/stats", verifyToken, getDeliveryStats);
router.get("/earnings", verifyToken, getDeliveryEarnings);
router.get("/cod/summary", verifyToken, allowRoles("delivery"), getDeliveryCodCashSummary);
router.post("/cod/pay", verifyToken, allowRoles("delivery"), submitDeliveryCodCashToAdmin);
router.get("/wallet/summary", verifyToken, allowRoles("delivery"), getRiderWalletSummaryController);
router.get(
  "/order-history",
  verifyToken,
  allowRoles("delivery"),
  getMyDeliveryOrders,
);
router.post("/request-withdrawal", verifyToken, requestWithdrawal);
router.post("/location", verifyToken, updateDeliveryLocation);

// Where withdrawals get paid — owned by the rider, read by the admin.
router.put(
  "/payout-details",
  verifyToken,
  allowRoles("delivery"),
  updateDeliveryPayoutDetails,
);

/**
 * Porter COD cash the rider is physically holding, and handing it back.
 * Distinct from /cod/* above, which settles quick-commerce order cash.
 */
router.get("/cash/summary", verifyToken, allowRoles("delivery"), riderGetCashSummary);
router.post("/cash/deposit", verifyToken, allowRoles("delivery"), riderCreateCashDeposit);
router.get("/cash/deposits", verifyToken, allowRoles("delivery"), riderListCashDeposits);
// Read-only: where admin wants deposits sent — UPI / QR / bank account, set
// from the admin Cash Deposits page. Shown on the deposit form before the
// rider transfers anything.
router.get(
  "/cash/payout-destination",
  verifyToken,
  allowRoles("delivery"),
  riderGetCashPayoutDestination,
);

/**
 * Doorstep switch from cash to online. `kind` is parcel | city_parcel.
 * POST mints (or returns) the QR; GET asks Razorpay whether it was paid and,
 * the first time it has been, converts the booking to an online payment.
 */
router.post("/cod-qr/:kind/:id", verifyToken, allowRoles("delivery"), riderCreateCodQr);
router.get("/cod-qr/:kind/:id", verifyToken, allowRoles("delivery"), riderCheckCodQr);

// NOTE: Delivery-completion OTP generation/validation lives on the
// canonical workflow routes:
//   POST /orders/workflow/:orderId/otp/request
//   POST /orders/workflow/:orderId/otp/verify
// The previous /delivery/orders/:orderId/(generate|validate)-otp
// endpoints were removed once the workflow state machine became the
// single source of truth (see backend/app/services/orderWorkflowService.js
// requestHandoffOtpAtomic / verifyHandoffOtpAndDeliver).

export default router;
