import { roundCurrency, toPaise, fromPaise } from "./money.js";

/**
 * GST on a porter fare.
 *
 * One implementation, shared by the local (City Parcel) and outstation
 * (Parcel) rate cards, because the two are configured independently but must
 * compute identically — an operation that charges 18% locally and 18%
 * outstation should never see the two disagree by a paisa on the same fare.
 *
 * The whole calculation runs in paise. Doing it in rupees means
 * `45.5 * 0.18` and a tax total that fails to reconcile with the sum of its
 * own CGST and SGST halves, which is exactly the kind of drift a tax auditor
 * finds first.
 *
 * Intra-state supply is assumed: the platform, the pickup and the drop are
 * all in one state for a local delivery, and the outstation leg is billed as
 * a service rendered where the parcel was collected. IGST is therefore always
 * zero here, but is carried through the shape so an inter-state variant can
 * be added without another migration.
 */

export const DEFAULT_GST_PERCENT = 18;

/** The empty result — the shape callers get when GST is switched off. */
function untaxed(subtotal, config = {}) {
  const amount = roundCurrency(subtotal);
  return {
    gstEnabled: false,
    gstPercent: 0,
    gstin: String(config?.gstin || "").trim().toUpperCase(),
    taxableAmount: amount,
    cgst: 0,
    sgst: 0,
    igst: 0,
    gstAmount: 0,
    /** What the customer actually pays. */
    totalAmount: amount,
    inclusive: false,
  };
}

/**
 * Normalises whatever an admin saved into something safe to compute with.
 * A missing or malformed percent falls back to zero rather than the default,
 * so a half-written config under-charges rather than silently inventing tax.
 */
export function normalizeGstConfig(gst = {}) {
  const percent = Number(gst?.percent);
  return {
    enabled: Boolean(gst?.enabled),
    percent: Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0,
    inclusive: Boolean(gst?.inclusive),
    gstin: String(gst?.gstin || "").trim().toUpperCase(),
    placeOfSupply: String(gst?.placeOfSupply || "").trim(),
  };
}

/**
 * Split GST into its halves without losing a paisa.
 *
 * CGST takes the rounded half and SGST takes the remainder, so the two always
 * add back to exactly the total. Halving twice and rounding each would leave
 * a 1-paisa gap on every odd amount.
 */
function splitHalves(gstPaise) {
  const cgstPaise = Math.round(gstPaise / 2);
  return {
    cgst: fromPaise(cgstPaise),
    sgst: fromPaise(gstPaise - cgstPaise),
  };
}

/**
 * Apply GST to a pre-tax fare.
 *
 * `subtotal` is the sum of the rate-card line items — base, distance, weight,
 * platform, express — after any minimum-fare floor. GST sits on top of that
 * floor rather than inside it, because a minimum fare is a commercial floor
 * on the service, not on the tax.
 *
 * Two modes:
 *   exclusive (default) — the customer pays subtotal + tax.
 *   inclusive           — the rate card is already tax-inclusive, so the
 *                         customer pays exactly the subtotal and the tax is
 *                         backed out of it for the invoice.
 *
 * Returns rupee values throughout: this result is what the invoice prints and
 * what the booking stores, and both are rupee-facing.
 */
export function applyGst(subtotal, gstConfig = {}) {
  const config = normalizeGstConfig(gstConfig);

  if (!config.enabled || config.percent <= 0) {
    return untaxed(subtotal, config);
  }

  const subtotalPaise = Math.max(0, toPaise(subtotal));

  if (config.inclusive) {
    // taxable = total / (1 + rate). The tax is whatever is left over, so the
    // two provably sum back to the price the customer was quoted.
    const taxablePaise = Math.round(subtotalPaise / (1 + config.percent / 100));
    const gstPaise = subtotalPaise - taxablePaise;
    return {
      gstEnabled: true,
      gstPercent: config.percent,
      gstin: config.gstin,
      placeOfSupply: config.placeOfSupply,
      taxableAmount: fromPaise(taxablePaise),
      ...splitHalves(gstPaise),
      igst: 0,
      gstAmount: fromPaise(gstPaise),
      totalAmount: fromPaise(subtotalPaise),
      inclusive: true,
    };
  }

  const gstPaise = Math.round((subtotalPaise * config.percent) / 100);
  return {
    gstEnabled: true,
    gstPercent: config.percent,
    gstin: config.gstin,
    placeOfSupply: config.placeOfSupply,
    taxableAmount: fromPaise(subtotalPaise),
    ...splitHalves(gstPaise),
    igst: 0,
    gstAmount: fromPaise(gstPaise),
    totalAmount: fromPaise(subtotalPaise + gstPaise),
    inclusive: false,
  };
}

/**
 * The tax that was charged on an already-saved booking.
 *
 * Reads the stored breakdown rather than recomputing from the live config —
 * an admin who changes the rate today must not retroactively change what
 * yesterday's invoice says was collected. Falls back to zero for bookings
 * made before GST existed, which is the truth for them.
 */
export function gstFromBreakdown(fareBreakdown = {}) {
  const gstAmount = Number(fareBreakdown?.gstAmount) || 0;
  const taxableAmount =
    Number(fareBreakdown?.taxableAmount) ||
    Math.max(0, roundCurrency((Number(fareBreakdown?.fare) || 0) - gstAmount));

  return {
    gstEnabled: gstAmount > 0,
    gstPercent: Number(fareBreakdown?.gstPercent) || 0,
    gstin: String(fareBreakdown?.gstin || ""),
    taxableAmount,
    cgst: Number(fareBreakdown?.cgst) || 0,
    sgst: Number(fareBreakdown?.sgst) || 0,
    igst: Number(fareBreakdown?.igst) || 0,
    gstAmount,
    totalAmount: roundCurrency(taxableAmount + gstAmount),
    inclusive: Boolean(fareBreakdown?.gstInclusive),
  };
}

/** The fare-breakdown fields a GST result contributes. Merged into both configs' breakdowns. */
export function gstBreakdownFields(gst) {
  return {
    gstPercent: gst.gstPercent,
    gstAmount: gst.gstAmount,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: gst.igst,
    taxableAmount: gst.taxableAmount,
    gstInclusive: gst.inclusive,
    gstin: gst.gstin,
  };
}
