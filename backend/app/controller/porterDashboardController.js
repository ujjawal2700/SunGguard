import Parcel from "../models/parcel.js";
import CityParcel from "../models/cityParcel.js";
import DeliveryZone from "../models/deliveryZone.js";
import handleResponse from "../utils/helper.js";
import { CITY_PARCEL_STATUS as S } from "../constants/cityParcelWorkflow.js";

/**
 * One console for the porter side of the desk.
 *
 * Porter work is split across two independent modules — the pickup-service
 * flow in models/parcel.js and the point-to-point flow in models/cityParcel.js
 * — that deliberately share no state. An operator still runs them as one
 * business, so this endpoint is the only place the two are added together.
 * Each half is also returned untouched under `breakdown`, because a number
 * that can only be seen merged is a number nobody can reconcile.
 */

/** A parcel is finished, one way or another. Everything else is in flight. */
const PICKUP_TERMINAL = ["DELIVERED", "CANCELLED"];
const CITY_TERMINAL = [S.DELIVERED, S.CANCELLED, S.RETURNED];

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

/** Folds a `$group`-by-status aggregation into a plain lookup object. */
const toStatusCounts = (rows) =>
  rows.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

const countTotal = (rows) => rows.reduce((sum, row) => sum + row.count, 0);

/**
 * Daily buckets covering the whole window, so a quiet day plots as zero
 * rather than vanishing and pulling the next day's point left.
 */
const buildTrend = (from, days, pickupRows, cityRows) => {
  const pickupByDay = new Map(pickupRows.map((r) => [r._id, r]));
  const cityByDay = new Map(cityRows.map((r) => [r._id, r]));

  return Array.from({ length: days }, (_, i) => {
    const day = new Date(from);
    day.setUTCDate(day.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);

    const pickup = pickupByDay.get(key);
    const city = cityByDay.get(key);
    const pickupCount = pickup?.count || 0;
    const cityCount = city?.count || 0;

    return {
      date: key,
      pickup: pickupCount,
      city: cityCount,
      total: pickupCount + cityCount,
      revenue: round2((pickup?.revenue || 0) + (city?.revenue || 0)),
    };
  });
};

/** Flattens either parcel shape into the one row the dashboard table renders. */
const toRecentRow = (doc, source) => ({
  id: String(doc._id),
  source,
  status: doc.status,
  fare: round2(doc.fare),
  customer: doc.customerId?.name || "Customer",
  rider: doc.deliveryPartnerId?.name || null,
  createdAt: doc.createdAt,
});

