/**
 * T20 — Priority 9: the GST configuration matrix for Local, in the browser.
 *
 * For each rate the admin config is saved through the UI, then a real quote is
 * taken on the booking screen and every tax figure is checked against a
 * calculation done here first.
 *
 * Local rate card (T02): base 40 + 6.79km x 15 + 2kg x 8 + platform 5 = 162.85
 */

import * as H from "./helpers.mjs";
import * as P from "./pay.mjs";

const SUBTOTAL = 162.85;
const m2 = (n) => Math.round(Number(n) * 100) / 100;

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};
const eq = (a, e, label) => check(m2(a) === m2(e), label, `expected ${m2(e)}, actual ${m2(a)}, diff ${m2(m2(a) - m2(e))}`);

/** Save the local GST block through /admin/porter/gst. */
async function setLocalGst(page, percent, enabled, inclusive) {
  await page.goto(`${H.APP}/admin/porter/gst`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const cbs = page.locator('input[type="checkbox"]');
  const nums = page.locator('input[type="number"]');
  const txts = page.locator('input[type="text"]');

  const setCb = async (i, want) => {
    const el = cbs.nth(i);
    if ((await el.isChecked()) !== want) {
      want ? await el.check({ force: true }) : await el.uncheck({ force: true });
    }
  };
  await setCb(0, enabled);
  await page.waitForTimeout(300);
  await nums.nth(0).fill(String(percent));
  await txts.nth(0).fill("29AAACQ1234A1ZP");
  await txts.nth(1).fill("Karnataka");
  await setCb(1, inclusive);
  await page.waitForTimeout(400);

  const [resp] = await Promise.all([
    page.waitForResponse((r) => /gst/i.test(r.url()) && r.request().method() !== "GET", { timeout: 30000 }),
    page.locator("button").filter({ hasText: /save local delivery gst/i }).first().click(),
  ]);
  await page.waitForTimeout(1200);
  return resp.ok();
}

const CASES = [
  { percent: 5, enabled: true, inclusive: false },
  { percent: 12, enabled: true, inclusive: false },
  { percent: 18, enabled: true, inclusive: true }, // prices already include GST
];

console.log("\n=== T20: Local GST matrix ===");
const browser = await H.launch();

for (const c of CASES) {
  const label = `${c.enabled ? c.percent + "%" : "OFF"} ${c.inclusive ? "inclusive" : "exclusive"}`;
  console.log(`\n  --- ${label} ---`);

  // expected, computed here first
  const expTaxable = c.inclusive ? m2(SUBTOTAL / (1 + c.percent / 100)) : SUBTOTAL;
  const expGst = c.inclusive ? m2(SUBTOTAL - expTaxable) : m2((SUBTOTAL * c.percent) / 100);
  const expTotal = c.inclusive ? SUBTOTAL : m2(SUBTOTAL + expGst);
  const expHalf = m2(expGst / 2);
  console.log(`  EXPECTED taxable ${expTaxable} | GST ${expGst} | total ${expTotal}`);

  const { ctx: aCtx, page: admin } = await H.newCtx(browser, "admin");
  await H.loginAdmin(admin);
  check(await setLocalGst(admin, c.percent, c.enabled, c.inclusive), `admin saved GST ${label}`);
  await aCtx.close();

  const { ctx: uCtx, page: user } = await H.newCtx(browser, "user");
  let fare = null;
  user.on("response", (r) => {
    if (/calculate-fare/i.test(r.url()) && r.request().method() === "POST") {
      r.json().then((j) => { if (j?.result) fare = j.result; }).catch(() => {});
    }
  });
  await H.loginCustomer(user, H.USER_01);
  await H.bookLocalToPayStep(user, { weightKg: 2 });
  await user.waitForTimeout(3000);

  if (fare) {
    const fb = fare.fareBreakdown || {};
    eq(fb.gstPercent, c.percent, `${label}: API gstPercent`);
    eq(fb.taxableAmount, expTaxable, `${label}: API taxable`);
    eq(fb.gstAmount, expGst, `${label}: API GST`);
    eq(m2((fb.cgst || 0) + (fb.sgst || 0)), expGst, `${label}: CGST + SGST == GST`);
    eq(fb.igst || 0, 0, `${label}: IGST zero`);
    eq(fare.fare, expTotal, `${label}: API total`);
    check(Boolean(fb.gstInclusive) === c.inclusive, `${label}: inclusive flag stored`, `${fb.gstInclusive}`);
  } else {
    check(false, `${label}: fare API captured`);
  }

  const panel = await P.readFarePanel(user);
  eq(panel.total, expTotal, `${label}: UI total`);
  if (!c.inclusive) eq(panel.gstAmount, expGst, `${label}: UI GST line`);
  else check(panel.gstAmount === null, `${label}: inclusive card shows no separate GST line`, `gst=${panel.gstAmount}`);

  await H.shot(user, `t20-gst-${c.percent}${c.inclusive ? "-inc" : ""}`);
  await uCtx.close();
}

console.log(`\n  T20 result: ${passed} passed, ${failed} failed`);
await browser.close();
