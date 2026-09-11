/**
 * T15 — Priority 3: admin approves the rider's cash deposit, in the browser.
 *
 * Before: rider holds 162.85, deposit PENDING, booking COD RIDER_HOLDING.
 * After : deposit APPROVED, booking COD REMITTED_TO_ADMIN, rider cash 0.
 */

import * as H from "./helpers.mjs";

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};

const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "admin");
await H.loginAdmin(page);
await page.goto(`${H.APP}/admin/porter/cash-deposits`, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);

const before = await page.locator("body").innerText();
console.log("  BEFORE:", before.split("\n").filter(Boolean).slice(16, 40).join(" | ").slice(0, 600));
check(/162\.85/.test(before), "admin sees the rider's ₹162.85 deposit");
await H.shot(page, "t15-before");

const buttons = await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .filter((b) => b.offsetParent || b.getClientRects().length)
    .map((b) => (b.innerText || "").trim())
    .filter(Boolean),
);
console.log("  buttons:", buttons.join(" | ").slice(0, 300));

const approve = page.locator("button").filter({ hasText: /approve|accept|confirm/i }).first();
check((await approve.count()) > 0, "an approve control exists");

if ((await approve.count()) > 0) {
  const wait = page
    .waitForResponse((r) => /deposit|cash/i.test(r.url()) && r.request().method() !== "GET", {
      timeout: 30000,
    })
    .catch(() => null);
  await approve.click();
  await page.waitForTimeout(2000);

  // A confirmation dialog may stand in the way.
  const confirm = page.locator("button").filter({ hasText: /approve & clear|approve and clear|^(confirm|yes)/i }).last();
  if ((await confirm.count()) > 0 && (await confirm.isEnabled())) {
    await confirm.click().catch(() => {});
  }
  const resp = await wait;
  console.log(`  approval request -> ${resp ? resp.status() : "none captured"}`);
  await page.waitForTimeout(4000);
  check(resp ? resp.ok() : false, "approval accepted by API", resp ? `HTTP ${resp.status()}` : "no request");
}

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3500);
const after = await page.locator("body").innerText();
console.log("  AFTER:", after.split("\n").filter(Boolean).slice(16, 40).join(" | ").slice(0, 600));
await H.shot(page, "t15-after");

console.log(`\n  T15 result: ${passed} passed, ${failed} failed`);
await ctx.close();
await browser.close();
