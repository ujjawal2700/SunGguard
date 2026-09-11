/**
 * T06 — walk the remaining rider transitions to DELIVERED through the UI.
 * Whatever action button the app offers is the one clicked, so the state
 * machine drives the test rather than the test asserting a guessed order.
 */

import * as H from "./helpers.mjs";

const BOOKING = process.argv[2];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const browser = await H.launch();
const { ctx, page } = await H.newCtx(browser, "driver");

const errors = [];
page.on("response", async (r) => {
  if (/city-parcel/i.test(r.url()) && r.status() >= 400) {
    errors.push(`${r.status()} ${r.url().replace(H.API, "")} ${(await r.text().catch(() => "")).slice(0, 140)}`);
  }
});

await H.loginDriver(page, H.DRIVER_01);
await page.waitForTimeout(2500);

const ACTION =
  /start riding|reached|arrived|i'm at|at the drop|deliver|collect|complete|hand ?over|cash|confirm/i;

for (let step = 1; step <= 7; step++) {
  await page.goto(`${H.APP}/delivery/city-parcel/${BOOKING}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);

  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => (b.offsetParent || b.getClientRects().length) && !b.disabled)
      .map((b) => (b.innerText || "").trim())
      .filter(Boolean),
  );
  const action = buttons.find((t) => ACTION.test(t));
  console.log(`step${step}: [${buttons.slice(0, 6).join(" | ")}]  -> ${action || "(no action)"}`);
  if (!action) break;

  await page.locator("button").filter({ hasText: new RegExp(escapeRe(action), "i") }).first().click();
  await page.waitForTimeout(4000);

  // Doorstep code, if the app asks for one.
  const box = page.locator('input[maxlength="4"][inputmode="numeric"]');
  if ((await box.count()) > 0) {
    await box.first().fill("1234");
    await page.waitForTimeout(800);
    const confirm = page.locator("button").filter({ hasText: /confirm|verify|deliver|done/i }).first();
    if ((await confirm.count()) > 0 && (await confirm.isEnabled())) {
      await confirm.click();
      await page.waitForTimeout(4000);
    }
  }
}

console.log("FINAL:", (await page.locator("body").innerText()).split("\n").filter(Boolean).slice(0, 16).join(" | "));
if (errors.length) console.log("ERRORS:", errors.join(" || "));
await H.shot(page, "t06-final");
await ctx.close();
await browser.close();
