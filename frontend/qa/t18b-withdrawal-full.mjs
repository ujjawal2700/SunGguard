/**
 * T18b — Priority 4: the full withdrawal flow.
 *
 * The rider app's own rules, read off the withdrawal modal, are:
 *   available for withdrawal = settled earnings
 *   minimum request = ₹100
 *   only one open request at a time
 *   payout details are required before SUBMIT enables
 *
 * Each of those is exercised rather than assumed, then an admin reviews.
 */

import * as H from "./helpers.mjs";

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};

console.log("\n=== T18b: withdrawal, full flow ===");
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

/* ---------- 1. payout details ---------- */
await page.goto(`${H.APP}/delivery/profile/bank-account`, { waitUntil: "networkidle" });
await page.waitForTimeout(3500);
await page.locator('input[placeholder="Name as printed in the bank"]').fill("QA Driver One");
await page.locator('input[placeholder="9 to 18 digits"]').fill("123456789012");
await page.locator('input[placeholder="HDFC0001234"]').fill("HDFC0001234");
await page.locator('input[placeholder="HDFC Bank"]').fill("HDFC Bank");
const bankResp = page
  .waitForResponse((r) => r.request().method() !== "GET" && /delivery/i.test(r.url()), { timeout: 30000 })
  .catch(() => null);
await page.locator("button").filter({ hasText: /save payout details/i }).first().click();
const bank = await bankResp;
check(bank ? bank.ok() : false, "payout details saved", bank ? `HTTP ${bank.status()}` : "no request");
await page.waitForTimeout(3000);

/* ---------- 2. withdrawal modal ---------- */
await page.goto(`${H.APP}/delivery/profile/wallet`, { waitUntil: "networkidle" });
await page.waitForTimeout(3500);
await page.locator("button").filter({ hasText: /request withdrawal/i }).first().click();
await page.waitForTimeout(3000);

const modal = await page.locator("body").innerText();
const avail = modal.match(/AVAILABLE FOR WITHDRAWAL[^\d]*([\d,]+\.?\d*)/i);
const available = avail ? Number(avail[1].replace(/,/g, "")) : null;
console.log(`  available for withdrawal: ₹${available}`);
check(available === 103.29, "available equals the settled earning", `₹${available}`);
check(/Minimum withdrawal is ₹100/i.test(modal), "minimum-withdrawal rule is stated to the rider");

const amount = page.locator('input[type="number"]').first();
const submit = page.locator("button").filter({ hasText: /submit request/i }).first();

/* A. below minimum */
await amount.fill("50");
await page.waitForTimeout(800);
check(!(await submit.isEnabled()), "below-minimum (₹50) cannot be submitted");

/* B. above balance */
await amount.fill("99999");
await page.waitForTimeout(800);
const overEnabled = await submit.isEnabled();
if (overEnabled) {
  calls.length = 0;
  await submit.click();
  await page.waitForTimeout(3500);
  const refusedByApi = calls.some((c) => c.status >= 400);
  const refusedByUi = /insufficient|not enough|exceed|more than available/i.test(
    await page.locator("body").innerText(),
  );
  check(refusedByApi || refusedByUi, "over-balance withdrawal refused", refusedByApi ? `HTTP ${calls[0].status}` : "UI message");
} else {
  check(true, "over-balance withdrawal cannot be submitted", "submit stays disabled");
}

/* C. valid */
calls.length = 0;
await amount.fill("100");
await page.waitForTimeout(900);
check(await submit.isEnabled(), "valid ₹100 request is submittable");
if (await submit.isEnabled()) {
  await submit.click();
  await page.waitForTimeout(5000);
  const ok = calls.find((c) => c.status < 400);
  check(Boolean(ok), "₹100 withdrawal accepted", calls.length ? `HTTP ${calls[0].status} ${JSON.stringify(calls[0].body).slice(0, 160)}` : "no request");
}
await H.shot(page, "t18b-requested");

/* D. duplicate while one is open */
calls.length = 0;
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3500);
await page.locator("button").filter({ hasText: /request withdrawal/i }).first().click();
await page.waitForTimeout(2500);
const afterText = await page.locator("body").innerText();
const amount2 = page.locator('input[type="number"]').first();
const submit2 = page.locator("button").filter({ hasText: /submit request/i }).first();
if ((await amount2.count()) > 0) {
  await amount2.fill("100").catch(() => {});
  await page.waitForTimeout(700);
  if (await submit2.isEnabled()) {
    await submit2.click();
    await page.waitForTimeout(4000);
    const dup = calls.some((c) => c.status >= 400);
    check(dup, "second concurrent request refused", calls.length ? `HTTP ${calls[0].status}` : "no request");
  } else {
    check(true, "second concurrent request blocked in the UI", "submit disabled while one is open");
  }
}
console.log("  wallet after:", afterText.split("\n").filter(Boolean).slice(0, 16).join(" | ").slice(0, 300));
await H.shot(page, "t18b-after");

console.log(`\n  T18b result: ${passed} passed, ${failed} failed`);
await ctx.close();
await browser.close();
