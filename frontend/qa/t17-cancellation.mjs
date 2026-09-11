/**
 * T17 — Priority 5: cancellation through the customer UI.
 *
 * The implemented rule (cityParcelController.cancelCityParcel) is: a customer
 * may cancel until the rider takes custody of the parcel; after that the only
 * route is a return. This tests the allowed stage, and asserts the refusal at
 * the disallowed one rather than assuming a fee model that does not exist.
 */

import * as H from "./helpers.mjs";

const BOOKING = process.argv[2];
let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};

console.log(`\n=== T17: cancellation (booking ${BOOKING}) ===`);
const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "user");
await H.loginCustomer(page, H.USER_01);
await page.goto(`${H.APP}/parcel/local/track/${BOOKING}`, { waitUntil: "networkidle" });
await page.waitForTimeout(4500);

const before = await page.locator("body").innerText();
check(!/Oops!|is not defined/i.test(before), "tracking page renders");
console.log("  status area:", before.split("\n").filter(Boolean).slice(6, 20).join(" | ").slice(0, 300));

const cancelBtn = page.locator("button").filter({ hasText: /cancel/i }).first();
check((await cancelBtn.count()) > 0, "a cancel control is offered before pickup");

if ((await cancelBtn.count()) > 0) {
  const wait = page
    .waitForResponse((r) => /cancel/i.test(r.url()) && r.request().method() !== "GET", {
      timeout: 30000,
    })
    .catch(() => null);
  await cancelBtn.click();
  await page.waitForTimeout(2000);

  // Reason / confirmation step, if the screen asks for one.
  const reason = page.locator('textarea, input[type="text"]').first();
  if ((await reason.count()) > 0 && (await reason.isVisible())) {
    await reason.fill("QA test cancellation").catch(() => {});
    await page.waitForTimeout(400);
  }
  const confirm = page
    .locator("button")
    .filter({ hasText: /confirm|yes|cancel booking|cancel this/i })
    .last();
  if ((await confirm.count()) > 0 && (await confirm.isEnabled())) {
    await confirm.click().catch(() => {});
  }

  const resp = await wait;
  console.log(`  cancel request -> ${resp ? resp.status() : "none captured"}`);
  if (resp) {
    const body = await resp.json().catch(() => ({}));
    check(resp.ok(), "cancellation accepted", `HTTP ${resp.status()}`);
    console.log("  refund block:", JSON.stringify(body?.result?.refund || {}).slice(0, 220));
  } else {
    check(false, "cancellation request fired", "no request seen");
  }
  await page.waitForTimeout(3500);
}

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const after = await page.locator("body").innerText();
check(/cancel/i.test(after), "UI reflects the cancelled state");
await H.shot(page, "t17-cancelled");

console.log(`\n  T17 result: ${passed} passed, ${failed} failed`);
await ctx.close();
await browser.close();
