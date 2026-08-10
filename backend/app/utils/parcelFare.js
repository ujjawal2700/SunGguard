import { multiplyMoney, roundCurrency } from "./money.js";

export function resolveParcelExpressCharge(config, deliverySpeed) {
  const speed = String(deliverySpeed || "normal").trim().toLowerCase();
  if (speed !== "express") return 0;
  return roundCurrency(Math.max(0, Number(config?.expressCharge) || 0));
}

/**
 * Customer parcel fare (single day, before multi-day multiplier).
 * Formula: (distanceKm × perKm) + weightFare + platformCharge + expressCharge
 * Base fare is intentionally excluded.
 */
export function computeParcelDailyFare({
  config,
  distanceKm = 0,
  weightKg = 0,
  platformCharge = 0,
  deliverySpeed = "normal",
} = {}) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  const weight = Math.max(0, Number(weightKg) || 0);
  const perKmCharge = Math.max(0, Number(config?.perKmCharge) || 0);
  const weightCharge = Math.max(0, Number(config?.weightCharge) || 0);

  const baseFare = 0;
  const distanceFare = roundCurrency(distance * perKmCharge);
  const weightFare = roundCurrency(weight * weightCharge);
  const platform = roundCurrency(Math.max(0, Number(platformCharge) || 0));
  const expressCharge = resolveParcelExpressCharge(config, deliverySpeed);
  const companyCharge = 0;
  const courierCharge = platform;
  const fare = roundCurrency(distanceFare + weightFare + platform + expressCharge);

  return {
    baseFare,
    distanceFare,
    weightFare,
    platformCharge: platform,
    companyCharge,
    courierCharge,
    expressCharge,
    perKmCharge: roundCurrency(perKmCharge),
    fare,
  };
}

/**
 * How many billable service days a parcel booking covers.
 * - today → 1
 * - 7/15/30_days → that count
 * - specific → inclusive days from today through preferredPickupDate (capped at 31)
 */
export function resolveParcelBillableDays({
  pickupWindow,
  pickupWindowDays,
  preferredPickupDate,
} = {}) {
  const window = String(pickupWindow || "today").trim();

  if (window === "today") return 1;
  if (window === "7_days") return 7;
  if (window === "15_days") return 15;
  if (window === "30_days") return 30;
  if (window === "custom_days") {
    const customDays = Number(pickupWindowDays);
    if (Number.isFinite(customDays) && customDays > 0) {
      return Math.min(31, Math.floor(customDays));
    }
    return 1;
  }

  if (window === "specific") {
    if (!preferredPickupDate) return 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(preferredPickupDate);
    end.setHours(0, 0, 0, 0);
    if (Number.isNaN(end.getTime())) return 1;
    const diffDays = Math.round((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    return Math.min(31, Math.max(1, diffDays));
  }

  const days = Number(pickupWindowDays);
  if (Number.isFinite(days) && days > 0) return Math.min(31, Math.floor(days));
  return 1;
}

/**
 * Apply multi-day booking to a single-trip fare.
 * Per-day line items stay as daily rates; `fare` becomes the customer total.
 */
export function applyBillableDaysToFare(
  {
    baseFare = 0,
    distanceFare = 0,
    weightFare = 0,
    platformCharge = 0,
    companyCharge = 0,
    courierCharge = 0,
    expressCharge = 0,
    fare = 0,
  },
  billableDays = 1,
) {
  const days = Math.max(1, Number(billableDays) || 1);
  const dailyFare = roundCurrency(fare);
  const totalFare = multiplyMoney(dailyFare, days);

  return {
    billableDays: days,
    dailyFare,
    // Keep daily rates in breakdown so rider payout stays one-trip based.
    baseFare: roundCurrency(baseFare),
    distanceFare: roundCurrency(distanceFare),
    weightFare: roundCurrency(weightFare),
    platformCharge: roundCurrency(platformCharge),
    companyCharge: roundCurrency(companyCharge),
    courierCharge: roundCurrency(courierCharge),
    expressCharge: roundCurrency(expressCharge),
    fare: totalFare,
  };
}
