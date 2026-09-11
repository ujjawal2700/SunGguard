/**
 * T23 — negative and edge cases on the LOCAL return flow.
 *
 * Sessions are real: each token is taken from a genuine browser login, then
 * the guarded endpoints are exercised directly so the exact HTTP status can be
 * asserted. Labelled API-level in the report, not browser-flow.
 *
 * usage: node qa/t23-return-edge.mjs <returnedBookingId> <inFlightBookingId?>
 */

import * as H from "./helpers.mjs";

const RETURNED_ID = process.argv[2];

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};

/** Log in for real, then lift the session token the app stored. */
async function tokenFor(browser, kind, who) {
  const { ctx, page } = await H.newCtx(browser, kind);
  if (kind === "driver") await H.loginDriver(page, who);
  else await H.loginCustomer(page, who);
  await page.waitForTimeout(2000);
  const token = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^auth_/.test(x));
    const raw = localStorage.getItem(k);
    try { const p = JSON.parse(raw); return p?.token || p?.accessToken || raw; } catch { return raw; }
  });
  await ctx.close();
  return token;
}

const api = async (token, method, path, body) => {
  const res = await fetch(`${H.API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

console.log(`\n=== T23: return flow edge cases (returned parcel ${RETURNED_ID}) ===`);
const browser = await H.launch();

const rider2 = await tokenFor(browser, "driver", H.DRIVER_02); // owns the parcel
const rider1 = await tokenFor(browser, "driver", H.DRIVER_01); // does not
const cust1 = await tokenFor(browser, "user", H.USER_01);      // owns it
const cust2 = await tokenFor(browser, "user", H.USER_02);      // does not
await browser.close();

const attempt = {
  outcome: "REFUSED",
  note: "dup",
  photoUrl: "https://example.test/x.png",
  calledAt: null,
  waitedMinutes: 0,
  location: { lat: 12.9352, lng: 77.6245, accuracyM: 0 },
};

/* 1. terminal parcel cannot take another failed attempt */
let r = await api(rider2, "POST", `/api/city-parcel/rider/${RETURNED_ID}/failed-attempt`, attempt);
check(r.status >= 400, "RETURNED parcel refuses a further failed attempt", `HTTP ${r.status} ${r.body?.message || ""}`);

/* 2. return cannot be completed twice */
r = await api(rider2, "POST", `/api/city-parcel/rider/${RETURNED_ID}/verify-return`, {
  otp: "1234",
  proofImage: "https://example.test/x.png",
  location: { lat: 12.9716, lng: 77.5946, accuracyM: 0 },
});
check(r.status >= 400, "a returned parcel cannot be returned again", `HTTP ${r.status} ${r.body?.message || ""}`);

/* 3. customer cannot submit a decision once the parcel is terminal */
r = await api(cust1, "POST", `/api/city-parcel/${RETURNED_ID}/failure-response`, { choice: "RETURN_TO_PICKUP" });
check(r.status >= 400, "no further customer decision on a returned parcel", `HTTP ${r.status} ${r.body?.message || ""}`);

/* 4. another customer cannot touch it */
r = await api(cust2, "POST", `/api/city-parcel/${RETURNED_ID}/failure-response`, { choice: "RETURN_TO_PICKUP" });
check(r.status === 403 || r.status === 404, "another customer cannot decide on this parcel", `HTTP ${r.status} ${r.body?.message || ""}`);

/* 5. another rider cannot act on it */
r = await api(rider1, "POST", `/api/city-parcel/rider/${RETURNED_ID}/verify-return`, {
  otp: "1234",
  proofImage: "https://example.test/x.png",
  location: { lat: 12.9716, lng: 77.5946, accuracyM: 0 },
});
check(r.status === 403 || r.status === 404, "another rider cannot complete this return", `HTTP ${r.status} ${r.body?.message || ""}`);

/* 6. another rider cannot report a failure on it */
r = await api(rider1, "POST", `/api/city-parcel/rider/${RETURNED_ID}/failed-attempt`, attempt);
check(r.status === 403 || r.status === 404, "another rider cannot report a failure on this job", `HTTP ${r.status} ${r.body?.message || ""}`);

/* 7. cancellation after custody is refused (business rule, unchanged) */
r = await api(cust1, "POST", `/api/city-parcel/${RETURNED_ID}/cancel`, { reason: "QA" });
check(r.status >= 400, "cancelling a parcel in/after custody is refused", `HTTP ${r.status} ${r.body?.message || ""}`);

/* 8. rider cannot flag unreachable once returned */
r = await api(rider2, "POST", `/api/city-parcel/rider/${RETURNED_ID}/customer-unreachable`, { note: "QA" });
check(r.status >= 400, "customer-unreachable refused on a returned parcel", `HTTP ${r.status} ${r.body?.message || ""}`);

/* 9. an invalid choice value is rejected */
r = await api(cust1, "POST", `/api/city-parcel/${RETURNED_ID}/failure-response`, { choice: "TELEPORT_IT" });
check(r.status >= 400, "an unknown customer choice is rejected", `HTTP ${r.status} ${r.body?.message || ""}`);

/* 10. duplicate return completion creates no extra ledger row — checked in DB after */
console.log(`\n  T23 result: ${passed} passed, ${failed} failed`);
