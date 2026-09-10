import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import CityParcelConfig from "../models/cityParcelConfig.js";
import ParcelConfig from "../models/parcelConfig.js";
import Delivery from "../models/delivery.js";
import DeliveryZone from "../models/deliveryZone.js";
import { normalizeGstConfig } from "../utils/gst.js";
import { getPorterGstReport, getPorterGstLedger } from "../services/porter/gstReportService.js";
import {
  buildPorterInvoice,
  getCustomerPorterTransactions,
} from "../services/porter/porterInvoiceService.js";
import { getBookingPaymentHistory } from "../services/porter/porterPaymentService.js";
import { PORTER_BOOKING_KIND, ALL_PORTER_BOOKING_KINDS } from "../constants/porterPayment.js";

/**
 * The porter desk's money surfaces: GST configuration and reporting, booking
 * invoices, payment history, and rider zone assignment.
 *
 * Grouped in one controller because they share a single concern — what the
 * platform charged, what it collected, and who it collected it from — and
 * splitting them across four files would mean four places to keep the same
 * authorisation rule in step.
 */

/** Turn a thrown service error into the status it asked for. */
const fail = (res, error, fallback = 500) =>
  handleResponse(res, Number(error?.statusCode) || fallback, error?.message || "Something went wrong");

/** `kind` arrives from the URL, so it is never trusted as a collection name. */
function parseKind(value) {
  const kind = String(value || "").toLowerCase();
  if (!ALL_PORTER_BOOKING_KINDS.includes(kind)) {
    const err = new Error("Unknown booking type");
    err.statusCode = 400;
    throw err;
  }
  return kind;
}

/* ==========================================================================
   GST — configuration
   ========================================================================== */

/**
 * Both rate cards' GST settings in one call.
 *
 * The admin screen edits them side by side, and fetching them separately
 * would let the two halves of one form load out of step — an admin would see
 * local's saved value next to outstation's stale one and have no way to tell.
 */
export const adminGetGstSettings = async (req, res) => {
  try {
    const [cityConfig, parcelConfig] = await Promise.all([
      CityParcelConfig.getConfig(),
      ParcelConfig.getOrCreate(),
    ]);

    return handleResponse(res, 200, "GST settings", {
      local: normalizeGstConfig(cityConfig.gst),
      outstation: normalizeGstConfig(parcelConfig.gst),
    });
  } catch (error) {
    return fail(res, error);
  }
};

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Validate one product's GST block.
 *
 * The GSTIN is checked against the real format rather than accepted as free
 * text: it is printed on every invoice the product issues, and a typo there
 * is not discovered until a customer's accountant rejects the invoice months
 * later. An empty GSTIN is allowed — an unregistered operation is a real
 * thing — but a malformed one is not.
 */
function validateGstPatch(patch, label) {
  const next = {};

  if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled);

  if (patch.percent !== undefined) {
    const percent = Number(patch.percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      const err = new Error(`${label}: the GST rate must be between 0 and 100`);
      err.statusCode = 400;
      throw err;
    }
    next.percent = Math.round(percent * 100) / 100;
  }

  if (patch.inclusive !== undefined) next.inclusive = Boolean(patch.inclusive);

  if (patch.gstin !== undefined) {
    const gstin = String(patch.gstin || "").trim().toUpperCase();
    if (gstin && !GSTIN_PATTERN.test(gstin)) {
      const err = new Error(`${label}: that does not look like a valid GSTIN`);
      err.statusCode = 400;
      throw err;
    }
    next.gstin = gstin;
  }

  if (patch.placeOfSupply !== undefined) {
    next.placeOfSupply = String(patch.placeOfSupply || "").trim();
  }

  /**
   * Turning GST on with no rate would charge nothing while telling every
   * invoice that tax applies — worse than leaving it off, because the
   * operation would believe it was collecting.
   */
  if (next.enabled && next.percent !== undefined && next.percent <= 0) {
    const err = new Error(`${label}: set a GST rate above zero before enabling it`);
    err.statusCode = 400;
    throw err;
  }

  return next;
}

