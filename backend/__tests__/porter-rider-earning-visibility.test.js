import { jest } from "@jest/globals";

/**
 * Regression cover for two defects found by driving the rider app in a real
 * browser, both of which advertised a rider's pay as zero:
 *
 *  1. `RIDER_SAFE_FIELDS` did not project `fareBreakdown`, so the available-
 *     jobs feed called `computeRiderEarning(undefined)` and every open city
 *     job was offered as "earn ₹0".
 *  2. The assigned-jobs endpoint returned the STORED `riderEarning`, which is
 *     only written at settlement, so a rider carrying a parcel saw "0 you
 *     earn" from accept through to delivery.
 */

const { computeRiderEarning } = await import("../app/services/cityParcelFareService.js");
const { RIDER_SAFE_FIELDS } = await import("../app/models/cityParcel.js");

const CONFIG = { riderBaseFareSharePercent: 80, riderDistanceFareSharePercent: 70 };

describe("rider feed projects what the payout maths needs", () => {
  it("selects the two pre-tax line items the payout is computed from", () => {
    // Without these the helper receives `undefined` and silently returns 0.
    expect(RIDER_SAFE_FIELDS).toContain("fareBreakdown.baseFare");
    expect(RIDER_SAFE_FIELDS).toContain("fareBreakdown.distanceFare");
  });

  it("does not leak the rest of the fare breakdown to riders", () => {
    // The tax split and the discount are none of the rider's business.
    expect(RIDER_SAFE_FIELDS).not.toContain("fareBreakdown.gstAmount");
    expect(RIDER_SAFE_FIELDS).not.toContain("fareBreakdown.taxableAmount");
    expect(RIDER_SAFE_FIELDS).not.toMatch(/\bfareBreakdown\b(?!\.)/);
  });

  it("computes a real offer from a projection carrying only those two fields", () => {
    // Exactly the shape a `.select(RIDER_SAFE_FIELDS)` lean document has.
    const projected = { fareBreakdown: { baseFare: 40, distanceFare: 101.85 } };
    // 40 × 80% + 101.85 × 70% = 32 + 71.295 = 103.29
    expect(computeRiderEarning(projected.fareBreakdown, CONFIG)).toBe(103.29);
  });

  it("returns zero when the breakdown is missing — the old failure mode", () => {
    expect(computeRiderEarning(undefined, CONFIG)).toBe(0);
    expect(computeRiderEarning({}, CONFIG)).toBe(0);
  });
});

describe("assigned-job earning falls back to the computed offer", () => {
  /** The rule the controller applies when shaping the assigned feed. */
  const shown = (parcel) =>
    Number(parcel.riderEarning) > 0
      ? Number(parcel.riderEarning)
      : computeRiderEarning(parcel.fareBreakdown, CONFIG);

  it("shows the offer while the job is in flight and unsettled", () => {
    const inFlight = { riderEarning: 0, fareBreakdown: { baseFare: 40, distanceFare: 101.85 } };
    expect(shown(inFlight)).toBe(103.29);
  });

  it("shows the settled figure once one exists, not a fresh estimate", () => {
    // An adjusted payout must survive a later rate-card change.
    const settled = { riderEarning: 95.5, fareBreakdown: { baseFare: 40, distanceFare: 101.85 } };
    expect(shown(settled)).toBe(95.5);
  });
});
