/**
 * The one Razorpay checkout launcher.
 *
 * Previously this lived in `modules/customer/utils/parcelRazorpay.js`, with
 * the city-parcel and order helpers delegating to it. That worked while only
 * the customer app took payments — but the rider app now does too (cash
 * deposits), and reaching across into another feature module for it would
 * make the customer module a dependency of the rider module for no reason.
 *
 * Everything payment-shaped in the product goes through here: load the
 * script once, open the sheet, resolve with the signed receipt. Nothing in
 * this file decides whether a payment succeeded — only the server does, by
 * verifying the receipt and reading the status back from the gateway.
 */

/**
 * Loads Razorpay's checkout script, once per page.
 *
 * The `data-razorpay` marker matters: two components mounting at the same
 * time would otherwise each append a script tag, and the second load can
 * clobber the first's handlers mid-checkout. A second caller finding the tag
 * already present waits on it instead.
 */
export function loadRazorpayScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window unavailable"));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-razorpay="checkout"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Razorpay));
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Razorpay")),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpay = "checkout";
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });
}

/**
 * Open the checkout sheet and resolve with the gateway's signed receipt.
 *
 * Rejects on dismissal as well as on failure, and the two are deliberately
 * different messages: a customer who changed their mind has not had a payment
 * fail, and telling them so sends them to support for no reason.
 */
export async function openRazorpayCheckout({
  keyId,
  orderId,
  amount,
  currency = "INR",
  // Callers pass the configured app name explicitly; this fallback only
  // covers one that forgets to, so it deliberately names no brand.
  name = "Payment",
  description = "Payment",
  prefill = {},
  themeColor = "#0f766e",
}) {
  if (!keyId || !orderId) {
    throw new Error("Payment could not be started");
  }

  const Razorpay = await loadRazorpayScript();

  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: keyId,
      amount,
      currency,
      name,
      description,
      order_id: orderId,
      prefill: {
        name: prefill.name || "",
        email: prefill.email || "",
        contact: prefill.contact || "",
      },
      theme: { color: themeColor },
      handler: (response) => {
        resolve({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => {
          const error = new Error("Payment cancelled");
          error.code = "CHECKOUT_DISMISSED";
          reject(error);
        },
      },
    });

    rzp.on("payment.failed", (response) => {
      const error = new Error(
        response?.error?.description || response?.error?.reason || "Payment failed",
      );
      error.code = "PAYMENT_FAILED";
      reject(error);
    });

    rzp.open();
  });
}

export default openRazorpayCheckout;
