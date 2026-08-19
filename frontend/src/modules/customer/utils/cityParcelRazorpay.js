import { openParcelRazorpayCheckout } from "./parcelRazorpay";

/**
 * Launch Razorpay checkout for a city delivery.
 *
 * Thin wrapper over the existing checkout helper — the script loading and
 * promise handling are identical, only the labelling differs. Resolves with
 * the gateway's signed receipt, which the server then verifies. Nothing here
 * decides whether a payment succeeded.
 */
export async function openCityParcelCheckout({ razorpay, parcel, customer = {} }) {
  if (!razorpay?.orderId || !razorpay?.keyId) {
    throw new Error("Payment could not be started");
  }

  const receipt = await openParcelRazorpayCheckout({
    keyId: razorpay.keyId,
    orderId: razorpay.orderId,
    amount: razorpay.amount,
    currency: razorpay.currency || "INR",
    name: "SunGguard",
    description: `City delivery ${parcel?.referenceId || ""}`.trim(),
    prefill: {
      name: customer.name || "",
      contact: String(customer.phone || "").replace(/\s/g, ""),
      email: customer.email || "",
    },
  });

  return {
    razorpay_order_id: receipt.razorpay_order_id,
    razorpay_payment_id: receipt.razorpay_payment_id,
    razorpay_signature: receipt.razorpay_signature,
  };
}

export default openCityParcelCheckout;
