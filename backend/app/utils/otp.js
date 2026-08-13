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
 * 6-digit parcel pickup OTP shown on the customer app.
 * Always random — verified in-app with the rider (not SMS-dependent).
 */
export const generateParcelOtp = () => randomOtp(6);

export { MOCK_OTP };
