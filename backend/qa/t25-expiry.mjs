/**
 * T25 — the "customer never answered" path.
 *
 * `resolveExpiredDecisions` is driven by cityParcelSweeperJob, which only runs
 * under PROCESS_ROLE=scheduler. This QA API process runs role=api, so the
 * sweeper is not scheduled here. Rather than invent a trigger, the QA harness
 * calls the SAME exported function the job calls, against the same disposable
 * database — labelled SERVICE-LEVEL, not browser.
 *
 * The response deadline is customerResponseWindowMinutes (30) in the future,
 * so the deadline is first wound back on the row to simulate the clock having
 * passed. Only the timestamp is touched; the decision logic is untouched.
 *
 * usage: node qa/t25-expiry.mjs <bookingIdAtDropReached>
 */

import mongoose from "mongoose";
import { testUri } from "./db.mjs";

const ID = process.argv[2];
const uri = testUri();
process.env.MONGO_URI = uri;
await mongoose.connect(uri);

// `startReturnLeg` populates `customerId`, so the customer model has to be
// registered on this connection exactly as the running app registers it.
await import("../app/models/customer.js");
const CityParcel = (await import("../app/models/cityParcel.js")).default;
const { recordFailedAttempt, resolveExpiredDecisions } = await import(
  "../app/services/cityParcelReturnService.js"
);

const m2 = (n) => Math.round(Number(n) * 100) / 100;
let passed = 0;
let failed = 0;
const check = (ok, label, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  ok ? passed++ : failed++;
};

console.log(`\n=== T25: unanswered decision expires to a return (${ID}) ===`);

const before = await CityParcel.findById(ID).lean();
console.log(`  start status: ${before.status}, riderId ${before.deliveryPartnerId}`);

// 1. rider reports the failure (service-level, same call the API makes)
const failed1 = await recordFailedAttempt({
  cityParcelId: ID,
  deliveryId: String(before.deliveryPartnerId),
  outcome: "NO_ANSWER",
  note: "QA: nobody answered",
  photoUrl: "https://example.test/door.png",
  calledAt: new Date(),
  waitedMinutes: 10,
  location: { lat: 12.9352, lng: 77.6245 },
});
check(failed1.parcel.status === "DELIVERY_FAILED", "parcel is DELIVERY_FAILED", failed1.parcel.status);
check(
  failed1.parcel.returnLeg?.status === "PENDING_CUSTOMER",
  "returnLeg awaits the customer",
  failed1.parcel.returnLeg?.status,
);
console.log(`  deadline: ${failed1.responseDeadlineAt.toISOString()}`);

// 2. nothing should happen while the deadline is still in the future
const early = await resolveExpiredDecisions({ limit: 50 });
check(early.returned === 0, "no auto-return before the deadline", `examined ${early.examined}, returned ${early.returned}`);
const stillPending = await CityParcel.findById(ID).lean();
check(stillPending.status === "DELIVERY_FAILED", "parcel still waiting on the customer", stillPending.status);

// 3. wind the clock past the deadline (timestamp only)
await CityParcel.updateOne(
  { _id: ID },
  { $set: { "returnLeg.responseDeadlineAt": new Date(Date.now() - 60_000) } },
);
console.log("  (deadline moved into the past to simulate the window elapsing)");

// 4. the sweeper's own function should now default it to a return
const late = await resolveExpiredDecisions({ limit: 50 });
check(late.returned >= 1, "expired decision auto-resolves", `examined ${late.examined}, returned ${late.returned}`);

const after = await CityParcel.findById(ID).lean();
check(after.status === "RETURN_IN_TRANSIT", "parcel moved to RETURN_IN_TRANSIT", after.status);
check(after.returnLeg?.status === "IN_TRANSIT", "returnLeg is IN_TRANSIT", after.returnLeg?.status);
check(
  after.returnLeg?.customerChoice === "RETURN_TO_PICKUP",
  "defaulted to RETURN_TO_PICKUP",
  after.returnLeg?.customerChoice,
);
check(m2(after.returnLeg?.riderPayout) === 61.11, "rider return payout still 61.11", String(after.returnLeg?.riderPayout));
check(m2(after.returnLeg?.customerCharge) === 0, "customer charge 0 at the restored config", String(after.returnLeg?.customerCharge));
check(after.returnLeg?.responseDeadlineAt === null, "deadline cleared once resolved", String(after.returnLeg?.responseDeadlineAt));

// 5. running it again must not double-resolve
const again = await resolveExpiredDecisions({ limit: 50 });
check(again.returned === 0, "re-running the sweeper does not double-resolve", `returned ${again.returned}`);

console.log(`\n  T25 result: ${passed} passed, ${failed} failed`);
await mongoose.disconnect();
