/**
 * Outstation booking wizard helper: FROM -> TO -> WHAT -> PAY.
 *
 * Mirrors the local helper. Nothing here fakes a business operation; every
 * step is the real screen.
 */

import * as H from "./helpers.mjs";

/** Drive the wizard up to the PAY screen and stop there. */
export async function bookOutstationToPayStep(
  page,
  {
    weightKg = 2,
    courier = "QA Courier Express",
    destinationCity = "Hyderabad",
    pickupWindow = "One day",
    customDays = null,
    speed = null,
  } = {},
) {
  await page.goto(`${H.APP}/parcel/outstation`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);

  // A previous run can leave a saved draft that reopens the wizard on a later
  // step; the FROM tab puts every scenario back at the same starting point.
  const street = page.locator('textarea[placeholder="Flat no, building, street or area"]');
  if ((await street.count()) === 0) {
    const fromTab = page.locator("button").filter({ hasText: /^from$/i }).first();
    if ((await fromTab.count()) > 0) {
      await fromTab.click();
      await page.waitForTimeout(2500);
    }
  }
  await street.waitFor({ state: "visible", timeout: 30000 });

  /* STEP 1 — FROM */
  await page.locator('input[placeholder="Full name"]').fill("QA User One");
  await page.locator('input[placeholder="10-digit"]').fill("9000000001");
  await street.fill("QA Out Pickup");
  await page.locator('input[placeholder="Near City Mall"]').fill("QA Out Landmark");
  await page.locator('input[placeholder="City"]').fill("Bengaluru");
  await page.locator('input[placeholder="State"]').fill("Karnataka");
  await page.locator('input[placeholder="110075"]').fill("560001");

  await page.locator("button").filter({ hasText: /drop a pin/i }).first().click();
  await page.waitForTimeout(4000);
  await page.locator("button").filter({ hasText: /confirm location/i }).first().click();
  await page.waitForTimeout(2500);

  await clickContinue(page, "FROM");

  /* STEP 2 — TO: courier, destination, pickup window */
  await page.locator("button").filter({ hasText: /pick a courier company/i }).first().click();
  await page.waitForTimeout(1800);
  await page.locator("button").filter({ hasText: new RegExp(courier, "i") }).first().click();
  await page.waitForTimeout(2500);

  await page.locator("button").filter({ hasText: /pick a destination city/i }).first().click();
  await page.waitForTimeout(1800);
  await page.locator("button").filter({ hasText: new RegExp(`^${destinationCity}$`, "i") }).first().click();
  await page.waitForTimeout(2000);

  if (pickupWindow) {
    await page
      .locator("button")
      .filter({ hasText: new RegExp(pickupWindow.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
      .first()
      .click();
    await page.waitForTimeout(1500);
    if (customDays) {
      const box = page.locator('input[type="number"], input[inputmode="numeric"]').first();
      if (await box.count()) {
        await box.fill(String(customDays));
        await page.waitForTimeout(1500);
      }
    }
  }

  await clickContinue(page, "TO");

  /* STEP 3 — WHAT */
  await page.waitForTimeout(2000);
  const weightBox = page
    .locator('input[inputmode="decimal"], input[type="number"]')
    .first();
  if (await weightBox.count()) {
    await weightBox.fill(String(weightKg));
    await page.waitForTimeout(1200);
  }
  if (speed) {
    await page
      .locator("button")
      .filter({ hasText: new RegExp(speed, "i") })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1200);
  }
  await clickContinue(page, "WHAT");
  await page.waitForTimeout(3000);
  return page;
}

async function clickContinue(page, label) {
  const btn = page.locator("button").filter({ hasText: /^continue$/i }).last();
  await btn.waitFor({ state: "visible", timeout: 20000 });
  for (let i = 0; i < 40 && !(await btn.isEnabled()); i++) await page.waitForTimeout(500);
  if (!(await btn.isEnabled())) {
    const body = await page.locator("body").innerText();
    throw new Error(`CONTINUE disabled at ${label}: ${body.slice(0, 200).replace(/\n/g, " | ")}`);
  }
  await btn.click();
  await page.waitForTimeout(2200);
}
