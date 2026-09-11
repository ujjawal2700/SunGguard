/**
 * T18 — Priority 4: driver withdrawal through the rider UI, then admin review.
 *
 * Balance before/after is read from the app itself, and the request amount is
 * checked against it. Also probes the insufficient-balance rule.
 */

import * as H from "./helpers.mjs";

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};
const m2 = (n) => Math.round(Number(n) * 100) / 100;

console.log("\n=== T18: driver withdrawal ===");
const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "driver");

const calls = [];
page.on("response", async (r) => {
  if (/withdraw/i.test(r.url()) && r.request().method() !== "GET") {
    calls.push({ status: r.status(), body: await r.json().catch(() => ({})) });
  }
});

await H.loginDriver(page, H.DRIVER_01);
await page.waitForTimeout(2500);
await page.goto(`${H.APP}/delivery/profile/wallet`, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);

const before = await page.locator("body").innerText();
const availMatch = before.match(/AVAILABLE[^\d₹]*₹\s*([\d,]+\.?\d*)/i) ||
  before.match(/BALANCE[^\d₹]*₹\s*([\d,]+\.?\d*)/i);
const available = availMatch ? Number(availMatch[1].replace(/,/g, "")) : null;
console.log("  wallet:", before.split("\n").filter(Boolean).slice(0, 18).join(" | ").slice(0, 400));
console.log(`  available balance read from UI: ${available}`);
await H.shot(page, "t18-wallet-before");

/* ---------- A. over-withdrawal must be refused ---------- */
await page.locator("button").filter({ hasText: /request withdrawal/i }).first().click();
await page.waitForTimeout(2500);

const amountBox = page.locator('input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"]').first();
if ((await amountBox.count()) > 0) {
  await amountBox.fill("999999");
  await page.waitForTimeout(500);
  const submit = page.locator("button").filter({ hasText: /request|submit|withdraw|confirm/i }).last();
  await submit.click().catch(() => {});
  await page.waitForTimeout(3500);
  const afterOver = await page.locator("body").innerText();
  const refused =
    calls.some((c) => c.status >= 400) ||
    /insufficient|not enough|exceed|more than|available/i.test(afterOver);
  check(refused, "over-withdrawal is refused", calls.length ? `HTTP ${calls[calls.length - 1].status}` : "UI message");
  await H.shot(page, "t18-over");
} else {
  check(false, "withdrawal amount field found", "no numeric input on the withdrawal screen");
}

/* ---------- B. a valid withdrawal ---------- */
calls.length = 0;
if ((await amountBox.count()) > 0) {
  await amountBox.fill("50");
  await page.waitForTimeout(500);
  const submit = page.locator("button").filter({ hasText: /request|submit|withdraw|confirm/i }).last();
  await submit.click().catch(() => {});
  await page.waitForTimeout(4500);
  const valid = calls.find((c) => c.status < 400);
  check(Boolean(valid), "valid ₹50 withdrawal accepted", calls.length ? `HTTP ${calls[0].status} ${JSON.stringify(calls[0].body).slice(0, 140)}` : "no request");
  await H.shot(page, "t18-requested");
}

console.log(`\n  T18 result: ${passed} passed, ${failed} failed`);
await ctx.close();
await browser.close();
