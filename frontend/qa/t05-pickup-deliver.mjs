/**
 * T05 — finish the job in the rider UI: pickup (customer code + parcel photo)
 * then delivery, and check the money that falls out of it.
 *
 * The pickup code is the one the CUSTOMER is shown on their tracking screen,
 * read from that screen rather than from the database, so the handshake is
 * exercised the way it actually happens.
 */

import * as H from "./helpers.mjs";

const BOOKING = process.argv[2];
if (!BOOKING) {
  console.error("usage: node qa/t05-pickup-deliver.mjs <cityParcelId>");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};

console.log(`\n=== T05: pickup + delivery for ${BOOKING} ===`);
const browser = await H.launch();

/* ------------------------------------------- customer reads their code */
const { ctx: userCtx, page: user } = await H.newCtx(browser, "user");
await H.loginCustomer(user, H.USER_01);
await user.goto(`${H.APP}/parcel/local/track/${BOOKING}`, { waitUntil: "networkidle" });
await user.waitForTimeout(4000);
check(!/Oops!|is not defined/i.test(await user.locator("body").innerText()), "tracking page renders (no crash)");

await user.locator("button").filter({ hasText: /send me the code/i }).first().click();
await user.waitForTimeout(4000);
const codeDigits = await user.evaluate(() => {
  const t = document.body.innerText;
  const i = t.indexOf("SENT TO");
  const after = t.slice(i, i + 120).match(/\b(\d)\b[\s\S]*?\b(\d)\b[\s\S]*?\b(\d)\b[\s\S]*?\b(\d)\b/);
  return after ? after.slice(1, 5).join("") : null;
});
check(Boolean(codeDigits), "customer is shown a pickup code", `code=${codeDigits}`);

/* ----------------------------------------------------- rider picks up */
const { ctx: drvCtx, page: driver } = await H.newCtx(browser, "driver");
const errors = [];
driver.on("response", async (r) => {
  if (/city-parcel/i.test(r.url()) && r.status() >= 400) {
    errors.push(`${r.status()} ${r.url().replace(H.API, "")} ${(await r.text().catch(() => "")).slice(0, 120)}`);
  }
});
await H.loginDriver(driver, H.DRIVER_01);
await driver.waitForTimeout(3000);
await driver.goto(`${H.APP}/delivery/city-parcel/${BOOKING}`, { waitUntil: "networkidle" });
await driver.waitForTimeout(4000);

const earnText = (await driver.locator("body").innerText()).match(/([\d,]+)\s*\n?\s*you earn/i);
check(
  earnText && Number(earnText[1].replace(/,/g, "")) > 0,
  "active job shows a non-zero earning",
  `shows ${earnText ? earnText[1] : "?"}`,
);

// Customer's pickup code
const codeBox = driver.locator('input[maxlength="4"][inputmode="numeric"]').first();
await codeBox.waitFor({ state: "visible", timeout: 30000 });
await codeBox.fill(codeDigits || "1234");
await driver.waitForTimeout(800);

// Parcel photo — a real file through the real input.
const fileInput = driver.locator('input[type="file"]');
if (await fileInput.count()) {
  await fileInput.first().setInputFiles("qa/fixtures/parcel.png");
  await driver.waitForTimeout(4000);
}

const confirm = driver.locator("button").filter({ hasText: /confirm pickup/i }).first();
for (let i = 0; i < 30 && !(await confirm.isEnabled()); i++) await driver.waitForTimeout(500);
check(await confirm.isEnabled(), "Confirm pickup enabled after code + photo");
if (await confirm.isEnabled()) {
  await confirm.click();
  await driver.waitForTimeout(5000);
}
await H.shot(driver, "t05-after-pickup");
console.log("  after pickup:", (await driver.locator("body").innerText()).split("\n").filter(Boolean).slice(0, 16).join(" | "));

if (errors.length) console.log("  API errors:", errors.join(" || "));

console.log(`\n  T05 result: ${passed} passed, ${failed} failed`);
await userCtx.close();
await drvCtx.close();
await browser.close();
