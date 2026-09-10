import { jest } from "@jest/globals";
import mongoose from "mongoose";

/**
 * Retrying a cancelled online booking must reuse the row it already created,
 * not duplicate it.
 *
 * A customer who dismisses the Razorpay sheet already has a CityParcel row
 * sitting unpaid in the database — the create call before checkout put it
 * there. Tapping "Pay" again used to call create() fresh every time, so one
 * hesitant customer left a stack of duplicate REQUESTED rows behind, each
 * with its own now-dead Razorpay order. This locks in the fix: a matching
 * unpaid attempt is updated in place and a new gateway order opened on it.
 */

const CUSTOMER = new mongoose.Types.ObjectId().toString();
const PICKUP = { fullAddress: "12 Test Street, Delhi", lat: 28.6139, lng: 77.209 };
const DROP = { fullAddress: "44 Other Road, Delhi", lat: 28.6448, lng: 77.2167 };
const PKG = { packageType: "document", weightKg: 2, description: "papers" };

const cityParcelFindOne = jest.fn();
const cityParcelCreateWithReference = jest.fn();
const recordEvent = jest.fn().mockResolvedValue({});
const startBroadcast = jest.fn();
const openBookingPayment = jest.fn();
const quoteTrip = jest.fn();
const computeDeliverySla = jest.fn();

jest.unstable_mockModule("../app/models/cityParcel.js", () => ({
  default: { findOne: cityParcelFindOne, createWithReference: cityParcelCreateWithReference },
  RIDER_SAFE_FIELDS: "",
}));
jest.unstable_mockModule("../app/models/cityParcelConfig.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/cityParcelEvent.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/services/cityParcelStateMachine.js", () => ({
  transition: jest.fn(),
  recordEvent,
  canTransition: jest.fn().mockReturnValue(true),
  assertTransition: jest.fn(),
  isTerminal: jest.fn().mockReturnValue(false),
  nextStatuses: jest.fn().mockReturnValue([]),
  TRANSITIONS: {},
}));
jest.unstable_mockModule("../app/services/cityParcelFareService.js", () => ({
  quoteTrip,
  checkServiceability: jest.fn(),
  computeCityParcelFare: jest.fn(),
  computeRiderEarning: jest.fn(),
  computeDeliverySla,
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
jest.unstable_mockModule("../app/services/cityParcelVerificationService.js", () => ({
  issueOtp: jest.fn(),
  resendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  checkDropProximity: jest.fn(),
  verifyDeliveryHandover: jest.fn(),
}));
jest.unstable_mockModule("../app/services/cityParcelReturnService.js", () => ({
  recordFailedAttempt: jest.fn(),
  applyCustomerChoice: jest.fn(),
  flagCustomerUnreachable: jest.fn(),
}));
jest.unstable_mockModule("../app/services/cityParcelSettlementService.js", () => ({
  creditDeliveryEarning: jest.fn(),
  creditReturnEarning: jest.fn(),
  releaseWithheldPayout: jest.fn(),
}));
jest.unstable_mockModule("../app/services/deliveryBusyService.js", () => ({
  syncDeliveryPartnerBusyFlag: jest.fn(),
  markDeliveryPartnerBusy: jest.fn(),
  deliveryPartnerHasActiveJob: jest.fn(),
}));
jest.unstable_mockModule("../app/models/delivery.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/services/deliveryZoneService.js", () => ({
  isZoneGatingActive: jest.fn(),
  resolveZoneForPoint: jest.fn(),
}));
jest.unstable_mockModule("../app/services/porter/porterPaymentService.js", () => ({
  openBookingPayment,
  verifyBookingReceipt: jest.fn(),
  getBookingPaymentHistory: jest.fn(),
}));
jest.unstable_mockModule("../app/services/porter/porterDispatchService.js", () => ({
  activatePorterBookingAfterPayment: jest.fn(),
}));
jest.unstable_mockModule("../app/services/cityParcelNotifyService.js", () => ({
  notifyRiderAssigned: jest.fn(),
  notifyCustomerOfStatus: jest.fn(),
}));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitToCustomer: jest.fn(),
  emitToAdmins: jest.fn(),
  emitToDelivery: jest.fn(),
}));
jest.unstable_mockModule("../app/services/riderCashService.js", () => ({
  recordCodCollection: jest.fn(),
}));
jest.unstable_mockModule("../app/services/porter/customerLedgerService.js", () => ({
  recordPorterCodCollected: jest.fn(),
}));

const { createCityParcel } = await import("../app/controller/cityParcelController.js");

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

const REQUEST_BODY = {
  pickupAddress: PICKUP,
  dropAddress: DROP,
  sender: { name: "Asha Kumari", phone: "9876543210" },
  receiver: { name: "Ravi Sharma", phone: "9876543211" },
  package: PKG,
};

const create = (body) => {
  const res = mockRes();
  return createCityParcel({ body, user: { id: CUSTOMER } }, res).then(() => res);
};

