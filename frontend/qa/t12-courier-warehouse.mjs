/**
 * T12 — Priority 7 & 8: Courier and Warehouse admin through the real UI.
 *
 * Also prerequisites for deterministic outstation pricing: the platform fee
 * on an outstation fare comes from the chosen COURIER, and the first-mile
 * distance comes from the nearest active WAREHOUSE.
 */

import * as H from "./helpers.mjs";

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};

/** Drive the shared Google Places box inside a map-picker modal. */
async function pickOnMap(page, searchPlaceholder, query, confirmLabel) {
  const box = page.locator(`input[placeholder="${searchPlaceholder}"]`);
  await box.waitFor({ state: "visible", timeout: 20000 });
  await box.click();
  await box.type(query, { delay: 90 });
  await page.waitForTimeout(3000);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3500);
  const confirm = page.locator("button").filter({ hasText: confirmLabel }).first();
  for (let i = 0; i < 20 && !(await confirm.isEnabled()); i++) await page.waitForTimeout(500);
  await confirm.click();
  await page.waitForTimeout(3000);
}

console.log("\n=== T12: Courier + Warehouse admin ===");
const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "admin");
await H.loginAdmin(page);

/* ------------------------------- COURIER ------------------------------ */
await page.goto(`${H.APP}/admin/parcels/couriers`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

await page.locator('input[placeholder="e.g. Blue Dart"]').fill("QA Courier Express");
const cnums = page.locator('input[type="number"]');
await cnums.nth(0).fill("25"); // PLATFORM CHARGE — feeds the outstation fare
await cnums.nth(1).fill("10"); // COURIER COMPANY CHARGE
await cnums.nth(2).fill("1");  // SORT ORDER

// Office location — these inputs only exist after the BUG-9 fix.
check(
  (await page.locator('input[placeholder="Street / building"]').count()) > 0 ||
    (await page.locator('input[placeholder="Building name, street, area"]').count()) > 0,
  "Add Courier form renders the office-location fields it validates",
);
await page.locator('input[placeholder="e.g. 12B"]').fill("12B");
await page.locator('input[placeholder="10-digit number"]').fill("9000000041");
await page.locator('input[placeholder="Building name, street, area"]').fill("MG Road, Bengaluru");
await page.locator('input[placeholder="Near metro, mall, etc."]').fill("Near Metro");
await page.locator('input[placeholder="City"]').fill("Bengaluru");
await page.locator('input[placeholder="State"]').fill("Karnataka");
await page.locator('input[placeholder="6-digit pincode"]').fill("560001");

await page.locator("button").filter({ hasText: /pick on map/i }).first().click();
await page.waitForTimeout(3000);
await pickOnMap(page, "Search courier branch area...", "MG Road Bengaluru", /confirm location/i);

const cResp = page.waitForResponse(
  (r) => /courier/i.test(r.url()) && r.request().method() === "POST",
  { timeout: 30000 },
);
await page.locator("button").filter({ hasText: /^add courier$/i }).first().click();
let cOut = { status: 0, body: {} };
try {
  const r = await cResp;
  cOut = { status: r.status(), body: await r.json().catch(() => ({})) };
} catch {
  const toast = await page.evaluate(() =>
    [...document.querySelectorAll("[data-sonner-toast],li")].map((e) => (e.innerText || "").trim()).filter(Boolean).slice(0, 2),
  );
  cOut.body = { message: `no request fired; toast=${JSON.stringify(toast)}` };
}
check(cOut.status >= 200 && cOut.status < 300, "courier created via Admin UI", `HTTP ${cOut.status} ${cOut.body?.message || ""}`);
await page.waitForTimeout(2000);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
check(/QA Courier Express/.test(await page.locator("body").innerText()), "courier persists after reload");
await H.shot(page, "t12-courier");

/* ------------------------------ WAREHOUSE ----------------------------- */
await page.goto(`${H.APP}/admin/parcels/warehouses`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

await page.locator('input[placeholder="e.g. Indore Central Hub"]').fill("QA Bengaluru Hub");
await page
  .locator('textarea[placeholder="Street address, building name, locality"]')
  .fill("QA Hub, MG Road, Bengaluru");
await page.locator('input[placeholder="e.g. Indore"]').fill("Bengaluru");
await page.locator('input[placeholder="e.g. 452010"]').fill("560001");
await page.locator('input[placeholder="Contact phone"]').fill("9000000031");
await page.locator('input[placeholder="Manager name"]').fill("QA Hub Manager");

const mapBtn = page.locator("button").filter({ hasText: /pick on map/i }).first();
if ((await mapBtn.count()) > 0) {
  await mapBtn.click();
  await page.waitForTimeout(3000);
  const ph = (await page.locator('input[placeholder*="Search"]').count()) > 0
    ? await page.locator('input[placeholder*="Search"]').last().getAttribute("placeholder")
    : null;
  if (ph) await pickOnMap(page, ph, "Indiranagar Bengaluru", /confirm/i);
}

const wResp = page.waitForResponse(
  (r) => /warehouse/i.test(r.url()) && r.request().method() === "POST",
  { timeout: 30000 },
);
await page.locator("button").filter({ hasText: /^add warehouse$/i }).first().click();
let wOut = { status: 0, body: {} };
try {
  const r = await wResp;
  wOut = { status: r.status(), body: await r.json().catch(() => ({})) };
} catch {
  const toast = await page.evaluate(() =>
    [...document.querySelectorAll("[data-sonner-toast],li")].map((e) => (e.innerText || "").trim()).filter(Boolean).slice(0, 2),
  );
  wOut.body = { message: `no request fired; toast=${JSON.stringify(toast)}` };
}
check(wOut.status >= 200 && wOut.status < 300, "warehouse created via Admin UI", `HTTP ${wOut.status} ${wOut.body?.message || ""}`);
await page.waitForTimeout(2000);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
check(/QA Bengaluru Hub/.test(await page.locator("body").innerText()), "warehouse persists after reload");
await H.shot(page, "t12-warehouse");

console.log(`\n  T12 result: ${passed} passed, ${failed} failed`);
await ctx.close();
await browser.close();
