/**
 * Razorpay webhook simulator — PROVIDER/MOCK verification, not browser.
 *
 * Posts a correctly-signed `payment.captured` event to the app's real webhook
 * route. The signature is an HMAC-SHA256 over the exact bytes, using the
 * LOCAL test secret this QA environment injected — it is not a Razorpay
 * credential and no money moves. This exercises the genuine server path:
 * signature validation, event-id deduplication, status mapping and the
 * booking side effects.
 *
 * usage: node qa/webhook-sim.mjs <gatewayOrderId> <amountPaise> [paymentId] [eventId]
 */

import crypto from "node:crypto";

const API = "http://localhost:7000";
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "qa_local_webhook_secret_do_not_use_in_prod";

const [orderId, amountPaise, paymentIdArg, eventIdArg] = process.argv.slice(2);
if (!orderId || !amountPaise) {
  console.error("usage: node qa/webhook-sim.mjs <gatewayOrderId> <amountPaise> [paymentId] [eventId]");
  process.exit(1);
}

const paymentId = paymentIdArg || `pay_QA${Date.now().toString(36).toUpperCase()}`;
const eventId = eventIdArg || `evt_QA${Date.now().toString(36).toUpperCase()}`;

const event = {
  entity: "event",
  account_id: "acc_QA_TEST",
  event: "payment.captured",
  contains: ["payment"],
  id: eventId,
  created_at: Math.floor(Date.now() / 1000),
  payload: {
    payment: {
      entity: {
        id: paymentId,
        entity: "payment",
        amount: Number(amountPaise),
        currency: "INR",
        status: "captured",
        order_id: orderId,
        method: "upi",
        vpa: "qa.test@upi",
        captured: true,
        amount_refunded: 0,
        created_at: Math.floor(Date.now() / 1000),
      },
    },
  },
};

const raw = Buffer.from(JSON.stringify(event), "utf8");
const signature = crypto.createHmac("sha256", SECRET).update(raw).digest("hex");

const res = await fetch(`${API}/api/payments/webhook/razorpay`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-razorpay-signature": signature,
  },
  body: raw,
});

console.log(
  JSON.stringify({
    http: res.status,
    body: (await res.text()).slice(0, 120),
    orderId,
    paymentId,
    eventId,
    amountPaise: Number(amountPaise),
  }),
);