/** A saved CityParcel document, with just enough surface for the handler. */
function existingDoc(overrides = {}) {
  return {
    _id: "existing-doc-id",
    referenceId: "CP-OLD1",
    status: "REQUESTED",
    paymentStatus: "PENDING",
    paymentMethod: "UPI",
    razorpayOrderId: "order_dead_1",
    set: jest.fn(),
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const QUOTE = {
  serviceable: true,
  distanceKm: 6,
  distanceSource: "route",
  fare: 129.64,
  fareBreakdown: { baseFare: 30, distanceFare: 72, weightFare: 20, platformCharge: 5 },
  zone: { _id: "zone-1" },
  config: {},
};

beforeEach(() => {
  jest.clearAllMocks();
  quoteTrip.mockResolvedValue(QUOTE);
  computeDeliverySla.mockReturnValue({
    deliveryEta: new Date("2026-01-01T12:00:00Z"),
    deliveryDeadline: new Date("2026-01-01T12:30:00Z"),
  });
  openBookingPayment.mockResolvedValue({
    payment: { _id: "pp-1" },
    checkout: {
      orderId: "order_new_1",
      keyId: "rzp_test",
      amount: 12964,
      currency: "INR",
    },
    reused: false,
  });
});

describe("createCityParcel · resuming a cancelled online payment", () => {
  it("reuses the matching unpaid attempt instead of creating a new row", async () => {
    const existing = existingDoc();
    cityParcelFindOne.mockReturnValue({ sort: () => Promise.resolve(existing) });

    const res = await create({ ...REQUEST_BODY, paymentMethod: "UPI" });

    expect(cityParcelCreateWithReference).not.toHaveBeenCalled();
    expect(existing.set).toHaveBeenCalledWith(
      expect.objectContaining({ fare: 129.64, distanceKm: 6 }),
    );
    expect(existing.save).toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.body.result.parcel).toBe(existing);
  });

  it("opens a fresh gateway order on the resumed row, clearing the dead one", async () => {
    const existing = existingDoc();
    cityParcelFindOne.mockReturnValue({ sort: () => Promise.resolve(existing) });

    await create({ ...REQUEST_BODY, paymentMethod: "UPI" });

    // The old order was tied to a checkout sheet that is already gone; a
    // stale id here would let a client try to pay against a dead order.
    expect(existing.razorpayOrderId).toBe("order_new_1");
    expect(openBookingPayment).toHaveBeenCalledTimes(1);
  });

  it("logs the retry distinctly from a genuine new booking", async () => {
    const existing = existingDoc();
    cityParcelFindOne.mockReturnValue({ sort: () => Promise.resolve(existing) });

    await create({ ...REQUEST_BODY, paymentMethod: "UPI" });

    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ note: "Payment retried on the same booking" }),
    );
  });

  it("matches on customer, route, package and payment method", async () => {
    cityParcelFindOne.mockReturnValue({ sort: () => Promise.resolve(null) });
    cityParcelCreateWithReference.mockResolvedValue({ _id: "new-1", save: jest.fn() });

    await create({ ...REQUEST_BODY, paymentMethod: "UPI" });

    const query = cityParcelFindOne.mock.calls[0][0];
    expect(query).toMatchObject({
      customerId: CUSTOMER,
      status: "REQUESTED",
      paymentStatus: "PENDING",
      paymentMethod: "UPI",
      "pickupAddress.lat": PICKUP.lat,
      "pickupAddress.lng": PICKUP.lng,
      "dropAddress.lat": DROP.lat,
      "dropAddress.lng": DROP.lng,
      "package.weightKg": 2,
      "package.packageType": "document",
    });
  });

  it("creates a fresh row when no matching unpaid attempt exists", async () => {
    cityParcelFindOne.mockReturnValue({ sort: () => Promise.resolve(null) });
    const created = { _id: "new-1", save: jest.fn() };
    cityParcelCreateWithReference.mockResolvedValue(created);

    await create({ ...REQUEST_BODY, paymentMethod: "UPI" });

    expect(cityParcelCreateWithReference).toHaveBeenCalledTimes(1);
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ note: "Booking created" }),
    );
  });

  it("never looks for a resumable row on COD, which has no cancel-retry step", async () => {
    cityParcelCreateWithReference.mockResolvedValue({ _id: "cod-1" });
    startBroadcast.mockResolvedValue({ parcel: { _id: "cod-1", status: "SEARCHING" } });

    await create({ ...REQUEST_BODY, paymentMethod: "COD" });

    expect(cityParcelFindOne).not.toHaveBeenCalled();
    expect(cityParcelCreateWithReference).toHaveBeenCalledTimes(1);
  });

  it("does not resume an attempt paid with a different method", async () => {
    cityParcelFindOne.mockReturnValue({ sort: () => Promise.resolve(null) });
    cityParcelCreateWithReference.mockResolvedValue({ _id: "card-1", save: jest.fn() });

    await create({ ...REQUEST_BODY, paymentMethod: "CARD" });

    const query = cityParcelFindOne.mock.calls[0][0];
    expect(query.paymentMethod).toBe("CARD");
  });

  it("only searches within the resumable time window", async () => {
    cityParcelFindOne.mockReturnValue({ sort: () => Promise.resolve(null) });
    cityParcelCreateWithReference.mockResolvedValue({ _id: "new-1", save: jest.fn() });

    const before = Date.now();
    await create({ ...REQUEST_BODY, paymentMethod: "UPI" });
    const after = Date.now();

    const query = cityParcelFindOne.mock.calls[0][0];
    const cutoff = query.createdAt.$gte.getTime();
    // Default window is 1 hour; the cutoff must land inside it, not be
    // unbounded (which would resume bookings from days ago) or absent.
    expect(cutoff).toBeGreaterThan(before - 3600_000 - 1000);
    expect(cutoff).toBeLessThanOrEqual(after - 3600_000 + 1000);
  });
});
