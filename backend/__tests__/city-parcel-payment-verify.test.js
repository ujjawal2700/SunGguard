import { jest } from "@jest/globals";
import mongoose from "mongoose";

/**
 * Verifying a gateway receipt on a local booking.
 *
 * Two behaviours are protected here.
 *
 * First: a receipt whose signature does not check out means "this cannot be
 * trusted", not "the customer's payment failed". This once wrote
 * `paymentStatus: FAILED` on any signature error, so a mangled or re-posted
 * receipt from a customer still inside the checkout sheet flipped their own
 * booking to FAILED and the real payment could never be applied to it. The
 * booking must stay PENDING so checkout can be completed or retried.
 *
 * Second: a genuine signature is not proof the money was taken. An authorised
 * but uncaptured payment produces a perfectly valid receipt, and dispatching
 * a rider against one means riding to a pickup nobody has paid for. The
 * controller must wait for CAPTURED before releasing the booking.
 */

const CUSTOMER = new mongoose.Types.ObjectId().toString();
const BOOKING = new mongoose.Types.ObjectId().toString();

const findOne = jest.fn();
const findById = jest.fn();
const findByIdAndUpdate = jest.fn();
const verifyBookingReceipt = jest.fn();
const activatePorterBookingAfterPayment = jest.fn();
const recordEvent = jest.fn().mockResolvedValue({});

jest.unstable_mockModule("../app/models/cityParcel.js", () => ({
  default: { findOne, findById, findByIdAndUpdate },
  RIDER_SAFE_FIELDS: "",
}));
jest.unstable_mockModule("../app/services/porter/porterPaymentService.js", () => ({
  verifyBookingReceipt,
  openBookingPayment: jest.fn(),
  getBookingPaymentHistory: jest.fn(),
  refundBookingPayment: jest.fn().mockResolvedValue({ attempted: false, reason: "NOT_PAID_ONLINE" }),
}));
jest.unstable_mockModule("../app/services/porter/porterDispatchService.js", () => ({
  activatePorterBookingAfterPayment,
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
  startBroadcast: jest.fn(),
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

/** What the payment service hands back on a successful capture. */
const capturedResult = (booking) => ({
  payment: { isPaid: () => true, status: "CAPTURED" },
  status: "CAPTURED",
  changed: true,
  booking: booking || bookingDoc({ status: "SEARCHING" }),
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
  verifyBookingReceipt.mockResolvedValue(capturedResult());
  findById.mockResolvedValue(bookingDoc({ status: "SEARCHING" }));
});

describe("city parcel payment verification", () => {
  it("releases the booking to riders once the gateway confirms capture", async () => {
    findOne.mockResolvedValue(bookingDoc());

    const res = await verify();

    expect(res.statusCode).toBe(200);
    expect(verifyBookingReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: BOOKING,
        customerId: CUSTOMER,
        gatewayOrderId: "order_live1",
        gatewayPaymentId: "pay_1",
        signature: "sig",
        // Dispatch is handed in rather than called by the payment layer, so
        // the same hook runs whether the client or the webhook got here first.
        onPaid: activatePorterBookingAfterPayment,
      }),
    );
  });

  it("leaves an untrusted receipt's booking PENDING so checkout can be retried", async () => {
    const booking = bookingDoc();
    findOne.mockResolvedValue(booking);
    verifyBookingReceipt.mockRejectedValue(
      Object.assign(new Error("This payment could not be verified"), {
        statusCode: 400,
        code: "INVALID_SIGNATURE",
      }),
    );

    const res = await verify({ razorpay_signature: "forged" });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    // The regression this test exists for: nothing may write FAILED here.
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
    expect(booking.paymentStatus).toBe("PENDING");
    expect(booking.save).not.toHaveBeenCalled();
    expect(activatePorterBookingAfterPayment).not.toHaveBeenCalled();
  });

  it("holds a genuine receipt whose payment has not captured yet", async () => {
    findOne.mockResolvedValue(bookingDoc());
    verifyBookingReceipt.mockResolvedValue({
      payment: { isPaid: () => false, status: "AUTHORIZED" },
      status: "AUTHORIZED",
      changed: true,
      booking: null,
    });

    const res = await verify();

    // 202, not 200: the receipt was real, the money is not confirmed, and the
    // webhook will finish the job — so there is nothing for the customer to
    // redo and nothing to tell them has failed.
    expect(res.statusCode).toBe(202);
  });

  it("refuses a receipt opened against a different booking", async () => {
    findOne.mockResolvedValue(bookingDoc());

    const res = await verify({ razorpay_order_id: "order_someone_else" });

    expect(res.statusCode).toBe(400);
    expect(verifyBookingReceipt).not.toHaveBeenCalled();
  });

  it("treats replaying a receipt on an already-paid booking as a no-op", async () => {
    const booking = bookingDoc({ paymentStatus: "PAID" });
    findOne.mockResolvedValue(booking);

    const res = await verify();

    expect(res.statusCode).toBe(200);
    expect(verifyBookingReceipt).not.toHaveBeenCalled();
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
