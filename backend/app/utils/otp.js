const MOCK_OTP = "1234";

export const useRealSMS = () =>
  process.env.USE_REAL_SMS === "true" || process.env.USE_REAL_SMS === "1";

/**
 * Deliberate escape hatch for testing a deployed environment before an SMS
 * provider is wired up. Off unless explicitly switched on.
 *
 * While this is enabled, ANY phone number can sign in on that deployment using
 * the fixed MOCK_OTP. It is a temporary pre-launch aid, not a config option —
 * unset it before real users arrive.
 */
export const allowMockOtpInProduction = () =>
  process.env.ALLOW_MOCK_OTP_IN_PRODUCTION === "true" ||
  process.env.ALLOW_MOCK_OTP_IN_PRODUCTION === "1";

const OTP_LENGTH = Math.max(4, parseInt(process.env.OTP_LENGTH || "4", 10));

function randomOtp(length) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

export const generateOTP = () => {
  const production = process.env.NODE_ENV === "production";
  if (production && !useRealSMS() && !allowMockOtpInProduction()) {
    const err = new Error("Mock OTP mode is disabled in production");
    err.statusCode = 500;
    throw err;
  }
  return useRealSMS() ? randomOtp(OTP_LENGTH) : MOCK_OTP;
};

/**
 * 6-digit parcel pickup OTP shown on the customer app.
 * Always random — verified in-app with the rider (not SMS-dependent).
 */
export const generateParcelOtp = () => randomOtp(6);

export { MOCK_OTP };
