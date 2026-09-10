import { jest } from "@jest/globals";
import crypto from "crypto";

/**
 * The payment path's security invariants, on the Razorpay gateway.
 *
 * The amount is taken from the server's own order snapshot rather than
 * anything the client sends, a payment can only be started by the customer
 * who owns the order, and a webhook is applied at most once no matter how
 * many times the gateway redelivers it.
 */

const mockOrderFindOne = jest.fn();
const mockOrderFindById = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockOrderUpdateOne = jest.fn();

const mockPaymentFindOne = jest.fn();
const mockPaymentCreate = jest.fn();
const mockPaymentCountDocuments = jest.fn();

const mockWebhookEventCreate = jest.fn();
const mockWebhookEventUpdateOne = jest.fn();

const mockHandleOnlineOrderFinance = jest.fn();
const mockAfterPlaceOrderV2 = jest.fn();
const mockReleaseReservedStockForOrder = jest.fn();

const mockOrdersCreate = jest.fn();
const mockOrdersFetchPayments = jest.fn();

const WEBHOOK_SECRET = "rzp_wh_secret";
const KEY_SECRET = "rzp_test_secret";

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findById: mockOrderFindById,
    findOneAndUpdate: mockOrderFindOneAndUpdate,
    updateOne: mockOrderUpdateOne,
  },
}));

jest.unstable_mockModule("../app/models/payment.js", () => ({
  default: {
    findOne: mockPaymentFindOne,
    create: mockPaymentCreate,
    countDocuments: mockPaymentCountDocuments,
  },
}));

jest.unstable_mockModule("../app/models/paymentWebhookEvent.js", () => ({
  default: {
    create: mockWebhookEventCreate,
    updateOne: mockWebhookEventUpdateOne,
  },
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  handleOnlineOrderFinance: mockHandleOnlineOrderFinance,
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: mockAfterPlaceOrderV2,
}));

jest.unstable_mockModule("../app/services/stockService.js", () => ({
  releaseReservedStockForOrder: mockReleaseReservedStockForOrder,
}));

// The SDK is stubbed at the module boundary; the adapter above it is real, so
// the signature maths under test is the code that actually ships.
jest.unstable_mockModule("razorpay", () => ({
  default: class FakeRazorpay {
    constructor() {
      this.orders = { create: mockOrdersCreate, fetchPayments: mockOrdersFetchPayments };
    }
  },
}));

const { createPaymentOrderForOrderRef, processGatewayWebhook } = await import(
  "../app/services/paymentService.js"
);

/** Signs a webhook body the way Razorpay does. */
const signWebhook = (body) =>
  crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