export const adminUpdateGstSettings = async (req, res) => {
  try {
    const { local, outstation } = req.body || {};

    if (!local && !outstation) {
      return handleResponse(res, 400, "Nothing to update");
    }

    const results = {};

    if (local) {
      const config = await CityParcelConfig.getConfig();
      const patch = validateGstPatch(local, "Local delivery");
      // Enabling with no rate previously saved is the same mistake as
      // enabling with a zero rate, so it is checked against the merged value
      // rather than the incoming one alone.
      const merged = { ...normalizeGstConfig(config.gst), ...patch };
      if (merged.enabled && !(merged.percent > 0)) {
        return handleResponse(res, 400, "Local delivery: set a GST rate above zero before enabling it");
      }
      config.gst = merged;
      await config.save();
      results.local = normalizeGstConfig(config.gst);
    }

    if (outstation) {
      const config = await ParcelConfig.getOrCreate();
      const patch = validateGstPatch(outstation, "Outstation parcel");
      const merged = { ...normalizeGstConfig(config.gst), ...patch };
      if (merged.enabled && !(merged.percent > 0)) {
        return handleResponse(res, 400, "Outstation parcel: set a GST rate above zero before enabling it");
      }
      config.gst = merged;
      await config.save();
      results.outstation = normalizeGstConfig(config.gst);
    }

    return handleResponse(res, 200, "GST settings updated", results);
  } catch (error) {
    return fail(res, error);
  }
};

/* ==========================================================================
   GST — reporting
   ========================================================================== */

export const adminGetGstReport = async (req, res) => {
  try {
    const report = await getPorterGstReport({
      from: req.query.from || null,
      to: req.query.to || null,
    });
    return handleResponse(res, 200, "GST report", report);
  } catch (error) {
    return fail(res, error);
  }
};

export const adminGetGstLedger = async (req, res) => {
  try {
    const { page, limit } = getPagination(req, { defaultLimit: 50, maxLimit: 200 });
    const data = await getPorterGstLedger({
      from: req.query.from || null,
      to: req.query.to || null,
      source: req.query.source || "all",
      // Defaults to settled-only, matching the headline number. An admin
      // wanting everything charged has to ask for it, so the two views cannot
      // be confused by accident.
      settledOnly: String(req.query.settledOnly ?? "true") !== "false",
      page,
      limit,
    });
    return handleResponse(res, 200, "GST ledger", data);
  } catch (error) {
    return fail(res, error);
  }
};

/* ==========================================================================
   Invoices
   ========================================================================== */

/**
 * One booking's invoice, for whoever is entitled to see it.
 *
 * A customer is scoped to their own bookings by the service; an admin sees
 * any. Both receive the identical document — the money on an invoice must not
 * depend on who printed it.
 */
export const getBookingInvoice = async (req, res) => {
  try {
    const kind = parseKind(req.params.kind);
    const isAdmin = req.user?.role === "admin" || req.user?.role === "parcel_admin";

    const invoice = await buildPorterInvoice({
      kind,
      bookingId: req.params.id,
      requesterId: req.user?.id,
      isAdmin,
    });

    return handleResponse(res, 200, "Invoice", invoice);
  } catch (error) {
    return fail(res, error);
  }
};

/**
 * Every payment attempt against a booking, newest first.
 *
 * Customers see this on their booking detail screen so a failed attempt they
 * remember making is visible rather than silently absent; admins see it when
 * answering "did this customer pay". Both are scoped by the same ownership
 * check the invoice uses.
 */
export const getBookingPayments = async (req, res) => {
  try {
    const kind = parseKind(req.params.kind);
    const isAdmin = req.user?.role === "admin" || req.user?.role === "parcel_admin";

    // Reuses the invoice builder's ownership check rather than repeating it:
    // if the caller may not see the invoice, they may not see the payments.
    await buildPorterInvoice({
      kind,
      bookingId: req.params.id,
      requesterId: req.user?.id,
      isAdmin,
    });

    const payments = await getBookingPaymentHistory(kind, req.params.id);
    return handleResponse(res, 200, "Payment history", { payments });
  } catch (error) {
    return fail(res, error);
  }
};

