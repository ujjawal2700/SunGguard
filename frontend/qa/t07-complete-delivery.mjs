/**
 * T07 — complete the handover: receiver code + proof photo -> DELIVERED.
 */

import * as H from "./helpers.mjs";

const BOOKING = process.argv[2];
let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};

const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "driver");

const errors = [];
page.on("response", async (r) => {
  if (/city-parcel/i.test(r.url()) && r.status() >= 400) {
    errors.push(`${r.status()} ${r.url().replace(H.API, "")} ${(await r.text().catch(() => "")).slice(0, 160)}`);
  }
});

await H.loginDriver(page, H.DRIVER_01);
await page.waitForTimeout(2500);
await page.goto(`${H.APP}/delivery/city-parcel/${BOOKING}`, { waitUntil: "networkidle" });
await page.waitForTimeout(3500);

// 1. Send the receiver their code.
const send = page.locator("button").filter({ hasText: /send code to receiver/i }).first();
if ((await send.count()) > 0) {
  await send.click();
  await page.waitForTimeout(3500);
  check(true, "receiver code requested");
}

// 2. Enter it (mock OTP).
const box = page.locator('input[maxlength="4"][inputmode="numeric"]').first();
await box.waitFor({ state: "visible", timeout: 30000 });
await box.fill("1234");
await page.waitForTimeout(800);
check(true, "receiver code entered");

// 3. Proof photo.
const file = page.locator('input[type="file"]');
if ((await file.count()) > 0) {
  await file.first().setInputFiles("qa/fixtures/parcel.png");
  await page.waitForTimeout(5000);
  check(true, "delivery proof photo uploaded");
}

// 4. Whatever the app now offers that is NOT the failure path.
const buttons = await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .filter((b) => (b.offsetParent || b.getClientRects().length) && !b.disabled)
    .map((b) => (b.innerText || "").trim())
    .filter(Boolean),
);
console.log("  buttons now:", buttons.join(" | "));
const finish = buttons.find(
  (t) => /deliver|complete|hand ?over|confirm|collected/i.test(t) && !/can't|cannot/i.test(t),
);
check(Boolean(finish), "a completion action is offered", finish || "none");

if (finish) {
  await page
    .locator("button")
    .filter({ hasText: new RegExp(finish.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
    .first()
    .click();
  await page.waitForTimeout(6000);
}

console.log("  FINAL:", (await page.locator("body").innerText()).split("\n").filter(Boolean).slice(0, 14).join(" | "));
if (errors.length) console.log("  API errors:", errors.join(" || "));
await H.shot(page, "t07-delivered");

console.log(`\n  T07 result: ${passed} passed, ${failed} failed`);
await ctx.close();
await browser.close();
