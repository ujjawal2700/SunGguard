import CityParcel from "../../models/cityParcel.js";
import Parcel from "../../models/parcel.js";
import CityParcelConfig from "../../models/cityParcelConfig.js";
import ParcelConfig from "../../models/parcelConfig.js";
import { normalizeGstConfig } from "../../utils/gst.js";

/**
 * What GST the porter desk has charged, and how much of it has actually been
 * collected.
 *
 * Two numbers that are commonly confused and must not be:
 *
 *   CHARGED   — tax on every booking that was made in the window, whether or
 *               not the money has arrived. This is what the customer was
 *               billed.
 *   COLLECTED — tax on bookings whose money is genuinely with the platform:
 *               an online payment that captured, or COD cash that a rider has
 *               deposited AND an admin has approved.
 *
 * A COD booking sitting in a rider's pocket has charged GST that nobody has
 * collected. Reporting the two as one figure is how an operation ends up
 * remitting tax on money it has not been given.
 *
 * Read off the BOOKINGS rather than the payment ledger, deliberately: COD has
 * no gateway payment at all, and a report that only counted gateway payments
 * would silently omit whichever share of the business pays in cash.
 */

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Bookings whose money is genuinely in hand. */
const SETTLED_MATCH = {
  $or: [
    // Paid through the gateway.
    { paymentMethod: { $ne: "COD" }, paymentStatus: "PAID" },
    // COD that reached the admin — the rider deposited and it was approved.
    { paymentMethod: "COD", "codCollection.status": "REMITTED_TO_ADMIN" },
    { paymentMethod: "COD", "codSettlement.status": "REMITTED_TO_ADMIN" },
  ],
};

/**
 * The GST fields, summed.
 *
 * `$ifNull` throughout because bookings made before GST existed have none of
 * these fields, and those bookings genuinely contributed zero tax — treating
 * a missing field as anything else would invent revenue.
 */
const TAX_SUMS = {
  bookings: { $sum: 1 },
  gross: { $sum: { $ifNull: ["$fare", 0] } },
  taxable: {
    $sum: {
      $ifNull: [
        "$fareBreakdown.taxableAmount",
        // Pre-GST bookings: the whole fare was the taxable value, because
        // no tax was added to it.
        { $ifNull: ["$fare", 0] },
      ],
    },
  },
  gst: { $sum: { $ifNull: ["$fareBreakdown.gstAmount", 0] } },
  cgst: { $sum: { $ifNull: ["$fareBreakdown.cgst", 0] } },
  sgst: { $sum: { $ifNull: ["$fareBreakdown.sgst", 0] } },
};

const emptyBucket = () => ({
  bookings: 0,
  gross: 0,
  taxable: 0,
  gst: 0,
  cgst: 0,
  sgst: 0,
});

function shapeBucket(row) {
  if (!row) return emptyBucket();
  return {
    bookings: row.bookings || 0,
    gross: round2(row.gross),
    taxable: round2(row.taxable),
    gst: round2(row.gst),
    cgst: round2(row.cgst),
    sgst: round2(row.sgst),
  };
}

function addBuckets(a, b) {
  return {
    bookings: a.bookings + b.bookings,
    gross: round2(a.gross + b.gross),
    taxable: round2(a.taxable + b.taxable),
    gst: round2(a.gst + b.gst),
    cgst: round2(a.cgst + b.cgst),
    sgst: round2(a.sgst + b.sgst),
  };
}

function dateWindow({ from, to }) {
  const match = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) match.$gte = start;
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      // Inclusive of the whole closing day — an admin picking "to: 31 Mar"
      // means the end of the 31st, not its first millisecond.
      end.setHours(23, 59, 59, 999);
      match.$lte = end;
    }
  }
  return Object.keys(match).length ? { createdAt: match } : {};
}

/** Charged vs collected for one collection. */
async function summariseCollection(Model, window) {
  const [chargedRows, collectedRows] = await Promise.all([
    Model.aggregate([
      { $match: { status: { $ne: "CANCELLED" }, ...window } },
      { $group: { _id: null, ...TAX_SUMS } },
    ]),
    Model.aggregate([
      { $match: { status: { $ne: "CANCELLED" }, ...window, ...SETTLED_MATCH } },
      { $group: { _id: null, ...TAX_SUMS } },
    ]),
  ]);

  const charged = shapeBucket(chargedRows[0]);
  const collected = shapeBucket(collectedRows[0]);

  return {
    charged,
    collected,
    /** Charged but not yet in hand — mostly COD still with riders. */
    outstanding: {
      bookings: charged.bookings - collected.bookings,
      gross: round2(charged.gross - collected.gross),
      taxable: round2(charged.taxable - collected.taxable),
      gst: round2(charged.gst - collected.gst),
      cgst: round2(charged.cgst - collected.cgst),
      sgst: round2(charged.sgst - collected.sgst),
    },
  };
}

/**
 * A month-by-month series for the chart, on COLLECTED tax.
 *
 * Collected rather than charged because a GST return is filed on what was
 * received, and a chart of charged tax would show the operation owing more
 * than it holds every time COD volume rises.
 */
