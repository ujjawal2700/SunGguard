/**
 * End-to-end check of the porter money chain against a running server.
 *
 * Books four real parcels — local COD, local online, outstation COD,
 * outstation online — drives each through the rider workflow, and asserts
 * that the customer was charged the quoted fare, the rider was credited the
 * configured share, the platform kept the rest, and COD cash landed in the
 * deposit pipeline while online money did not.
 *
 * Everything it creates is tagged with a single run id and removed at the
 * end, so it can be run against a working database without leaving residue.
 * Pass --keep to leave the data in place and inspect it in the admin UI.
 *
 *   node scripts/e2e-porter-flow.js [--keep] [--base http://localhost:7000]
 */

import "dotenv/config";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import Customer from "../app/models/customer.js";
import Delivery from "../app/models/delivery.js";
import Admin from "../app/models/admin.js";
import Parcel from "../app/models/parcel.js";
import CityParcel from "../app/models/cityParcel.js";
import ParcelConfig from "../app/models/parcelConfig.js";
import CityParcelConfig from "../app/models/cityParcelConfig.js";
import CourierCompany from "../app/models/courierCompany.js";
import Warehouse from "../app/models/warehouse.js";
import DeliveryZone from "../app/models/deliveryZone.js";
import Transaction from "../app/models/transaction.js";
import CashDeposit from "../app/models/cashDeposit.js";
import CityParcelOtp from "../app/models/cityParcelOtp.js";
import { applyParcelDeliveredRiderEarning } from "../app/services/parcelRiderSettlementService.js";
import { creditDeliveryEarning } from "../app/services/cityParcelSettlementService.js";
import { computeRiderParcelEarnings } from "../app/services/parcelWorkflowService.js";

const args = process.argv.slice(2);
const KEEP = args.includes("--keep");
const BASE =
  (args.includes("--base") ? args[args.indexOf("--base") + 1] : null) ||
  `http://127.0.0.1:${process.env.PORT || 7000}/api`;

const RUN = `e2e${Date.now().toString().slice(-8)}`;

/* ---------------------------------------------------------------- output */

let passed = 0;
const failures = [];

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  head: (s) => `\x1b[1m\x1b[36m${s}\x1b[0m`,
};

function check(label, actual, expected) {
  const a = typeof actual === "number" ? Math.round(actual * 100) / 100 : actual;
  const e = typeof expected === "number" ? Math.round(expected * 100) / 100 : expected;
  if (a === e) {
    passed += 1;
    console.log(`  ${c.ok("PASS")} ${label} ${c.dim(`= ${a}`)}`);
  } else {
    failures.push(`${label}: expected ${e}, got ${a}`);
    console.log(`  ${c.bad("FAIL")} ${label} ${c.bad(`expected ${e}, got ${a}`)}`);
  }
}

