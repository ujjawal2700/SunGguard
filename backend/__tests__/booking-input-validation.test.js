import { jest } from "@jest/globals";
import {
  createCityParcelSchema,
  calculateCityFareSchema,
} from "../app/validation/cityParcelValidation.js";

/**
 * What a booking form is allowed to send.
 *
 * Both porter booking screens used to gate on `value.trim()` alone, and the
 * outstation create endpoint had no field validation at all — a name could be
 * "12345", the phone a rider has to call could be "abc", and a missing map pin
 * became NaN that only surfaced as a routing failure. These lock the rules in
 * on the server, where the client cannot bypass them.
 */

const PICKUP = { fullAddress: "12 Test Street, Connaught Place, Delhi", lat: 28.6139, lng: 77.209 };
const DROP = { fullAddress: "44 Other Road, Civil Lines, Delhi", lat: 28.6448, lng: 77.2167 };

const validBooking = {
  pickupAddress: PICKUP,
  dropAddress: DROP,
  sender: { name: "Asha Kumari", phone: "9876543210" },
  receiver: { name: "Ravi Sharma", phone: "9876543211" },
  package: { packageType: "document", weightKg: 2, description: "papers" },
  paymentMethod: "COD",
};

const reject = (body) => createCityParcelSchema.validate(body).error;
const accept = (body) => {
  const { error } = createCityParcelSchema.validate(body);
  if (error) throw new Error(`expected valid, got: ${error.message}`);
  return true;
};

describe("local booking · names", () => {
  it("accepts a booking with everything filled in properly", () => {
    expect(accept(validBooking)).toBe(true);
  });

  it.each([
    ["a phone number typed into the name box", "9876543210"],
    ["a name that is only digits", "12345"],
    ["a name with a digit in it", "Ravi2"],
    ["punctuation with no letters", "@@@"],
    ["a single character", "R"],
    ["nothing at all", ""],
  ])("rejects %s", (_label, name) => {
    expect(reject({ ...validBooking, receiver: { ...validBooking.receiver, name } })).toBeTruthy();
  });

  it.each([
    ["a plain name", "Ravi Sharma"],
    ["initials", "R. K. Sharma"],
    ["an apostrophe", "D'Souza"],
    ["a hyphen", "Anne-Marie"],
    ["a non-Latin script", "रवि शर्मा"],
  ])("accepts %s", (_label, name) => {
    expect(reject({ ...validBooking, receiver: { ...validBooking.receiver, name } })).toBeUndefined();
  });

  it("applies the same rule to the sender", () => {
    expect(reject({ ...validBooking, sender: { name: "12345", phone: "9876543210" } })).toBeTruthy();
    expect(reject({ ...validBooking, sender: { name: "Asha", phone: "9876543210" } })).toBeUndefined();
  });

  it("still books when an older client sends no sender at all", () => {
    const { sender, ...withoutSender } = validBooking;
    expect(accept(withoutSender)).toBe(true);
  });
});

describe("local booking · phone numbers", () => {
  it.each([
    ["letters", "abcdefghij"],
    ["too few digits", "12345"],
    ["too many digits", "98765432101234"],
    ["a landline-style leading digit", "1234567890"],
    ["a name typed into the phone box", "Ravi Sharma"],
    ["nothing at all", ""],
  ])("rejects %s", (_label, phone) => {
    expect(reject({ ...validBooking, receiver: { ...validBooking.receiver, phone } })).toBeTruthy();
  });

  it.each([
    ["a bare 10-digit number", "9876543210"],
    ["a +91 prefix", "+919876543210"],
    ["a 0 prefix", "09876543210"],
    ["a spaced +91", "+91 9876543210"],
  ])("accepts %s", (_label, phone) => {
    expect(reject({ ...validBooking, receiver: { ...validBooking.receiver, phone } })).toBeUndefined();
  });
});

describe("local booking · addresses and package", () => {
  it("rejects an address too short to find", () => {
    expect(reject({ ...validBooking, pickupAddress: { ...PICKUP, fullAddress: "x" } })).toBeTruthy();
  });

  it("rejects a missing map pin", () => {
    const { lat, ...noLat } = PICKUP;
    expect(reject({ ...validBooking, pickupAddress: noLat })).toBeTruthy();
  });

  it("rejects coordinates outside the world", () => {
    expect(reject({ ...validBooking, pickupAddress: { ...PICKUP, lat: 200 } })).toBeTruthy();
    expect(reject({ ...validBooking, pickupAddress: { ...PICKUP, lng: -900 } })).toBeTruthy();
  });

  it("rejects a weight of zero or beyond what a bike carries", () => {
    expect(reject({ ...validBooking, package: { packageType: "document", weightKg: 0 } })).toBeTruthy();
    expect(reject({ ...validBooking, package: { packageType: "document", weightKg: 500 } })).toBeTruthy();
  });

  it("rejects an over-long description rather than truncating it", () => {
    expect(
      reject({
        ...validBooking,
        package: { packageType: "document", weightKg: 1, description: "x".repeat(501) },
      }),
    ).toBeTruthy();
  });

  it("rejects an unknown payment method", () => {
    expect(reject({ ...validBooking, paymentMethod: "CASHAPP" })).toBeTruthy();
    expect(reject({ ...validBooking, paymentMethod: "" })).toBeTruthy();
  });

  it("rejects a booking with no receiver", () => {
    const { receiver, ...noReceiver } = validBooking;
    expect(reject(noReceiver)).toBeTruthy();
  });

  it("rejects fields the schema does not know, rather than ignoring them", () => {
    expect(reject({ ...validBooking, fare: 1 })).toBeTruthy();
  });
});

describe("fare quote input", () => {
  it("needs both ends and the package before it will price anything", () => {
    expect(
      calculateCityFareSchema.validate({
        pickupAddress: PICKUP,
        dropAddress: DROP,
        package: { packageType: "document", weightKg: 2 },
      }).error,
    ).toBeUndefined();

    expect(calculateCityFareSchema.validate({ pickupAddress: PICKUP }).error).toBeTruthy();
  });

  it("does not ask for a receiver just to quote a price", () => {
    const { error } = calculateCityFareSchema.validate({
      pickupAddress: PICKUP,
      dropAddress: DROP,
      package: { packageType: "document", weightKg: 2 },
    });
    expect(error).toBeUndefined();
  });
});
