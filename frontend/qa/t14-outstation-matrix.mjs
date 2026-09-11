/**
 * T14 — Outstation booking matrix through the real browser.
 *
 * usage: node qa/t14-outstation-matrix.mjs <gstPercent|off> <coupon|none> <Cash|UPI> [weight]
 *
 * Every expected figure is derived here from the admin rate card BEFORE the
 * app is asked anything, then compared against the fare API, the PAY screen
 * and the stored booking.
 *
 * Outstation rate card (set through the Admin UI in T13):
 *   per km 12 | per kg 20 | express 30 | courier platform fee 25
 *   base fare is deliberately NOT charged on outstation.
 *   first mile = 5 km (DEFAULT_FIRST_MILE_KM, no active warehouse)
 *   rider share: 80% of base + 80% of distance
 */

import * as H from "./helpers.mjs";
import * as O from "./outstation.mjs";
import * as P from "./pay.mjs";

const GST = process.argv[2] === "off" ? 0 : Number(process.argv[2] || 18);
const COUPON = process.argv[3] && process.argv[3] !== "none" ? process.argv[3] : null;
const METHOD = process.argv[4] || "Cash";
const WEIGHT = Number(process.argv[5] || 2);

const CFG = { perKm: 12, perKg: 20, platform: 25, riderBasePct: 80, riderDistPct: 80 };
const FIRST_MILE_KM = 5;
const COUPON_PCT = 10;

const m2 = (n) => Math.round(Number(n) * 100) / 100;
let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};
const eq = (a, e, label) => check(m2(a) === m2(e), label, `expected ${m2(e)}, actual ${m2(a)}, diff ${m2(m2(a) - m2(e))}`);

console.log(`\n=== T14: Outstation | GST ${GST || "OFF"} | coupon ${COUPON || "none"} | ${METHOD} | ${WEIGHT}kg ===`);

/* ---------------- independent expectation ---------------- */
const expDistanceFare = m2(FIRST_MILE_KM * CFG.perKm);       // 60
const expWeightFare = m2(WEIGHT * CFG.perKg);                 // 40 @2kg
const expSubtotal = m2(expDistanceFare + expWeightFare + CFG.platform); // 125
const expGstNoCoupon = m2((expSubtotal * GST) / 100);
const expGross = m2(expSubtotal + expGstNoCoupon);
const expDiscount = COUPON ? m2((expGross * COUPON_PCT) / 100) : 0;
const expPayable = m2(expGross - expDiscount);
const expTaxable = GST > 0 ? m2(expPayable / (1 + GST / 100)) : expPayable;
const expGst = GST > 0 ? m2(expPayable - expTaxable) : 0;
const expRider = m2(0 * (CFG.riderBasePct / 100) + expDistanceFare * (CFG.riderDistPct / 100)); // base is 0

console.log(`  EXPECTED  distance ${expDistanceFare} + weight ${expWeightFare} + platform ${CFG.platform} = subtotal ${expSubtotal}`);
console.log(`            GST(pre-coupon) ${expGstNoCoupon} -> gross ${expGross}`);
console.log(`            discount ${expDiscount} -> payable ${expPayable}`);
console.log(`            taxable ${expTaxable} + GST ${expGst} = ${m2(expTaxable + expGst)}`);
console.log(`            rider ${expRider}`);

const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "user");

let fareResult = null;
page.on("response", (r) => {
  if (/calculate-fare/i.test(r.url()) && r.request().method() === "POST") {
    r.json().then((j) => { if (j?.result) fareResult = j.result; }).catch(() => {});
  }
});

await H.loginCustomer(page, H.USER_01);
await O.bookOutstationToPayStep(page, { weightKg: WEIGHT });
await page.waitForTimeout(2500);

