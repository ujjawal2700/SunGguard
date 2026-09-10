import express from "express";
import {
  createPaymentOrder,
  verifyCheckoutPayment,
  verifyPaymentStatus,
  handleGatewayWebhook,
} from "../controller/paymentController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { paymentRouteRateLimiter } from "../middleware/securityMiddlewares.js";

const paymentRoute = express.Router();

/**
 * Open a gateway order for a CheckoutGroupId or OrderId.
 * Auth: Required (customer paying for their own order)
 */
paymentRoute.post(
  "/create-order",
  verifyToken,
  paymentRouteRateLimiter,
  createPaymentOrder,
);

/**
 * Verify the signed receipt checkout returned to the browser.
 * Auth: Required — the receipt is checked against the caller's own payment.
 */
paymentRoute.post(
  "/verify",
  verifyToken,
  paymentRouteRateLimiter,
  verifyCheckoutPayment,
);

/**
 * Poll the gateway for a payment's real status.
 * Auth: Required
 */
paymentRoute.get(
  "/status/:id",
  verifyToken,
  paymentRouteRateLimiter,
  verifyPaymentStatus,
);

/**
 * Razorpay server-to-server webhook.
 *
 * No session auth — a gateway cannot carry one. Trust comes from the HMAC
 * over the raw body, so this path parses the body as a Buffer: re-serialising
 * parsed JSON would change byte order or spacing and the signature would
 * never match.
 *
 * Deliberately not rate-limited. Dropping a webhook loses a payment
 * confirmation, and the gateway's own retry policy is the backstop.
 */
paymentRoute.post(
  "/webhook/razorpay",
  express.raw({ type: "application/json" }),
  handleGatewayWebhook,
);

export default paymentRoute;