export const adminGetPorterDashboard = async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query?.days) || 14, 1), 90);

    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    const window = { createdAt: { $gte: from } };

    const dailyGroup = {
      _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
      count: { $sum: 1 },
      revenue: { $sum: "$fare" },
    };

    const [
      pickupByStatus,
      pickupMoney,
      pickupDaily,
      cityByStatus,
      cityMoney,
      cityDaily,
      zoneTotal,
      zoneActive,
      pickupUnassigned,
      pickupRefundRequests,
      cityUnassigned,
      cityFailed,
      cityWithheld,
      recentPickup,
      recentCity,
    ] = await Promise.all([
      Parcel.aggregate([
        { $match: window },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Parcel.aggregate([
        { $match: { ...window, status: "DELIVERED" } },
        {
          $group: {
            _id: null,
            delivered: { $sum: 1 },
            revenue: { $sum: "$fare" },
            distanceKm: { $sum: "$distance" },
          },
        },
      ]),
      Parcel.aggregate([{ $match: window }, { $group: dailyGroup }]),

      CityParcel.aggregate([
        { $match: window },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      CityParcel.aggregate([
        { $match: { ...window, status: S.DELIVERED } },
        {
          $group: {
            _id: null,
            delivered: { $sum: 1 },
            revenue: { $sum: "$fare" },
            riderPay: { $sum: "$riderEarning" },
            distanceKm: { $sum: "$distanceKm" },
          },
        },
      ]),
      CityParcel.aggregate([{ $match: window }, { $group: dailyGroup }]),

      DeliveryZone.countDocuments({}),
      DeliveryZone.countDocuments({ isActive: true }),

      Parcel.countDocuments({
        ...window,
        deliveryPartnerId: null,
        status: { $in: ["REQUESTED", "SEARCHING"] },
      }),
      Parcel.countDocuments({ ...window, "lateRefundRequest.status": "requested" }),
      CityParcel.countDocuments({
        ...window,
        deliveryPartnerId: null,
        status: { $in: [S.REQUESTED, S.SEARCHING] },
      }),
      CityParcel.countDocuments({ ...window, status: S.DELIVERY_FAILED }),
      CityParcel.countDocuments({ ...window, payoutWithheld: true }),

      Parcel.find(window)
        .sort({ createdAt: -1 })
        .limit(6)
        .populate("customerId", "name")
        .populate("deliveryPartnerId", "name")
        .select("status fare customerId deliveryPartnerId createdAt")
        .lean(),
      CityParcel.find(window)
        .sort({ createdAt: -1 })
        .limit(6)
        .populate("customerId", "name")
        .populate("deliveryPartnerId", "name")
        .select("status fare customerId deliveryPartnerId createdAt")
        .lean(),
    ]);

    const pickupStatusCounts = toStatusCounts(pickupByStatus);
    const cityStatusCounts = toStatusCounts(cityByStatus);
    const pickupTotals = pickupMoney[0] || {};
    const cityTotals = cityMoney[0] || {};

    const pickupTotal = countTotal(pickupByStatus);
    const cityTotal = countTotal(cityByStatus);

    const inFlight = (counts, terminal) =>
      Object.entries(counts)
        .filter(([status]) => !terminal.includes(status))
        .reduce((sum, [, count]) => sum + count, 0);

    const revenue = (pickupTotals.revenue || 0) + (cityTotals.revenue || 0);
    // Only city parcels carry a stored rider share; the pickup flow settles
    // riders outside the parcel document, so it contributes nothing here.
    const riderPayout = cityTotals.riderPay || 0;

    const recent = [
      ...recentPickup.map((doc) => toRecentRow(doc, "pickup")),
      ...recentCity.map((doc) => toRecentRow(doc, "city")),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8);

    return handleResponse(res, 200, "Porter dashboard", {
      range: { days, from, to: new Date() },
      overview: {
        totalParcels: pickupTotal + cityTotal,
        activeParcels:
          inFlight(pickupStatusCounts, PICKUP_TERMINAL) +
          inFlight(cityStatusCounts, CITY_TERMINAL),
        deliveredParcels: (pickupTotals.delivered || 0) + (cityTotals.delivered || 0),
        cancelledParcels:
          (pickupStatusCounts.CANCELLED || 0) + (cityStatusCounts[S.CANCELLED] || 0),
        revenue: round2(revenue),
        riderPayout: round2(riderPayout),
        margin: round2(revenue - riderPayout),
        distanceKm: round1((pickupTotals.distanceKm || 0) + (cityTotals.distanceKm || 0)),
        zones: { total: zoneTotal, active: zoneActive },
      },
      breakdown: {
        pickup: {
          total: pickupTotal,
          delivered: pickupTotals.delivered || 0,
          revenue: round2(pickupTotals.revenue),
          statusCounts: pickupStatusCounts,
        },
        city: {
          total: cityTotal,
          delivered: cityTotals.delivered || 0,
          revenue: round2(cityTotals.revenue),
          riderPay: round2(cityTotals.riderPay),
          statusCounts: cityStatusCounts,
        },
      },
      needsAttention: {
        unassigned: pickupUnassigned + cityUnassigned,
        failed: cityFailed,
        withheldPayouts: cityWithheld,
        refundRequests: pickupRefundRequests,
      },
      trend: buildTrend(from, days, pickupDaily, cityDaily),
      recent,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
