/**
 * PAY-step helpers — reading the fare panel, coupons, and placing the booking.
 *
 * Kept in its own module because the fare panel is parsed with regexes that do
 * not survive being written through a shell heredoc.
 */

const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, "")));

/** Every fare row the customer can actually see, read off the rendered page. */
export async function readFarePanel(page) {
  const text = await page.locator("body").innerText();

  const row = (label) => {
    const re = new RegExp(label + "[^\\d₹]*₹\\s*(-?[\\d,]+\\.?\\d*)", "i");
    const m = text.match(re);
    return m ? num(m[1]) : null;
  };

  const distance = text.match(/Distance\s*·\s*([\d.]+)\s*km/i);
  const gst = text.match(/GST\s*\((\d+(?:\.\d+)?)%\)[^\d₹]*₹\s*([\d,]+\.?\d*)/i);
  const coupon = text.match(/Coupon\s*\(([^)]*)\)[^\d₹]*-?₹\s*([\d,]+\.?\d*)/i);

  return {
    baseFare: row("Base fare"),
    distanceKm: distance ? Number(distance[1]) : null,
    distanceFare: row("Distance\\s*·\\s*[\\d.]+\\s*km"),
    weightFare: row("Weight"),
    platformFee: row("Platform fee"),
    expressFare: row("Express"),
    gstPercent: gst ? Number(gst[1]) : null,
    gstAmount: gst ? num(gst[2]) : null,
    couponCode: coupon ? coupon[1] : null,
    couponAmount: coupon ? num(coupon[2]) : null,
    total: row("TOTAL"),
    estimate: row("ESTIMATE"),
    raw: text,
  };
}

/** Apply a coupon code on the PAY step; returns the API's own verdict. */
export async function applyCoupon(page, code) {
  await page.locator('input[placeholder="Enter coupon code"]').fill(code);
  const wait = page.waitForResponse(
    (r) => /coupon/i.test(r.url()) && r.request().method() === "POST",
    { timeout: 30000 },
  );
  await page.locator("button").filter({ hasText: /^Apply$/ }).first().click();
  let status = 0;
  let body = {};
  try {
    const resp = await wait;
    status = resp.status();
    body = await resp.json().catch(() => ({}));
  } catch {
    /* the button may be inert for an empty/duplicate code */
  }
  await page.waitForTimeout(1800);
  return { status, ok: status >= 200 && status < 300, body };
}

/**
 * Choose a payment method and place the booking.
 * Returns the create response so the caller can assert against what was stored.
 */
export async function placeBooking(page, method = "Cash") {
  // Anchored at the start only: the outstation screen labels its options over
  // two lines ("Cash\nOn pickup", "UPI\nPay now"), so an end-anchored match
  // finds nothing there while the local screen uses bare words.
  await page
    .locator("button")
    .filter({ hasText: new RegExp("^\\s*" + method, "i") })
    .first()
    .click();
  await page.waitForTimeout(1200);

  const submit = page
    .locator("button")
    .filter({
      hasText:
        /PAY\s*₹|PLACE|CONFIRM|BOOK NOW|PAY ON|CASH ON|BOOK PICKUP|CONFIRM BOOKING|REQUEST PICKUP/i,
    })
    .last();

  // Local posts to /city-parcel/..., outstation to /parcel/create — match
  // either, while excluding the quote and coupon calls that also fly here.
  const wait = page.waitForResponse(
    (r) =>
      /\/(city-)?parcel/i.test(r.url()) &&
      r.request().method() === "POST" &&
      !/coupon|calculate-fare|validate/i.test(r.url()),
    { timeout: 60000 },
  );
  await submit.click();

  const resp = await wait;
  const body = await resp.json().catch(() => ({}));
  await page.waitForTimeout(3000);
  return { status: resp.status(), ok: resp.ok(), body, url: page.url() };
}
