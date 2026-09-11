/**
 * T13 — outstation rate card + warehouse deactivation, through the Admin UI.
 *
 * Warehouses are deactivated deliberately: their coordinates can only be set
 * from the map picker, whose tiles do not render in headless Chromium, so the
 * only hub on file sits in the picker's default city. With no active
 * warehouse `resolveFirstMile` falls back to DEFAULT_FIRST_MILE_KM (5 km),
 * which is a documented code path and gives a first mile that can be
 * predicted exactly. Deactivating is itself the Priority-8 behaviour under
 * test.
 */

import * as H from "./helpers.mjs";

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};

/** Controlled outstation rate card. */
export const OUT_CFG = { perKm: 12, perKg: 20, maxWeight: 10, express: 30 };

console.log("\n=== T13: outstation rate card + warehouse deactivation ===");
const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "admin");
await H.loginAdmin(page);

/* --------------------------- rate card -------------------------------- */
await page.goto(`${H.APP}/admin/parcels/pricing`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const nums = page.locator('input[type="number"]');
await nums.nth(0).fill(String(OUT_CFG.perKm));      // PER KM CHARGE
await nums.nth(1).fill(String(OUT_CFG.perKg));      // WEIGHT / KG
await nums.nth(2).fill(String(OUT_CFG.maxWeight));  // MAX WEIGHT
await nums.nth(3).fill(String(OUT_CFG.express));    // EXPRESS EXTRA
await page.waitForTimeout(400);

const [resp] = await Promise.all([
  page.waitForResponse((r) => /parcel/i.test(r.url()) && r.request().method() !== "GET", {
    timeout: 30000,
  }),
  page.locator("button").filter({ hasText: /save parcel settings/i }).first().click(),
]);
check(resp.ok(), "outstation rate card saved", `HTTP ${resp.status()}`);
await page.waitForTimeout(1500);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const after = await page.evaluate(() =>
  [...document.querySelectorAll('input[type="number"]')].slice(0, 4).map((e) => e.value),
);
check(Number(after[0]) === OUT_CFG.perKm, "per-km persisted", `${after[0]}`);
check(Number(after[1]) === OUT_CFG.perKg, "per-kg persisted", `${after[1]}`);
check(Number(after[2]) === OUT_CFG.maxWeight, "max-weight persisted", `${after[2]}`);
check(Number(after[3]) === OUT_CFG.express, "express charge persisted", `${after[3]}`);
await H.shot(page, "t13-outstation-pricing");

/* ---------------------- deactivate warehouses ------------------------- */
await page.goto(`${H.APP}/admin/parcels/warehouses`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

let deactivated = 0;
for (let i = 0; i < 6; i++) {
  const btn = page.locator("button").filter({ hasText: /^deactivate$/i }).first();
  if ((await btn.count()) === 0) break;
  const wait = page.waitForResponse(
    (r) => /warehouse/i.test(r.url()) && r.request().method() !== "GET",
    { timeout: 20000 },
  ).catch(() => null);
  await btn.click();
  await wait;
  await page.waitForTimeout(2500);
  deactivated++;
}
console.log(`  deactivated ${deactivated} warehouse(s) through the UI`);
check(deactivated > 0, "warehouse deactivation available in Admin UI");

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const text = await page.locator("body").innerText();
check(!/\bACTIVE\b/.test(text.split("Warehouses")[1] || text), "no warehouse left marked ACTIVE", "");
await H.shot(page, "t13-warehouses-off");

console.log(`\n  T13 result: ${passed} passed, ${failed} failed`);
await ctx.close();
await browser.close();
