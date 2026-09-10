import CityParcelOtp from "../models/cityParcelOtp.js";
import CityParcelConfig from "../models/cityParcelConfig.js";
import Delivery from "../models/delivery.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { useRealSMS, MOCK_OTP } from "../utils/otp.js";
import { sendSmsIndiaHubOtp } from "./smsIndiaHubService.js";
import { CITY_PARCEL_OTP_TYPE } from "../constants/cityParcelWorkflow.js";
import logger from "./logger.js";

/**
 * Verification for the City Parcel module.
 *
 * Two independent facts have to be true before a parcel is marked delivered:
 *
 *   WHO    the person at the door is the receiver the customer named. Proven
 *          by an OTP sent to their phone, plus the rider confirming the name
 *          and reading back the last four digits of the number.
 *
 *   WHERE  the rider is actually at the drop address. Proven by comparing
 *          their GPS to point B.
 *
 * Neither substitutes for the other. An OTP alone proves only that somebody
 * read a number down a phone line — a rider can call the receiver from three
 * streets away, collect the code, and close the job with the parcel still in
 * their bag. That is the exact hole the proximity gate closes.
 */

function fourDigit() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Mirrors `utils/otp.js`: when USE_REAL_SMS is off, every code is the fixed
 * mock value (1234) and nothing is sent. That is how this deployment runs
 * before launch, and it must behave identically here or testing the flow
 * would need a live SMS account.
 */
function newCode() {
  return useRealSMS() ? fourDigit() : MOCK_OTP;
}

async function deliverCode({ phone, code, type, referenceId }) {
  if (!useRealSMS()) {
    logger.info("City parcel OTP (mock mode, not sent)", {
      type,
      referenceId,
      phone,
    });
    return { sent: false, mocked: true };
  }

  const message =
    type === CITY_PARCEL_OTP_TYPE.DELIVERY
      ? `${code} is your code to receive parcel ${referenceId}. Share it only with the delivery partner at your door.`
      : `${code} is your code for parcel ${referenceId}.`;

  try {
    await sendSmsIndiaHubOtp({ phone, otp: code, message });
    return { sent: true, mocked: false };
  } catch (err) {
    // A failed SMS must not fail the whole request: the rider can resend,
    // and for a delivery code the receiver may still be reachable by phone.
    logger.error("City parcel OTP SMS failed", {
      type,
      referenceId,
      error: err?.message,
    });
    return { sent: false, mocked: false, error: err?.message };
  }
}

/**
 * Issue a fresh code, retiring any live one of the same type.
 *
 * A retry after a failed attempt gets a NEW code rather than reusing the
 * dead one — otherwise a code read out at a wrong address stays valid at the
 * right one.
 */
