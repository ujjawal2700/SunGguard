import handleResponse from "../utils/helper.js";
import {
  createPaymentOrderForOrderRef,
  verifyGatewayPaymentStatus,
  verifyCheckoutReceipt,
  processGatewayWebhook,
} from "../services/paymentService.js";
import {
  createPaymentOrderSchema,
  verifyCheckoutReceiptSchema,
  validateSchema,
} from "../validation/paymentValidation.js";
import logger from "../services/logger.js";

function resolvePaymentErrorMessage(error) {
  const directMessage = String(error?.message || "").trim();
  if (directMessage) return directMessage;

  const responseStatusText = String(error?.response?.statusText || "").trim();
  if (responseStatusText) return `Payment gateway error: ${responseStatusText}`;

  const causeCode = String(error?.cause?.code || error?.code || "").trim();
  if (causeCode) return `Payment gateway request failed (${causeCode})`;

  return "Unable to start the payment right now";
}

/**
 * Opens a gateway order for a cart or an unpaid order.
 *
 * Returns what the client needs to launch checkout. Nothing is confirmed
 * here — the payment is only real once its receipt is verified or the
 * gateway's webhook arrives.
 */
export const createPaymentOrder = async (req, res) => {
  try {
    const payload = validateSchema(createPaymentOrderSchema, req.body || {});
    const result = await createPaymentOrderForOrderRef({
      orderRef: payload.orderRef || payload.orderId,
      userId: req.user?.id,
      idempotencyKey: req.headers["idempotency-key"] || null,
      correlationId: req.correlationId || null,
    });

    return handleResponse(
      res,
      result.duplicate ? 200 : 201,
      result.duplicate ? "Re-using existing payment" : "Payment initiated",
      {
        payment: result.payment,
        checkout: result.checkout,
        merchantOrderId: result.payment.gatewayOrderId,
      },
    );
  } catch (error) {
    logger.error("createPaymentOrder failed", {
      scope: "PaymentController.createPaymentOrder",
      message: error?.message,
      statusCode: error?.statusCode || error?.status || 500,
      code: error?.code || error?.cause?.code || null,
      responseStatus: error?.response?.status || null,
      responseStatusText: error?.response?.statusText || null,
      orderRef: req.body?.orderRef || req.body?.orderId || null,
      userId: req.user?.id || null,
      correlationId: req.correlationId || null,
    });
    return handleResponse(
      res,
      error.statusCode || error.status || 500,
      resolvePaymentErrorMessage(error),
    );
  }
};

/**
 * The signed receipt checkout hands back to the browser.
 *
 * This is the fast path that lets the customer see "paid" immediately. It is
 * not the only path: the webhook below confirms the same payment server to
 * server, so an abandoned browser still gets the order through.
 */
export const verifyCheckoutPayment = async (req, res) => {
  try {
    const payload = validateSchema(verifyCheckoutReceiptSchema, req.body || {});

    const verification = await verifyCheckoutReceipt({
      gatewayOrderId: payload.razorpay_order_id,
      gatewayPaymentId: payload.razorpay_payment_id,
      signature: payload.razorpay_signature,
      userId: req.user?.id,
      correlationId: req.correlationId || null,
    });

    return handleResponse(res, 200, "Payment verified", {
      status: verification.status,
      payment: verification.payment,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/** Polls the gateway for a payment's real status. */
export const verifyPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const merchantOrderId = id || req.query.merchantOrderId;

    if (!merchantOrderId) {
      return handleResponse(res, 400, "merchantOrderId is required");
    }

    const verification = await verifyGatewayPaymentStatus({
      merchantOrderId,
      userId: req.user?.id,
      correlationId: req.correlationId || null,
    });

    return handleResponse(res, 200, "Payment status verified", {
      status: verification.status,
      payment: verification.payment,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/**
 * Razorpay server-to-server webhook.
 *
 * Unauthenticated by design — the gateway cannot hold a user session. Trust
 * comes entirely from the HMAC over the raw request body, which is why this
 * route mounts a raw body parser and why an unsigned request is refused
 * before the payload is read.
 */
export const handleGatewayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.body;

    if (!signature) {
      logger.warn("Gateway webhook missing signature header", {
        scope: "PaymentController.handleGatewayWebhook",
        correlationId: req.correlationId || null,
        ip: req.ip,
      });
      return res.status(401).send("Unauthorized");
    }

    const result = await processGatewayWebhook({
      rawBody,
      signature,
      correlationId: req.correlationId || null,
    });

    if (result.accepted) {
      return res.status(200).send("OK");
    }

    return res.status(400).send("Bad Request");
  } catch (error) {
    // A 5xx tells the gateway to retry, which is what we want for a transient
    // fault. A rejected signature is a 401 and is not worth retrying.
    const status = error?.statusCode === 401 ? 401 : 500;
    logger.error("Gateway webhook processing failed", {
      scope: "PaymentController.handleGatewayWebhook",
      correlationId: req.correlationId || null,
      message: error?.message,
      error,
    });
    return res.status(status).send(status === 401 ? "Unauthorized" : "Internal Server Error");
  }
};

export const getPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const verification = await verifyGatewayPaymentStatus({
      merchantOrderId: id,
      userId: req.user?.id,
      correlationId: req.correlationId || null,
    });

    return handleResponse(res, 200, "Payment status retrieved", {
      status: verification.status,
      merchantOrderId: verification.payment.gatewayOrderId,
      amount: verification.payment.amount,
      currency: verification.payment.currency,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