describe("Phase 0 payment hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.FRONTEND_URL = "https://frontend.test";

    mockPaymentFindOne.mockImplementation((query) => {
      if (query?.idempotencyKey) {
        return Promise.resolve(null);
      }
      return {
        sort: jest.fn().mockResolvedValue(null),
      };
    });
  });

  it("derives payment amount only from server-side order snapshot", async () => {
    mockOrderFindOne.mockResolvedValue({
      _id: "order-mongo-id",
      orderId: "ORD-20260325-ABC123",
      customer: "user-1",
      paymentMode: "ONLINE",
      paymentStatus: "CREATED",
      status: "pending",
      workflowStatus: "CREATED",
      paymentBreakdown: { grandTotal: 499 },
    });
    mockPaymentCountDocuments.mockResolvedValue(0);
    mockOrdersCreate.mockResolvedValue({
      id: "order_gateway_1",
      amount: 49900,
      currency: "INR",
    });
    mockPaymentCreate.mockResolvedValue({
      _id: "payment-1",
      publicOrderId: "ORD-20260325-ABC123",
      gatewayName: "RAZORPAY",
      gatewayOrderId: "order_gateway_1",
      amount: 49900,
      currency: "INR",
      status: "PENDING",
      attemptCount: 1,
    });

    const result = await createPaymentOrderForOrderRef({
      orderRef: "ORD-20260325-ABC123",
      userId: "user-1",
      idempotencyKey: "idem-1",
      correlationId: "corr-1",
    });

    // ₹499 becomes 49900 paise, taken from the order, not the request body.
    expect(mockOrdersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 49900, currency: "INR" }),
    );
    expect(result.payment.amount).toBe(49900);
    expect(result.checkout).toEqual(
      expect.objectContaining({ orderId: "order_gateway_1", keyId: "rzp_test_key" }),
    );
  });

  it("never sends the secret key to the client", async () => {
    mockOrderFindOne.mockResolvedValue({
      _id: "order-mongo-id",
      orderId: "ORD-1",
      customer: "user-1",
      paymentMode: "ONLINE",
      paymentStatus: "CREATED",
      status: "pending",
      workflowStatus: "CREATED",
      paymentBreakdown: { grandTotal: 100 },
    });
    mockPaymentCountDocuments.mockResolvedValue(0);
    mockOrdersCreate.mockResolvedValue({ id: "order_g", amount: 10000, currency: "INR" });
    mockPaymentCreate.mockResolvedValue({ _id: "p", gatewayOrderId: "order_g", amount: 10000 });

    const result = await createPaymentOrderForOrderRef({
      orderRef: "ORD-1",
      userId: "user-1",
    });

    expect(JSON.stringify(result.checkout)).not.toContain(KEY_SECRET);
  });

  it("blocks payment initiation for wrong user or invalid order state", async () => {
    mockOrderFindOne.mockResolvedValueOnce({
      _id: "order-1",
      orderId: "ORD-1",
      customer: "owner-user",
      paymentMode: "ONLINE",
      paymentStatus: "CREATED",
      status: "pending",
      workflowStatus: "CREATED",
      paymentBreakdown: { grandTotal: 100 },
    });

    await expect(
      createPaymentOrderForOrderRef({
        orderRef: "ORD-1",
        userId: "attacker-user",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    mockOrderFindOne.mockResolvedValueOnce({
      _id: "order-2",
      orderId: "ORD-2",
      customer: "owner-user",
      paymentMode: "ONLINE",
      paymentStatus: "CREATED",
      status: "cancelled",
      workflowStatus: "CANCELLED",
      paymentBreakdown: { grandTotal: 100 },
    });

    await expect(
      createPaymentOrderForOrderRef({
        orderRef: "ORD-2",
        userId: "owner-user",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("treats a redelivered webhook event as idempotent", async () => {
    mockWebhookEventCreate.mockRejectedValueOnce({ code: 11000 });

    const body = Buffer.from(
      JSON.stringify({
        id: "evt_dup_1",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_1",
              order_id: "order_gateway_1",
              status: "captured",
              amount: 49900,
              notes: { merchantOrderId: "ORD-1-1" },
            },
          },
        },
      }),
    );

    const result = await processGatewayWebhook({
      rawBody: body,
      signature: signWebhook(body),
      correlationId: "corr-webhook",
    });

    expect(result).toEqual(expect.objectContaining({ duplicate: true, accepted: true }));
    expect(mockOrderUpdateOne).not.toHaveBeenCalled();
  });

  it("refuses a webhook whose signature does not match the body", async () => {
    const body = Buffer.from(JSON.stringify({ id: "evt_1", event: "payment.captured" }));

    await expect(
      processGatewayWebhook({ rawBody: body, signature: "deadbeef" }),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(mockWebhookEventCreate).not.toHaveBeenCalled();
  });

  it("refuses a webhook when no webhook secret is configured", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = Buffer.from(JSON.stringify({ id: "evt_1", event: "payment.captured" }));

    // A missing secret must fail closed, not wave the request through.
    await expect(
      processGatewayWebhook({ rawBody: body, signature: signWebhook(body) }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("refuses a webhook body that was tampered with after signing", async () => {
    const original = Buffer.from(
      JSON.stringify({ id: "evt_1", event: "payment.captured", amount: 100 }),
    );
    const signature = signWebhook(original);
    const tampered = Buffer.from(
      JSON.stringify({ id: "evt_1", event: "payment.captured", amount: 999999 }),
    );

    await expect(
      processGatewayWebhook({ rawBody: tampered, signature }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
