/**
 * Live check: retrying a cancelled online booking must reuse the same DB row.
 *
 * Reproduces exactly what the user reported — book online, dismiss/cancel
 * before paying, tap Pay again — for both porter flows, against a running
 * server and a real database. Cleans up everything it creates.
 *
 *   node scripts/e2e-resume-booking.js [--base http://localhost:7000]
 */

import "dotenv/config";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import Customer from "../app/models/customer.js";
import Parcel from "../app/models/parcel.js";
import CityParcel from "../app/models/cityParcel.js";
import ParcelConfig from "../app/models/parcelConfig.js";
import CityParcelConfig from "../app/models/cityParcelConfig.js";
import CourierCompany from "../app/models/courierCompany.js";
import Warehouse from "../app/models/warehouse.js";
import DeliveryZone from "../app/models/deliveryZone.js";

const args = process.argv.slice(2);
const BASE =
  (args.includes("--base") ? args[args.indexOf("--base") + 1] : null) ||
  `http://127.0.0.1:${process.env.PORT || 7000}/api`;

const RUN = `resume${Date.now().toString().slice(-8)}`;
let passed = 0;
const failures = [];

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  head: (s) => `\x1b[1m\x1b[36m${s}\x1b[0m`,
};

function check(label, actual, expected) {
  if (actual === expected) {
    passed += 1;
    console.log(`  ${c.ok("PASS")} ${label} ${c.dim(`= ${actual}`)}`);
  } else {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
    console.log(`  ${c.bad("FAIL")} ${label} ${c.bad(`expected ${expected}, got ${actual}`)}`);
  }
}

const section = (s) => console.log(`\n${c.head(s)}`);

async function api(method, path, { token, body } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, body: json, result: json.result };
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`${method} ${path} failed to connect`);
}

const sign = (id, role) =>
  jwt.sign({ id: String(id), role }, process.env.JWT_SECRET, { expiresIn: "1h" });

const PICKUP = { lat: 28.6139, lng: 77.209 };
const DROP = { lat: 28.6448, lng: 77.2167 };

