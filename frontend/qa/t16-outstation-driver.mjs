/**
 * T16 — Priority 1: outstation rider flow in the browser.
 *
 * Outstation jobs are pushed to riders as a live socket offer (there is no
 * polled outstation list on the rider dashboard, unlike city parcels), so the
 * rider is signed in and sitting on the dashboard BEFORE the customer books.
 * That is also the real-world sequence.
 *
 * Expected rider payout on outstation: base fare is not charged, so it is
 * distanceFare x riderDistanceFareSharePercent = 60 x 80% = 48.
 */

import * as H from "./helpers.mjs";
import * as O from "./outstation.mjs";
import * as P from "./pay.mjs";

const EXP_RIDER = 48;
const EXP_PAYABLE = 125; // GST off, no coupon

const m2 = (n) => Math.round(Number(n) * 100) / 100;
let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};
const eq = (a, e, label) => check(m2(a) === m2(e), label, `expected ${m2(e)}, actual ${m2(a)}, diff ${m2(m2(a) - m2(e))}`);

console.log("\n=== T16: outstation rider flow (live offer) ===");
const browser = await H.launch();

/* ---- rider online and waiting FIRST ---- */
const { ctx: dCtx, page: driver } = await H.newCtx(browser, "driver");
const offers = [];
driver.on("response", async (r) => {
  if (/\/parcel\/rider\/(available|accept)/i.test(r.url())) {
    const j = await r.json().catch(() => null);
    if (j) offers.push({ url: r.url().replace(H.API, ""), status: r.status(), body: j });
  }
});
await H.loginDriver(driver, H.DRIVER_01);
await driver.waitForTimeout(5000);
console.log("  rider is online and on the dashboard");

/* ---- customer books ---- */
const { ctx: uCtx, page: user } = await H.newCtx(browser, "user");
await H.loginCustomer(user, H.USER_01);
await O.bookOutstationToPayStep(user, { weightKg: 2 });
await user.waitForTimeout(1500);
const created = await P.placeBooking(user, "Cash");
const b = created.body?.result?.parcel || {};
console.log(`  booked ${b._id} payable ${b.payableFare} status ${b.status}`);
eq(b.payableFare, EXP_PAYABLE, "outstation payable");
check(b.status === "SEARCHING", "booking is broadcasting to riders", b.status);

/* ---- rider should now be offered it ---- */
await driver.waitForTimeout(9000);
const body = await driver.locator("body").innerText();
console.log("  rider screen:", body.split("\n").filter(Boolean).slice(0, 22).join(" | ").slice(0, 500));
await H.shot(driver, "t16-offer");

const sawOffer = /new (parcel|delivery|job)|parcel request|accept|₹\s*48/i.test(body);
check(sawOffer, "rider is presented the outstation offer", sawOffer ? "" : "no offer visible");

const shownEarn = body.match(/₹\s*(\d+(?:\.\d+)?)/g);
console.log("  amounts on rider screen:", shownEarn ? shownEarn.slice(0, 8).join(", ") : "none");

/* ---- accept ---- */
const acceptBtn = driver.locator("button").filter({ hasText: /accept/i }).first();
if ((await acceptBtn.count()) > 0) {
  const wait = driver
    .waitForResponse((r) => /parcel\/rider\/accept/i.test(r.url()), { timeout: 30000 })
    .catch(() => null);
  await acceptBtn.click();
  const resp = await wait;
  check(resp ? resp.ok() : false, "rider accepted the outstation job", resp ? `HTTP ${resp.status()}` : "no accept request");
  await driver.waitForTimeout(4000);
  await H.shot(driver, "t16-after-accept");
} else {
  check(false, "an accept control is offered", "none found on screen");
}

console.log(`\n  T16 result: ${passed} passed, ${failed} failed`);
console.log(`  BOOKING_ID=${b._id}`);
await uCtx.close();
await dCtx.close();
await browser.close();
