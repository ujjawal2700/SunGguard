/**
 * T21 — LOCAL failed-delivery return, end to end in the browser.
 *
 * Lifecycle under test (verified against cityParcelReturnService.js and the
 * state machine, not assumed):
 *   DROP_REACHED --rider "Can't deliver this"--> DELIVERY_FAILED
 *                  (returnLeg.status = PENDING_CUSTOMER, response deadline set)
 *   --customer chooses RETURN_TO_PICKUP--> RETURN_IN_TRANSIT
 *                  (riderPayout + customerCharge computed, RETURN_DROP OTP to CUSTOMER)
 *   --rider verify-return (OTP + proximity)--> RETURNED
 *                  (creditReturnEarning)
 *
 * Config in force: returnRiderPayoutPercent 60, returnCustomerChargePercent 0,
 * maxDeliveryAttempts 2, customerResponseWindowMinutes 30.
 *
 * usage: node qa/t21-local-return.mjs <bookingId>
 */

import * as H from "./helpers.mjs";

const ID = process.argv[2];
const m2 = (n) => Math.round(Number(n) * 100) / 100;

/* ---- independent expectations, from the rate card + return config ---- */
const DISTANCE_FARE = 101.85;
const TAXABLE = 162.85;
const RETURN_RIDER_PCT = 60;
const RETURN_CUSTOMER_PCT = 0;
const EXP_RIDER_RETURN = m2(DISTANCE_FARE * (RETURN_RIDER_PCT / 100)); // 61.11
const EXP_CUSTOMER_CHARGE = m2(TAXABLE * (RETURN_CUSTOMER_PCT / 100)); // 0

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};
const eq = (a, e, label) => check(m2(a) === m2(e), label, `expected ${m2(e)}, actual ${m2(a)}, diff ${m2(m2(a) - m2(e))}`);

console.log(`\n=== T21: LOCAL failed-delivery return (${ID}) ===`);
console.log(`  EXPECTED rider return payout ${EXP_RIDER_RETURN} (distanceFare ${DISTANCE_FARE} x ${RETURN_RIDER_PCT}%)`);
console.log(`  EXPECTED customer return charge ${EXP_CUSTOMER_CHARGE} (taxable ${TAXABLE} x ${RETURN_CUSTOMER_PCT}%)`);

const browser = await H.launch();

/* ==================== A. rider reports the failure ==================== */
const { ctx: dCtx, page: driver } = await H.newCtx(browser, "driver", H.GEO_DROP);
let failResp = null;
driver.on("response", async (r) => {
  if (/failed-attempt/i.test(r.url())) failResp = { s: r.status(), b: await r.json().catch(() => ({})) };
});
await H.loginDriver(driver, H.DRIVER_02);
await driver.waitForTimeout(2500);
await driver.goto(`${H.APP}/delivery/city-parcel/${ID}`, { waitUntil: "networkidle" });
await driver.waitForTimeout(3500);

await driver.locator("button").filter({ hasText: /can't deliver this/i }).first().click();
await driver.waitForTimeout(2500);

// REFUSED needs no minimum wait; NO_ANSWER is gated on minWaitAtDropMinutes.
await driver.locator("button").filter({ hasText: /they refused it/i }).first().click();
await driver.waitForTimeout(800);
await driver.locator('textarea[placeholder="Anything else worth noting (optional)"]').fill("QA: receiver refused");
const file = driver.locator('input[type="file"]');
if ((await file.count()) > 0) {
  await file.first().setInputFiles("qa/fixtures/parcel.png");
  await driver.waitForTimeout(5000);
}
const report = driver.locator("button").filter({ hasText: /report failed attempt/i }).first();
for (let i = 0; i < 30 && !(await report.isEnabled()); i++) await driver.waitForTimeout(500);
check(await report.isEnabled(), "rider can submit the failed attempt after outcome + photo");
await report.click();
await driver.waitForTimeout(5000);

check(failResp?.s === 200, "failed-attempt accepted", failResp ? `HTTP ${failResp.s}` : "no request");
const fr = failResp?.b?.result || {};
console.log(`  attempt ${fr.attemptNo}, isLastAttempt=${fr.isLastAttempt}, choices=${JSON.stringify(fr.choices)}`);
check(fr.attemptNo === 1, "first attempt recorded", `attemptNo=${fr.attemptNo}`);
check(Array.isArray(fr.choices) && fr.choices.length > 0, "customer is offered choices");
check(Boolean(fr.responseDeadlineAt), "a response deadline is set", String(fr.responseDeadlineAt));
await H.shot(driver, "t21-failed");
await dCtx.close();

/* ==================== B. customer decides ==================== */
const { ctx: uCtx, page: user } = await H.newCtx(browser, "user");
let choiceResp = null;
user.on("response", async (r) => {
  if (/failure-response/i.test(r.url())) choiceResp = { s: r.status(), b: await r.json().catch(() => ({})) };
});
await H.loginCustomer(user, H.USER_01);
await user.goto(`${H.APP}/parcel/local/track/${ID}`, { waitUntil: "networkidle" });
await user.waitForTimeout(4500);

const decisionText = await user.locator("body").innerText();
check(!/Oops!|is not defined/i.test(decisionText), "tracking page renders the decision");
check(/bring it back|try again|could not|couldn'?t/i.test(decisionText), "customer is shown the failed-delivery decision");
console.log("  customer sees:", decisionText.split("\n").filter(Boolean).slice(6, 26).join(" | ").slice(0, 400));
await H.shot(user, "t21-decision");

const bringBack = user.locator("button, [role=button]").filter({ hasText: /bring it back to me/i }).first();
check((await bringBack.count()) > 0, "the RETURN_TO_PICKUP option is offered");
if ((await bringBack.count()) > 0) {
  await bringBack.click();
  await user.waitForTimeout(1000);
  const submit = user.locator("button").filter({ hasText: /confirm|send it back|continue|submit|done/i }).last();
  if ((await submit.count()) > 0 && (await submit.isEnabled())) {
    await submit.click();
  }
  await user.waitForTimeout(5000);
}
check(choiceResp?.s === 200, "customer choice accepted", choiceResp ? `HTTP ${choiceResp.s}` : "no request");
const cr = choiceResp?.b?.result || {};
console.log(`  choice result: action=${cr.action} riderPayout=${cr.riderPayout} customerCharge=${cr.customerCharge}`);
check(cr.action === "RETURN", "action is RETURN", cr.action);
eq(cr.riderPayout, EXP_RIDER_RETURN, "return rider payout");
eq(cr.customerCharge, EXP_CUSTOMER_CHARGE, "return customer charge");
await uCtx.close();

console.log(`\n  T21 (parts A-B) result: ${passed} passed, ${failed} failed`);
await browser.close();
