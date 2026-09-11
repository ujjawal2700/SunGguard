import { jest } from "@jest/globals";

/**
 * AUDIT HARNESS — coupon x GST x payment interaction across the Porter matrix.
 *
 * Runs the REAL pricing, tax and coupon engines. Only the Coupon/CityParcel/
 * Parcel model reads are stubbed, because the arithmetic under audit does not
 * depend on Mongo. Every expectation below is calculated by hand in the
 * comment above it, so a failure says which of the two is wrong.
 */

const findOne = jest.fn();
const findById = jest.fn();
const countDocuments = jest.fn().mockResolvedValue(0);

jest.unstable_mockModule("../app/models/coupon.js", () => ({
  default: {
    findOne: (...a) => ({ session: () => ({ lean: () => findOne(...a) }), lean: () => findOne(...a) }),
    findById: (...a) => ({ session: () => ({ lean: () => findById(...a) }), lean: () => findById(...a) }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  },
}));
jest.unstable_mockModule("../app/models/order.js", () => ({ default: { countDocuments, find: jest.fn() } }));
jest.unstable_mockModule("../app/models/cityParcel.js", () => ({
  default: { countDocuments: (...a) => ({ session: () => countDocuments(...a) , then: (r)=>Promise.resolve(0).then(r) }) },
}));
jest.unstable_mockModule("../app/models/parcel.js", () => ({
  default: { countDocuments: (...a) => ({ session: () => countDocuments(...a), then: (r)=>Promise.resolve(0).then(r) }) },
}));

const { computeBookingDiscount } = await import("../app/services/finance/couponService.js");
const { computeCityParcelFare, computeRiderEarning } = await import(
  "../app/services/cityParcelFareService.js"
);
const { computeParcelDailyFare, applyBillableDaysToFare } = await import(
  "../app/utils/parcelFare.js"
);
const { rebaseGstAfterDiscount } = await import("../app/utils/gst.js");

const money = (n) => Math.round(Number(n) * 100) / 100;

/** Rate card as an admin would save it on /admin/city-parcels/pricing. */
const CITY = {
  baseFare: 30,
  perKmCharge: 12,
  weightCharge: 10,
  minFare: 45,
  platformCharge: 5,
  expressCharge: 20,
  riderBaseFareSharePercent: 80,
  riderDistanceFareSharePercent: 70,
};

const PARCEL = { perKmCharge: 10, weightCharge: 15, expressCharge: 25 };

const GST_ON = { enabled: true, percent: 18, inclusive: false, gstin: "27AAAAA0000A1Z5" };
const GST_OFF = { enabled: false, percent: 0 };

const PCT10 = {
  _id: "c1",
  code: "SAVE10",
  isActive: true,
  discountType: "percentage",
  discountValue: 10,
  appliesTo: ["porter_local", "porter_outstation"],
};

/* ======================================================================
   1. Local fare arithmetic, GST off then on
   ====================================================================== */

describe("local fare: GST off vs on", () => {
  // 5 km, 2 kg, normal speed.
  // base 30 + distance (5 x 12 = 60) + weight (2 x 10 = 20) + platform 5 = 115
  const args = { config: { ...CITY, gst: GST_OFF }, distanceKm: 5, weightKg: 2 };

  it("GST OFF: fare is the untaxed subtotal", () => {
    const q = computeCityParcelFare(args);
    expect(q.fare).toBe(115);
    expect(q.taxableAmount).toBe(115);
    expect(q.gstAmount).toBe(0);
  });

  it("GST ON 18%: 115 taxable, 20.70 tax, 135.70 gross", () => {
    const q = computeCityParcelFare({ ...args, config: { ...CITY, gst: GST_ON } });
    expect(q.taxableAmount).toBe(115);
    expect(q.gstAmount).toBe(20.7); // 115 x 0.18
    expect(q.cgst + q.sgst).toBe(20.7); // 10.35 + 10.35
    expect(q.fare).toBe(135.7);
  });
});

/* ======================================================================
   2. THE CORE AUDIT — what a coupon does to the tax base
   ====================================================================== */

describe("coupon x GST: does the invoice reconcile with the tax actually due?", () => {
  beforeEach(() => {
    findOne.mockResolvedValue(PCT10);
    findById.mockResolvedValue(PCT10);
  });

  it("GST OFF + 10% coupon: discount 11.50, payable 103.50", async () => {
    const q = computeCityParcelFare({ config: { ...CITY, gst: GST_OFF }, distanceKm: 5, weightKg: 2 });
    const d = await computeBookingDiscount({
      couponCode: "SAVE10",
      bookingKind: "porter_local",
      fareAmount: q.fare,
    });
    // 10% of 115 = 11.50 -> payable 103.50. No tax involved, nothing to reconcile.
    expect(d.discountAmount).toBe(11.5);
    expect(d.payableFare).toBe(103.5);
  });

  it("GST ON + 10% coupon: records the tax base and what the customer pays", async () => {
    const q = computeCityParcelFare({ config: { ...CITY, gst: GST_ON }, distanceKm: 5, weightKg: 2 });
    const d = await computeBookingDiscount({
      couponCode: "SAVE10",
      bookingKind: "porter_local",
      fareAmount: q.fare, // 135.70 — the TAX-INCLUSIVE gross
    });

    // The coupon is applied to the tax-inclusive gross, so "10% off" takes
    // 13.57 rather than 10% of the pre-tax 115 (= 11.50).
    expect(d.discountAmount).toBe(13.57);
    expect(d.payableFare).toBe(122.13);

    // What gets persisted on the booking as the tax record:
    const storedTaxable = q.taxableAmount; // 115
    const storedGst = q.gstAmount; // 20.70

    // INVARIANT UNDER AUDIT: the tax recorded as charged should be the tax on
    // the consideration actually received. Customer paid 122.13; at 18% that
    // implies taxable 103.50 and GST 18.63.
    const impliedTaxable = money(d.payableFare / 1.18); // 103.50
    const impliedGst = money(d.payableFare - impliedTaxable); // 18.63

    expect(impliedTaxable).toBe(103.5);
    expect(impliedGst).toBe(18.63);

    // The gap the platform over-declares, per booking:
    const overDeclared = money(storedGst - impliedGst);
    expect(overDeclared).toBe(2.07); // == 18% of the 11.50 pre-tax discount

    // Documents the raw rate-card output before re-attribution.
    expect(storedTaxable).toBe(115);
    expect(storedGst).toBe(20.7);

    // ...and the fix puts the tax back onto the money that changed hands.
    const rebased = rebaseGstAfterDiscount(q, d.payableFare);
    expect(rebased.taxableAmount).toBe(103.5);
    expect(rebased.gstAmount).toBe(18.63);
    // Compared in paise: the halves are 9.31 + 9.32 and adding them as floats
    // is what drifts, not the split itself.
    expect(money(rebased.cgst + rebased.sgst)).toBe(18.63);
    expect(rebased.preDiscountTaxableAmount).toBe(115);
    // The invoice now closes: taxable + tax == what the customer paid.
    expect(money(rebased.taxableAmount + rebased.gstAmount)).toBe(d.payableFare);
  });

  it("a fixed-amount coupon also lands the tax on the amount paid", async () => {
    findOne.mockResolvedValue({ ...PCT10, discountType: "fixed", discountValue: 20 });
    const q = computeCityParcelFare({ config: { ...CITY, gst: GST_ON }, distanceKm: 5, weightKg: 2 });
    const d = await computeBookingDiscount({
      couponCode: "SAVE10",
      bookingKind: "porter_local",
      fareAmount: q.fare,
    });
    // 135.70 - 20 = 115.70 paid. The customer total is unchanged by the fix.
    expect(d.payableFare).toBe(115.7);

    const rebased = rebaseGstAfterDiscount(q, d.payableFare);
    // 115.70 / 1.18 = 98.05 taxable, tax 17.65.
    expect(rebased.taxableAmount).toBe(98.05);
    expect(rebased.gstAmount).toBe(17.65);
    expect(money(rebased.taxableAmount + rebased.gstAmount)).toBe(115.7);
  });

  it("with GST off, the taxable value is the discounted amount, not the list fare", async () => {
    findOne.mockResolvedValue(PCT10);
    const q = computeCityParcelFare({ config: { ...CITY, gst: GST_OFF }, distanceKm: 5, weightKg: 2 });
    const d = await computeBookingDiscount({
      couponCode: "SAVE10",
      bookingKind: "porter_local",
      fareAmount: q.fare,
    });
    const rebased = rebaseGstAfterDiscount(q, d.payableFare);
    expect(rebased.taxableAmount).toBe(103.5);
    expect(rebased.gstAmount).toBe(0);
    expect(rebased.preDiscountTaxableAmount).toBe(115);
  });

  it("leaves an inclusive rate card reconciling too", async () => {
    findOne.mockResolvedValue(PCT10);
    const inclusive = computeCityParcelFare({
      config: { ...CITY, gst: { enabled: true, percent: 18, inclusive: true } },
      distanceKm: 5,
      weightKg: 2,
    });
    // Inclusive: the customer pays the 115 quoted, tax backed out of it.
    expect(inclusive.fare).toBe(115);
    expect(inclusive.taxableAmount).toBe(97.46);
    expect(inclusive.gstAmount).toBe(17.54);

    const d = await computeBookingDiscount({
      couponCode: "SAVE10",
      bookingKind: "porter_local",
      fareAmount: inclusive.fare,
    });
    expect(d.payableFare).toBe(103.5); // 115 - 11.50

    const rebased = rebaseGstAfterDiscount(inclusive, d.payableFare);
    expect(money(rebased.taxableAmount + rebased.gstAmount)).toBe(103.5);
    expect(rebased.gstInclusive).toBe(true);
  });
});

/* ======================================================================
   2b. Outstation bookings must actually persist their tax split
   ====================================================================== */

describe("outstation breakdown carries the tax it charged", () => {
  it("exposes every field the booking record and GST report read", () => {
    const daily = computeParcelDailyFare({ config: PARCEL, distanceKm: 5, weightKg: 2 });
    const priced = applyBillableDaysToFare(daily, 1, GST_ON);

    // 80 taxable, 14.40 tax, 94.40 charged to the customer.
    expect(priced.fare).toBe(94.4);
    expect(priced.taxableAmount).toBe(80);
    expect(priced.gstAmount).toBe(14.4);
    expect(priced.cgst).toBe(7.2);
    expect(priced.sgst).toBe(7.2);
    expect(priced.gstPercent).toBe(18);
    expect(priced.gstin).toBe("27AAAAA0000A1Z5");
    expect(priced.gstInclusive).toBe(false);

    // The controller copies these onto `fareBreakdown`; a zero here is what
    // made outstation tax invisible to the invoice and the GST report.
    expect(priced.gstAmount).toBeGreaterThan(0);
    expect(priced.taxableAmount).toBeGreaterThan(0);
  });
});

/* ======================================================================
   3. Rider earning must be immune to both GST and coupon
   ====================================================================== */

describe("rider earning is insulated from tax and discount", () => {
  it("pays the same on an identical trip whether GST is on or off", () => {
    const off = computeCityParcelFare({ config: { ...CITY, gst: GST_OFF }, distanceKm: 5, weightKg: 2 });
    const on = computeCityParcelFare({ config: { ...CITY, gst: GST_ON }, distanceKm: 5, weightKg: 2 });
    // 30 x 80% + 60 x 70% = 24 + 42 = 66
    expect(computeRiderEarning(off, CITY)).toBe(66);
    expect(computeRiderEarning(on, CITY)).toBe(66);
  });
});

/* ======================================================================
   3b. The whole chain: quote -> coupon -> stored booking -> invoice
   ====================================================================== */

describe("invoice reconciles end to end", () => {
  it("charges - discount + tax == the amount the customer pays", async () => {
    findOne.mockResolvedValue(PCT10);

    const quote = computeCityParcelFare({
      config: { ...CITY, gst: GST_ON },
      distanceKm: 5,
      weightKg: 2,
    });
    const d = await computeBookingDiscount({
      couponCode: "SAVE10",
      bookingKind: "porter_local",
      fareAmount: quote.fare,
    });

    // Exactly what the controller now persists on the booking.
    const stored = { ...quote, ...rebaseGstAfterDiscount(quote, d.payableFare) };

    // The pre-tax charge lines the invoice prints.
    const chargeLines =
      stored.baseFare + stored.distanceFare + stored.weightFare + stored.platformCharge;
    expect(money(chargeLines)).toBe(115);

    // The discount the invoice puts against those lines.
    const taxableDiscount = money(stored.preDiscountTaxableAmount - stored.taxableAmount);
    expect(taxableDiscount).toBe(11.5);

    // Invoice subtotal is the taxable value, and the lines resolve to it.
    expect(money(chargeLines - taxableDiscount)).toBe(stored.taxableAmount);

    // Subtotal + tax == total == what payment/COD will actually collect.
    expect(money(stored.taxableAmount + stored.gstAmount)).toBe(d.payableFare);

    // And the customer's headline saving is still the full 13.57.
    expect(d.discountAmount).toBe(13.57);
    expect(money(taxableDiscount + (stored.preDiscountTaxableAmount * 0.18 - stored.gstAmount)))
      .toBe(13.57);
  });
});

describe("outstation legacy payout fallback excludes tax", () => {
  it("pays a share of the pre-tax value, not of the tax-inclusive fare", async () => {
    const { computeRiderParcelEarnings } = await import(
      "../app/services/parcelWorkflowService.js"
    );

    // A legacy row: fare recorded, no pre-tax line items, but tax was charged.
    // fare 118 = 100 taxable + 18 tax. 80% of the taxable 100 is 80 —
    // 80% of 118 would be 94.40, handing the rider 14.40 of the government's
    // tax.
    const legacyWithTax = {
      fare: 118,
      fareBreakdown: { taxableAmount: 100, gstAmount: 18 },
    };
    expect(computeRiderParcelEarnings(legacyWithTax, { riderSharePercent: 80 })).toBe(80);

    // Derives the same answer when only the tax amount was recorded.
    const noTaxable = { fare: 118, fareBreakdown: { gstAmount: 18 } };
    expect(computeRiderParcelEarnings(noTaxable, { riderSharePercent: 80 })).toBe(80);

    // A booking from before GST existed is untouched: 80% of 118 = 94.40.
    const preGst = { fare: 118, fareBreakdown: {} };
    expect(computeRiderParcelEarnings(preGst, { riderSharePercent: 80 })).toBe(94.4);
  });
});

/* ======================================================================
   4. Outstation multi-day: tax on the total, not per day
   ====================================================================== */

describe("outstation fare with billable days", () => {
  it("taxes the multi-day total once", () => {
    const daily = computeParcelDailyFare({
      config: PARCEL,
      distanceKm: 5,
      weightKg: 2,
      platformCharge: 0,
    });
    // (5 x 10) + (2 x 15) = 50 + 30 = 80/day
    expect(daily.fare).toBe(80);

    const priced = applyBillableDaysToFare(daily, 7, GST_ON);
    // 80 x 7 = 560 taxable; 18% = 100.80; gross 660.80
    expect(priced.taxableAmount).toBe(560);
    expect(priced.gstAmount).toBe(100.8);
    expect(priced.fare).toBe(660.8);
  });
});

/* ======================================================================
   5. Coupon clamps
   ====================================================================== */

describe("coupon clamps", () => {
  it("a fixed coupon larger than the fare cannot make the payable negative", async () => {
    findOne.mockResolvedValue({
      ...PCT10,
      discountType: "fixed",
      discountValue: 10000,
    });
    const q = computeCityParcelFare({ config: { ...CITY, gst: GST_ON }, distanceKm: 5, weightKg: 2 });
    const d = await computeBookingDiscount({
      couponCode: "SAVE10",
      bookingKind: "porter_local",
      fareAmount: q.fare,
    });
    expect(d.discountAmount).toBe(135.7);
    expect(d.payableFare).toBe(0);
  });

  it("honours maxDiscount", async () => {
    findOne.mockResolvedValue({ ...PCT10, discountValue: 50, maxDiscount: 20 });
    const q = computeCityParcelFare({ config: { ...CITY, gst: GST_ON }, distanceKm: 5, weightKg: 2 });
    const d = await computeBookingDiscount({
      couponCode: "SAVE10",
      bookingKind: "porter_local",
      fareAmount: q.fare,
    });
    // 50% of 135.70 = 67.85, clamped to 20
    expect(d.discountAmount).toBe(20);
    expect(d.payableFare).toBe(115.7);
  });

  it("rejects a coupon that does not apply to this booking kind", async () => {
    findOne.mockResolvedValue({ ...PCT10, appliesTo: ["order"] });
    await expect(
      computeBookingDiscount({
        couponCode: "SAVE10",
        bookingKind: "porter_local",
        fareAmount: 135.7,
      }),
    ).rejects.toThrow(/not valid for this type/i);
  });
});
