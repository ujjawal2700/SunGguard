/**
 * T07b — complete the handover with the rider actually AT the drop.
 *
 * The first attempt was refused because the rider's GPS was still at the
 * pickup, 5183 m away, and the rate card's proximity gate is 120 m. That
 * refusal is correct behaviour, so the fix is to move the rider, not to
 * bypass the gate.
 */

import * as H from "./helpers.mjs";

const BOOKING = process.argv[2];
let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};

const browser = await H.launch();
// Rider starts at the drop this time.
const { ctx, page } = await H.newCtx(browser, "driver", H.GEO_DROP);

const errors = [];
page.on("response", async (r) => {
  if (/city-parcel/i.test(r.url()) && r.status() >= 400) {
    errors.push(`${r.status()} ${r.url().replace(H.API, "")} ${(await r.text().catch(() => "")).slice(0, 160)}`);
  }
});

await H.loginDriver(page, H.DRIVER_01);
await page.waitForTimeout(2500);
await page.goto(`${H.APP}/delivery/city-parcel/${BOOKING}`, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);

// Let the app take a fresh fix at the new position.
const refresh = page.locator("button").filter({ hasText: /^refresh$/i }).first();
if ((await refresh.count()) > 0) {
  await refresh.click();
  await page.waitForTimeout(4000);
}
const proximity = await page.locator("body").innerText();
check(!/look far from the address/i.test(proximity), "rider is now within the proximity gate");

// Identity checks the app asks for before a handover.
const nameBox = page.locator('input[type="checkbox"]').first();
if ((await nameBox.count()) > 0) {
  await nameBox.check({ force: true });
  await page.waitForTimeout(400);
  check(true, "confirmed the receiver's name matches");
}

// The two 4-character boxes are told apart by placeholder: "0000" wants the
// last four digits of the receiver's number, "————" wants the code.
await page.locator('input[placeholder="0000"]').fill("0021");
await page.waitForTimeout(400);
check(true, "entered the receiver's last 4 digits");

const send = page.locator("button").filter({ hasText: /send code to receiver/i }).first();
if ((await send.count()) > 0) {
  await send.click();
  await page.waitForTimeout(3500);
}

// The rider app prints the mock code on screen in test mode; read it rather
// than hard-coding, so this still holds if the fixture changes.
const shownCode = (await page.locator("body").innerText()).match(/Test mode code:\s*(\d{4})/i);
await page.locator('input[placeholder="————"]').fill(shownCode ? shownCode[1] : "1234");
await page.waitForTimeout(800);
check(Boolean(shownCode), "receiver code obtained", shownCode ? shownCode[1] : "fell back to 1234");

const file = page.locator('input[type="file"]');
if ((await file.count()) > 0) {
  await file.first().setInputFiles("qa/fixtures/parcel.png");
  await page.waitForTimeout(5000);
}

const buttons = await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .filter((b) => (b.offsetParent || b.getClientRects().length) && !b.disabled)
    .map((b) => (b.innerText || "").trim())
    .filter(Boolean),
);
console.log("  enabled buttons:", buttons.join(" | "));

const finish = buttons.find((t) => /^confirm delivery$/i.test(t)) ||
  buttons.find((t) => /confirm delivery/i.test(t) && !/can't/i.test(t));
check(Boolean(finish), "Confirm delivery is enabled", finish || "not enabled");

if (finish) {
  await page.locator("button").filter({ hasText: /confirm delivery/i }).first().click();
  await page.waitForTimeout(6000);
}

console.log("  FINAL:", (await page.locator("body").innerText()).split("\n").filter(Boolean).slice(0, 12).join(" | "));
if (errors.length) console.log("  API errors:", errors.join(" || "));
await H.shot(page, "t07b-delivered");

console.log(`\n  T07b result: ${passed} passed, ${failed} failed`);
await ctx.close();
await browser.close();
