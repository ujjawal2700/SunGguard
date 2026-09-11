/**
 * T12b — add a Bengaluru warehouse with a VERIFIED map pick.
 *
 * The first attempt pressed Enter before Google's suggestion list had
 * rendered, so `getPlace()` returned undefined and the picker fell back to its
 * default centre (Indore). This waits for a `.pac-item` to actually exist
 * before committing, and asserts the resulting coordinates are in Bengaluru.
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
await page.goto(`${H.APP}/admin/parcels/warehouses`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

await page.locator('input[placeholder="e.g. Indore Central Hub"]').fill("QA BLR Hub");
await page
  .locator('textarea[placeholder="Street address, building name, locality"]')
  .fill("QA BLR Hub, MG Road, Bengaluru");
await page.locator('input[placeholder="e.g. Indore"]').fill("Bengaluru");
await page.locator('input[placeholder="e.g. 452010"]').fill("560001");
await page.locator('input[placeholder="Contact phone"]').fill("9000000032");
await page.locator('input[placeholder="Manager name"]').fill("QA BLR Manager");

await page.locator("button").filter({ hasText: /pick on map/i }).first().click();
await page.waitForTimeout(3500);

const search = page.locator('input[placeholder="Search warehouse area or address..."]');
await search.waitFor({ state: "visible", timeout: 20000 });
await search.click();
await search.type("MG Road Bengaluru Karnataka", { delay: 100 });

// Wait for Google's own suggestion list before committing.
let hasSuggestion = false;
for (let i = 0; i < 30; i++) {
  hasSuggestion = (await page.locator(".pac-item").count()) > 0;
  if (hasSuggestion) break;
  await page.waitForTimeout(500);
}
check(hasSuggestion, "Places suggestions rendered before selection");

await page.keyboard.press("ArrowDown");
await page.waitForTimeout(600);
await page.keyboard.press("Enter");
await page.waitForTimeout(4000);

const confirm = page.locator("button").filter({ hasText: /confirm location/i }).first();
for (let i = 0; i < 20 && !(await confirm.isEnabled()); i++) await page.waitForTimeout(500);
await confirm.click();
await page.waitForTimeout(3000);

const wResp = page.waitForResponse(
  (r) => /warehouse/i.test(r.url()) && r.request().method() === "POST",
  { timeout: 30000 },
);
await page.locator("button").filter({ hasText: /^add warehouse$/i }).first().click();
let out = { status: 0, body: {} };
try {
  const r = await wResp;
  out = { status: r.status(), body: await r.json().catch(() => ({})) };
} catch {}
check(out.status >= 200 && out.status < 300, "Bengaluru warehouse created", `HTTP ${out.status}`);

const wh = out.body?.result?.warehouse || out.body?.result || {};
console.log(`  saved coords: ${wh.lat}, ${wh.lng}  city=${wh.city}`);
check(
  Number(wh.lat) > 12.5 && Number(wh.lat) < 13.5 && Number(wh.lng) > 77 && Number(wh.lng) < 78,
  "warehouse coordinates are in Bengaluru",
  `${wh.lat}, ${wh.lng}`,
);

await H.shot(page, "t12b-warehouse");
console.log(`\n  T12b result: ${passed} passed, ${failed} failed`);
await ctx.close();
await browser.close();
