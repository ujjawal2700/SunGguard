import { jest } from "@jest/globals";
import mongoose from "mongoose";

/**
 * Verifying a Razorpay receipt on a local booking.
 *
 * A receipt whose signature does not check out means "this cannot be
 * trusted", not "the customer's payment failed" — but this used to write
 * `paymentStatus: FAILED` on any signature error. A mangled or re-posted
 * receipt from a customer still inside the checkout sheet would flip their
 * own booking to FAILED, and the real payment could then never be applied to
 * it. The booking must stay PENDING so checkout can be completed or retried.
 */

const CUSTOMER = new mongoose.Types.ObjectId().toString();
const BOOKING = new mongoose.Types.ObjectId().toString();

const findOne = jest.fn();
const findByIdAndUpdate = jest.fn();
const verifyCityParcelSignature = jest.fn();
const startBroadcast = jest.fn();
const recordEvent = jest.fn().mockResolvedValue({});

jest.unstable_mockModule("../app/models/cityParcel.js", () => ({
  default: { findOne, findByIdAndUpdate },
  RIDER_SAFE_FIELDS: "",
}));
jest.unstable_mockModule("../app/services/cityParcelRazorpayService.js", () => ({
  verifyCityParcelSignature,
  createCityParcelOrder: jest.fn(),
  isRazorpayConfigured: jest.fn().mockReturnValue(true),
}));
jest.unstable_mockModule("../app/services/cityParcelStateMachine.js", () => ({
  recordEvent,
  transition: jest.fn(),
  canTransition: jest.fn().mockReturnValue(true),
  assertTransition: jest.fn(),
  isTerminal: jest.fn().mockReturnValue(false),
  nextStatuses: jest.fn().mockReturnValue([]),
  TRANSITIONS: {},
}));
jest.unstable_mockModule("../app/services/cityParcelWorkflowService.js", () => ({
  startBroadcast,
  advanceExpiredSearch: jest.fn(),
  sweepExpiredSearches: jest.fn(),
  fetchAvailableForRider: jest.fn(),
  acceptAtomic: jest.fn(),
  releaseJob: jest.fn(),
  skipJob: jest.fn(),
}));

const { verifyPayment } = await import("../app/controller/cityParcelController.js");

function mockRes() {
  const res = {};
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

const bookingDoc = (overrides = {}) => ({
  _id: BOOKING,
  referenceId: "CP-4242",
  customerId: CUSTOMER,
  status: "REQUESTED",
  paymentStatus: "PENDING",
  paymentMethod: "UPI",
  razorpayOrderId: "order_live1",
  isCod: () => false,
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const verify = (receipt) => {
  const res = mockRes();
  return verifyPayment(
    {
      params: { cityParcelId: BOOKING },
      user: { id: CUSTOMER },
      body: {
        razorpay_order_id: "order_live1",
        razorpay_payment_id: "pay_1",
        razorpay_signature: "sig",
        ...receipt,
      },
    },
    res,
  ).then(() => res);
};

beforeEach(() => {
  jest.clearAllMocks();
  verifyCityParcelSignature.mockReturnValue(true);
  startBroadcast.mockImplementation(async () => ({ parcel: bookingDoc({ status: "SEARCHING" }) }));
});

describe("city parcel payment verification", () => {
  it("marks a booking paid on a valid receipt and starts the rider search", async () => {
    const booking = bookingDoc();
    findOne.mockResolvedValue(booking);

    const res = await verify();

    expect(res.statusCode).toBe(200);
    expect(booking.paymentStatus).toBe("PAID");
    expect(booking.save).toHaveBeenCalled();
    expect(startBroadcast).toHaveBeenCalled();
  });

  it("leaves an untrusted receipt's booking PENDING so checkout can be retried", async () => {
    const booking = bookingDoc();
    findOne.mockResolvedValue(booking);
    verifyCityParcelSignature.mockImplementation(() => {
      const err = new Error("Payment signature verification failed");
      err.statusCode = 400;
      throw err;
    });

    const res = await verify({ razorpay_signature: "forged" });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    // The regression this test exists for: nothing may write FAILED here.
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
    expect(booking.paymentStatus).toBe("PENDING");
    expect(booking.save).not.toHaveBeenCalled();
    expect(startBroadcast).not.toHaveBeenCalled();
  });

  it("refuses a receipt opened against a different booking", async () => {
    findOne.mockResolvedValue(bookingDoc());

    const res = await verify({ razorpay_order_id: "order_someone_else" });

    expect(res.statusCode).toBe(400);
    expect(verifyCityParcelSignature).not.toHaveBeenCalled();
  });

  it("treats replaying a receipt on an already-paid booking as a no-op", async () => {
    const booking = bookingDoc({ paymentStatus: "PAID" });
    findOne.mockResolvedValue(booking);

    const res = await verify();

    expect(res.statusCode).toBe(200);
    expect(startBroadcast).not.toHaveBeenCalled();
    expect(booking.save).not.toHaveBeenCalled();
  });

  it("refuses to take a payment against a cash booking", async () => {
    findOne.mockResolvedValue(bookingDoc({ isCod: () => true }));

    expect((await verify()).statusCode).toBe(400);
  });

  it("refuses once a rider is already on the job", async () => {
    findOne.mockResolvedValue(bookingDoc({ status: "ACCEPTED" }));

    expect((await verify()).statusCode).toBe(409);
  });

  it("404s a booking that is not this customer's", async () => {
    findOne.mockResolvedValue(null);

    expect((await verify()).statusCode).toBe(404);
  });
});