function checkTrue(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ${c.ok("PASS")} ${label}`);
  } else {
    failures.push(`${label}${detail ? ` (${detail})` : ""}`);
    console.log(`  ${c.bad("FAIL")} ${label} ${detail ? c.bad(detail) : ""}`);
  }
}

const section = (s) => console.log(`\n${c.head(s)}`);
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* ------------------------------------------------------------------ http */

async function api(method, path, { token, body } = {}) {
  // One retry: a freshly booted server occasionally drops the first socket
  // on Windows, and a transport blip should not read as a failing assertion.
  let lastError;
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
      return { status: res.status, ok: res.ok, body: json, result: json.result };
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`${method} ${path} failed: ${lastError?.cause?.code || lastError?.message}`);
}

const sign = (id, role) =>
  jwt.sign({ id: String(id), role }, process.env.JWT_SECRET, { expiresIn: "1h" });

/* --------------------------------------------------------------- fixtures */

/** Two points ~4 km apart in Delhi, used for every booking in this run. */
const PICKUP = { lat: 28.6139, lng: 77.209 };
const DROP = { lat: 28.6448, lng: 77.2167 };

const created = {
  customer: null,
  rider: null,
  admin: null,
  courier: null,
  warehouse: null,
  zone: null,
  outsider: null,
};

async function setup() {
  section("Setting up test actors and admin pricing");

  created.customer = await Customer.create({
    name: `E2E Customer ${RUN}`,
    phone: `9${RUN.slice(-9).padStart(9, "1")}`,
    isActive: true,
  });

  created.rider = await Delivery.create({
    name: `E2E Rider ${RUN}`,
    phone: `8${RUN.slice(-9).padStart(9, "1")}`,
    vehicleType: "bike",
    vehicleNumber: `DL${RUN.slice(-6)}`,
    isVerified: true,
    isApproved: true,
    isOnline: true,
    isParcelService: true,
    location: { type: "Point", coordinates: [PICKUP.lng, PICKUP.lat] },
    lastLocationAt: new Date(),
    // Set through the rider's own payout screen in the real app.
    accountHolder: "E2E Rider",
    accountNumber: "123456789012",
    ifsc: "HDFC0001234",
    bankName: "HDFC Bank",
  });

  created.admin = await Admin.findOne({}).lean();
  console.log(`  ${c.dim(`customer ${created.customer._id}`)}`);
  console.log(`  ${c.dim(`rider    ${created.rider._id}`)}`);

  // --- what an admin would save on /admin/parcels/pricing
  const parcelConfig = await ParcelConfig.getOrCreate();
  Object.assign(parcelConfig, {
    perKmCharge: 10,
    weightCharge: 15,
    maxWeightKg: 5,
    expressCharge: 25,
    riderBaseFareSharePercent: 80,
    riderDistanceFareSharePercent: 80,
    baseSearchRadiusKm: 15,
  });
  await parcelConfig.save();
  console.log(`  ${c.dim("outstation rate card: ₹10/km + ₹15/kg + courier fee, rider 80% of distance")}`);

  // --- and on /admin/city-parcels/pricing
  const cityConfig = await CityParcelConfig.getConfig();
  Object.assign(cityConfig, {
    baseFare: 30,
    perKmCharge: 12,
    weightCharge: 10,
    minFare: 45,
    platformCharge: 5,
    expressCharge: 20,
    riderBaseFareSharePercent: 80,
    riderDistanceFareSharePercent: 70,
    maxTripDistanceKm: 30,
    maxWeightKg: 20,
    isEnabled: true,
    baseSearchRadiusKm: 15,
    dropProximityMeters: 2000,
  });
  await cityConfig.save();
  console.log(`  ${c.dim("local rate card: ₹30 base + ₹12/km + ₹10/kg + ₹5 platform, min ₹45")}`);

  // --- a courier the outstation booking can pick
  created.courier = await CourierCompany.create({
    name: `E2E Courier ${RUN}`,
    platformCharge: 60,
    isActive: true,
    cities: ["Mumbai"],
  });

  // --- the hub an outstation parcel is dropped at
  created.warehouse = await Warehouse.create({
    name: `E2E Hub ${RUN}`,
    address: "Test Hub Road",
    city: "Delhi",
    pincode: "110001",
    phone: "9000000001",
    lat: DROP.lat,
    lng: DROP.lng,
    location: { type: "Point", coordinates: [DROP.lng, DROP.lat] },
    isActive: true,
  });

  // --- a zone covering both points, so the local booking is serviceable.
  // Drawn as `points`; the model's pre-validate hook builds the GeoJSON twin.
  created.zone = await DeliveryZone.create({
    name: `E2E Zone ${RUN}`,
    city: "Delhi",
    isActive: true,
    points: [
      { lat: 28.55, lng: 77.15 },
      { lat: 28.55, lng: 77.3 },
      { lat: 28.7, lng: 77.3 },
      { lat: 28.7, lng: 77.15 },
    ],
  });

  return { parcelConfig, cityConfig };
}

/* ------------------------------------------------------------ validation */

async function testValidation(customerToken) {
  section("Booking form validation (server side)");

  const goodLocal = {
    pickupAddress: { fullAddress: "12 Test Street, Connaught Place, Delhi", ...PICKUP },
    dropAddress: { fullAddress: "44 Other Road, Civil Lines, Delhi", ...DROP },
    sender: { name: "Asha Kumari", phone: "9876543210" },
    receiver: { name: "Ravi Sharma", phone: "9876543211" },
    package: { packageType: "document", weightKg: 2, description: "papers" },
    paymentMethod: "COD",
  };

  const cases = [
    ["digits in receiver name are rejected", { ...goodLocal, receiver: { name: "9876543210", phone: "9876543211" } }],
    ["digits in sender name are rejected", { ...goodLocal, sender: { name: "12345", phone: "9876543210" } }],
    ["letters in receiver phone are rejected", { ...goodLocal, receiver: { name: "Ravi", phone: "abcdefghij" } }],
    ["a short phone is rejected", { ...goodLocal, receiver: { name: "Ravi", phone: "12345" } }],
    ["a landline-style number is rejected", { ...goodLocal, receiver: { name: "Ravi", phone: "1234567890" } }],
    ["a one-character address is rejected", { ...goodLocal, pickupAddress: { fullAddress: "x", ...PICKUP } }],
    ["an out-of-range weight is rejected", { ...goodLocal, package: { packageType: "document", weightKg: 500 } }],
    ["a zero weight is rejected", { ...goodLocal, package: { packageType: "document", weightKg: 0 } }],
    ["an unknown payment method is rejected", { ...goodLocal, paymentMethod: "CASHAPP" }],
    ["a missing receiver is rejected", { ...goodLocal, receiver: undefined }],
  ];

  for (const [label, body] of cases) {
    const res = await api("POST", "/city-parcel/create", { token: customerToken, body });
    checkTrue(`local: ${label}`, res.status === 400, `got ${res.status} ${res.body?.message || ""}`);
  }

  // --- outstation, which had no field validation at all until now
  const goodOutstation = {
    pickupAddress: {
      name: "Asha Kumari",
      phone: "9876543210",
      fullAddress: "12 Test Street, Connaught Place, Delhi",
      pincode: "110001",
      ...PICKUP,
    },
    dropAddress: { name: "Hub", phone: "9000000001", fullAddress: "Test Hub Road, Delhi", ...DROP },
    packageDetails: { packageType: "document", weight: 1, description: "papers" },
    paymentMethod: "COD",
    courierCompanyId: String(created.courier._id),
    destinationCity: "Mumbai",
    pickupWindow: "today",
    deliverySpeed: "normal",
  };

  const outCases = [
    ["digits in the sender name are rejected", { pickupAddress: { ...goodOutstation.pickupAddress, name: "9876543210" } }],
    ["letters in the sender phone are rejected", { pickupAddress: { ...goodOutstation.pickupAddress, phone: "abcdefghij" } }],
    ["a missing map pin is rejected", { pickupAddress: { ...goodOutstation.pickupAddress, lat: undefined, lng: undefined } }],
    ["a bad pincode is rejected", { pickupAddress: { ...goodOutstation.pickupAddress, pincode: "12" } }],
    ["an unknown payment method is rejected", { paymentMethod: "CASHAPP" }],
    ["an over-limit weight is rejected", { packageDetails: { packageType: "document", weight: 99 } }],
  ];

  for (const [label, patch] of outCases) {
    const res = await api("POST", "/parcel/create", {
      token: customerToken,
      body: { ...goodOutstation, ...patch },
    });
    checkTrue(`outstation: ${label}`, res.status === 400, `got ${res.status} ${res.body?.message || ""}`);
  }

  return { goodLocal, goodOutstation };
}

/* --------------------------------------------------------------- bookings */

/** Razorpay is often unconfigured outside production; that is not a defect. */
const GATEWAY_DOWN = (res) =>
  res.status === 503 || /authentication failed|could not start payment/i.test(res.body?.message || "");

async function bookLocal({ customerToken, paymentMethod, base }) {
  const body = { ...base, paymentMethod, receiver: { ...base.receiver } };
  const res = await api("POST", "/city-parcel/create", { token: customerToken, body });
  if (res.status !== 201) {
    if (GATEWAY_DOWN(res)) return { gatewayDown: true, message: res.body?.message };
    throw new Error(`local ${paymentMethod} booking failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.result;
}

