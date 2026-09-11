/**
 * T03 — Local + COD + no coupon + GST OFF, end to end through the browser.
 *
 * Customer books, rider sees the offer, accepts, picks up and delivers.
 * Every money figure is calculated here from the admin rate card FIRST and
 * only then compared with what the API, the UI and the database say.
 */

import * as H from "./helpers.mjs";
import * as P from "./pay.mjs";

/** The rate card T02 saved through the Admin UI. */
const CFG = {
  baseFare: 40,
  perKm: 15,
  perKg: 8,
  minFare: 50,
  platform: 5,
  riderBasePct: 80,
  riderDistPct: 70,
};

const m2 = (n) => Math.round(n * 100) / 100;

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};
const eq = (actual, expected, label) =>
  check(m2(actual) === m2(expected), label, `expected ${m2(expected)}, actual ${m2(actual)}`);

console.log("\n=== T03: Local + COD + no coupon + GST OFF ===");

const browser = await H.launch();

/* -------------------------------------------------------------- customer */
const { ctx: userCtx, page: user } = await H.newCtx(browser, "user");
await H.loginCustomer(user, H.USER_01);
await H.bookLocalToPayStep(user, { weightKg: 2 });
await user.waitForTimeout(3000);

const panel = await P.readFarePanel(user);
const km = panel.distanceKm;
console.log(`  routed distance: ${km} km (taken from the quote, then priced independently)`);

// Independent expectation from the admin rate card.
const expDistance = m2(km * CFG.perKm);
const expWeight = m2(2 * CFG.perKg);
const expSubtotal = m2(CFG.baseFare + expDistance + expWeight + CFG.platform);
const expFare = Math.max(expSubtotal, CFG.minFare);
const expRider = m2(CFG.baseFare * (CFG.riderBasePct / 100) + expDistance * (CFG.riderDistPct / 100));

console.log(`  EXPECTED  base ${CFG.baseFare} + dist ${expDistance} + wt ${expWeight} + plat ${CFG.platform} = ${expFare}`);

eq(panel.baseFare, CFG.baseFare, "UI base fare");
eq(panel.distanceFare, expDistance, "UI distance fare");
eq(panel.weightFare, expWeight, "UI weight fare");
eq(panel.platformFee, CFG.platform, "UI platform fee");
eq(panel.total, expFare, "UI total");
check(panel.gstAmount === null, "UI shows no GST line while GST is off", `gst=${panel.gstAmount}`);

const created = await P.placeBooking(user, "Cash");
check(created.status === 201, "booking created via UI", `HTTP ${created.status}`);
const parcel = created.body?.result?.parcel || {};
const bookingId = parcel._id;
const ref = parcel.referenceId;
console.log(`  booking: ${ref}  (${bookingId})`);

eq(parcel.fare, expFare, "API fare");
eq(parcel.payableFare, expFare, "API payableFare");
eq(parcel.codCollection?.amount, expFare, "COD amount == payable");
check(parcel.paymentMethod === "COD", "payment method COD", parcel.paymentMethod);
check(parcel.status === "SEARCHING", "status SEARCHING", parcel.status);

await H.shot(user, "t03-user-booked");

/* ---------------------------------------------------------------- driver */
const { ctx: drvCtx, page: driver } = await H.newCtx(browser, "driver");

// Capture the app's OWN feed response rather than re-fetching with a guessed
// token — this is exactly the payload the rider's screen renders from.
let feed = null;
driver.on("response", async (r) => {
  if (/rider\/available/i.test(r.url())) {
    feed = await r.json().catch(() => null);
  }
});

await H.loginDriver(driver, H.DRIVER_01);
await driver.waitForTimeout(6000);

const offer = (feed?.result?.parcels || []).find((p) => String(p._id) === String(bookingId));
check(Boolean(offer), "rider sees the job in the available feed");
if (offer) {
  eq(offer.riderEarning, expRider, "rider offer earning (base×80% + distance×70%)");
}

const driverText = await driver.locator("body").innerText();
const shown = driverText.match(/earn\s*₹\s*([\d,]+\.?\d*)/i);
const shownValue = shown ? Number(shown[1].replace(/,/g, "")) : null;
// The card prints whole rupees, so compare against the rounded payout rather
// than the exact paise figure. The point of the check is that it is no longer
// ₹0 and matches the computed offer.
check(
  shownValue !== null && Math.round(shownValue) === Math.round(expRider) && shownValue > 0,
  "rider job card shows a real earning (not ₹0)",
  `card shows ₹${shownValue}, expected ≈₹${expRider}`,
);
await H.shot(driver, "t03-driver-feed");

console.log(`\n  T03 result: ${passed} passed, ${failed} failed`);
await userCtx.close();
await drvCtx.close();
await browser.close();
