import { jest } from "@jest/globals";
import crypto from "crypto";

/**
 * The Razorpay adapter's two signatures and its status mapping.
 *
 * These are the only places in the order-payment path where the platform
 * decides whether money moved, so each one is pinned: the checkout receipt
 * (HMAC over `order_id|payment_id` with the API key secret), the webhook
 * (HMAC over the raw body with the separate webhook secret), and the mapping
 * from a gateway payment state to our own.
 */

const mockOrdersCreate = jest.fn();
const mockOrdersFetchPayments = jest.fn();

jest.unstable_mockModule("razorpay", () => ({
  default: class FakeRazorpay {
    constructor(opts) {
      this.opts = opts;
      this.orders = { create: mockOrdersCreate, fetchPayments: mockOrdersFetchPayments };
    }
  },
}));

const { RazorpayAdapter } = await import(
  "../app/services/payment/providers/razorpay.adapter.js"
);
const { PAYMENT_STATUS } = await import("../app/constants/payment.js");

const KEY_ID = "rzp_test_key";
const KEY_SECRET = "rzp_test_secret";
const WEBHOOK_SECRET = "rzp_webhook_secret";

let adapter;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  adapter = new RazorpayAdapter();
});

describe("configuration", () => {
  it("reports itself configured only when both credentials are present", () => {
    expect(adapter.isConfigured()).toBe(true);

    delete process.env.RAZORPAY_KEY_SECRET;
    expect(adapter.isConfigured()).toBe(false);
  });

  it("refuses to open an order with no credentials, as a 503", async () => {
    delete process.env.RAZORPAY_KEY_ID;

    await expect(
      adapter.initiatePayment({ merchantOrderId: "ORD-1", amountPaise: 100 }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe("initiatePayment", () => {
  beforeEach(() => {
    mockOrdersCreate.mockResolvedValue({
      id: "order_abc123",
      amount: 49900,
      currency: "INR",
    });
  });

  it("opens an order for the exact amount and hands back checkout details", async () => {
    const result = await adapter.initiatePayment({
      merchantOrderId: "ORD-20260325-1",
      amountPaise: 49900,
    });

    expect(mockOrdersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 49900, currency: "INR" }),
    );
    expect(result.checkout).toEqual({
      orderId: "order_abc123",
      keyId: KEY_ID,
      amount: 49900,
      currency: "INR",
    });
    expect(result.gatewayOrderId).toBe("order_abc123");
  });

  it("carries our own id back in notes, so a webhook can find the row", async () => {
    await adapter.initiatePayment({ merchantOrderId: "ORD-1", amountPaise: 100 });

    const [args] = mockOrdersCreate.mock.calls[0];
    expect(args.notes.merchantOrderId).toBe("ORD-1");
  });

  it("truncates the receipt to what Razorpay accepts", async () => {
    await adapter.initiatePayment({ merchantOrderId: "X".repeat(60), amountPaise: 100 });

    const [args] = mockOrdersCreate.mock.calls[0];
    expect(args.receipt.length).toBeLessThanOrEqual(40);
  });

  it.each([0, -1, NaN, "abc"])("rejects an amount of %s", async (amountPaise) => {
    await expect(
      adapter.initiatePayment({ merchantOrderId: "ORD-1", amountPaise }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("checkout receipt signature", () => {
  const sign = (orderId, paymentId, secret = KEY_SECRET) =>
    crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

  it("accepts a receipt signed with the key secret", () => {
    expect(
      adapter.verifyCheckoutSignature({
        gatewayOrderId: "order_1",
        gatewayPaymentId: "pay_1",
        signature: sign("order_1", "pay_1"),
      }),
    ).toBe(true);
  });

  it("rejects a receipt signed with the wrong secret", () => {
    expect(
      adapter.verifyCheckoutSignature({
        gatewayOrderId: "order_1",
        gatewayPaymentId: "pay_1",
        signature: sign("order_1", "pay_1", "someone-elses-secret"),
      }),
    ).toBe(false);
  });

  it("rejects a receipt whose payment belongs to a different order", () => {
    // The signature is valid, just not for this order — which is exactly the
    // attack of replaying someone else's paid receipt onto your own order.
    expect(
      adapter.verifyCheckoutSignature({
        gatewayOrderId: "order_2",
        gatewayPaymentId: "pay_1",
        signature: sign("order_1", "pay_1"),
      }),
    ).toBe(false);
  });

  it.each([
    ["a missing signature", { gatewayOrderId: "order_1", gatewayPaymentId: "pay_1" }],
    ["a missing order id", { gatewayPaymentId: "pay_1", signature: "x" }],
    ["a missing payment id", { gatewayOrderId: "order_1", signature: "x" }],
    ["an empty signature", { gatewayOrderId: "o", gatewayPaymentId: "p", signature: "" }],
  ])("rejects %s", (_label, args) => {
    expect(adapter.verifyCheckoutSignature(args)).toBe(false);
  });
});

describe("webhook signature", () => {
  const body = Buffer.from(JSON.stringify({ id: "evt_1", event: "payment.captured" }));
  const sign = (buf, secret = WEBHOOK_SECRET) =>
    crypto.createHmac("sha256", secret).update(buf).digest("hex");

  it("accepts a body signed with the webhook secret", async () => {
    expect(await adapter.validateWebhook({ rawBody: body, signature: sign(body) })).toBe(true);
  });

  it("uses the webhook secret, not the API key secret", async () => {
    // Two different secrets on purpose; signing with the wrong one must fail.
    expect(
      await adapter.validateWebhook({ rawBody: body, signature: sign(body, KEY_SECRET) }),
    ).toBe(false);
  });

  it("rejects a body altered after signing", async () => {
    const signature = sign(body);
    const tampered = Buffer.from(JSON.stringify({ id: "evt_1", event: "payment.failed" }));

    expect(await adapter.validateWebhook({ rawBody: tampered, signature })).toBe(false);
  });

  it("fails closed when no webhook secret is configured", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;

    expect(await adapter.validateWebhook({ rawBody: body, signature: sign(body) })).toBe(false);
  });

  it.each([
    ["no signature", { rawBody: body }],
    ["an empty body", { rawBody: Buffer.alloc(0), signature: "x" }],
  ])("rejects %s", async (_label, args) => {
    expect(await adapter.validateWebhook(args)).toBe(false);
  });
});

describe("decodeWebhookPayload", () => {
  it("flattens a payment.captured event", async () => {
    const body = Buffer.from(
      JSON.stringify({
        id: "evt_9",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_9",
              order_id: "order_9",
              status: "captured",
              amount: 12300,
              notes: { merchantOrderId: "ORD-9-1" },
            },
          },
        },
      }),
    );

    const decoded = await adapter.decodeWebhookPayload({ rawBody: body });

    expect(decoded).toEqual(
      expect.objectContaining({
        eventId: "evt_9",
        eventType: "payment.captured",
        gatewayOrderId: "order_9",
        merchantOrderId: "ORD-9-1",
        state: "captured",
        transactionId: "pay_9",
        amountPaise: 12300,
      }),
    );
  });

  it("falls back to the order receipt when notes are absent", async () => {
    const body = Buffer.from(
      JSON.stringify({
        id: "evt_10",
        event: "order.paid",
        payload: { order: { entity: { id: "order_10", receipt: "ORD-10-1", status: "paid" } } },
      }),
    );

    const decoded = await adapter.decodeWebhookPayload({ rawBody: body });
    expect(decoded.merchantOrderId).toBe("ORD-10-1");
  });

  it("derives a stable event id when the gateway omits one", async () => {
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_x", order_id: "order_x", status: "captured" } } },
    });

    const first = await adapter.decodeWebhookPayload({ rawBody: Buffer.from(raw) });
    const second = await adapter.decodeWebhookPayload({ rawBody: Buffer.from(raw) });

    // Identical redeliveries must collapse onto one id, or the de-duplication
    // index cannot stop the same event being applied twice.
    expect(first.eventId).toBe(second.eventId);
    expect(first.eventId).toHaveLength(64);
  });

  it("rejects a body that is not JSON", async () => {
    await expect(
      adapter.decodeWebhookPayload({ rawBody: Buffer.from("not json") }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("getPaymentStatus", () => {
  it("reports a captured payment even when an earlier attempt failed", async () => {
    mockOrdersFetchPayments.mockResolvedValue({
      items: [
        { id: "pay_fail", status: "failed", error_reason: "insufficient_funds" },
        { id: "pay_ok", status: "captured" },
      ],
    });

    const status = await adapter.getPaymentStatus({ gatewayOrderId: "order_1" });

    expect(status.state).toBe("captured");
    expect(status.transactionId).toBe("pay_ok");
  });

  it("reports created when nobody has paid yet", async () => {
    mockOrdersFetchPayments.mockResolvedValue({ items: [] });

    const status = await adapter.getPaymentStatus({ gatewayOrderId: "order_1" });
    expect(status.state).toBe("created");
  });

  it("refuses to look up without an order id", async () => {
    await expect(adapter.getPaymentStatus({})).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("mapStatusToInternal", () => {
  it.each([
    ["captured", PAYMENT_STATUS.CAPTURED],
    ["authorized", PAYMENT_STATUS.AUTHORIZED],
    ["failed", PAYMENT_STATUS.FAILED],
    ["refunded", PAYMENT_STATUS.REFUNDED],
    ["created", PAYMENT_STATUS.PENDING],
    ["something-new", PAYMENT_STATUS.PENDING],
    [undefined, PAYMENT_STATUS.PENDING],
  ])("maps %s to %s", (state, expected) => {
    expect(adapter.mapStatusToInternal(state)).toBe(expected);
  });
});