export async function issueOtp({
  cityParcelId,
  type,
  phone,
  referenceId = "",
  attemptNo = 1,
  ttlMs = null,
}) {
  const config = await CityParcelConfig.getConfig();
  const code = newCode();
  const lifetime =
    ttlMs || parseInt(process.env.CITY_PARCEL_OTP_TTL_MS || "3600000", 10);

  // Retire live codes of this type before minting a new one.
  await CityParcelOtp.updateMany(
    { cityParcelId, type, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  const record = await CityParcelOtp.create({
    cityParcelId,
    type,
    codeHash: CityParcelOtp.hashCode(code),
    expiresAt: new Date(Date.now() + lifetime),
    maxAttempts: 5,
    maxResends: 3,
    lastSentAt: new Date(),
    sentToPhone: String(phone || ""),
    attemptNo,
  });

  const delivery = await deliverCode({ phone, code, type, referenceId });

  return {
    otpId: String(record._id),
    expiresAt: record.expiresAt,
    ...delivery,
    // Only ever surfaced in mock mode, so the flow is testable pre-launch.
    devCode: useRealSMS() ? undefined : code,
  };
}

/** Resend the live code, within the per-code resend cap. */
export async function resendOtp({ cityParcelId, type, phone, referenceId = "" }) {
  const live = await CityParcelOtp.findOne({
    cityParcelId,
    type,
    consumedAt: null,
  }).sort({ createdAt: -1 });

  if (!live || live.isExpired()) {
    // Nothing usable to resend — mint a fresh one instead of failing.
    return issueOtp({ cityParcelId, type, phone, referenceId });
  }

  if (live.resendCount >= live.maxResends) {
    const err = new Error(
      "That code has been resent too many times. Call the receiver instead.",
    );
    err.statusCode = 429;
    throw err;
  }

  // The stored hash cannot be reversed, so a resend issues a new code. This
  // is a feature: it invalidates anything already read aloud.
  const refreshed = await issueOtp({ cityParcelId, type, phone, referenceId });
  await CityParcelOtp.findByIdAndUpdate(refreshed.otpId, {
    $set: { resendCount: live.resendCount + 1 },
  });

  return { ...refreshed, resendCount: live.resendCount + 1 };
}

/**
 * Check a code. Consumes it on success.
 *
 * Wrong codes burn an attempt. Once the attempts are gone the code is dead
 * and the rider has to fail the attempt properly rather than guessing.
 */
export async function verifyOtp({ cityParcelId, type, code }) {
  const record = await CityParcelOtp.findOne({
    cityParcelId,
    type,
    consumedAt: null,
  }).sort({ createdAt: -1 });

  if (!record) {
    return { ok: false, reason: "NO_CODE", message: "No active code. Send one first." };
  }

  if (record.isExpired()) {
    return {
      ok: false,
      reason: "EXPIRED",
      message: "That code has expired. Send a new one.",
    };
  }

  if (record.attempts >= record.maxAttempts) {
    return {
      ok: false,
      reason: "ATTEMPTS_EXHAUSTED",
      message: "Too many wrong attempts on this code.",
    };
  }

  if (!record.matches(code)) {
    record.attempts += 1;
    await record.save();
    const left = Math.max(0, record.maxAttempts - record.attempts);
    return {
      ok: false,
      reason: "MISMATCH",
      attemptsLeft: left,
      message: left
        ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
        : "That code is not right, and there are no tries left.",
    };
  }

  record.consumedAt = new Date();
  await record.save();
  return { ok: true, verifiedAt: record.consumedAt };
}

/**
 * Is the rider actually at the drop address?
 *
 * Three things can go wrong and they are reported separately, because they
 * need different responses from the rider:
 *
 *   NO_FIX     the app has never had their location
 *   STALE_FIX  the fix is too old to mean anything now
 *   TOO_FAR    they are somewhere else
 *
 * GPS accuracy is subtracted from the measured distance before comparing.
 * A phone reads 5-10 m in the open but 30-60 m in a stairwell, a basement or
 * a gated society — which is precisely where parcels get delivered. Ignoring
 * the reported accuracy punishes riders for their building.
 */
export async function checkDropProximity({
  target,
  riderLocation = null,
  deliveryPartnerId = null,
  config = null,
}) {
  const cfg = config || (await CityParcelConfig.getVerificationSettings());
  const limit = Number(cfg.dropProximityMeters) || 120;
  const maxAgeSeconds = Number(cfg.maxLocationAgeSeconds) || 120;

  let lat = Number(riderLocation?.lat);
  let lng = Number(riderLocation?.lng);
  let accuracyM = Number(riderLocation?.accuracyM);
  let ageSeconds = 0;

  // Fall back to the rider's last stored fix when the client did not send one.
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && deliveryPartnerId) {
    const rider = await Delivery.findById(deliveryPartnerId)
      .select("location lastLocationAt")
      .lean();
    const coords = rider?.location?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      [lng, lat] = coords.map(Number);
      ageSeconds = rider.lastLocationAt
        ? Math.round((Date.now() - new Date(rider.lastLocationAt).getTime()) / 1000)
        : Number.POSITIVE_INFINITY;
    }
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      passed: false,
      reason: "NO_FIX",
      message: "We cannot read your location. Turn GPS on and try again.",
      limit,
    };
  }

  if (ageSeconds > maxAgeSeconds) {
    return {
      passed: false,
      reason: "STALE_FIX",
      message: "Your location is out of date. Refresh it and try again.",
      ageSeconds,
      limit,
    };
  }

  const metres = distanceMeters(
    Number(target.lat),
    Number(target.lng),
    lat,
    lng,
  );

  const accuracy = Number.isFinite(accuracyM) ? Math.max(0, accuracyM) : 0;
  const effective = Math.max(0, metres - accuracy);
  const passed = effective <= limit;

  return {
    passed,
    reason: passed ? "OK" : "TOO_FAR",
    message: passed
      ? "You are at the address"
      : `You look about ${Math.round(metres)} m from the address.`,
    distanceMeters: Math.round(metres),
    effectiveMeters: Math.round(effective),
    gpsAccuracyM: accuracy || null,
    ageSeconds,
    limit,
    lat,
    lng,
  };
}

/**
 * The combined check at point B.
 *
 * Returns a verdict rather than throwing, so the caller can decide what to
 * do with a near-miss. A failed proximity check is NOT automatically fatal:
 * blocking outright strands a real rider at a real door holding a real
 * parcel, which is worse than a reviewable exception. They may complete with
 * a written reason, which flags the delivery for admin review and withholds
 * their payout until it is cleared.
 */
export async function verifyDeliveryHandover({
  parcel,
  otp,
  nameConfirmed,
  phoneLast4,
  riderLocation,
  overrideReason = "",
}) {
  const config = await CityParcelConfig.getVerificationSettings();

  if (!nameConfirmed) {
    return {
      ok: false,
      reason: "NAME_NOT_CONFIRMED",
      message: "Confirm who you are handing this to first.",
    };
  }

  const expectedLast4 = String(parcel.receiver?.phone || "").replace(/\D/g, "").slice(-4);
  if (expectedLast4 && String(phoneLast4) !== expectedLast4) {
    return {
      ok: false,
      reason: "PHONE_MISMATCH",
      message: "Those last four digits do not match the receiver's number.",
    };
  }

  const proximity = await checkDropProximity({
    target: parcel.dropAddress,
    riderLocation,
    deliveryPartnerId: parcel.deliveryPartnerId,
    config,
  });

  if (!proximity.passed) {
    const mayOverride =
      config.allowProximityOverride && String(overrideReason || "").trim().length >= 5;

    if (!mayOverride) {
      return {
        ok: false,
        reason: "PROXIMITY_FAILED",
        proximity,
        canOverride: Boolean(config.allowProximityOverride),
        message: config.allowProximityOverride
          ? `${proximity.message} Move closer, or tell us why you are completing from here.`
          : proximity.message,
      };
    }
  }

  const otpResult = await verifyOtp({
    cityParcelId: parcel._id,
    type: CITY_PARCEL_OTP_TYPE.DELIVERY,
    code: otp,
  });

  if (!otpResult.ok) {
    return { ok: false, reason: otpResult.reason, message: otpResult.message, proximity };
  }

  const overridden = !proximity.passed;

  return {
    ok: true,
    proximity,
    overridden,
    // A rider who completes past the gate does not get paid until a human
    // has looked at why.
    withholdPayout: overridden,
    verifiedAt: otpResult.verifiedAt,
  };
}
