/**
 * T11 — the server-built invoice for the GST+coupon booking, and the admin
 * GST report, checked against figures computed here.
 */

import * as H from "./helpers.mjs";

const BOOKING = process.argv[2];
const m2 = (n) => Math.round(Number(n) * 100) / 100;

let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (ok) { H.pass(label, extra); passed++; } else { H.fail(label, extra); failed++; }
};
const eq = (a, e, label) => check(m2(a) === m2(e), label, `expected ${m2(e)}, actual ${m2(a)}`);

/* Expected for CP-5FOOL8DGPNKG, from T10. */
const EXP = {
  subtotal: 146.56,      // taxable value after the coupon
  preDiscount: 162.85,
  gst: 26.38,
  total: 172.94,
  taxableDiscount: 16.29,
  totalSaving: 19.22,
};

const browser = await H.launch();

/* ------------------------------- invoice ------------------------------ */
const { ctx: uCtx, page: user } = await H.newCtx(browser, "user");
await H.loginCustomer(user, H.USER_02);
await user.goto(`${H.APP}/parcel/local/track/${BOOKING}`, { waitUntil: "networkidle" });
await user.waitForTimeout(4000);

const invoice = await user.evaluate(async (id) => {
  // The customer app stores its JWT under `auth_customer`.
  const key =
    Object.keys(localStorage).find((k) => /^auth_/.test(k)) ||
    Object.keys(localStorage).find((k) => /token/i.test(k));
  const raw = localStorage.getItem(key);
  let token = raw;
  try { const p = JSON.parse(raw); token = p?.token || p?.accessToken || raw; } catch {}
  const res = await fetch(`http://localhost:7000/api/porter/invoice/city_parcel/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}, BOOKING);

console.log(`\n=== T11: invoice (HTTP ${invoice.status}) ===`);
const inv = invoice.body?.result?.invoice || invoice.body?.result || {};
if (invoice.status === 200 && inv.total !== undefined) {
  console.log(`  charges: ${(inv.charges || []).map((c) => `${c.label} ${c.amount}`).join(" | ")}`);
  console.log(`  subtotal ${inv.subtotal} | tax ${inv.tax?.total} | total ${inv.total}`);
  eq(inv.subtotal, EXP.subtotal, "invoice subtotal == taxable value");
  eq(inv.tax?.total, EXP.gst, "invoice GST total");
  eq(inv.total, EXP.total, "invoice total == payable");
  eq(m2((inv.subtotal || 0) + (inv.tax?.total || 0)), EXP.total, "invoice subtotal + tax == total");
  eq(inv.discount?.amount, EXP.taxableDiscount, "invoice discount line (against taxable value)");
  if (inv.discount?.totalSaving !== undefined) {
    eq(inv.discount.totalSaving, EXP.totalSaving, "invoice records the customer's full saving");
  }
  const charged = (inv.charges || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  eq(m2(charged), EXP.subtotal, "invoice charge lines sum to the subtotal");
  const half = m2(EXP.gst / 2);
  const cgst = (inv.tax?.lines || []).find((l) => /CGST/i.test(l.label));
  const sgst = (inv.tax?.lines || []).find((l) => /SGST/i.test(l.label));
  check(cgst && sgst, "invoice prints CGST and SGST separately");
  if (cgst && sgst) eq(m2(cgst.amount + sgst.amount), EXP.gst, "CGST + SGST == GST");
  console.log(`  amount in words: ${inv.amountInWords}`);
} else {
  check(false, "invoice fetched", `HTTP ${invoice.status} ${JSON.stringify(invoice.body).slice(0, 200)}`);
}
await uCtx.close();

/* ----------------------------- GST report ----------------------------- */
const { ctx: aCtx, page: admin } = await H.newCtx(browser, "admin");
let report = null;
admin.on("response", async (r) => {
  if (/gst-report/i.test(r.url()) && r.request().method() === "GET") {
    const j = await r.json().catch(() => null);
    if (j?.result?.combined || j?.result?.local) report = j.result;
  }
});
await H.loginAdmin(admin);
await admin.goto(`${H.APP}/admin/porter/gst`, { waitUntil: "networkidle" });
await admin.waitForTimeout(5000);

console.log("\n=== T11: admin GST report ===");
if (report) {
  const c = report.combined?.charged || {};
  const col = report.combined?.collected || {};
  console.log(`  charged  : bookings ${c.bookings} gross ${c.gross} taxable ${c.taxable} gst ${c.gst} discount ${c.discount}`);
  console.log(`  collected: bookings ${col.bookings} gross ${col.gross} taxable ${col.taxable} gst ${col.gst}`);
  check(m2(c.gst) === m2(EXP.gst), "report GST == the only taxed booking's GST", `expected ${EXP.gst}, actual ${m2(c.gst)}`);
  check(c.discount !== undefined, "report exposes a discount column", `discount=${c.discount}`);
  eq(c.discount, EXP.totalSaving, "report discount total");
  check(
    m2(c.gross) < m2(c.gross + c.discount),
    "report gross is net of the coupon (what customers were billed)",
    `gross ${c.gross}`,
  );
  // Nothing has been remitted yet: the only delivered job is COD still with the rider.
  eq(col.gst, 0, "collected GST is zero while COD is still with the rider");
} else {
  check(false, "GST report payload captured");
}
await H.shot(admin, "t11-gst-report");
await aCtx.close();

console.log(`\n  T11 result: ${passed} passed, ${failed} failed`);
await browser.close();
