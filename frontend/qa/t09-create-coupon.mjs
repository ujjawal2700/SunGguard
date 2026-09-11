/**
 * T09 — create a delivery coupon through the real Admin UI.
 *
 * usage: node qa/t09-create-coupon.mjs CODE percentage|fixed VALUE [maxDiscount] [minFare] [scope]
 *   scope: local | outstation | both   (default local)
 */

import * as H from "./helpers.mjs";

const [code, kind = "percentage", value = "10", maxDiscount = "", minFare = "", scope = "local"] =
  process.argv.slice(2);

if (!code) {
  console.error("usage: node qa/t09-create-coupon.mjs CODE [kind] [value] [max] [minFare] [scope]");
  process.exit(1);
}

const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "admin");
await H.loginAdmin(page);
await page.goto(`${H.APP}/admin/coupons`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

await page.locator("button").filter({ hasText: /create delivery coupon/i }).first().click();
await page.waitForTimeout(2500);

const texts = page.locator('input[type="text"]');
const selects = page.locator("select");
const nums = page.locator('input[type="number"]');
const dates = page.locator('input[type="date"]');
const checks = page.locator('input[type="checkbox"]');

// Addressed by placeholder: the modal shares `input[type=text]` with the
// list's own search box, and their index order is not stable.
await page.locator('input[placeholder="E.G. SUMMER50"]').fill(code);
await selects.nth(0).selectOption(kind === "fixed" ? "fixed" : "percentage");
await page
  .locator('input[placeholder="E.G. Flat 10% off local delivery"]')
  .fill(`QA ${code}`);

// Delivery type checkboxes: [0] local, [1] outstation.
const wantLocal = scope === "local" || scope === "both";
const wantOut = scope === "outstation" || scope === "both";
if ((await checks.nth(0).isChecked()) !== wantLocal) {
  wantLocal ? await checks.nth(0).check({ force: true }) : await checks.nth(0).uncheck({ force: true });
}
if ((await checks.nth(1).isChecked()) !== wantOut) {
  wantOut ? await checks.nth(1).check({ force: true }) : await checks.nth(1).uncheck({ force: true });
}

// Strategy: a minimum-fare coupon when a floor was asked for.
await selects.nth(1).selectOption(minFare ? "min_order_value" : "generic");
await page.waitForTimeout(500);

await nums.nth(0).fill(String(value)); // DISCOUNT VALUE
// MINIMUM FARE carries `required` even under "Generic Discount", where the
// label offers no default, so it is always filled — 0 when none was asked for.
await nums.nth(1).fill(String(minFare || 0));
if (maxDiscount) await nums.nth(2).fill(String(maxDiscount)); // MAX DISCOUNT
await nums.nth(4).fill("50"); // PER USER LIMIT — high, so one QA account can reuse it

// DESCRIPTION is required too.
await page.locator("textarea").first().fill(`QA automated test coupon ${code}`);

const today = new Date();
const end = new Date(today.getTime() + 30 * 864e5);
await dates.nth(0).fill(today.toISOString().slice(0, 10));
await dates.nth(1).fill(end.toISOString().slice(0, 10));

const [resp] = await Promise.all([
  page.waitForResponse((r) => /coupon/i.test(r.url()) && r.request().method() === "POST", {
    timeout: 30000,
  }),
  page.locator("button").filter({ hasText: /^create coupon$/i }).first().click(),
]);
const body = await resp.json().catch(() => ({}));
console.log(`  create ${code} -> HTTP ${resp.status()} ${body?.message || ""}`);
await page.waitForTimeout(2000);
await H.shot(page, `t09-coupon-${code}`);

await ctx.close();
await browser.close();
