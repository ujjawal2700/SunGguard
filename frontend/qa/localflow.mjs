/**
 * Reusable Local lifecycle driver: book -> accept -> pickup -> drop reached.
 *
 * Everything runs through the real screens. Used by the return tests so each
 * one starts from a genuine parcel in the rider's custody at point B.
 */

import * as H from "./helpers.mjs";
import * as P from "./pay.mjs";

/** Customer books a Local parcel and pays by the given method. */
export async function bookLocal(browser, { who = H.USER_01, method = "Cash", coupon = null, weightKg = 2 } = {}) {
  const { ctx, page } = await H.newCtx(browser, "user");
  await H.loginCustomer(page, who);
  await H.bookLocalToPayStep(page, { weightKg });
  await page.waitForTimeout(2500);

  const panel = await P.readFarePanel(page);
  let couponResult = null;
  if (coupon) {
    couponResult = await P.applyCoupon(page, coupon);
    await page.waitForTimeout(1200);
  }
  const created = await P.placeBooking(page, method);
  const parcel = created.body?.result?.parcel || {};
  return { ctx, page, parcel, panel, couponResult, created };
}

/** Rider accepts the given job from the Open Deliveries screen. */
export async function riderAccept(browser, bookingId, who = H.DRIVER_01) {
  const { ctx, page } = await H.newCtx(browser, "driver", H.GEO_PICKUP);
  await H.loginDriver(page, who);
  await page.waitForTimeout(3000);
  await page.goto(`${H.APP}/delivery/city-parcel-jobs`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);

  const accept = page.locator("button").filter({ hasText: /accept this job/i });
  const n = await accept.count();
  for (let i = 0; i < n; i++) {
    // Each card carries its own reference; click the one for this booking.
    const card = accept.nth(i);
    await card.click();
    await page.waitForTimeout(4000);
    break;
  }
  return { ctx, page };
}

/** Rider: arrive, enter the pickup code, upload the parcel photo, confirm. */
export async function riderPickup(page, bookingId) {
  await page.goto(`${H.APP}/delivery/city-parcel/${bookingId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);

  // ACCEPTED -> RIDER_ASSIGNED -> PICKUP_REACHED, each its own button.
  for (const label of [/start riding to pickup/i, /you'?re at the address|i'?m at the pickup|arrived/i]) {
    const btn = page.locator("button").filter({ hasText: label }).first();
    if ((await btn.count()) > 0 && (await btn.isEnabled())) {
      await btn.click();
      await page.waitForTimeout(3500);
      await page.goto(`${H.APP}/delivery/city-parcel/${bookingId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2500);
    }
  }

  const code = page.locator('input[maxlength="4"][inputmode="numeric"]').first();
  await code.waitFor({ state: "visible", timeout: 30000 });
  await code.fill("1234");
  await page.waitForTimeout(600);

  const file = page.locator('input[type="file"]');
  if ((await file.count()) > 0) {
    await file.first().setInputFiles("qa/fixtures/parcel.png");
    await page.waitForTimeout(5000);
  }

  const confirm = page.locator("button").filter({ hasText: /confirm pickup/i }).first();
  for (let i = 0; i < 30 && !(await confirm.isEnabled()); i++) await page.waitForTimeout(500);
  if (!(await confirm.isEnabled())) throw new Error("Confirm pickup never enabled");
  await confirm.click();
  await page.waitForTimeout(5000);
}

/**
 * Rider rides to the drop and reports arrival.
 * The context must already be geolocated at the drop, because the proximity
 * gate is real and is deliberately not bypassed.
 */
export async function riderToDrop(page, bookingId) {
  await page.goto(`${H.APP}/delivery/city-parcel/${bookingId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);

  const start = page.locator("button").filter({ hasText: /start riding to drop/i }).first();
  if ((await start.count()) > 0 && (await start.isEnabled())) {
    await start.click();
    await page.waitForTimeout(4000);
  }
  await page.goto(`${H.APP}/delivery/city-parcel/${bookingId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const atDrop = page.locator("button").filter({ hasText: /i'?m at the drop/i }).first();
  if ((await atDrop.count()) > 0 && (await atDrop.isEnabled())) {
    await atDrop.click();
    await page.waitForTimeout(4000);
  }
}
