/**
 * T08 — /admin/porter/gst through the real Admin UI.
 * Turns local GST on at a given rate, saves, reloads and re-reads.
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

/**
 * The local card is the first GST block on the page. Its controls, in DOM
 * order: [enabled] [percent] [gstin] [place of supply] [inclusive].
 */
const localBlock = async () => {
  const cbs = page.locator('input[type="checkbox"]');
  const nums = page.locator('input[type="number"]');
  const txts = page.locator('input[type="text"]');
  return { cbs, nums, txts };
};

const { cbs, nums, txts } = await localBlock();

// enabled
const enabledBox = cbs.nth(0);
if ((await enabledBox.isChecked()) !== ENABLE) {
  await enabledBox.check({ force: !ENABLE });
  if (!ENABLE) await enabledBox.uncheck({ force: true });
}
await page.waitForTimeout(300);

// percent
await nums.nth(0).fill(String(PERCENT));
// gstin + place of supply
await txts.nth(0).fill("29AAACQ1234A1ZP");
await txts.nth(1).fill("Karnataka");

// inclusive is the checkbox that closes the local block
const inclusiveBox = cbs.nth(1);
if ((await inclusiveBox.isChecked()) !== INCLUSIVE) {
  if (INCLUSIVE) await inclusiveBox.check({ force: true });
  else await inclusiveBox.uncheck({ force: true });
}
await page.waitForTimeout(400);

const [resp] = await Promise.all([
  page.waitForResponse((r) => /gst/i.test(r.url()) && r.request().method() !== "GET", {
    timeout: 30000,
  }),
  page.locator("button").filter({ hasText: /save local delivery gst/i }).first().click(),
]);
console.log(`  save local GST -> HTTP ${resp.status()}`);
await page.waitForTimeout(1500);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const after = {
  enabled: await page.locator('input[type="checkbox"]').nth(0).isChecked(),
  percent: await page.locator('input[type="number"]').nth(0).inputValue(),
  inclusive: await page.locator('input[type="checkbox"]').nth(1).isChecked(),
  gstin: await page.locator('input[type="text"]').nth(0).inputValue(),
};
console.log(`  after reload: ${JSON.stringify(after)}`);
console.log(
  after.enabled === ENABLE && Number(after.percent) === PERCENT && after.inclusive === INCLUSIVE
    ? "  PASS  GST config persisted"
    : "  FAIL  GST config did not persist",
);

await H.shot(page, `t08-gst-${PERCENT}`);
await ctx.close();
await browser.close();
