import * as H from "./helpers.mjs";
const ID = process.argv[2];
let passed=0, failed=0;
const check=(ok,l,e="")=>{ ok?(H.pass(l,e),passed++):(H.fail(l,e),failed++); };
console.log(`\n=== T26: customer won't take it back (${ID}) ===`);
const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "driver", H.GEO_PICKUP);
let resp=null;
page.on("response", async r=>{ if(/customer-unreachable/i.test(r.url())) resp={s:r.status(), b:await r.json().catch(()=>({}))}; });
await H.loginDriver(page, H.DRIVER_02);
await page.waitForTimeout(2500);
await page.goto(`${H.APP}/delivery/city-parcel/${ID}`, { waitUntil:"networkidle" });
await page.waitForTimeout(4000);
const btn = page.locator("button").filter({hasText:/won'?t take it back|customer won/i}).first();
check(await btn.count()>0, "rider is offered the 'customer won't take it back' action");
if(await btn.count()>0){
  await btn.click(); await page.waitForTimeout(2500);
  const ta = page.locator("textarea").first();
  if(await ta.count() && await ta.isVisible()) { await ta.fill("QA: customer refused to accept the return"); await page.waitForTimeout(500); }
  const conf = page.locator("button").filter({hasText:/confirm|report|submit|yes|hand/i}).last();
  if(await conf.count() && await conf.isEnabled()) await conf.click().catch(()=>{});
  await page.waitForTimeout(5000);
}
check(resp?.s===200, "customer-unreachable accepted", resp?`HTTP ${resp.s} ${resp.b?.message||""}`:"no request");
await H.shot(page,"t26-unreachable");
console.log(`\n  T26 result: ${passed} passed, ${failed} failed`);
await ctx.close(); await browser.close();
