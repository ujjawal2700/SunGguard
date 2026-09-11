/**
 * T08b — outstation GST config through /admin/porter/gst.
 *
 * The page carries two independent blocks. In DOM order the controls are:
 *   checkbox[0] local enabled     checkbox[1] local inclusive
 *   checkbox[2] outstation enabled checkbox[3] outstation inclusive
 *   number[0]  local percent       number[1]  outstation percent
 *   text[0..1] local gstin/place   text[2..3] outstation gstin/place
 *
 * usage: node qa/t08b-outstation-gst.mjs <percent|0> <on|off> [inclusive]
 */

import * as H from "./helpers.mjs";

const PERCENT = Number(process.argv[2] || 18);
const ENABLE = process.argv[3] !== "off";
const INCLUSIVE = process.argv[4] === "inclusive";

const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "admin");
await H.loginAdmin(page);
await page.goto(`${H.APP}/admin/porter/gst`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const cbs = page.locator('input[type="checkbox"]');
const nums = page.locator('input[type="number"]');
const txts = page.locator('input[type="text"]');

const setCb = async (idx, want) => {
  const el = cbs.nth(idx);
  if ((await el.isChecked()) !== want) {
    want ? await el.check({ force: true }) : await el.uncheck({ force: true });
  }
};

await setCb(2, ENABLE);           // outstation enabled
await page.waitForTimeout(300);
await nums.nth(1).fill(String(PERCENT));
await txts.nth(2).fill("29AAACQ1234A1ZP");
await txts.nth(3).fill("Karnataka");
await setCb(3, INCLUSIVE);        // outstation inclusive
await page.waitForTimeout(400);

const [resp] = await Promise.all([
  page.waitForResponse((r) => /gst/i.test(r.url()) && r.request().method() !== "GET", {
    timeout: 30000,
  }),
  page.locator("button").filter({ hasText: /save outstation parcel gst/i }).first().click(),
]);
console.log(`  save outstation GST -> HTTP ${resp.status()}`);
await page.waitForTimeout(1500);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const after = {
  enabled: await cbs.nth(2).isChecked(),
  percent: Number(await nums.nth(1).inputValue()),
  inclusive: await cbs.nth(3).isChecked(),
  gstin: await txts.nth(2).inputValue(),
};
console.log(`  after reload: ${JSON.stringify(after)}`);
console.log(
  after.enabled === ENABLE && after.percent === PERCENT && after.inclusive === INCLUSIVE
    ? "  PASS  outstation GST config persisted"
    : "  FAIL  outstation GST config did not persist",
);
await H.shot(page, `t08b-out-gst-${PERCENT}`);
await ctx.close();
await browser.close();
