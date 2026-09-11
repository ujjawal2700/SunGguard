import * as H from "./helpers.mjs";
const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "admin");
await H.loginAdmin(page);
await page.goto(`${H.APP}/admin/parcels/warehouses`, { waitUntil:"networkidle" });
await page.waitForTimeout(3000);
let n=0;
for (let i=0;i<6;i++){
  const b = page.locator("button").filter({hasText:/^active$/i}).first();
  if (await b.count()===0) break;
  const w = page.waitForResponse(r=>/warehouse/i.test(r.url()) && r.request().method()!=="GET",{timeout:20000}).catch(()=>null);
  await b.click(); const r = await w; await page.waitForTimeout(2500);
  console.log(`  toggle ${++n} -> ${r?r.status():"no request"}`);
}
await page.reload({waitUntil:"networkidle"}); await page.waitForTimeout(2500);
await H.shot(page,"t13b-wh");
await ctx.close(); await browser.close();
