import Transaction from "../models/transaction.js";
import CityParcel from "../models/cityParcel.js";
import handleResponse from "../utils/helper.js";
import { CITY_PARCEL_STATUS as S } from "../constants/cityParcelWorkflow.js";

/**
 * What the porter desk has paid its riders.
 *
 * The admin Money Requests screen lists rider *withdrawals*, and a withdrawal
 * cannot be attributed to porter: a rider's balance pools what they earned on
 * grocery orders and on parcels, and they draw against the pool. Splitting
 * that after the fact would be invention.
 *
 * What is genuinely porter-only is the earning side. Every parcel settlement
 * stamps `meta.kind` on the ledger row it writes, while a grocery earning
 * carries an `order` reference and no kind — so these two populations never
 * overlap. This endpoint reports the porter half of that ledger, which is the
 * honest answer to "what does porter owe, and what has it paid".
 */

/** Ledger stamps written by the two parcel settlement services. */
const PORTER_EARNING_KINDS = ["parcel", "city_parcel", "city_parcel_return"];

/** Human labels for those stamps, so the UI never renders a raw enum. */
const KIND_LABELS = {
  parcel: "Outstation",
  city_parcel: "Local",
  city_parcel_return: "Local return",
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const adminGetPorterRiderPayouts = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 25));
    const skip = (page - 1) * limit;

    const kind = String(req.query?.kind || "").trim();
    const match = {
      userModel: "Delivery",
      type: "Delivery Earning",
      "meta.kind": PORTER_EARNING_KINDS.includes(kind) ? kind : { $in: PORTER_EARNING_KINDS },
    };

    const [rows, total, byKind, riderCount, withheld] = await Promise.all([
      Transaction.find(match)
        .populate("user", "name phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(match),
      Transaction.aggregate([
        { $match: match },
        { $group: { _id: "$meta.kind", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      Transaction.distinct("user", match),
      // Local deliveries completed past the proximity gate: earned, but held
      // back until an admin reviews why. Money the desk still owes.
      CityParcel.aggregate([
        { $match: { payoutWithheld: true, status: S.DELIVERED } },
        { $group: { _id: null, amount: { $sum: "$riderEarning" }, count: { $sum: 1 } } },
      ]),
    ]);

    const modules = byKind.map((row) => ({
      kind: row._id,
      label: KIND_LABELS[row._id] || row._id,
      amount: round2(row.amount),
      count: row.count,
    }));

    return handleResponse(res, 200, "Porter rider payouts", {
      summary: {
        totalPaid: round2(modules.reduce((sum, m) => sum + m.amount, 0)),
        entries: total,
        riders: riderCount.length,
        withheldAmount: round2(withheld[0]?.amount || 0),
        withheldCount: withheld[0]?.count || 0,
      },
      modules,
      items: rows.map((row) => ({
        id: String(row._id),
        rider: row.user?.name || "Rider",
        riderPhone: row.user?.phone || "",
        amount: round2(row.amount),
        kind: row.meta?.kind || "",
        kindLabel: KIND_LABELS[row.meta?.kind] || row.meta?.kind || "",
        // Local settlements stamp a human waybill; outstation only stamps the
        // id, so fall back to that rather than showing a blank column.
        parcelRef:
          row.meta?.referenceId ||
          row.meta?.parcelId ||
          row.meta?.cityParcelId ||
          "",
        distanceKm: row.meta?.distanceKm ?? null,
        paymentMethod: row.meta?.paymentMethod || "",
        status: row.status,
        reference: row.reference,
        date: row.date || row.createdAt,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
