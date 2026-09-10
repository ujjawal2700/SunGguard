/**
 * PaymentProviderPort
 *
 * Abstract contract every payment provider adapter must implement. Domain
 * code in paymentService.js only ever sees a provider through this interface
 * — it never imports a vendor SDK directly.
 *
 * Implementations live under `../providers/<name>.adapter.js` and are wired
 * in `../providerRegistry.js`. The active provider is selected at runtime via
 * `process.env.PAYMENT_PROVIDER` (default: "razorpay").
 *
 * Methods must satisfy these contracts:
 *
 *  initiatePayment({ merchantOrderId, amountPaise, currency, notes })
 *    → { checkout: { orderId, keyId, amount, currency },
 *        gatewayOrderId: string, gatewayResponse?: any }
 *
 *    `checkout` is everything the client needs to launch the gateway. It is
 *    deliberately not a redirect URL: an order-and-checkout gateway opens
 *    over our own page and hands back a signed receipt, which is both a
 *    better experience and a stronger verification story than a redirect
 *    the customer can abandon.
 *
 *  getPaymentStatus({ gatewayOrderId, merchantOrderId })
 *    → { state, transactionId?, responseCode?, gatewayResponse? }
 *
 *  verifyCheckoutSignature({ gatewayOrderId, gatewayPaymentId, signature })
 *    → boolean — the receipt the client returned really came from the gateway
 *
 *  validateWebhook({ rawBody, signature })
 *    → boolean — computed over the exact bytes received, never a re-serialised
 *      body, and false (not true) when no secret is configured
 *
 *  decodeWebhookPayload({ rawBody })
 *    → { eventId, eventType, merchantOrderId, gatewayOrderId, state,
 *        transactionId?, responseCode?, amountPaise?, raw }
 *
 *    `eventId` must be stable across redeliveries of the same event; the
 *    webhook de-duplication index depends on it.
 *
 *  mapStatusToInternal(gatewayState)
 *    → one of the PAYMENT_STATUS constants
 *
 *  initiateRefund({ gatewayPaymentId, amountPaise, notes, receipt })
 *    → { gatewayRefundId, status, speed?, amount, gatewayResponse }
 *
 *    `status` is the gateway's own refund state ("processed" | "pending" for
 *    Razorpay) — money leaves the merchant balance the instant the refund is
 *    created either way; the status only describes how fast it reaches the
 *    customer's bank. Callers should treat a successful call as "refund
 *    initiated" regardless of which value comes back, and let the webhook
 *    confirm a "pending" one later.
 *
 *  isConfigured()
 *    → boolean — credentials present, so callers can fall back to cash
 *
 *  providerName
 *    → string, used for logging and DB labelling
 */

export class PaymentProviderPort {
  get providerName() {
    throw new Error("providerName must be implemented");
  }

  isConfigured() {
    return true;
  }

  async initiatePayment(_args) {
    throw new Error("initiatePayment must be implemented");
  }

  async getPaymentStatus(_args) {
    throw new Error("getPaymentStatus must be implemented");
  }

  verifyCheckoutSignature(_args) {
    throw new Error("verifyCheckoutSignature must be implemented");
  }

  async validateWebhook(_args) {
    throw new Error("validateWebhook must be implemented");
  }

  async decodeWebhookPayload(_args) {
    throw new Error("decodeWebhookPayload must be implemented");
  }

  mapStatusToInternal(_gatewayState) {
    throw new Error("mapStatusToInternal must be implemented");
  }

  async initiateRefund(_args) {
    throw new Error("initiateRefund must be implemented");
  }
}

export default PaymentProviderPort;
