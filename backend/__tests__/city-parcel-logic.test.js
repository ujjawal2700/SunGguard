import { jest } from "@jest/globals";

/**
 * The rules that decide whether a parcel is delivered, retried, or sent back.
 * These are pure functions and deserve to be pinned down: a mistake here
 * either strands a rider at a door or marks an undelivered parcel delivered.
 */

const {
  canTransition,
  nextStatuses,
  isTerminal,
} = await import("../app/services/cityParcelStateMachine.js");

const {
  computeCityParcelFare,
  computeRiderEarning,
  computeReturnLegAmounts,
  computeWaitingCharge,
  computeDeliverySla,
} = await import("../app/services/cityParcelFareService.js");

const { checkDropProximity } = await import(
  "../app/services/cityParcelVerificationService.js"
);

const config = {
  baseFare: 30,
  perKmCharge: 12,
  weightCharge: 10,
  minFare: 45,
  platformCharge: 0,
  expressCharge: 20,
  riderBaseFareSharePercent: 80,
  riderDistanceFareSharePercent: 80,
  returnRiderPayoutPercent: 60,
  returnCustomerChargePercent: 0,
  freeWaitMinutes: 5,
  perMinuteWaiting: 2,
  deliverySlaMinutesPerKm: 4,
  deliverySlaFloorMinutes: 30,
};

describe("city parcel state machine", () => {
  test("a parcel cannot skip pickup on its way to delivery", () => {
    // This is the transition the pickup-service allow-list permits today.
    expect(canTransition("ACCEPTED", "OUT_FOR_DELIVERY")).toBe(false);
    expect(canTransition("ACCEPTED", "PICKUP_REACHED")).toBe(true);
    expect(canTransition("PICKUP_REACHED", "PICKED_UP")).toBe(true);
  });

  test("cancelling stops being possible once the rider has the parcel", () => {
    expect(canTransition("PICKUP_REACHED", "CANCELLED")).toBe(true);
    expect(canTransition("PICKED_UP", "CANCELLED")).toBe(false);
    expect(canTransition("OUT_FOR_DELIVERY", "CANCELLED")).toBe(false);
  });

  test("a failed delivery can go back out or go home, but never to delivered", () => {
    expect(canTransition("DELIVERY_FAILED", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canTransition("DELIVERY_FAILED", "RETURN_IN_TRANSIT")).toBe(true);
    expect(canTransition("DELIVERY_FAILED", "DELIVERED")).toBe(false);
  });

  test("terminal states are genuinely terminal", () => {
    for (const status of ["DELIVERED", "RETURNED", "CANCELLED"]) {
      expect(isTerminal(status)).toBe(true);
      expect(nextStatuses(status)).toEqual([]);
    }
  });

  test("delivery is only reachable from the door", () => {
    const reaching = ["REQUESTED", "SEARCHING", "ACCEPTED", "PICKED_UP", "OUT_FOR_DELIVERY"]
      .filter((s) => canTransition(s, "DELIVERED"));
    expect(reaching).toEqual([]);
    expect(canTransition("DROP_REACHED", "DELIVERED")).toBe(true);
  });
});

describe("city parcel pricing", () => {
  test("short trips are lifted to the minimum fare", () => {
    const quote = computeCityParcelFare({ config, distanceKm: 0.4, weightKg: 0.2 });
    expect(quote.minFareApplied).toBe(true);
    expect(quote.fare).toBe(45);
  });

  test("base fare is actually charged", () => {
    // The pickup-service fare util hard-codes this to zero, which silently
    // zeroes the rider's base-fare share too.
    const quote = computeCityParcelFare({ config, distanceKm: 6.2, weightKg: 1.5 });
    expect(quote.baseFare).toBe(30);
    expect(quote.fare).toBe(119.4);
  });

  test("express adds its surcharge", () => {
    const normal = computeCityParcelFare({ config, distanceKm: 6.2, weightKg: 1.5 });
    const express = computeCityParcelFare({
      config,
      distanceKm: 6.2,
      weightKg: 1.5,
      deliverySpeed: "express",
    });
    expect(express.fare - normal.fare).toBe(20);
  });

  test("the rider earns a share of base and distance, not of the whole fare", () => {
    const quote = computeCityParcelFare({ config, distanceKm: 6.2, weightKg: 1.5 });
    const earning = computeRiderEarning(quote, config);
    // 80% of (30 + 74.4) -- the weight charge is the platform's.
    expect(earning).toBe(83.52);
    expect(earning).toBeLessThan(quote.fare);
  });

  test("return pay and return billing are independent", () => {
    const quote = computeCityParcelFare({ config, distanceKm: 6.2, weightKg: 1.5 });
    const amounts = computeReturnLegAmounts({ ...quote }, config);

    // The rider is paid for the extra leg even though the customer is not
    // billed for it. One shared number could not express this.
    expect(amounts.riderPayout).toBeGreaterThan(0);
    expect(amounts.customerCharge).toBe(0);
  });

  test("waiting is free up to the allowance, then per minute", () => {
    expect(computeWaitingCharge(4, config)).toBe(0);
    expect(computeWaitingCharge(5, config)).toBe(0);
    expect(computeWaitingCharge(12, config)).toBe(14);
    // Partial minutes are never billed.
    expect(computeWaitingCharge(12.9, config)).toBe(14);
  });

  test("a very short trip still gets a believable ETA", () => {
    const tiny = computeDeliverySla({ distanceKm: 0.4, config });
    expect(tiny.etaMinutes).toBeGreaterThanOrEqual(30);
    expect(tiny.deliveryDeadline.getTime()).toBeGreaterThan(tiny.deliveryEta.getTime());
  });
});

describe("proximity gate", () => {
  const gate = { dropProximityMeters: 120, allowProximityOverride: true, maxLocationAgeSeconds: 120 };
  const B = { lat: 22.75, lng: 75.89 };

  test("passes at the door", async () => {
    const r = await checkDropProximity({
      target: B,
      riderLocation: { lat: 22.75005, lng: 75.89005, accuracyM: 8 },
      config: gate,
    });
    expect(r.passed).toBe(true);
  });

  test("fails from streets away", async () => {
    const r = await checkDropProximity({
      target: B,
      riderLocation: { lat: 22.753, lng: 75.893, accuracyM: 10 },
      config: gate,
    });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe("TOO_FAR");
    expect(r.message).toMatch(/\d+ m from the address/);
  });

  test("a poor GPS fix at the door is not punished", async () => {
    // 106 m measured, but the phone admits to 60 m of error -- which is
    // normal in a stairwell or a basement, where parcels get delivered.
    const r = await checkDropProximity({
      target: B,
      riderLocation: { lat: 22.75095, lng: 75.8901, accuracyM: 60 },
      config: gate,
    });
    expect(r.distanceMeters).toBeGreaterThan(100);
    expect(r.effectiveMeters).toBeLessThan(60);
    expect(r.passed).toBe(true);
  });

  test("no location is refused rather than assumed", async () => {
    const r = await checkDropProximity({ target: B, riderLocation: {}, config: gate });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe("NO_FIX");
  });
});
