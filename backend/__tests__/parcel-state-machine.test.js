import {
  canTransition,
  isTerminal,
  nextStatuses,
  transitionRefusal,
  PARCEL_TERMINAL_STATUSES,
} from "../app/services/parcelStateMachine.js";

/**
 * The outstation rider endpoint used to check only that the status being
 * asked for was a real one, never that the parcel could reach it from where
 * it stood. The two moves that matters most are locked in below: you cannot
 * skip the pickup, and you cannot walk a status backwards.
 */

describe("outstation parcel transitions", () => {
  it("walks the happy path one step at a time", () => {
    const path = [
      "REQUESTED",
      "SEARCHING",
      "ACCEPTED",
      "RIDER_ASSIGNED",
      "PICKUP_REACHED",
      "PICKED_UP",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ];

    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  /**
   * The bug this whole module exists for. PICKUP_REACHED and PICKED_UP are
   * where the pickup OTP is verified and the proof photo is taken; jumping
   * the queue meant a parcel could reach the hub with no evidence it was
   * ever collected from the customer.
   */
  it("refuses a jump from ACCEPTED straight to OUT_FOR_DELIVERY", () => {
    expect(canTransition("ACCEPTED", "OUT_FOR_DELIVERY")).toBe(false);
    expect(canTransition("ACCEPTED", "DELIVERED")).toBe(false);
    expect(canTransition("RIDER_ASSIGNED", "PICKED_UP")).toBe(false);
  });

  it("refuses a status that moves backwards", () => {
    expect(canTransition("PICKED_UP", "PICKUP_REACHED")).toBe(false);
    expect(canTransition("OUT_FOR_DELIVERY", "ACCEPTED")).toBe(false);
    expect(canTransition("DELIVERED", "OUT_FOR_DELIVERY")).toBe(false);
  });

  it("treats a repeat of the current status as no transition at all", () => {
    // Not an error, but not an event either — the caller answers it as a
    // no-op rather than writing a second timeline row for one arrival.
    expect(canTransition("PICKED_UP", "PICKED_UP")).toBe(false);
  });

  it("lets a rider reach the door without announcing the ride first", () => {
    // RIDER_ASSIGNED is an optional "on my way" beat; a rider who is already
    // there should not be stuck behind it.
    expect(canTransition("ACCEPTED", "PICKUP_REACHED")).toBe(true);
  });

  it("allows cancelling only before the rider has the parcel", () => {
    for (const status of ["REQUESTED", "SEARCHING", "ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED"]) {
      expect(canTransition(status, "CANCELLED")).toBe(true);
    }
    expect(canTransition("PICKED_UP", "CANCELLED")).toBe(false);
    expect(canTransition("OUT_FOR_DELIVERY", "CANCELLED")).toBe(false);
  });

  it("lets an exhausted search fall back for manual assignment", () => {
    expect(canTransition("SEARCHING", "REQUESTED")).toBe(true);
  });

  it("lets nothing leave a terminal status", () => {
    for (const status of PARCEL_TERMINAL_STATUSES) {
      expect(isTerminal(status)).toBe(true);
      expect(nextStatuses(status)).toEqual([]);
    }
  });

  it("survives a status it has never heard of", () => {
    expect(canTransition("MADE_UP", "DELIVERED")).toBe(false);
    expect(canTransition(null, "DELIVERED")).toBe(false);
    expect(canTransition("PICKED_UP", undefined)).toBe(false);
  });
});

describe("refusal messages", () => {
  it("says the parcel is already done rather than that the status is invalid", () => {
    expect(transitionRefusal("DELIVERED", "OUT_FOR_DELIVERY")).toMatch(/already been dropped/i);
    expect(transitionRefusal("CANCELLED", "PICKED_UP")).toMatch(/cancelled/i);
  });

  it("names where the parcel actually is, so the rider knows which screen to use", () => {
    expect(transitionRefusal("ACCEPTED", "OUT_FOR_DELIVERY")).toMatch(/accepted/i);
    expect(transitionRefusal("RIDER_ASSIGNED", "PICKED_UP")).toMatch(/rider assigned/i);
  });
});
