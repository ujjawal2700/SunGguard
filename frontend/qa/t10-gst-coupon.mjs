/**
 * T10 — Local + GST 18% + 10% coupon, the scenario that exposed the tax
 * attribution bug in the static audit. Verified here through the real UI.
 *
 * Every figure is derived from the rate card first, by hand, in the comments
 * below. Nothing is read from the app and then declared correct.
 */

import * as H from "./helpers.mjs";
import * as P from "./pay.mjs";

const CFG = { baseFare: 40, perKm: 15, perKg: 8, platform: 5, riderBasePct: 80, riderDistPct: 70 };
const GST = 18;
const COUPON = "QAPCT10";
const COUPON_PCT = 10;

const m2 = (n) => Math.round(Number(n) * 100) / 100;

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};
const eq = (a, e, label) => check(m2(a) === m2(e), label, `expected ${m2(e)}, actual ${m2(a)}`);

console.log("\n=== T10: Local + GST 18% + coupon 10% ===");

const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "user");
await H.loginCustomer(page, H.USER_02); // second customer, for booking isolation
await H.bookLocalToPayStep(page, { weightKg: 2 });
await page.waitForTimeout(3000);

const pre = await P.readFarePanel(page);
const km = pre.distanceKm;

/* ---------------- independent expectation, computed here -------------- */
const expDistance = m2(km * CFG.perKm);
const expWeight = m2(2 * CFG.perKg);
const expSubtotal = m2(CFG.baseFare + expDistance + expWeight + CFG.platform);
const expGstNoCoupon = m2((expSubtotal * GST) / 100);
const expGross = m2(expSubtotal + expGstNoCoupon);
const expDiscount = m2((expGross * COUPON_PCT) / 100); // coupon applies to the gross
const expPayable = m2(expGross - expDiscount);
// Tax re-attributed onto the money actually paid:
const expTaxable = m2(expPayable / (1 + GST / 100));
const expGst = m2(expPayable - expTaxable);
const expTaxableDiscount = m2(expSubtotal - expTaxable);
const expRider = m2(CFG.baseFare * (CFG.riderBasePct / 100) + expDistance * (CFG.riderDistPct / 100));

console.log(`  distance ${km} km`);
console.log(`  EXPECTED  subtotal ${expSubtotal} | GST(pre-coupon) ${expGstNoCoupon} | gross ${expGross}`);
console.log(`            discount ${expDiscount} -> payable ${expPayable}`);
console.log(`            taxable ${expTaxable} + GST ${expGst} = ${m2(expTaxable + expGst)}`);
console.log(`            rider ${expRider} (must be unchanged by GST or coupon)`);

/* -------------------------- pre-coupon UI ----------------------------- */
eq(pre.total, expGross, "UI total before coupon (subtotal + GST)");
eq(pre.gstAmount, expGstNoCoupon, "UI GST line before coupon");
check(pre.gstPercent === GST, "UI GST percent", `${pre.gstPercent}%`);

/* --------------------------- apply coupon ----------------------------- */
const applied = await P.applyCoupon(page, COUPON);
check(applied.ok, "coupon accepted by API", `HTTP ${applied.status}`);
const r = applied.body?.result || {};
eq(r.discountAmount, expDiscount, "API coupon discount (off the gross)");
eq(r.payableFare, expPayable, "API payable after coupon");
if (r.tax) {
  eq(r.tax.taxableAmount, expTaxable, "API re-attributed taxable value");
  eq(r.tax.amount, expGst, "API re-attributed GST");
  eq(m2(r.tax.taxableAmount + r.tax.amount), expPayable, "API taxable + GST == payable");
}
if (r.taxableDiscount !== undefined) {
  eq(r.taxableDiscount, expTaxableDiscount, "API discount against the taxable value");
}

await page.waitForTimeout(1500);
const post = await P.readFarePanel(page);
eq(post.total, expPayable, "UI total after coupon");
eq(post.gstAmount, expGst, "UI GST line after coupon (tax on what is paid)");
check(
  m2(expSubtotal - (post.couponAmount ?? 0) + (post.gstAmount ?? 0)) === expPayable,
  "UI lines reconcile: charges - discount + GST == total",
  `${expSubtotal} - ${post.couponAmount} + ${post.gstAmount} = ${m2(expSubtotal - (post.couponAmount ?? 0) + (post.gstAmount ?? 0))}, total ${expPayable}`,
);
await H.shot(page, "t10-coupon-gst");

/* ---------------------------- place it -------------------------------- */
const created = await P.placeBooking(page, "Cash");
check(created.status === 201, "booking created", `HTTP ${created.status}`);
const b = created.body?.result?.parcel || {};
console.log(`  booking ${b.referenceId} (${b._id})`);

eq(b.fare, expGross, "DB fare (list price, tax included, pre-coupon)");
eq(b.discountAmount, expDiscount, "DB discountAmount");
eq(b.payableFare, expPayable, "DB payableFare");
eq(b.codCollection?.amount, expPayable, "COD amount == payable (not the pre-discount fare)");
eq(b.fareBreakdown?.taxableAmount, expTaxable, "DB taxableAmount re-attributed");
eq(b.fareBreakdown?.gstAmount, expGst, "DB gstAmount re-attributed");
eq(m2((b.fareBreakdown?.cgst || 0) + (b.fareBreakdown?.sgst || 0)), expGst, "DB CGST + SGST == GST");
eq(b.fareBreakdown?.preDiscountTaxableAmount, expSubtotal, "DB preDiscountTaxableAmount (audit trail)");

console.log(`\n  T10 result: ${passed} passed, ${failed} failed`);
console.log(`  BOOKING_ID=${b._id}`);
await ctx.close();
await browser.close();