const created = { customer: null, courier: null, warehouse: null, zone: null };

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(c.head(`\nResume-booking check · run ${RUN} · ${BASE}`));

  created.customer = await Customer.create({
    name: `Resume Test ${RUN}`,
    phone: `9${RUN.slice(-9).padStart(9, "1")}`,
    isActive: true,
  });
  const customerToken = sign(created.customer._id, "customer");

  const cityConfig = await CityParcelConfig.getConfig();
  Object.assign(cityConfig, {
    baseFare: 30,
    perKmCharge: 12,
    weightCharge: 10,
    minFare: 45,
    platformCharge: 5,
    isEnabled: true,
    maxTripDistanceKm: 30,
    maxWeightKg: 20,
    dropProximityMeters: 2000,
  });
  await cityConfig.save();

  const parcelConfig = await ParcelConfig.getOrCreate();
  Object.assign(parcelConfig, { perKmCharge: 10, weightCharge: 15, maxWeightKg: 5 });
  await parcelConfig.save();

  created.courier = await CourierCompany.create({
    name: `Resume Courier ${RUN}`,
    platformCharge: 60,
    isActive: true,
    cities: ["Mumbai"],
  });
  created.warehouse = await Warehouse.create({
    name: `Resume Hub ${RUN}`,
    address: "Test Hub Road",
    city: "Delhi",
    pincode: "110001",
    phone: "9000000001",
    lat: DROP.lat,
    lng: DROP.lng,
    location: { type: "Point", coordinates: [DROP.lng, DROP.lat] },
    isActive: true,
  });
  created.zone = await DeliveryZone.create({
    name: `Resume Zone ${RUN}`,
    city: "Delhi",
    isActive: true,
    points: [
      { lat: 28.55, lng: 77.15 },
      { lat: 28.55, lng: 77.3 },
      { lat: 28.7, lng: 77.3 },
      { lat: 28.7, lng: 77.15 },
    ],
  });

  /* ---------------- local (city) ---------------- */
  section("Local delivery · cancel and retry");

  const cityBody = {
    pickupAddress: { fullAddress: "12 Test Street, Connaught Place, Delhi", ...PICKUP },
    dropAddress: { fullAddress: "44 Other Road, Civil Lines, Delhi", ...DROP },
    sender: { name: "Asha Kumari", phone: "9876543210" },
    receiver: { name: "Ravi Sharma", phone: "9876543211" },
    package: { packageType: "document", weightKg: 2, description: "papers" },
    paymentMethod: "UPI",
  };

  const cityFirst = await api("POST", "/city-parcel/create", { token: customerToken, body: cityBody });
  check("first attempt is created", cityFirst.status, 201);
  const firstCityId = cityFirst.result?.parcel?._id;

  // Customer dismisses the Razorpay sheet without paying, then taps Pay again
  // with the exact same booking — this is the reported bug.
  const citySecond = await api("POST", "/city-parcel/create", { token: customerToken, body: cityBody });
  check("retry after cancel is accepted", citySecond.status, 201);
  check("retry reuses the SAME booking id", citySecond.result?.parcel?._id, firstCityId);

  const cityThird = await api("POST", "/city-parcel/create", { token: customerToken, body: cityBody });
  check("a second retry still reuses the same id", cityThird.result?.parcel?._id, firstCityId);

  const cityCount = await CityParcel.countDocuments({ customerId: created.customer._id });
  check("only one row exists in the database after three attempts", cityCount, 1);

  const cityOrderIds = new Set(
    [cityFirst, citySecond, cityThird].map((r) => r.result?.razorpay?.orderId).filter(Boolean),
  );
  console.log(`  ${c.dim(`gateway orders opened: ${cityOrderIds.size} (fresh order per retry is expected)`)}`);

  /* ---------------- outstation ---------------- */
  section("Outstation parcel · cancel and retry");

  const outBody = {
    pickupAddress: {
      name: "Asha Kumari",
      phone: "9876543210",
      fullAddress: "12 Test Street, Connaught Place, Delhi",
      pincode: "110001",
      ...PICKUP,
    },
    dropAddress: { name: "Hub", phone: "9000000001", fullAddress: "Test Hub Road, Delhi", ...DROP },
    packageDetails: { packageType: "document", weight: 1, description: "papers" },
    paymentMethod: "UPI",
    courierCompanyId: String(created.courier._id),
    destinationCity: "Mumbai",
    pickupWindow: "today",
    deliverySpeed: "normal",
  };

  const outFirst = await api("POST", "/parcel/create", { token: customerToken, body: outBody });
  check("first attempt is created", outFirst.status, 201);
  const firstOutId = outFirst.result?.parcel?._id;

  const outSecond = await api("POST", "/parcel/create", { token: customerToken, body: outBody });
  check("retry after cancel is accepted", outSecond.status, 201);
  check("retry reuses the SAME booking id", outSecond.result?.parcel?._id, firstOutId);

  const outCount = await Parcel.countDocuments({ customerId: created.customer._id });
  check("only one row exists in the database after two attempts", outCount, 1);

  /* ---------------- a genuinely different booking is NOT resumed ---------------- */
  section("A different booking must not be resumed onto the same row");

  const differentBody = { ...cityBody, package: { ...cityBody.package, weightKg: 5 } };
  const differentRes = await api("POST", "/city-parcel/create", {
    token: customerToken,
    body: differentBody,
  });
  check(
    "a booking with a different weight gets its own row",
    differentRes.result?.parcel?._id === firstCityId,
    false,
  );
  const cityCountAfterDifferent = await CityParcel.countDocuments({ customerId: created.customer._id });
  check("so the database now has two distinct rows", cityCountAfterDifferent, 2);

  /* ---------------- report ---------------- */
  section("Result");
  console.log(`  ${c.ok(`${passed} passed`)}${failures.length ? `, ${c.bad(`${failures.length} failed`)}` : ""}`);
  failures.forEach((f) => console.log(`    ${c.bad("·")} ${f}`));

  return failures.length === 0;
}

async function cleanup() {
  section("Cleaning up");
  const customerId = created.customer?._id;
  await Promise.all([
    customerId ? CityParcel.deleteMany({ customerId }) : null,
    customerId ? Parcel.deleteMany({ customerId }) : null,
    customerId ? Customer.deleteOne({ _id: customerId }) : null,
    created.courier ? CourierCompany.deleteOne({ _id: created.courier._id }) : null,
    created.warehouse ? Warehouse.deleteOne({ _id: created.warehouse._id }) : null,
    created.zone ? DeliveryZone.deleteOne({ _id: created.zone._id }) : null,
  ]);
  console.log(`  ${c.dim("test customer, bookings and fixtures removed")}`);
}

let success = false;
try {
  success = await run();
} catch (err) {
  console.error(`\n${c.bad("Run aborted:")} ${err.message}`);
  console.error(err.stack);
} finally {
  await cleanup().catch((e) => console.error("cleanup failed:", e.message));
  await mongoose.disconnect();
}

process.exit(success ? 0 : 1);
