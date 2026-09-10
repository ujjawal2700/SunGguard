import { openParcelRazorpayCheckout } from "./parcelRazorpay";

/**
 * Launch Razorpay checkout for a shop order.
 *
 * Replaces the old redirect-to-gateway flow. A redirect took the customer off
 * the site and relied on them coming back for the order to be confirmed — if
 * they closed the tab after paying, the order sat unpaid. Checkout opens over
 * our own page instead, and the receipt it returns is verified server-side,
 * with the gateway's webhook confirming the same payment independently.
 *
 * Resolves with the gateway's signed receipt. Nothing here decides whether a
 * payment succeeded; only the server does.
 */
export async function openOrderCheckout({
  checkout,
  order,
  customer = {},
  appName = "Order",
}) {
  if (!checkout?.orderId || !checkout?.keyId) {
    throw new Error("Payment could not be started");
  }

  const receipt = await openParcelRazorpayCheckout({
    keyId: checkout.keyId,
    orderId: checkout.orderId,
    amount: checkout.amount,
    currency: checkout.currency || "INR",
    name: appName,
    description: order?.orderId ? `Order ${order.orderId}` : "Order payment",
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

export default openOrderCheckout;
