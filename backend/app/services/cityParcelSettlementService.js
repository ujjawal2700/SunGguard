import Transaction from "../models/transaction.js";
import CityParcelConfig from "../models/cityParcelConfig.js";
import CityParcel from "../models/cityParcel.js";
import { computeRiderEarning } from "./cityParcelFareService.js";
import { buildKey, invalidate } from "./cacheService.js";
import { roundCurrency } from "../utils/money.js";
import logger from "./logger.js";

/**
 * Rider pay for the City Parcel module.
 *
 * Writes the same `Transaction` rows the pickup-service flow uses, so the
 * existing Earnings and Dashboard screens pick city parcels up without any
 * change. The `reference` field is the idempotency key: re-running a
 * settlement updates the row rather than paying twice.
 */

/** Paid when a parcel is handed over and verified. */
export async function creditDeliveryEarning(parcel) {
  const riderId = parcel?.deliveryPartnerId?._id || parcel?.deliveryPartnerId;
  if (!riderId || !parcel?._id) return null;

  // A delivery completed past a failed proximity check is not paid until an
  // admin has looked at why. Otherwise "complete anyway" becomes the norm.
  if (parcel.payoutWithheld) {
    logger.info("City parcel payout withheld pending review", {
      referenceId: parcel.referenceId,
    });
    return null;
  }

  const config = await CityParcelConfig.getConfig();
  const amount = roundCurrency(computeRiderEarning(parcel.fareBreakdown, config));
  if (!(amount > 0)) return null;

  const reference = `CTY-ERN-${String(parcel._id)}`;

  const txn = await Transaction.findOneAndUpdate(
    { reference },
    {
      $set: {
        amount,
        status: "Settled",
        meta: {
          kind: "city_parcel",
          cityParcelId: String(parcel._id),
          referenceId: parcel.referenceId,
          payoutBase: roundCurrency(parcel.fareBreakdown?.baseFare || 0),
          payoutDistance: roundCurrency(parcel.fareBreakdown?.distanceFare || 0),
          distanceKm: parcel.distanceKm,
          paymentMethod: parcel.paymentMethod,
        },
      },
      $setOnInsert: {
        user: riderId,
        userModel: "Delivery",
        type: "Delivery Earning",
        reference,
        date: new Date(),
      },
    },
    { upsert: true, new: true },
  );

  await CityParcel.findByIdAndUpdate(parcel._id, { $set: { riderEarning: amount } });
  await invalidateRiderCaches(riderId);

  return txn;
}

/**
 * Paid for carrying a failed parcel back.
 *
 * A separate transaction from the delivery earning, not an adjustment to it,
 * so a rider can see plainly that they were paid for the extra leg.
 */
export async function creditReturnEarning(parcel) {
  const riderId = parcel?.deliveryPartnerId?._id || parcel?.deliveryPartnerId;
  const amount = roundCurrency(parcel?.returnLeg?.riderPayout || 0);
  if (!riderId || !(amount > 0)) return null;

  const reference = `CTY-RTN-${String(parcel._id)}`;

  const txn = await Transaction.findOneAndUpdate(
    { reference },
    {
      $set: {
        amount,
        status: "Settled",
        meta: {
          kind: "city_parcel_return",
          cityParcelId: String(parcel._id),
          referenceId: parcel.referenceId,
          reason: "Return leg — delivery could not be completed",
        },
      },
      $setOnInsert: {
        user: riderId,
        userModel: "Delivery",
        type: "Delivery Earning",
        reference,
        date: new Date(),
      },
    },
    { upsert: true, new: true },
  );

  await CityParcel.findByIdAndUpdate(parcel._id, {
    $set: { riderReturnEarning: amount },
  });
  await invalidateRiderCaches(riderId);

  return txn;
}

/** Release a payout an admin has cleared after reviewing an override. */
export async function releaseWithheldPayout(cityParcelId) {
  const parcel = await CityParcel.findByIdAndUpdate(
    cityParcelId,
    { $set: { payoutWithheld: false } },
    { new: true },
  );
  if (!parcel) return null;
  return creditDeliveryEarning(parcel);
}

async function invalidateRiderCaches(riderId) {
  await Promise.all([
    invalidate(buildKey("delivery", "earnings", String(riderId))),
    invalidate(buildKey("delivery", "stats", String(riderId))),
  ]).catch(() => {});
}
