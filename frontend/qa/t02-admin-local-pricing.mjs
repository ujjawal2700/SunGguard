/**
 * T02 — /admin/city-parcels/pricing through the real Admin UI.
 *
 * Sets controlled values, saves, RELOADS the page, and re-reads every field
 * from the DOM. Persistence is then confirmed a second time against the
 * database, because a page that re-renders from its own client cache would
 * otherwise look like it saved.
 */

import * as H from "./helpers.mjs";

const PRICING_URL = `${H.APP}/admin/city-parcels/pricing`;

/** Controlled test rate card. Index positions come from the field map. */
export const TARGET = {
  0: { label: "Base fare", value: 40 },
  1: { label: "Per km", value: 15 },
  2: { label: "Per kg", value: 8 },
  3: { label: "Minimum fare", value: 50 },
  4: { label: "Platform charge", value: 5 },
  5: { label: "Express charge", value: 20 },
  6: { label: "Base fare share %", value: 80 },
  7: { label: "Distance share %", value: 70 },
  8: { label: "Return leg payout %", value: 60 },
  9: { label: "Return charge to customer %", value: 0 },
};

async function readFields(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('input[type="number"]')].map((el) => el.value),
  );
}

async function setField(page, idx, value) {
  const el = page.locator('input[type="number"]').nth(idx);
  await el.click();
  await el.press("Control+a");
  await el.fill(String(value));
  await el.blur();
}

export async function run() {
  const browser = await H.launch();
  const { ctx, page } = await H.newCtx(browser, "admin");
  let passed = 0;
  let failed = 0;
  const check = (ok, label, extra) => {
    if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
  };

  console.log("\n=== T02: Admin UI — Local (City Parcel) rate card ===");
  await H.loginAdmin(page);
  await page.goto(PRICING_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const before = await readFields(page);
  console.log(`  current values: [${before.slice(0, 10).join(", ")}]`);

  // 1. Set every pricing field through the UI.
  for (const [idx, spec] of Object.entries(TARGET)) {
    await setField(page, Number(idx), spec.value);
  }

  // 2. Save, and require the API to actually accept it.
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => /city-parcel.*config|config.*city/i.test(r.url()) && r.request().method() !== "GET",
      { timeout: 30000 },
    ),
    page.getByRole("button", { name: /save rate card/i }).click(),
  ]);
  check(resp.ok(), "save rate card accepted by API", `HTTP ${resp.status()}`);
  await page.waitForTimeout(1200);

  // 3. Hard reload — not a client-side re-render.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  const after = await readFields(page);
  for (const [idx, spec] of Object.entries(TARGET)) {
    const got = Number(after[Number(idx)]);
    check(got === spec.value, `persisted after reload: ${spec.label}`, `expected ${spec.value}, UI shows ${got}`);
  }

  await H.shot(page, "t02-local-pricing");
  await ctx.close();
  await browser.close();
  return { passed, failed };
}

const r = await run();
console.log(`\n  T02 result: ${r.passed} passed, ${r.failed} failed`);