/* ---------------- fare API ---------------- */
if (fareResult) {
  eq(fareResult.distance, FIRST_MILE_KM, "API first-mile distance");
  eq(fareResult.distanceFare, expDistanceFare, "API distance fare");
  eq(fareResult.weightFare, expWeightFare, "API weight fare");
  eq(fareResult.platformCharge, CFG.platform, "API platform charge (from courier config)");
  eq(fareResult.baseFare, 0, "API base fare is 0 on outstation");
  eq(fareResult.dailyFare, expSubtotal, "API daily fare");
  eq(fareResult.billableDays, 1, "API billable days");
  eq(fareResult.gstPercent, GST, "API GST percent");
  eq(fareResult.gstAmount, expGstNoCoupon, "API GST amount (pre-coupon)");
  eq(fareResult.taxableAmount, expSubtotal, "API taxable (pre-coupon)");
} else {
  check(false, "fare API response captured");
}

/* ---------------- PAY screen ---------------- */
const pre = await P.readFarePanel(page);
eq(pre.total, expGross, "UI total before coupon");
if (GST > 0) eq(pre.gstAmount, expGstNoCoupon, "UI GST line before coupon");
else check(pre.gstAmount === null, "UI shows no GST line while GST is off", `gst=${pre.gstAmount}`);

/* ---------------- coupon ---------------- */
if (COUPON) {
  const applied = await P.applyCoupon(page, COUPON);
  check(applied.ok, "coupon accepted", `HTTP ${applied.status} ${applied.body?.message || ""}`);
  const r = applied.body?.result || {};
  eq(r.discountAmount, expDiscount, "API coupon discount");
  eq(r.payableFare, expPayable, "API payable after coupon");
  if (GST > 0 && r.tax) {
    eq(r.tax.taxableAmount, expTaxable, "API re-attributed taxable");
    eq(r.tax.amount, expGst, "API re-attributed GST");
    eq(m2(r.tax.taxableAmount + r.tax.amount), expPayable, "API taxable + GST == payable");
  }
  await page.waitForTimeout(1500);
  const post = await P.readFarePanel(page);
  eq(post.total, expPayable, "UI total after coupon");
}

/* ---------------- place it ---------------- */
const created = await P.placeBooking(page, METHOD);
check(created.status === 201 || created.ok, "booking created", `HTTP ${created.status}`);
const b = created.body?.result?.parcel || created.body?.result || {};
console.log(`  booking id ${b._id}`);

eq(b.fare, expGross, "DB fare");
eq(b.discountAmount || 0, expDiscount, "DB discountAmount");
eq(b.payableFare, expPayable, "DB payableFare");

const fb = b.fareBreakdown || {};
eq(fb.distanceFare, expDistanceFare, "DB distanceFare");
eq(fb.weightFare, expWeightFare, "DB weightFare");
eq(fb.platformCharge, CFG.platform, "DB platformCharge");
eq(fb.dailyFare, expSubtotal, "DB dailyFare");
eq(fb.billableDays, 1, "DB billableDays");

/* ---- BUG-1 regression: outstation MUST persist its tax split ---- */
eq(fb.gstPercent, GST, "DB gstPercent persisted");
eq(fb.gstAmount, expGst, "DB gstAmount persisted");
eq(fb.taxableAmount, expTaxable, "DB taxableAmount persisted");
eq(m2((fb.cgst || 0) + (fb.sgst || 0)), expGst, "DB CGST + SGST == GST");
eq(fb.igst || 0, 0, "DB IGST is zero (intra-state)");
if (GST > 0) {
  check(String(fb.gstin || "").length > 0, "DB gstin persisted", `gstin=${fb.gstin}`);
}
if (COUPON) {
  eq(fb.preDiscountTaxableAmount, expSubtotal, "DB preDiscountTaxableAmount");
}

if (String(METHOD).toLowerCase() === "cash") {
  const cod = b.codSettlement || {};
  eq(cod.collectAmount ?? cod.amount ?? 0, expPayable, "COD collect amount == payable");
}

console.log(`\n  T14 result: ${passed} passed, ${failed} failed`);
console.log(`  BOOKING_ID=${b._id}`);
await H.shot(page, `t14-out-gst${GST}-${COUPON || "nocoupon"}-${METHOD}`);
await ctx.close();
await browser.close();
