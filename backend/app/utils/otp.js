const MOCK_OTP = "1234";

/**
 * The single switch for the entire OTP system.
 *
 *   unset (or anything but "true")  every OTP is the fixed MOCK_OTP and no SMS
 *                                   is sent. Works with zero configuration, in
 *                                   every environment including production.
 *   USE_REAL_SMS=true               random OTPs delivered over SMS. Requires
 *                                   the SMS_INDIA_HUB_* values to be set.
 *
 * Mock mode is deliberately permitted in production: it is how this deployment
 * runs before launch. Set USE_REAL_SMS=true when you are ready to go live —
 * that one variable switches every auth flow at once.
 */
export const useRealSMS = () =>
  process.env.USE_REAL_SMS === "true" || process.env.USE_REAL_SMS === "1";

const OTP_LENGTH = Math.max(4, parseInt(process.env.OTP_LENGTH || "4", 10));

function randomOtp(length) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

export const generateOTP = () => (useRealSMS() ? randomOtp(OTP_LENGTH) : MOCK_OTP);

/**
 * 4-digit parcel pickup OTP shown on the customer app.
 * When USE_REAL_SMS is off, returns the fixed mock value so the rider can
 * always advance the booking with 1234 (Porter pre-launch flow).
 */
export const generateParcelOtp = () => (useRealSMS() ? randomOtp(4) : MOCK_OTP);

export { MOCK_OTP };
