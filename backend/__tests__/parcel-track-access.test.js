import { jest } from "@jest/globals";
import mongoose from "mongoose";

/**
 * Who may read a waybill.
 *
 * `GET /parcel/track/:id` used to look the parcel up by id and return it to
 * any signed-in caller, so anyone could walk ids and collect other people's
 * names, phone numbers, home addresses and the pickup OTP that authorises a
 * handover. Access is now scoped to the people with a reason to see it.
 */

const OWNER = new mongoose.Types.ObjectId().toString();
const RIDER = new mongoose.Types.ObjectId().toString();
const STRANGER = new mongoose.Types.ObjectId().toString();
const PARCEL = new mongoose.Types.ObjectId().toString();

const parcelFindById = jest.fn();

/** findById(...).populate().populate()... resolves to the doc. */
const populated = (doc) => {
  const q = {
    populate: () => q,
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
  };
  return q;
};

jest.unstable_mockModule("../app/models/parcel.js", () => ({
  default: { findById: parcelFindById },
}));

const { trackParcel } = await import("../app/controller/parcelController.js");

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

const parcelDoc = (overrides = {}) => ({
  _id: PARCEL,
  customerId: { _id: OWNER, name: "Asha", phone: "9876543210" },
  deliveryPartnerId: { _id: RIDER, name: "Rider" },
  status: "PICKED_UP",
  deliverySpeed: "normal",
  otp: "482913",
  fare: 110,
  pickupAddress: { name: "Asha", phone: "9876543210", fullAddress: "12 Test Street" },
  toObject() {
    const { toObject, ...rest } = this;
    return { ...rest };
  },
  ...overrides,
});

const track = (viewerId, role = "customer") => {
  const res = mockRes();
  return trackParcel({ params: { id: PARCEL }, user: { id: viewerId, role } }, res).then(
    () => res,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  parcelFindById.mockReturnValue(populated(parcelDoc()));
});

describe("trackParcel access", () => {
  it("lets the customer who booked it read their own waybill", async () => {
    const res = await track(OWNER);

    expect(res.statusCode).toBe(200);
    expect(res.body.result.fare).toBe(110);
  });

  it("gives the owner the pickup code, which is theirs to read out", async () => {
    const res = await track(OWNER);
    expect(res.body.result.otp).toBe("482913");
  });

  it("lets the assigned rider read it, without the code they are meant to verify", async () => {
    const res = await track(RIDER, "delivery");

    expect(res.statusCode).toBe(200);
    expect(res.body.result.otp).toBeUndefined();
  });

  it("refuses a signed-in stranger", async () => {
    const res = await track(STRANGER);

    // 404 rather than 403, so the endpoint cannot confirm an id exists.
    expect(res.statusCode).toBe(404);
    expect(res.body.result?.otp).toBeUndefined();
    expect(res.body.result?.pickupAddress).toBeUndefined();
  });

  it("refuses a rider who is not carrying this parcel", async () => {
    const res = await track(new mongoose.Types.ObjectId().toString(), "delivery");
    expect(res.statusCode).toBe(404);
  });

  it("lets an admin read it", async () => {
    expect((await track(STRANGER, "admin")).statusCode).toBe(200);
    expect((await track(STRANGER, "parcel_admin")).statusCode).toBe(200);
  });

  it("still refuses a stranger on a parcel with no rider assigned yet", async () => {
    parcelFindById.mockReturnValue(populated(parcelDoc({ deliveryPartnerId: null })));

    expect((await track(STRANGER)).statusCode).toBe(404);
    expect((await track(OWNER)).statusCode).toBe(200);
  });

  it("404s an id that is not a parcel", async () => {
    parcelFindById.mockReturnValue(populated(null));
    expect((await track(OWNER)).statusCode).toBe(404);
  });

  it("handles an unpopulated customerId, which is how lean reads come back", async () => {
    parcelFindById.mockReturnValue(
      populated(parcelDoc({ customerId: OWNER, deliveryPartnerId: RIDER })),
    );

    expect((await track(OWNER)).statusCode).toBe(200);
    expect((await track(STRANGER)).statusCode).toBe(404);
  });
});