async function monthlySeries(Model, window, label) {
  const rows = await Model.aggregate([
    { $match: { status: { $ne: "CANCELLED" }, ...window, ...SETTLED_MATCH } },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        gst: { $sum: { $ifNull: ["$fareBreakdown.gstAmount", 0] } },
        taxable: {
          $sum: { $ifNull: ["$fareBreakdown.taxableAmount", { $ifNull: ["$fare", 0] }] },
        },
        bookings: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  return rows.map((row) => ({
    period: `${row._id.year}-${String(row._id.month).padStart(2, "0")}`,
    source: label,
    gst: round2(row.gst),
    taxable: round2(row.taxable),
    bookings: row.bookings,
  }));
}

/**
 * The whole GST picture for the admin screen: local, outstation, and the two
 * combined, plus the rates currently in force.
 */
export async function getPorterGstReport({ from = null, to = null } = {}) {
  const window = dateWindow({ from, to });

  const [local, outstation, localSeries, outstationSeries, cityConfig, parcelConfig] =
    await Promise.all([
      summariseCollection(CityParcel, window),
      summariseCollection(Parcel, window),
      monthlySeries(CityParcel, window, "local"),
      monthlySeries(Parcel, window, "outstation"),
      CityParcelConfig.getConfig(),
      ParcelConfig.getOrCreate(),
    ]);

  const combined = {
    charged: addBuckets(local.charged, outstation.charged),
    collected: addBuckets(local.collected, outstation.collected),
    outstanding: addBuckets(local.outstanding, outstation.outstanding),
  };

  /**
   * The two series are merged by period rather than concatenated, so the
   * chart has one row per month with both products on it. Concatenating
   * produces two points at the same x and a chart that reads as noise.
   */
  const byPeriod = new Map();
  [...localSeries, ...outstationSeries].forEach((row) => {
    const entry = byPeriod.get(row.period) || {
      period: row.period,
      localGst: 0,
      outstationGst: 0,
      totalGst: 0,
      bookings: 0,
    };
    if (row.source === "local") entry.localGst = row.gst;
    else entry.outstationGst = row.gst;
    entry.totalGst = round2(entry.localGst + entry.outstationGst);
    entry.bookings += row.bookings;
    byPeriod.set(row.period, entry);
  });

  return {
    window: { from, to },
    rates: {
      local: normalizeGstConfig(cityConfig.gst),
      outstation: normalizeGstConfig(parcelConfig.gst),
    },
    local,
    outstation,
    combined,
    series: [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period)),
  };
}

/**
 * Line-by-line GST for a window — what an accountant exports.
 *
 * Paginated, and it returns the fields a GSTR-1 style summary needs rather
 * than whole booking documents: the invoice number, the date, the taxable
 * value, the rate, and the split.
 */
export async function getPorterGstLedger({
  from = null,
  to = null,
  source = "all",
  settledOnly = true,
  page = 1,
  limit = 50,
} = {}) {
  const window = dateWindow({ from, to });
  const match = {
    status: { $ne: "CANCELLED" },
    ...window,
    ...(settledOnly ? SETTLED_MATCH : {}),
  };

  const skip = (Math.max(1, page) - 1) * limit;
  const wantLocal = source === "all" || source === "local";
  const wantOutstation = source === "all" || source === "outstation";

  const project = {
    fare: 1,
    createdAt: 1,
    paymentMethod: 1,
    paymentStatus: 1,
    "fareBreakdown.taxableAmount": 1,
    "fareBreakdown.gstPercent": 1,
    "fareBreakdown.gstAmount": 1,
    "fareBreakdown.cgst": 1,
    "fareBreakdown.sgst": 1,
    "fareBreakdown.gstin": 1,
  };

  /**
   * Both collections are queried over the same window and merged in memory.
   * A `$unionWith` would push the merge into Mongo, but it would also tie
   * this report to a specific server version for a page of at most a few
   * hundred rows — not a trade worth making.
   */
  const [localRows, outstationRows, localCount, outstationCount] = await Promise.all([
    wantLocal
      ? CityParcel.find(match, { ...project, referenceId: 1, customerId: 1 })
          .sort({ createdAt: -1 })
          .limit(skip + limit)
          .lean()
      : [],
    wantOutstation
      ? Parcel.find(match, { ...project, customerId: 1, destinationCity: 1 })
          .sort({ createdAt: -1 })
          .limit(skip + limit)
          .lean()
      : [],
    wantLocal ? CityParcel.countDocuments(match) : 0,
    wantOutstation ? Parcel.countDocuments(match) : 0,
  ]);

  const rows = [
    ...localRows.map((row) => ({
      source: "local",
      id: String(row._id),
      invoiceNo: row.referenceId || `CP-${String(row._id).slice(-6).toUpperCase()}`,
      date: row.createdAt,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      total: round2(row.fare),
      taxable: round2(row.fareBreakdown?.taxableAmount ?? row.fare),
      gstPercent: Number(row.fareBreakdown?.gstPercent) || 0,
      gst: round2(row.fareBreakdown?.gstAmount),
      cgst: round2(row.fareBreakdown?.cgst),
      sgst: round2(row.fareBreakdown?.sgst),
      gstin: row.fareBreakdown?.gstin || "",
    })),
    ...outstationRows.map((row) => ({
      source: "outstation",
      id: String(row._id),
      invoiceNo: `PCL-${String(row._id).slice(-6).toUpperCase()}`,
      date: row.createdAt,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      destinationCity: row.destinationCity || "",
      total: round2(row.fare),
      taxable: round2(row.fareBreakdown?.taxableAmount ?? row.fare),
      gstPercent: Number(row.fareBreakdown?.gstPercent) || 0,
      gst: round2(row.fareBreakdown?.gstAmount),
      cgst: round2(row.fareBreakdown?.cgst),
      sgst: round2(row.fareBreakdown?.sgst),
      gstin: row.fareBreakdown?.gstin || "",
    })),
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(skip, skip + limit);

  const total = localCount + outstationCount;

  return {
    items: rows,
    page: Math.max(1, page),
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