async function bookOutstation({ customerToken, paymentMethod, base }) {
  const res = await api("POST", "/parcel/create", {
    token: customerToken,
    body: { ...base, paymentMethod },
  });
  if (res.status !== 201) {
    if (GATEWAY_DOWN(res)) return { gatewayDown: true, message: res.body?.message };
    throw new Error(`outstation ${paymentMethod} booking failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.result;
}

/* ==========================================================================
   Online payment
   ==========================================================================
   Razorpay's checkout hands the client back a receipt signed with the key
   secret, and the server re-computes that signature before it marks anything
   paid. Signing one here with the same secret is what the real gateway does
   on a successful payment, so the whole verify path is exercised — including
   the mismatch and replay guards — without a browser.
   ========================================================================== */

const signReceipt = (orderId, paymentId) =>
  crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

async function testOnlinePayment({ label, customerToken, order, parcelId, verify, reload }) {
  section(`${label} · paying online`);

  if (!order?.orderId) {
    console.log(`  ${c.dim("no gateway order to pay — skipped")}`);
    return null;
  }

  // The gateway is charged in paise; a rupee/paise mix-up here would take
  // 100× or 1/100th of the fare and nobody would notice until settlement.
  const booked = await reload(parcelId);
  check("the gateway is asked for the fare, in paise", order.amount, Math.round(booked.fare * 100));
  check("in the right currency", order.currency || "INR", "INR");

  const paymentId = `pay_e2e${Date.now().toString().slice(-10)}`;

  // A forged receipt must not pay for anything.
  const forged = await verify({
    parcelId,
    razorpay_order_id: order.orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: "not-a-real-signature",
  });
  checkTrue("a forged signature is rejected", forged.status >= 400, `got ${forged.status}`);
  const stillUnpaid = await reload(parcelId);
  check("and the booking stays unpaid", stillUnpaid.paymentStatus, "PENDING");

  // The real thing.
  const good = await verify({
    parcelId,
    razorpay_order_id: order.orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signReceipt(order.orderId, paymentId),
  });
  check("a valid signature is accepted", good.status, 200);

  const paid = await reload(parcelId);
  check("the booking is marked paid", paid.paymentStatus, "PAID");
  check("the payment id is recorded", paid.razorpayPaymentId, paymentId);
  checkTrue(
    "an online booking never asks the rider for cash",
    Number(paid.codSettlement?.collectAmount ?? paid.codCollection?.amount ?? 0) === 0,
  );
  checkTrue(
    "and carries no COD state",
    ["NOT_APPLICABLE", undefined].includes(
      paid.codSettlement?.status ?? paid.codCollection?.status,
    ),
  );

  // Replaying the same receipt must not double-charge or restart the search.
  const replay = await verify({
    parcelId,
    razorpay_order_id: order.orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signReceipt(order.orderId, paymentId),
  });
  check("replaying the receipt is a no-op", replay.status, 200);

  return paid;
}

/* ------------------------------------------------------------------- main */

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(c.head(`\nPorter end-to-end · run ${RUN} · ${BASE}`));

  const { parcelConfig, cityConfig } = await setup();
  const customerToken = sign(created.customer._id, "customer");
  const riderToken = sign(created.rider._id, "delivery");

  const { goodLocal, goodOutstation } = await testValidation(customerToken);

  /* ---------------- local COD ---------------- */
  section("Local delivery · COD");
  const localCodRes = await bookLocal({ customerToken, paymentMethod: "COD", base: goodLocal });
  const localCod = await CityParcel.findById(localCodRes.parcel._id).lean();

  const expectedCityFare = (() => {
    const distance = localCod.distanceKm;
    const sub =
      cityConfig.baseFare +
      distance * cityConfig.perKmCharge +
      2 * cityConfig.weightCharge +
      cityConfig.platformCharge;
    return money(Math.max(sub, cityConfig.minFare));
  })();
  const expectedCityEarning = money(
    localCod.fareBreakdown.baseFare * (cityConfig.riderBaseFareSharePercent / 100) +
      localCod.fareBreakdown.distanceFare * (cityConfig.riderDistanceFareSharePercent / 100),
  );

  console.log(`  ${c.dim(`distance ${localCod.distanceKm} km · fare ₹${localCod.fare}`)}`);
  check("customer fare matches the rate card", localCod.fare, expectedCityFare);
  check(
    "fare equals the sum of its breakdown",
    localCod.fare,
    money(
      localCod.fareBreakdown.baseFare +
        localCod.fareBreakdown.distanceFare +
        localCod.fareBreakdown.weightFare +
        localCod.fareBreakdown.platformCharge +
        localCod.fareBreakdown.expressCharge,
    ),
  );
  check("COD asks for the full fare", localCod.codCollection.amount, localCod.fare);
  check("COD starts pending collection", localCod.codCollection.status, "COLLECT_PENDING");
  check("COD is unpaid at booking", localCod.paymentStatus, "PENDING");
  // riderEarning is written when the job is delivered, not at booking, so the
  // quote endpoint is what the customer and rider are shown up front.
  const quoted = await api("POST", "/city-parcel/calculate-fare", {
    token: customerToken,
    body: {
      pickupAddress: goodLocal.pickupAddress,
      dropAddress: goodLocal.dropAddress,
      package: goodLocal.package,
    },
  });
  check("quoted fare matches the booked fare", quoted.result?.fare, localCod.fare);
  // The rider's cut is deliberately not in a customer-facing quote; it is
  // asserted below, where the rider is actually credited.
  checkTrue(
    "the customer quote does not leak the rider's cut",
    quoted.result?.riderEarning === undefined,
  );
  checkTrue("platform margin is positive", localCod.fare - expectedCityEarning > 0);
  check("nothing is credited to the rider at booking time", localCod.riderEarning, 0);

  // What the customer typed must reach the people doing the work.
  check("sender name is stored", localCod.sender?.name, goodLocal.sender.name);
  check("sender phone is stored", localCod.sender?.phone, goodLocal.sender.phone);
  check("receiver name is stored", localCod.receiver?.name, goodLocal.receiver.name);
  check("package weight is stored", localCod.package?.weightKg, 2);
  check("package description is stored", localCod.package?.description, "papers");
  check("pickup note is stored", localCod.pickupAddress?.addressNote ?? "", "");

  /* ---------------- local online ---------------- */
  section("Local delivery · online (UPI)");
  const localUpiRes = await bookLocal({ customerToken, paymentMethod: "UPI", base: goodLocal });
  let localUpi = null;

  if (localUpiRes.gatewayDown) {
    console.log(`  ${c.dim(`gateway unavailable here (${localUpiRes.message}) — checking it failed cleanly`)}`);
    // A booking that could not reach the gateway must not be left sitting in
    // REQUESTED, where a rider could be dispatched against unpaid money.
    const stranded = await CityParcel.findOne({
      customerId: created.customer._id,
      paymentMethod: "UPI",
      status: { $nin: ["CANCELLED"] },
    }).lean();
    checkTrue("no unpaid online booking is left live", !stranded, stranded ? String(stranded._id) : "");
  } else {
    localUpi = await CityParcel.findById(localUpiRes.parcel._id).lean();
    check("same rate card, same fare", localUpi.fare, localCod.fare);
    check("online leaves no cash with the rider", localUpi.codCollection.amount, 0);
    check("online COD state is not applicable", localUpi.codCollection.status, "NOT_APPLICABLE");
    checkTrue("online booking waits for the gateway", localUpiRes.requiresPayment === true);
    checkTrue("a Razorpay order was created", Boolean(localUpi.razorpayOrderId));

    localUpi = await testOnlinePayment({
      label: "Local delivery",
      customerToken,
      order: localUpiRes.razorpay,
      parcelId: localUpi._id,
      verify: ({ parcelId, ...receipt }) =>
        api("POST", `/city-parcel/${parcelId}/verify-payment`, {
          token: customerToken,
          body: receipt,
        }),
      reload: (id) => CityParcel.findById(id).lean(),
    });
  }

  /* ---------------- outstation COD ---------------- */
  section("Outstation parcel · COD");
  const outCodRes = await bookOutstation({ customerToken, paymentMethod: "COD", base: goodOutstation });
  const outCod = await Parcel.findById(outCodRes.parcel._id).lean();

  const expectedParcelFare = money(
    outCod.distance * parcelConfig.perKmCharge + 1 * parcelConfig.weightCharge + 60,
  );
  const expectedParcelEarning = money(
    outCod.fareBreakdown.distanceFare * (parcelConfig.riderDistanceFareSharePercent / 100),
  );

  console.log(`  ${c.dim(`distance ${outCod.distance} km · fare ₹${outCod.fare}`)}`);
  check("customer fare matches the rate card", outCod.fare, expectedParcelFare);
  check("no base fare is charged", outCod.fareBreakdown.baseFare, 0);
  check("courier platform fee is passed through", outCod.fareBreakdown.platformCharge, 60);
  check("COD asks for the full fare", outCod.codSettlement.collectAmount, outCod.fare);
  check("COD starts pending collection", outCod.codSettlement.status, "COLLECT_PENDING");
  check("it routes to the warehouse, not a seller", outCod.parcelType, "outstation");
  checkTrue("a warehouse was assigned", Boolean(outCod.warehouseId));
  check("no seller is involved", outCod.sellerId, null);

  check("sender name reaches the parcel", outCod.pickupAddress?.name, goodOutstation.pickupAddress.name);
  check("sender phone reaches the parcel", outCod.pickupAddress?.phone, goodOutstation.pickupAddress.phone);
  check("package type is stored", outCod.packageDetails?.packageType, "document");
  check("courier company is stored", outCod.courierCompany, created.courier.name);
  check("destination city is stored", outCod.destinationCity, "Mumbai");

  /* ---------------- outstation online ---------------- */
  section("Outstation parcel · online (UPI)");
  const outUpiRes = await bookOutstation({ customerToken, paymentMethod: "UPI", base: goodOutstation });
  let outUpi = null;

  if (outUpiRes.gatewayDown) {
    console.log(`  ${c.dim(`gateway unavailable here (${outUpiRes.message}) — checking it failed cleanly`)}`);
    const stranded = await Parcel.findOne({
      customerId: created.customer._id,
      paymentMethod: "UPI",
    }).lean();
    checkTrue("no unpaid online parcel is left behind", !stranded, stranded ? String(stranded._id) : "");
  } else {
    outUpi = await Parcel.findById(outUpiRes.parcel._id).lean();
    check("same rate card, same fare", outUpi.fare, outCod.fare);
    check("online leaves no cash with the rider", outUpi.codSettlement.collectAmount, 0);
    check("online COD state is not applicable", outUpi.codSettlement.status, "NOT_APPLICABLE");
    checkTrue("online booking waits for the gateway", outUpiRes.requiresPayment === true);
    checkTrue("a Razorpay order was created", Boolean(outUpi.razorpayOrderId));

    outUpi = await testOnlinePayment({
      label: "Outstation parcel",
      customerToken,
      order: outUpiRes.razorpay,
      parcelId: outUpi._id,
      verify: ({ parcelId, ...receipt }) =>
        api("POST", "/parcel/verify-payment", {
          token: customerToken,
          body: { parcelId: String(parcelId), ...receipt },
        }),
      reload: (id) => Parcel.findById(id).lean(),
    });
  }

  /* ---------------- the customer's own history ---------------- */
  section("Customer history and detail");

  const outHistory = await api("GET", "/parcel/history", { token: customerToken });
  check("outstation history responds", outHistory.status, 200);
  const outRows = outHistory.body?.results || outHistory.body?.result || [];
  checkTrue("it is a list", Array.isArray(outRows), typeof outRows);
  checkTrue(
    "the outstation COD booking appears in it",
    outRows.some((r) => String(r._id) === String(outCod._id)),
  );
  if (outUpi) {
    checkTrue(
      "so does the online one",
      outRows.some((r) => String(r._id) === String(outUpi._id)),
    );
  }
  checkTrue(
    "each row carries what the history card renders",
    outRows.every((r) => r.status && r.pickupAddress && r.createdAt),
  );

  const cityHistory = await api("GET", "/city-parcel/history", { token: customerToken });
  check("local history responds", cityHistory.status, 200);
  checkTrue(
    "the local COD booking appears in it",
    (cityHistory.result?.parcels || []).some((r) => String(r._id) === String(localCod._id)),
  );

  // Opening a waybill from history — the detail page reads this endpoint.
  const detail = await api("GET", `/parcel/track/${outCod._id}`, { token: customerToken });
  check("the owner can open their waybill", detail.status, 200);
  check("it carries the fare breakdown the detail page shows", typeof detail.result?.fareBreakdown, "object");
  checkTrue("and the pickup code, for the owner", Boolean(detail.result?.otp));

  // Someone else's waybill must not be readable by id.
  const outsider = await Customer.create({
    name: `E2E Outsider ${RUN}`,
    phone: `7${RUN.slice(-9).padStart(9, "1")}`,
    isActive: true,
  });
  created.outsider = outsider;
  const stolen = await api("GET", `/parcel/track/${outCod._id}`, {
    token: sign(outsider._id, "customer"),
  });
  check("a stranger cannot read it by id", stolen.status, 404);

  /* ---------------- what the rider is offered ---------------- */
  section("What the rider is shown");
  const assigned = await api("GET", "/city-parcel/rider/assigned", { token: riderToken });
  checkTrue("the rider feed responds", assigned.status === 200, `got ${assigned.status}`);

  /* ---------------- cash, deposit and withdrawal ---------------- */
  /* ---------------- what the rider is actually credited ---------------- */
  section("Rider earning on delivery");

  // Assign and deliver the outstation parcel, then settle it exactly as the
  // workflow does, and check the ledger row that lands.
  await Parcel.findByIdAndUpdate(outCod._id, {
    $set: { deliveryPartnerId: created.rider._id, status: "DELIVERED" },
  });
  const deliveredParcel = await Parcel.findById(outCod._id).lean();
  const expectedCredit = computeRiderParcelEarnings(deliveredParcel, {
    riderBaseFareSharePercent: parcelConfig.riderBaseFareSharePercent,
    riderDistanceFareSharePercent: parcelConfig.riderDistanceFareSharePercent,
    riderSharePercent: parcelConfig.riderSharePercent,
  });
  await applyParcelDeliveredRiderEarning(deliveredParcel);

  const earningRow = await Transaction.findOne({
    reference: `PCL-ERN-${String(outCod._id)}`,
  }).lean();
  checkTrue("an earning row is written on delivery", Boolean(earningRow));
  check("the rider is credited the configured share", earningRow?.amount, expectedCredit);
  check("it is credited as settled", earningRow?.status, "Settled");
  check("it is stamped as porter work", earningRow?.meta?.kind, "parcel");
  check(
    "the platform keeps the rest",
    money(deliveredParcel.fare - (earningRow?.amount || 0)),
    money(deliveredParcel.fare - expectedParcelEarning),
  );

  // --- and the same for a local delivery
  await CityParcel.findByIdAndUpdate(localCod._id, {
    $set: { deliveryPartnerId: created.rider._id, status: "DELIVERED" },
  });
  const deliveredCity = await CityParcel.findById(localCod._id).lean();
  await creditDeliveryEarning(deliveredCity);

  const cityEarningRow = await Transaction.findOne({
    reference: `CTY-ERN-${String(localCod._id)}`,
  }).lean();
  checkTrue("a local delivery is credited too", Boolean(cityEarningRow));
  check("at the configured base + distance share", cityEarningRow?.amount, expectedCityEarning);
  check("stamped as local porter work", cityEarningRow?.meta?.kind, "city_parcel");
  check(
    "the platform keeps the rest of the local fare",
    money(deliveredCity.fare - (cityEarningRow?.amount || 0)),
    money(deliveredCity.fare - expectedCityEarning),
  );

  // Settling twice must not pay twice — the reference is deterministic.
  await applyParcelDeliveredRiderEarning(deliveredParcel);
  const earningRows = await Transaction.countDocuments({
    reference: `PCL-ERN-${String(outCod._id)}`,
  });
  check("re-settling the same parcel does not pay twice", earningRows, 1);

  section("Rider cash, deposit and withdrawal");

  // Put both COD jobs in the state a real pickup leaves them in.
  await CityParcel.findByIdAndUpdate(localCod._id, {
    $set: {
      deliveryPartnerId: created.rider._id,
      "codCollection.status": "RIDER_HOLDING",
      "codCollection.collectedAt": new Date(),
    },
  });
  await Parcel.findByIdAndUpdate(outCod._id, {
    $set: {
      deliveryPartnerId: created.rider._id,
      "codSettlement.status": "RIDER_HOLDING",
      "codSettlement.riderCollectedAt": new Date(),
    },
  });

  const summary = await api("GET", "/delivery/cash/summary", { token: riderToken });
  const expectedHeld = money(localCod.fare + outCod.fare);
  check("cash summary responds", summary.status, 200);
  check("held cash is both COD fares", summary.result?.depositableAmount, expectedHeld);
  check("both jobs are listed", summary.result?.items?.length, 2);
  const onlineIds = [localUpi?._id, outUpi?._id].filter(Boolean).map(String);
  checkTrue(
    "the online bookings are not counted as cash",
    !(summary.result?.items || []).some((i) => onlineIds.includes(i.refId)),
  );

  const deposit = await api("POST", "/delivery/cash/deposit", {
    token: riderToken,
    body: { method: "UPI", reference: `E2E-${RUN}`, note: "e2e run" },
  });
  check("deposit is accepted", deposit.status, 201);
  check("deposit amount is the held cash, not client-supplied", deposit.result?.amount, expectedHeld);
  check("deposit starts pending review", deposit.result?.status, "PENDING");

  const afterDeposit = await api("GET", "/delivery/cash/summary", { token: riderToken });
  check("deposited jobs leave the depositable pool", afterDeposit.result?.depositableAmount, 0);
  check("and move to awaiting review", afterDeposit.result?.awaitingReviewAmount, expectedHeld);

  // A second request must not be able to claim the same jobs again.
  const doubleDeposit = await api("POST", "/delivery/cash/deposit", {
    token: riderToken,
    body: { method: "UPI", reference: "again" },
  });
  checkTrue("the same cash cannot be deposited twice", doubleDeposit.status === 400, `got ${doubleDeposit.status}`);

  if (created.admin) {
    const adminToken = sign(created.admin._id, "admin");
    const review = await api("PATCH", `/porter/admin/cash-deposits/${deposit.result._id}/review`, {
      token: adminToken,
      body: { approve: true, adminNote: "e2e verified" },
    });
    check("admin approval succeeds", review.status, 200);

    const clearedCity = await CityParcel.findById(localCod._id).lean();
    const clearedParcel = await Parcel.findById(outCod._id).lean();
    check("local COD is remitted on approval", clearedCity.codCollection.status, "REMITTED_TO_ADMIN");
    check("local COD is marked paid", clearedCity.paymentStatus, "PAID");
    check("outstation COD is remitted on approval", clearedParcel.codSettlement.status, "REMITTED_TO_ADMIN");
    check("outstation COD is marked paid", clearedParcel.paymentStatus, "PAID");

    const holdings = await api("GET", "/porter/admin/cash-holdings", { token: adminToken });
    checkTrue(
      "the rider no longer shows as holding cash",
      !(holdings.result?.items || []).some((r) => r.riderId === String(created.rider._id)),
    );
  } else {
    console.log(`  ${c.dim("no admin account found — approval leg skipped")}`);
  }

  // --- withdrawal, against real earnings
  await Transaction.create({
    user: created.rider._id,
    userModel: "Delivery",
    type: "Delivery Earning",
    amount: 500,
    status: "Settled",
    reference: `E2E-ERN-${RUN}`,
    meta: { kind: "city_parcel" },
  });

  const tooSmall = await api("POST", "/delivery/request-withdrawal", {
    token: riderToken,
    body: { amount: 50 },
  });
  checkTrue("a withdrawal under the minimum is refused", tooSmall.status === 400, `got ${tooSmall.status}`);

  const tooBig = await api("POST", "/delivery/request-withdrawal", {
    token: riderToken,
    body: { amount: 5000 },
  });
  checkTrue("a withdrawal over the balance is refused", tooBig.status === 400, `got ${tooBig.status}`);

  const withdrawal = await api("POST", "/delivery/request-withdrawal", {
    token: riderToken,
    body: { amount: 300 },
  });
  check("a valid withdrawal is accepted", withdrawal.status, 201);
  check("it is recorded as a debit", withdrawal.result?.amount, -300);
  check("payout destination travels with it", withdrawal.result?.meta?.payout?.accountNumber, "123456789012");

  const second = await api("POST", "/delivery/request-withdrawal", {
    token: riderToken,
    body: { amount: 100 },
  });
  checkTrue("only one withdrawal may be open at a time", second.status === 409, `got ${second.status}`);

  /* ---------------- report ---------------- */
  section("Result");
  console.log(`  ${c.ok(`${passed} passed`)}${failures.length ? `, ${c.bad(`${failures.length} failed`)}` : ""}`);
  if (failures.length) {
    failures.forEach((f) => console.log(`    ${c.bad("·")} ${f}`));
  }

  return failures.length === 0;
}

async function cleanup() {
  if (KEEP) {
    console.log(`\n${c.dim(`--keep set: leaving run ${RUN} in the database`)}`);
    return;
  }
  section("Cleaning up");
  const riderId = created.rider?._id;
  const customerId = created.customer?._id;

  await Promise.all([
    customerId ? CityParcel.deleteMany({ customerId }) : null,
    customerId ? Parcel.deleteMany({ customerId }) : null,
    riderId ? CashDeposit.deleteMany({ riderId }) : null,
    riderId ? Transaction.deleteMany({ user: riderId }) : null,
    riderId ? Delivery.deleteOne({ _id: riderId }) : null,
    customerId ? Customer.deleteOne({ _id: customerId }) : null,
    created.outsider ? Customer.deleteOne({ _id: created.outsider._id }) : null,
    created.courier ? CourierCompany.deleteOne({ _id: created.courier._id }) : null,
    created.warehouse ? Warehouse.deleteOne({ _id: created.warehouse._id }) : null,
    created.zone ? DeliveryZone.deleteOne({ _id: created.zone._id }) : null,
    CityParcelOtp.deleteMany({}).catch(() => {}),
  ]);
  console.log(`  ${c.dim("test customer, rider, bookings, deposits and ledger rows removed")}`);
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
