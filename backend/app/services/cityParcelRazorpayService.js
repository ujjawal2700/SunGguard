import crypto from "crypto";
import Razorpay from "razorpay";

/**
 * Razorpay for the City Parcel module.
 *
 * Mirrors services/parcelRazorpayService.js rather than importing it: the
 * receipt prefix, the notes, and the amount source all differ, and the two
 * modules should not be able to break each other's payments.
 */

function requireRazorpayConfig() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) {
    const err = new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
    err.statusCode = 503;
    err.code = "RAZORPAY_NOT_CONFIGURED";
    throw err;
  }
  return { keyId, keySecret };
}

export function isRazorpayConfigured() {
  return Boolean(
    String(process.env.RAZORPAY_KEY_ID || "").trim() &&
      String(process.env.RAZORPAY_KEY_SECRET || "").trim(),
  );
}

/** Rupees to paise. Razorpay bills in the smallest unit. */
export function fareToPaise(fare) {
  const rupees = Number(fare);
  if (!Number.isFinite(rupees) || rupees <= 0) {
    const err = new Error("Invalid fare for payment");
    err.statusCode = 400;
    throw err;
  }
  return Math.round(rupees * 100);
}

function formatRazorpayError(err) {
  const description =
    err?.error?.description ||
    err?.error?.reason ||
    err?.description ||
    err?.message ||
    "Could not start the payment";
  const status =
    Number(err?.statusCode || err?.status || err?.error?.http_status_code) || 500;
  const out = new Error(description);
  out.statusCode = status >= 400 && status < 600 ? status : 500;
  return out;
}

/**
 * Open an order with the gateway.
 *
 * The amount comes from the parcel document, never from the client — a fare
 * posted by the browser is a fare the customer can choose.
 */
export async function createCityParcelOrder(parcel) {
  const { keyId, keySecret } = requireRazorpayConfig();
  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const amount = fareToPaise(parcel.fare);

  // Razorpay caps receipts at 40 characters and wants them unique per attempt.
  const receipt = `cty_${String(parcel._id).slice(-10)}_${Date.now().toString(36)}`.slice(0, 40);

  try {
    const order = await client.orders.create({
      amount,
      currency: "INR",
      receipt,
      notes: {
        cityParcelId: String(parcel._id),
        referenceId: parcel.referenceId,
        customerId: String(parcel.customerId),
        purpose: "city_parcel_delivery",
      },
    });

    return {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    };
  } catch (err) {
    throw formatRazorpayError(err);
  }
}

/**
 * Prove the gateway really took the money.
 *
 * The signature is an HMAC of "<order_id>|<payment_id>" keyed with the
 * account secret, so only Razorpay can produce it. Without this check any
 * caller could POST a made-up payment id and get a free delivery.
 *
 * Compared in constant time so a wrong signature cannot be discovered by
 * timing how long the rejection takes.
 */
export function verifyCityParcelSignature({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  const { keySecret } = requireRazorpayConfig();

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    const err = new Error("Payment details are incomplete");
    err.statusCode = 400;
    err.code = "PAYMENT_DETAILS_MISSING";
    throw err;
  }

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(razorpaySignature), "utf8");

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const err = new Error("This payment could not be verified");
    err.statusCode = 400;
    err.code = "INVALID_SIGNATURE";
    throw err;
  }

  return true;
}
