import * as H from "./helpers.mjs";
const PCT = process.argv[2] || "20";
const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "admin");
await H.loginAdmin(page);
await page.goto(`${H.APP}/admin/city-parcels/pricing`, { waitUntil:"networkidle" });
await page.waitForTimeout(2500);
const el = page.locator('input[type="number"]').nth(9); // Return charge to customer (%)
await el.click(); await el.press("Control+a"); await el.fill(PCT); await el.blur();
await page.waitForTimeout(400);
const [r] = await Promise.all([
  page.waitForResponse(x=>/city-parcel.*config|config.*city/i.test(x.url()) && x.request().method()!=="GET",{timeout:30000}),
  page.locator("button").filter({hasText:/save rate card/i}).click(),
]);
console.log("  save ->", r.status());
await page.reload({waitUntil:"networkidle"}); await page.waitForTimeout(2500);
console.log("  after reload, return charge % =", await page.locator('input[type="number"]').nth(9).inputValue());
await ctx.close(); await browser.close();
