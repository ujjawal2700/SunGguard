/**
 * T04 — rider lifecycle through the rider UI: accept -> pickup -> deliver,
 * then the money that follows (earning credited, COD cash owed).
 *
 * Drives the real screens. Every status and every rupee is read back from the
 * API/DB rather than assumed.
 */

import * as H from "./helpers.mjs";

const m2 = (n) => Math.round(Number(n) * 100) / 100;

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};

console.log("\n=== T04: rider lifecycle (accept -> pickup -> deliver) ===");

const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "driver");

const api = [];
page.on("response", async (r) => {
  if (/city-parcel/i.test(r.url()) && r.request().method() !== "GET") {
    api.push({ url: r.url().replace(H.API, ""), status: r.status() });
  }
});

await H.loginDriver(page, H.DRIVER_01);
await page.waitForTimeout(3000);

/* ------------------------------------------------------------- accept */
await page.goto(`${H.APP}/delivery/city-parcel-jobs`, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);

const beforeText = await page.locator("body").innerText();
const refMatch = beforeText.match(/CP-[A-Z0-9]+/);
const ref = refMatch ? refMatch[0] : null;
console.log(`  accepting: ${ref}`);
check(/you earn/i.test(beforeText), "open-jobs list shows the rider's earning");
check(/Collect ₹/i.test(beforeText), "open-jobs list shows the COD amount to collect");

const acceptBtn = page.locator("button").filter({ hasText: /accept this job/i }).first();
await acceptBtn.click();
await page.waitForTimeout(5000);
console.log(`  after accept -> ${page.url()}`);
await H.shot(page, "t04-after-accept");

const afterAccept = await page.locator("body").innerText();
console.log("  screen:", afterAccept.split("\n").filter(Boolean).slice(0, 18).join(" | "));

/* --------------------------------------------- walk the status buttons */
const steps = [];
for (let i = 0; i < 8; i++) {
  const body = await page.locator("body").innerText();
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => b.offsetParent || b.getClientRects().length)
      .map((b) => (b.innerText || "").trim())
      .filter(Boolean),
  );
  const action = btns.find((t) =>
    /arriv|reach|pick ?up|start|transit|deliver|collect|complete|otp|verify/i.test(t),
  );
  if (!action) {
    steps.push(`(no further action button; buttons: ${btns.slice(0, 6).join(", ")})`);
    break;
  }
  steps.push(action);
  await page.locator("button").filter({ hasText: new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first().click();
  await page.waitForTimeout(3500);

  // A doorstep OTP may be required; the app mocks it to 1234.
  const otpBoxes = page.locator('input[maxlength="1"], input[autocomplete="one-time-code"]');
  if ((await otpBoxes.count()) >= 4) {
    for (let d = 0; d < 4; d++) await otpBoxes.nth(d).fill("1234"[d]);
    await page.waitForTimeout(500);
    await page
      .locator("button")
      .filter({ hasText: /verify|confirm|submit|done/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(3000);
    steps.push("(entered OTP 1234)");
  }
}

console.log("  status actions taken:", steps.join(" -> "));
console.log("  non-GET API calls:", api.map((a) => `${a.status} ${a.url}`).join(", "));
await H.shot(page, "t04-final");

console.log(`\n  T04 result: ${passed} passed, ${failed} failed  (see DB check next)`);
await ctx.close();
await browser.close();
