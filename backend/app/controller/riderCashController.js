import mongoose from "mongoose";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import Parcel from "../models/parcel.js";
import CityParcel from "../models/cityParcel.js";
import {
  getRiderCodSummary,
  createCashDeposit,
  reviewCashDeposit,
  listCashDeposits,
  getFleetCashHoldings,
  getCashPayoutDestination,
  updateCashPayoutDestination,
} from "../services/riderCashService.js";
import {
  createCodQr,
  fetchCodQrStatus,
  closeCodQr,
  isCodQrAvailable,
} from "../services/codQrService.js";

/* ==========================================================================
   Rider — COD cash they are holding, and depositing it back
   ========================================================================== */

export const riderGetCashSummary = async (req, res) => {
  try {
    const summary = await getRiderCodSummary(req.user.id);
    return handleResponse(res, 200, "Cash summary", summary);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

const DEPOSIT_METHODS = new Set(["UPI", "BANK_TRANSFER", "CASH", "OTHER"]);

export const riderCreateCashDeposit = async (req, res) => {
  try {
    const { method, reference, proofImageUrl, note, items } = req.body || {};

    if (!DEPOSIT_METHODS.has(String(method || "").toUpperCase())) {
      return handleResponse(res, 400, "Choose how you deposited the cash");
    }

    const deposit = await createCashDeposit({
      riderId: req.user.id,
      method: String(method).toUpperCase(),
      reference,
      proofImageUrl,
      note,
      selection: Array.isArray(items) ? items : null,
    });

    return handleResponse(
      res,
      201,
      "Deposit submitted — admin will verify it shortly",
      deposit,
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const riderListCashDeposits = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const data = await listCashDeposits({
      status: req.query.status || "all",
      riderId: req.user.id,
      page,
      limit,
      skip,
    });
    return handleResponse(res, 200, "Deposit history", data);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/* ==========================================================================
   Rider — turning a COD booking into an online payment at the doorstep
   ========================================================================== */

/** Loads the booking either flow, with the fields this controller needs. */
async function loadBooking(kind, id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  if (kind === "city_parcel") return CityParcel.findById(id);
  if (kind === "parcel") return Parcel.findById(id);
  return null;
}

const codStateFor = (kind, booking) =>
  kind === "city_parcel" ? booking.codCollection : booking.codSettlement;

/** The rider must own the job before they can collect against it. */
function assertRiderOwnsBooking(booking, riderId) {
  if (String(booking.deliveryPartnerId || "") !== String(riderId)) {
    const err = new Error("This booking is not assigned to you");
    err.statusCode = 403;
    throw err;
  }
}

export const riderCreateCodQr = async (req, res) => {
  try {
    const { kind, id } = req.params;
    if (!isCodQrAvailable()) {
      return handleResponse(res, 503, "Online payment is unavailable — collect cash instead");
    }

    const booking = await loadBooking(kind, id);
    if (!booking) return handleResponse(res, 404, "Booking not found");
    assertRiderOwnsBooking(booking, req.user.id);

    if (String(booking.paymentMethod).toUpperCase() !== "COD") {
      return handleResponse(res, 400, "This booking is not cash on delivery");
    }
    if (booking.paymentStatus === "PAID") {
      return handleResponse(res, 400, "This booking is already paid");
    }

    // Reuse a QR that is still live rather than minting one per tap — a
    // second QR for the same booking would be a second way to charge twice.
    const existing = booking.codOnlineQr || {};
    if (existing.qrId && !existing.paidAt) {
      return handleResponse(res, 200, "Scan to pay", {
        qrId: existing.qrId,
        imageUrl: existing.imageUrl,
        amount: existing.amount,
      });
    }

    const codState = codStateFor(kind, booking) || {};
    const amount =
      Number(codState.collectAmount) || Number(codState.amount) || Number(booking.fare);

    const qr = await createCodQr({
      amount,
      label: `Delivery ${booking.referenceId || String(booking._id).slice(-6).toUpperCase()}`,
      notes: {
        kind,
        bookingId: String(booking._id),
        riderId: String(req.user.id),
        purpose: "cod_switch_to_online",
      },
    });

    booking.codOnlineQr = {
      qrId: qr.qrId,
      imageUrl: qr.imageUrl,
      amount: qr.amount,
      createdAt: new Date(),
      paidAt: null,
      paymentId: null,
    };
    await booking.save();

    return handleResponse(res, 201, "Scan to pay", {
      qrId: qr.qrId,
      imageUrl: qr.imageUrl,
      amount: qr.amount,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const riderCheckCodQr = async (req, res) => {
  try {
    const { kind, id } = req.params;
    const booking = await loadBooking(kind, id);
    if (!booking) return handleResponse(res, 404, "Booking not found");
    assertRiderOwnsBooking(booking, req.user.id);

    // Already converted on an earlier poll — answer from the document rather
    // than calling Razorpay again.
    if (booking.paymentStatus === "PAID") {
      return handleResponse(res, 200, "Payment received", {
        paid: true,
        paymentMethod: booking.paymentMethod,
      });
    }

    const qrId = booking.codOnlineQr?.qrId;
    if (!qrId) {
      return handleResponse(res, 400, "No payment QR has been created for this booking");
    }

    const status = await fetchCodQrStatus(qrId, booking.codOnlineQr?.amount);
    if (!status.paid) {
      return handleResponse(res, 200, "Waiting for payment", { paid: false });
    }

    // Paid: the booking stops being COD entirely, so the rider carries no
    // cash for it and it counts as an online payment everywhere downstream.
    booking.paymentStatus = "PAID";
    booking.paymentMethod = "UPI";
    booking.codOnlineQr.paidAt = new Date();
    booking.codOnlineQr.paymentId = status.paymentId || null;

    if (kind === "city_parcel") {
      booking.codCollection = {
        ...(booking.codCollection?.toObject?.() || booking.codCollection || {}),
        amount: 0,
        status: "NOT_APPLICABLE",
      };
    } else {
      booking.codSettlement = {
        ...(booking.codSettlement?.toObject?.() || booking.codSettlement || {}),
        collectAmount: 0,
        status: "NOT_APPLICABLE",
      };
    }

    await booking.save();
    await closeCodQr(qrId);

    return handleResponse(res, 200, "Payment received", {
      paid: true,
      paymentMethod: "UPI",
      paymentId: status.paymentId || null,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/* ==========================================================================
   Admin — the deposit approval queue
   ========================================================================== */

export const adminListCashDeposits = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, { defaultLimit: 25, maxLimit: 100 });
    const data = await listCashDeposits({
      status: req.query.status || "PENDING",
      riderId: req.query.riderId || null,
      page,
      limit,
      skip,
    });
    return handleResponse(res, 200, "Cash deposits", data);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adminReviewCashDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const { approve, adminNote } = req.body || {};

    if (typeof approve !== "boolean") {
      return handleResponse(res, 400, "approve must be true or false");
    }

    const result = await reviewCashDeposit({
      depositId: id,
      adminId: req.user?.id,
      approve,
      adminNote,
    });

    if (!result) return handleResponse(res, 404, "Deposit not found");

    return handleResponse(
      res,
      200,
      approve ? "Deposit approved and cash cleared" : "Deposit rejected",
      result,
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adminGetFleetCashHoldings = async (req, res) => {
  try {
    const data = await getFleetCashHoldings();
    return handleResponse(res, 200, "Cash held by riders", data);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/* ==========================================================================
   Where to send the cash
   ========================================================================== */

/** Rider-facing, read-only: what admin has configured to deposit into. */
export const riderGetCashPayoutDestination = async (req, res) => {
  try {
    const destination = await getCashPayoutDestination();
    return handleResponse(res, 200, "Deposit destination", destination);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adminGetCashPayoutDestination = async (req, res) => {
  try {
    const destination = await getCashPayoutDestination();
    return handleResponse(res, 200, "Deposit destination", destination);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adminUpdateCashPayoutDestination = async (req, res) => {
  try {
    const destination = await updateCashPayoutDestination(req.body || {});
    return handleResponse(res, 200, "Deposit destination updated", destination);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
