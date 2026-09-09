function loadRazorpayScript() {
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
 * Open Razorpay checkout for a parcel UPI payment.
 * Resolves with { razorpay_order_id, razorpay_payment_id, razorpay_signature }.
 */
export async function openParcelRazorpayCheckout({
  keyId,
  orderId,
  amount,
  currency = "INR",
  // Callers pass the configured app name explicitly; this only covers a
  // caller that forgets to, so it deliberately names no brand.
  name = "Parcel Delivery",
  description = "Parcel delivery payment",
  prefill = {},
}) {
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
      theme: { color: "#0f766e" },
      handler: (response) => {
        resolve({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => {
          reject(new Error("Payment cancelled"));
        },
      },
    });

    rzp.on("payment.failed", (response) => {
      const msg =
        response?.error?.description ||
        response?.error?.reason ||
        "Payment failed";
      reject(new Error(msg));
    });

    rzp.open();
  });
}
