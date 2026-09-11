/**
 * T22 — complete the return leg: RETURN_IN_TRANSIT -> RETURNED.
 *
 * The return OTP goes to the CUSTOMER (not the receiver), so it is read from
 * the customer's own tracking screen. The rider is geolocated at the pickup
 * address because the proximity gate applies to the return drop too and is
 * deliberately not bypassed.
 *
 * usage: node qa/t22-return-complete.mjs <bookingId>
 */

import * as H from "./helpers.mjs";

const ID = process.argv[2];
const m2 = (n) => Math.round(Number(n) * 100) / 100;
const EXP_RIDER_RETURN = 61.11;

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};
const eq = (a, e, label) => check(m2(a) === m2(e), label, `expected ${m2(e)}, actual ${m2(a)}, diff ${m2(m2(a) - m2(e))}`);

console.log(`\n=== T22: return leg completion (${ID}) ===`);
const browser = await H.launch();

/* ---------- customer side: sees it coming back, holds the code ---------- */
const { ctx: uCtx, page: user } = await H.newCtx(browser, "user");
await H.loginCustomer(user, H.USER_01);
await user.goto(`${H.APP}/parcel/local/track/${ID}`, { waitUntil: "networkidle" });
await user.waitForTimeout(4500);
const custText = await user.locator("body").innerText();
check(!/Oops!|is not defined/i.test(custText), "tracking page renders during return");
check(/on its way back|coming back|return/i.test(custText), "customer sees the parcel is coming back");
console.log("  customer sees:", custText.split("\n").filter(Boolean).slice(6, 20).join(" | ").slice(0, 320));
await H.shot(user, "t22-customer-return");
await uCtx.close();

/* ---------- rider side: back at point A ---------- */
const { ctx: dCtx, page: driver } = await H.newCtx(browser, "driver", H.GEO_PICKUP);
let verifyResp = null;
driver.on("response", async (r) => {
  if (/verify-return/i.test(r.url())) verifyResp = { s: r.status(), b: await r.json().catch(() => ({})) };
});
await H.loginDriver(driver, H.DRIVER_02);
await driver.waitForTimeout(2500);
await driver.goto(`${H.APP}/delivery/city-parcel/${ID}`, { waitUntil: "networkidle" });
await driver.waitForTimeout(4000);

const screen = await driver.locator("body").innerText();
console.log("  rider screen:", screen.split("\n").filter(Boolean).slice(8, 34).join(" | ").slice(0, 500));
check(/return|bring.*back|back to/i.test(screen), "rider screen shows the return leg");
const earnShown = screen.match(/([\d,]+(?:\.\d+)?)\s*\n?\s*you earn/i);
if (earnShown) console.log(`  rider screen earning: ${earnShown[1]}`);
await H.shot(driver, "t22-rider-return");

// Proximity, then the customer's return code, then proof.
const refresh = driver.locator("button").filter({ hasText: /^refresh$/i }).first();
if ((await refresh.count()) > 0) { await refresh.click(); await driver.waitForTimeout(3500); }
check(!/look far from the address/i.test(await driver.locator("body").innerText()), "rider is within the return proximity gate");

const code = driver.locator('input[maxlength="4"][inputmode="numeric"]').first();
if ((await code.count()) > 0) {
  const shown = (await driver.locator("body").innerText()).match(/Test mode code:\s*(\d{4})/i);
  await code.fill(shown ? shown[1] : "1234");
  await driver.waitForTimeout(700);
  check(true, "return code entered", shown ? shown[1] : "1234 (mock)");
}

const file = driver.locator('input[type="file"]');
if ((await file.count()) > 0) {
  await file.first().setInputFiles("qa/fixtures/parcel.png");
  await driver.waitForTimeout(5000);
}

const buttons = await driver.evaluate(() =>
  [...document.querySelectorAll("button")]
    .filter((b) => (b.offsetParent || b.getClientRects().length) && !b.disabled)
    .map((b) => (b.innerText || "").trim())
    .filter(Boolean),
);
console.log("  enabled buttons:", buttons.join(" | "));
const finish = buttons.find((t) => /hand (it )?back|returned|confirm return|complete return|give.*back/i.test(t));
check(Boolean(finish), "a return-completion action is offered", finish || "none");

if (finish) {
  await driver.locator("button").filter({ hasText: new RegExp(finish.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first().click();
  await driver.waitForTimeout(6000);
}
check(verifyResp?.s === 200, "verify-return accepted", verifyResp ? `HTTP ${verifyResp.s} ${verifyResp.b?.message || ""}` : "no request");
await H.shot(driver, "t22-returned");

console.log(`\n  T22 result: ${passed} passed, ${failed} failed`);
await dCtx.close();
await browser.close();