/** The signed-in customer's own recent money movements. */
export const getMyTransactions = async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));
    const transactions = await getCustomerPorterTransactions(req.user.id, limit);
    return handleResponse(res, 200, "Transactions", { transactions });
  } catch (error) {
    return fail(res, error);
  }
};

/* ==========================================================================
   Rider zone assignment
   ========================================================================== */

/**
 * Which zones a rider is staffed to.
 *
 * An empty list means "wherever they physically are" — the local job feed
 * falls back to the rider's live GPS fix, which is how zone gating worked
 * before assignment existed. A non-empty list is a hard restriction: they see
 * only those zones' jobs, wherever they happen to be standing.
 */
export const adminSetRiderZones = async (req, res) => {
  try {
    const { zoneIds } = req.body || {};

    if (zoneIds !== null && !Array.isArray(zoneIds)) {
      return handleResponse(res, 400, "zoneIds must be a list, or null to clear");
    }

    const ids = [...new Set((zoneIds || []).map(String))].filter(Boolean);

    /**
     * Every id has to be a zone that exists and is active. Assigning a rider
     * to a deleted or deactivated zone would silently give them no work at
     * all, and the admin would have no way to see why.
     */
    if (ids.length) {
      const found = await DeliveryZone.find({ _id: { $in: ids }, isActive: true })
        .select("_id")
        .lean();
      if (found.length !== ids.length) {
        return handleResponse(res, 400, "One or more of those zones no longer exist");
      }
    }

    const rider = await Delivery.findByIdAndUpdate(
      req.params.id,
      { $set: { zoneIds: ids } },
      { new: true },
    )
      .select("name phone zoneIds")
      .populate("zoneIds", "name city color")
      .lean();

    if (!rider) return handleResponse(res, 404, "Rider not found");

    return handleResponse(res, 200, "Zones updated", { rider });
  } catch (error) {
    return fail(res, error);
  }
};

/** Riders with their zone assignments, for the assignment screen. */
export const adminListRiderZones = async (req, res) => {
  try {
    const { page, limit } = getPagination(req, { defaultLimit: 25, maxLimit: 100 });
    const skip = (page - 1) * limit;

    const match = { isVerified: true, isParcelService: true };
    if (String(req.query.search || "").trim()) {
      const rx = new RegExp(
        String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      match.$or = [{ name: rx }, { phone: rx }];
    }
    // "Which riders cover this zone" — the question an admin asks when a zone
    // has jobs nobody is taking.
    if (req.query.zoneId) match.zoneIds = req.query.zoneId;

    const [riders, total, zones] = await Promise.all([
      Delivery.find(match)
        .select("name phone profileImage isOnline zoneIds")
        .populate("zoneIds", "name city color")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Delivery.countDocuments(match),
      DeliveryZone.find({ isActive: true }).select("name city color").sort({ name: 1 }).lean(),
    ]);

    return handleResponse(res, 200, "Rider zones", {
      items: riders.map((rider) => ({
        id: String(rider._id),
        name: rider.name,
        phone: rider.phone,
        avatar: rider.profileImage || "",
        isOnline: Boolean(rider.isOnline),
        zones: (rider.zoneIds || []).map((zone) => ({
          id: String(zone._id),
          name: zone.name,
          city: zone.city,
          color: zone.color,
        })),
        /** No assignment means the rider is matched on live location instead. */
        scope: (rider.zoneIds || []).length ? "ASSIGNED" : "LIVE_LOCATION",
      })),
      zones: zones.map((zone) => ({
        id: String(zone._id),
        name: zone.name,
        city: zone.city,
        color: zone.color,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return fail(res, error);
  }
};

export { PORTER_BOOKING_KIND };
