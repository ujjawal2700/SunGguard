import Parcel from "../models/parcel.js";
import ParcelConfig from "../models/parcelConfig.js";
import CourierCompany from "../models/courierCompany.js";
import Delivery from "../models/delivery.js";
import User from "../models/customer.js";
import Admin from "../models/admin.js";
import handleResponse from "../utils/helper.js";
import Notification from "../models/notification.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { emitToAdmins, emitToDelivery, emitToCustomer, retractParcelBroadcast, emitParcelNewToNearbySellers, emitToSeller } from "../services/orderSocketEmitter.js";
import {
  startParcelBroadcast,
  parcelAcceptAtomic,
  parcelRejectAtomic,
  fetchAvailableParcelsForRider,
  fetchParcelsForSeller,
  cancelParcelSearch,
  computeRiderParcelEarnings,
} from "../services/parcelWorkflowService.js";
import { resetAllParcelData } from "../services/parcelDataResetService.js";
import { generateParcelOtp } from "../utils/otp.js";
import { getCachedRoute } from "../services/mapsRouteService.js";
import {
  resolveParcelBillableDays,
  applyBillableDaysToFare,
  computeParcelDailyFare,
} from "../utils/parcelFare.js";
import {
  createParcelRazorpayOrder,
  createParcelCodRemitRazorpayOrder,
  verifyParcelRazorpaySignature,
} from "../services/parcelRazorpayService.js";
import { findNearestParcelSellerWithDistance } from "../services/sellerNearbyService.js";
import { applyParcelDeliveredRiderEarning } from "../services/parcelRiderSettlementService.js";
import {
  canCustomerRequestLateRefund,
  creditLateRefundToCustomerWallet,
  getParcelLatePickupSummary,
  getParcelPickupDeadline,
  isNormalParcelPickupLate,
  NORMAL_PICKUP_SLA_MINUTES,
} from "../services/parcelLateRefundService.js";
import { roundCurrency } from "../utils/money.js";

function isParcelCod(parcelOrMethod) {
  const method =
    typeof parcelOrMethod === "string"
      ? parcelOrMethod
      : parcelOrMethod?.paymentMethod;
  return String(method || "").toUpperCase() === "COD";
}

function getParcelCollectAmount(parcel) {
  if (!isParcelCod(parcel)) return 0;
  const fromSettlement = Number(parcel?.codSettlement?.collectAmount);
  if (Number.isFinite(fromSettlement) && fromSettlement > 0) return fromSettlement;
  return Math.max(0, Number(parcel?.fare) || 0);
}

function buildInitialCodSettlement(paymentMethod, fare) {
  if (!isParcelCod(paymentMethod)) {
    return {
      collectAmount: 0,
      status: "NOT_APPLICABLE",
    };
  }
  return {
    collectAmount: Math.max(0, Number(fare) || 0),
    status: "COLLECT_PENDING",
  };
}

async function notifyParcelRequested(parcel, userId) {
  try {
    const admins = await Admin.find().select("_id").lean();
    const adminIds = (admins || []).map((a) => a?._id).filter(Boolean);
    emitNotificationEvent(NOTIFICATION_EVENTS.PARCEL_REQUESTED, {
      userId,
      customerId: userId,
      adminIds,
      parcelId: parcel._id,
      fare: parcel.fare,
      customerBody: `Your parcel delivery request (ID: ${parcel._id}) has been created. Searching for a nearby rider...`,
      adminBody: `Parcel #${String(parcel._id).slice(-6)}${parcel.deliverySpeed === "express" ? " (EXPRESS)" : ""} booked for ₹${parcel.fare}. Open Parcel Delivery to view.`,
      data: {
        parcelId: parcel._id,
        fare: parcel.fare,
        deliverySpeed: parcel.deliverySpeed || "normal",
        pickup: parcel.pickupAddress?.fullAddress,
        drop: parcel.dropAddress?.fullAddress,
      },
    });
  } catch (notifyErr) {
    console.error("Failed to notify customer/admins for parcel request:", notifyErr);
  }
}

async function activateParcelAfterPayment(parcel) {
  emitToAdmins("parcel:new", parcel);
  await emitParcelNewToNearbySellers(parcel);
  const searchingParcel = await startParcelBroadcast(parcel);
  return searchingParcel || parcel;
}
import { syncDeliveryPartnerBusyFlag } from "../services/deliveryBusyService.js";

// Utility to send notifications
async function sendParcelNotification(userId, role, title, body, eventType = "alert", parcelId = null) {
  try {
    if (Object.values(NOTIFICATION_EVENTS).includes(eventType)) {
      emitNotificationEvent(eventType, {
        userId,
        customerId: role === "customer" ? userId : undefined,
        deliveryId: role === "delivery" ? userId : undefined,
        parcelId,
        body,
        data: {
          title,
          parcelId,
          role,
        }
      });
    } else {
      await Notification.create({
        userId,
        recipient: userId,
        role: role === "customer" ? "customer" : role === "delivery" ? "delivery" : role,
        recipientModel: role === "customer" ? "Customer" : role === "delivery" ? "Delivery" : role === "admin" ? "Admin" : "Seller",
        title,
        body,
        message: body,
        status: "pending",
        type: "alert",
      });
    }
  } catch (err) {
    console.error("Failed to send notification:", err);
  }
}

/* ==========================================================================
   CUSTOMER CONTROLLERS
   ========================================================================== */

export const calculateFare = async (req, res) => {
  try {
    const {
      pickupLat,
      pickupLng,
      weight,
      courierCompany,
      courierCompanyId,
      pickupWindow,
      pickupWindowDays,
      preferredPickupDate,
      deliverySpeed,
    } = req.body;

    if (pickupLat == null || pickupLng == null) {
      return handleResponse(res, 400, "Pickup location is required");
    }

    const pickupLatN = Number(pickupLat);
    const pickupLngN = Number(pickupLng);
    if (!Number.isFinite(pickupLatN) || !Number.isFinite(pickupLngN)) {
      return handleResponse(res, 400, "Invalid pickup location");
    }

    const config = await ParcelConfig.getOrCreate();
    const maxWeightKg = Math.min(50, Math.max(0.1, Number(config.maxWeightKg) || 1));
    const pkgWeight = Number(weight || 0.1);
    if (pkgWeight <= 0 || pkgWeight > maxWeightKg) {
      return handleResponse(
        res,
        400,
        `Weight must be greater than 0 and maximum ${maxWeightKg} KG`,
      );
    }

    // Distance = pickup (user) → nearest parcel-hub seller (delivery location).
    const nearest = await findNearestParcelSellerWithDistance(pickupLatN, pickupLngN);
    if (!nearest) {
      return handleResponse(
        res,
        400,
        "No parcel hub seller is available near your pickup location",
      );
    }
    const distanceKm = nearest.distanceKm;

    let platformCharge = 0;
    const courierKey = courierCompanyId || courierCompany;
    if (courierKey) {
      const courier = await CourierCompany.findActiveByNameOrId(courierKey);
      if (courier) {
        platformCharge = Math.round((Number(courier.platformCharge) || 0) * 100) / 100;
      }
    }

    const daily = computeParcelDailyFare({
      config,
      distanceKm,
      weightKg: pkgWeight,
      platformCharge,
      deliverySpeed,
    });

    const billableDays = resolveParcelBillableDays({
      pickupWindow,
      pickupWindowDays,
      preferredPickupDate,
    });
    const priced = applyBillableDaysToFare(daily, billableDays);

    const sellerName = nearest.seller.shopName || nearest.seller.name || "Parcel hub";
    const configuredExpressCharge =
      Math.round((Math.max(0, Number(config.expressCharge) || 0) + Number.EPSILON) * 100) / 100;

    return handleResponse(res, 200, "Fare calculated successfully", {
      distance: distanceKm,
      perKmCharge: daily.perKmCharge,
      sellerName,
      configuredExpressCharge,
      baseFare: priced.baseFare,
      distanceFare: priced.distanceFare,
      weightFare: priced.weightFare,
      platformCharge: priced.platformCharge,
      companyCharge: priced.companyCharge,
      courierCharge: priced.courierCharge,
      expressCharge: priced.expressCharge,
      dailyFare: priced.dailyFare,
      billableDays: priced.billableDays,
      fare: priced.fare,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createParcel = async (req, res) => {
  try {
    const {
      pickupAddress,
      dropAddress,
      packageDetails,
      paymentMethod,
      courierCompany,
      courierCompanyId,
      customCourierName,
      destinationCity,
      preferredPickupDate,
      pickupWindow,
      pickupWindowDays,
      deliverySpeed,
    } = req.body;

    if (!pickupAddress || !dropAddress || !packageDetails || !paymentMethod) {
      return handleResponse(res, 400, "Missing required details");
    }

    const courierKey = courierCompanyId || courierCompany;
    const courierDoc = await CourierCompany.findActiveByNameOrId(courierKey);
    if (!courierDoc) {
      return handleResponse(res, 400, "Please select a valid courier company");
    }
    // For the "Other" option the customer types their own company name; the
    // platform rate still comes from the admin-managed "Other" record.
    let courier = courierDoc.name;
    if (courierDoc.isOther) {
      const typedName = String(customCourierName || "").trim();
      if (!typedName) {
        return handleResponse(res, 400, "Please enter the courier company name");
      }
      courier = typedName;
    }
    const city = String(destinationCity || "").trim();
    if (!city) {
      return handleResponse(res, 400, "Please select destination city");
    }

    const allowedWindows = ["today", "7_days", "15_days", "30_days", "custom_days", "specific"];
    const windowValue = allowedWindows.includes(String(pickupWindow || "").trim())
      ? String(pickupWindow).trim()
      : "specific";

    const windowDaysMap = {
      today: 0,
      "7_days": 7,
      "15_days": 15,
      "30_days": 30,
      custom_days: null,
      specific: null,
    };

    let resolvedWindowDays =
      windowValue === "specific" || windowValue === "custom_days"
        ? pickupWindowDays == null || pickupWindowDays === ""
          ? null
          : Number(pickupWindowDays)
        : windowDaysMap[windowValue];

    if (windowValue === "custom_days") {
      if (!Number.isFinite(resolvedWindowDays) || resolvedWindowDays < 2) {
        return handleResponse(res, 400, "Please enter at least 2 days for custom booking");
      }
      if (resolvedWindowDays > 30) {
        return handleResponse(res, 400, "Custom booking cannot exceed 30 days");
      }
      resolvedWindowDays = Math.floor(resolvedWindowDays);
    }

    if (windowValue !== "specific" && windowValue !== "custom_days" && !Number.isFinite(resolvedWindowDays)) {
      resolvedWindowDays = windowDaysMap[windowValue] ?? 0;
    }

    if (!preferredPickupDate && windowValue === "specific") {
      return handleResponse(res, 400, "Please select preferred pickup date");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let pickupDate;
    if (windowValue === "specific") {
      pickupDate = new Date(preferredPickupDate);
    } else {
      pickupDate = preferredPickupDate
        ? new Date(preferredPickupDate)
        : new Date(today.getTime() + resolvedWindowDays * 24 * 60 * 60 * 1000);
    }

    if (Number.isNaN(pickupDate.getTime())) {
      return handleResponse(res, 400, "Invalid preferred pickup date");
    }
    const pickupDay = new Date(pickupDate);
    pickupDay.setHours(0, 0, 0, 0);
    if (pickupDay < today) {
      return handleResponse(res, 400, "Preferred pickup date cannot be in the past");
    }
    const maxDay = new Date(today);
    maxDay.setDate(maxDay.getDate() + 30);
    if (pickupDay > maxDay) {
      return handleResponse(res, 400, "Preferred pickup date cannot be more than 30 days ahead");
    }

    const config = await ParcelConfig.getOrCreate();
    const maxWeightKg = Math.min(50, Math.max(0.1, Number(config.maxWeightKg) || 1));
    const weight = Number(packageDetails.weight || 0);
    if (weight <= 0 || weight > maxWeightKg) {
      return handleResponse(
        res,
        400,
        `Weight must be greater than 0 and maximum ${maxWeightKg} KG`,
      );
    }

    const allowedTypes = (config.packageTypes || [])
      .filter((t) => t?.isActive !== false)
      .map((t) => String(t.value));
    const packageType = String(packageDetails.packageType || "").trim();
    if (!packageType || (allowedTypes.length && !allowedTypes.includes(packageType))) {
      return handleResponse(res, 400, "Invalid package type");
    }

    const speedValue = String(deliverySpeed || "normal").trim().toLowerCase();
    if (!["normal", "express"].includes(speedValue)) {
      return handleResponse(res, 400, "Please select a valid delivery speed");
    }

    // Fare distance = pickup (user) → nearest parcel-hub seller (delivery location).
    const nearest = await findNearestParcelSellerWithDistance(
      Number(pickupAddress.lat),
      Number(pickupAddress.lng),
    );
    if (!nearest) {
      return handleResponse(
        res,
        400,
        "No parcel hub seller is available near your pickup location",
      );
    }
    const distanceKm = nearest.distanceKm;
    const platformCharge =
      Math.round((Number(courierDoc.platformCharge) || 0) * 100) / 100;
    const daily = computeParcelDailyFare({
      config,
      distanceKm,
      weightKg: weight,
      platformCharge,
      deliverySpeed: speedValue,
    });

    const billableDays = resolveParcelBillableDays({
      pickupWindow: windowValue,
      pickupWindowDays: resolvedWindowDays,
      preferredPickupDate: pickupDay,
    });
    const priced = applyBillableDaysToFare(daily, billableDays);

    // Generate 6-digit OTP code
    const otp = generateParcelOtp();

    const parcel = await Parcel.create({
      customerId: req.user.id,
      pickupAddress,
      dropAddress,
      packageDetails,
      courierCompany: courier,
      courierCompanyId: courierDoc._id,
      sellerId: nearest.seller._id,
      deliverySpeed: speedValue,
      destinationCity: city,
      preferredPickupDate: pickupDate,
      pickupWindow: windowValue,
      pickupWindowDays: resolvedWindowDays,
      weight,
      distance: distanceKm,
      fare: priced.fare,
      fareBreakdown: {
        baseFare: priced.baseFare,
        distanceFare: priced.distanceFare,
        weightFare: priced.weightFare,
        platformCharge: priced.platformCharge,
        companyCharge: priced.companyCharge,
        courierCharge: priced.courierCharge,
        expressCharge: priced.expressCharge,
        dailyFare: priced.dailyFare,
        billableDays: priced.billableDays,
      },
      paymentStatus: "PENDING",
      paymentMethod,
      codSettlement: buildInitialCodSettlement(paymentMethod, priced.fare),
      otp,
      status: "REQUESTED",
    });

    const method = String(paymentMethod || "").toUpperCase();

    // UPI: create Razorpay order; broadcast only after payment verify.
    if (method === "UPI") {
      try {
        const razorpay = await createParcelRazorpayOrder(parcel);
        parcel.razorpayOrderId = razorpay.orderId;
        await parcel.save();
        return handleResponse(res, 201, "Complete UPI payment to confirm parcel", {
          parcel,
          requiresPayment: true,
          razorpay,
        });
      } catch (payErr) {
        await Parcel.findByIdAndDelete(parcel._id).catch(() => {});
        console.error("[createParcel] Razorpay order failed:", {
          message: payErr?.message,
          statusCode: payErr?.statusCode,
          error: payErr?.error,
        });
        const status = payErr.statusCode || 500;
        return handleResponse(
          res,
          status,
          payErr.message || "Failed to start Razorpay payment",
        );
      }
    }

    // COD (and any non-UPI): start search immediately.
    const resultParcel = await activateParcelAfterPayment(parcel);
    await notifyParcelRequested(resultParcel, req.user.id);

    return handleResponse(res, 201, "Parcel request created successfully", {
      parcel: resultParcel,
      requiresPayment: false,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Verify Razorpay UPI payment for a parcel, then start rider/seller search.
 */
export const verifyParcelPayment = async (req, res) => {
  try {
    const {
      parcelId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body || {};

    if (!parcelId) {
      return handleResponse(res, 400, "Parcel ID is required");
    }

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    if (String(parcel.customerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this parcel");
    }

    if (String(parcel.paymentMethod).toUpperCase() !== "UPI") {
      return handleResponse(res, 400, "This parcel does not require UPI payment");
    }

    if (parcel.paymentStatus === "PAID") {
      return handleResponse(res, 200, "Parcel already paid", {
        parcel,
        requiresPayment: false,
      });
    }

    verifyParcelRazorpaySignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (parcel.razorpayOrderId && parcel.razorpayOrderId !== razorpayOrderId) {
      return handleResponse(res, 400, "Razorpay order mismatch for this parcel");
    }

    parcel.paymentStatus = "PAID";
    parcel.razorpayOrderId = razorpayOrderId;
    parcel.razorpayPaymentId = razorpayPaymentId;
    await parcel.save();

    const resultParcel = await activateParcelAfterPayment(parcel);
    await notifyParcelRequested(resultParcel, req.user.id);

    return handleResponse(res, 200, "Payment verified. Searching for rider...", {
      parcel: resultParcel,
      requiresPayment: false,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return handleResponse(res, status, error.message);
  }
};

export const getParcelHistory = async (req, res) => {
  try {
    const parcels = await Parcel.find({ customerId: req.user.id })
      .populate("deliveryPartnerId", "name phone vehicleType")
      .sort({ createdAt: -1 });

    return handleResponse(res, 200, "Parcel history retrieved successfully", parcels);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const trackParcel = async (req, res) => {
  try {
    const parcel = await Parcel.findById(req.params.id)
      .populate("customerId", "name phone email")
      .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber profileImage location")
      .populate("sellerId", "shopName location");

    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    const plain = parcel.toObject ? parcel.toObject() : { ...parcel };
    const deadline = getParcelPickupDeadline(plain);
    const lateEligible = canCustomerRequestLateRefund(plain);
    const lateSummary = getParcelLatePickupSummary(plain);
    plain.pickupSla = {
      minutes: String(plain.deliverySpeed || "normal").toLowerCase() === "express" ? 10 : NORMAL_PICKUP_SLA_MINUTES,
      deadlineAt: deadline,
      isLate: isNormalParcelPickupLate(plain),
      canRequestLateRefund: lateEligible.ok === true,
      lateRefundBlockReason: lateEligible.ok ? null : lateEligible.message,
      lateByMinutes: lateSummary?.lateByMinutes ?? 0,
      lateByLabel: lateSummary?.lateByLabel || null,
      acceptedAt: plain.acceptedAt || null,
    };

    return handleResponse(res, 200, "Parcel details retrieved successfully", plain);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const cancelParcelByCustomer = async (req, res) => {
  try {
    const { parcelId } = req.params;
    if (!parcelId) {
      return handleResponse(res, 400, "Parcel ID is required");
    }

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    if (String(parcel.customerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this parcel");
    }

    // Once a delivery partner has accepted, cancel is not allowed.
    if (parcel.deliveryPartnerId) {
      return handleResponse(
        res,
        409,
        "Parcel cannot be cancelled after a delivery partner has accepted the request",
      );
    }

    if (!["REQUESTED", "SEARCHING"].includes(parcel.status)) {
      return handleResponse(
        res,
        409,
        "Parcel cannot be cancelled after a delivery partner has accepted the request",
      );
    }

    // Atomic guard against race with rider accept.
    const updated = await Parcel.findOneAndUpdate(
      {
        _id: parcelId,
        customerId: req.user.id,
        deliveryPartnerId: null,
        status: { $in: ["REQUESTED", "SEARCHING"] },
      },
      {
        $set: {
          status: "CANCELLED",
          searchExpiresAt: null,
        },
        $unset: { searchMeta: 1 },
      },
      { new: true },
    );

    if (!updated) {
      return handleResponse(
        res,
        409,
        "Parcel cannot be cancelled after a delivery partner has accepted the request",
      );
    }

    if (parcel.status === "SEARCHING") {
      cancelParcelSearch(parcel._id);
      await retractParcelBroadcast(String(parcel._id), null);
    }

    emitToAdmins("parcel:status:update", updated);
    emitToCustomer(updated.customerId, {
      event: "parcel:status:update",
      payload: {
        parcelId: String(updated._id),
        status: updated.status,
        parcel: updated,
      },
    });

    return handleResponse(res, 200, "Parcel search cancelled successfully", updated);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ==========================================================================
   ADMIN CONTROLLERS
   ========================================================================== */

export const adminGetParcels = async (req, res) => {
  try {
    const parcels = await Parcel.find()
      .populate("customerId", "name phone email")
      .populate("deliveryPartnerId", "name phone vehicleType")
      .sort({ createdAt: -1 });

    const enriched = parcels.map((doc) => {
      const plain = doc.toObject ? doc.toObject() : { ...doc };
      const lateSummary = getParcelLatePickupSummary(plain);
      if (lateSummary) {
        plain.pickupSla = {
          minutes: lateSummary.slaMinutes,
          deadlineAt: lateSummary.deadlineAt,
          acceptedAt: lateSummary.acceptedAt,
          isLate: lateSummary.isLate,
          lateByMinutes: lateSummary.lateByMinutes,
          lateByLabel: lateSummary.lateByLabel,
          stillAwaitingPickup: lateSummary.stillAwaitingPickup,
        };
      }
      return plain;
    });

    return handleResponse(res, 200, "Parcels retrieved successfully", enriched);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** Fresh single parcel for admin detail modal (includes proof images). */
export const adminGetParcelById = async (req, res) => {
  try {
    const { parcelId } = req.params;
    const parcel = await Parcel.findById(parcelId)
      .populate("customerId", "name phone email")
      .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber profileImage")
      .populate("sellerId", "name shopName phone address location");

    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    const plain = parcel.toObject ? parcel.toObject() : { ...parcel };
    const lateSummary = getParcelLatePickupSummary(plain);
    if (lateSummary) {
      plain.pickupSla = {
        minutes: lateSummary.slaMinutes,
        deadlineAt: lateSummary.deadlineAt,
        acceptedAt: lateSummary.acceptedAt,
        isLate: lateSummary.isLate,
        lateByMinutes: lateSummary.lateByMinutes,
        lateByLabel: lateSummary.lateByLabel,
        stillAwaitingPickup: lateSummary.stillAwaitingPickup,
      };
    }

    return handleResponse(res, 200, "Parcel retrieved successfully", plain);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** Customer: request wallet compensation when Normal pickup exceeds 30 min. */
export const requestParcelLateRefund = async (req, res) => {
  try {
    const { parcelId } = req.params;
    const reason = String(req.body?.reason || "").trim().slice(0, 500);

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }
    if (String(parcel.customerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this parcel");
    }

    const gate = canCustomerRequestLateRefund(parcel);
    if (!gate.ok) {
      return handleResponse(res, 409, gate.message);
    }

    const fare = roundCurrency(Number(parcel.fare) || 0);
    const lateSummary = getParcelLatePickupSummary(parcel);
    parcel.lateRefundRequest = {
      status: "requested",
      reason,
      requestedAt: new Date(),
      requestedAmount: fare,
      measuredAt: lateSummary?.measuredAt || new Date(),
      deadlineAt: lateSummary?.deadlineAt || null,
      lateByMinutes: lateSummary?.lateByMinutes || 0,
      lateByLabel: lateSummary?.lateByLabel || "",
      approvedAmount: 0,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      adminNote: "",
    };
    await parcel.save();

    emitToAdmins("parcel:late-refund:requested", {
      parcelId: String(parcel._id),
      fare,
      customerId: String(parcel.customerId),
      reason,
      lateByMinutes: lateSummary?.lateByMinutes || 0,
      lateByLabel: lateSummary?.lateByLabel || "",
    });

    await sendParcelNotification(
      parcel.customerId,
      "customer",
      "Late refund request submitted",
      "Your late pickup refund request was sent to admin. COD / fare collection is unchanged until admin decides.",
      NOTIFICATION_EVENTS.PARCEL_STATUS_UPDATE,
      parcel._id,
    );

    return handleResponse(res, 200, "Late refund request submitted", parcel);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/** Admin: approve late refund → credit customer wallet (COD still collects full cash). */
export const adminApproveParcelLateRefund = async (req, res) => {
  try {
    const { parcelId } = req.params;
    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }
    if (String(parcel.lateRefundRequest?.status || "none") !== "requested") {
      return handleResponse(res, 400, "No pending late refund request for this parcel");
    }

    const fare = roundCurrency(Number(parcel.fare) || 0);
    let amount = roundCurrency(
      req.body?.amount != null ? Number(req.body.amount) : fare,
    );
    if (!(amount > 0)) {
      return handleResponse(res, 400, "Refund amount must be greater than 0");
    }
    if (fare > 0 && amount > fare) {
      amount = fare;
    }

    const credited = await creditLateRefundToCustomerWallet(
      parcel,
      amount,
      req.user.id,
    );

    parcel.lateRefundRequest.status = "approved";
    parcel.lateRefundRequest.approvedAmount = credited;
    parcel.lateRefundRequest.approvedAt = new Date();
    parcel.lateRefundRequest.approvedBy = req.user.id;
    parcel.lateRefundRequest.adminNote = String(req.body?.note || "").trim().slice(0, 500);
    parcel.markModified("lateRefundRequest");
    await parcel.save();

    // COD: do NOT change collectAmount — rider still collects full cash.
    emitToCustomer(parcel.customerId, {
      event: "parcel:status:update",
      payload: {
        parcelId: String(parcel._id),
        status: parcel.status,
        parcel,
        lateRefundApproved: true,
        lateRefundAmount: credited,
      },
    });

    await sendParcelNotification(
      parcel.customerId,
      "customer",
      "Late refund approved",
      `₹${credited.toFixed(2)} was credited to your wallet for late Normal pickup. ${
        String(parcel.paymentMethod).toUpperCase() === "COD"
          ? "COD cash collection remains the full fare."
          : ""
      }`.trim(),
      NOTIFICATION_EVENTS.PARCEL_STATUS_UPDATE,
      parcel._id,
    );

    return handleResponse(
      res,
      200,
      "Late refund approved and credited to customer wallet",
      parcel,
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adminRejectParcelLateRefund = async (req, res) => {
  try {
    const { parcelId } = req.params;
    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }
    if (String(parcel.lateRefundRequest?.status || "none") !== "requested") {
      return handleResponse(res, 400, "No pending late refund request for this parcel");
    }

    parcel.lateRefundRequest.status = "rejected";
    parcel.lateRefundRequest.rejectedAt = new Date();
    parcel.lateRefundRequest.rejectedBy = req.user.id;
    parcel.lateRefundRequest.adminNote = String(req.body?.note || "").trim().slice(0, 500);
    parcel.markModified("lateRefundRequest");
    await parcel.save();

    emitToCustomer(parcel.customerId, {
      event: "parcel:status:update",
      payload: {
        parcelId: String(parcel._id),
        status: parcel.status,
        parcel,
        lateRefundRejected: true,
      },
    });

    await sendParcelNotification(
      parcel.customerId,
      "customer",
      "Late refund request rejected",
      parcel.lateRefundRequest.adminNote ||
        "Your late pickup refund request was rejected by admin.",
      NOTIFICATION_EVENTS.PARCEL_STATUS_UPDATE,
      parcel._id,
    );

    return handleResponse(res, 200, "Late refund request rejected", parcel);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adminAssignRider = async (req, res) => {
  try {
    const { parcelId, riderId } = req.body;

    if (!parcelId || !riderId) {
      return handleResponse(res, 400, "Parcel ID and Rider ID are required");
    }

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    if (parcel.deliveryPartnerId) {
      return handleResponse(res, 409, "Parcel already has a rider assigned");
    }

    if (parcel.status === "SEARCHING") {
      cancelParcelSearch(parcelId);
      await retractParcelBroadcast(String(parcelId), null);
    }

    const rider = await Delivery.findById(riderId);
    if (!rider) {
      return handleResponse(res, 404, "Delivery partner not found");
    }

    parcel.deliveryPartnerId = riderId;
    parcel.status = "ACCEPTED";
    parcel.acceptedAt = new Date();
    parcel.searchExpiresAt = null;
    parcel.searchMeta = undefined;
    await parcel.save();

    rider.isBusy = await syncDeliveryPartnerBusyFlag(riderId);
    await rider.save();
    // Emit socket event to the rider in real-time
    emitToDelivery(riderId, {
      event: "parcel:assigned",
      payload: parcel
    });

    emitToAdmins("parcel:status:update", parcel);

    // Notify Customer
    await sendParcelNotification(
      parcel.customerId,
      "customer",
      "Rider Assigned",
      `Delivery partner ${rider.name} (${rider.phone}) has been assigned to your parcel.`,
      NOTIFICATION_EVENTS.PARCEL_STATUS_UPDATE,
      parcel._id
    );

    // Notify Rider
    await sendParcelNotification(
      riderId,
      "delivery",
      "New Parcel Delivery Assigned",
      `You have been assigned a new parcel delivery from ${parcel.pickupAddress.fullAddress} to ${parcel.dropAddress.fullAddress}.`,
      NOTIFICATION_EVENTS.PARCEL_ASSIGNED,
      parcel._id
    );

    emitToCustomer(parcel.customerId, {
      event: "parcel:status:update",
      payload: {
        parcelId: String(parcel._id),
        status: "ACCEPTED",
        parcel,
      },
    });

    return handleResponse(res, 200, "Delivery partner assigned successfully", parcel);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminGetPricingConfig = async (req, res) => {
  try {
    const config = await ParcelConfig.getOrCreate();
    return handleResponse(res, 200, "Pricing config retrieved successfully", config);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** Public booking options for customer Package Details form. */
export const getBookingConfig = async (req, res) => {
  try {
    const config = await ParcelConfig.getPublicBookingConfig();
    const courierCompanies = await CourierCompany.listActiveForBooking();
    return handleResponse(res, 200, "Parcel booking config retrieved", {
      ...config,
      courierCompanies: (courierCompanies || []).map((c) => ({
        id: String(c._id),
        name: c.name,
        platformCharge: Math.round((Number(c.platformCharge) || 0) * 100) / 100,
        companyCharge: Math.round((Number(c.companyCharge) || 0) * 100) / 100,
        location: c.location || null,
        isOther: c.isOther === true,
      })),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminUpdatePricingConfig = async (req, res) => {
  try {
    const {
      baseFare,
      perKmCharge,
      weightCharge,
      baseSearchRadiusKm,
      radiusMultiplier,
      riderSharePercent,
      riderBaseFareSharePercent,
      riderDistanceFareSharePercent,
      packageTypes,
      packageCategories,
      maxWeightKg,
      packageDescriptionPlaceholder,
      expressCharge,
    } = req.body;

    const config = await ParcelConfig.getOrCreate();
    if (baseFare !== undefined) config.baseFare = Number(baseFare);
    if (perKmCharge !== undefined) config.perKmCharge = Number(perKmCharge);
    if (weightCharge !== undefined) config.weightCharge = Number(weightCharge);
    if (baseSearchRadiusKm !== undefined) {
      config.baseSearchRadiusKm = Math.min(100, Math.max(1, Number(baseSearchRadiusKm)));
    }
    if (radiusMultiplier !== undefined) {
      config.radiusMultiplier = Math.min(5, Math.max(1, Number(radiusMultiplier)));
    }
    if (riderBaseFareSharePercent !== undefined) {
      config.riderBaseFareSharePercent = Math.min(
        100,
        Math.max(0, Number(riderBaseFareSharePercent)),
      );
    }
    if (riderDistanceFareSharePercent !== undefined) {
      config.riderDistanceFareSharePercent = Math.min(
        100,
        Math.max(0, Number(riderDistanceFareSharePercent)),
      );
    }
    // Keep legacy field in sync as average for older readers.
    if (
      riderBaseFareSharePercent !== undefined ||
      riderDistanceFareSharePercent !== undefined
    ) {
      const basePct = Number(
        config.riderBaseFareSharePercent ?? config.riderSharePercent ?? 80,
      );
      const distPct = Number(
        config.riderDistanceFareSharePercent ?? config.riderSharePercent ?? 80,
      );
      config.riderSharePercent = Math.round((basePct + distPct) / 2);
    } else if (riderSharePercent !== undefined) {
      const pct = Math.min(100, Math.max(0, Number(riderSharePercent)));
      config.riderSharePercent = pct;
      config.riderBaseFareSharePercent = pct;
      config.riderDistanceFareSharePercent = pct;
    }
    if (packageTypes !== undefined) {
      config.packageTypes = ParcelConfig.normalizePackageTypes(packageTypes);
    }
    if (packageCategories !== undefined) {
      config.packageCategories = ParcelConfig.normalizePackageCategories(packageCategories);
    }
    if (maxWeightKg !== undefined) {
      config.maxWeightKg = Math.min(50, Math.max(0.1, Number(maxWeightKg) || 1));
    }
    if (expressCharge !== undefined) {
      config.expressCharge = Math.max(0, Number(expressCharge) || 0);
      config.markModified("expressCharge");
    }
    if (packageDescriptionPlaceholder !== undefined) {
      config.packageDescriptionPlaceholder = String(
        packageDescriptionPlaceholder || "",
      ).trim() || "E.g. keys, critical document papers...";
    }

    await config.save();
    const fresh = await ParcelConfig.findById(config._id).lean();
    return handleResponse(
      res,
      200,
      "Pricing config updated successfully",
      fresh || config,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminGetReports = async (req, res) => {
  try {
    const parcels = await Parcel.find();
    
    const totalDeliveries = parcels.length;
    const completed = parcels.filter(p => p.status === "DELIVERED").length;
    const cancelled = parcels.filter(p => p.status === "CANCELLED").length;
    
    // Revenue is calculated from DELIVERED parcels or PAID paymentStatus
    const revenue = parcels
      .filter(p => p.status === "DELIVERED")
      .reduce((sum, p) => sum + p.fare, 0);

    const settings = await ParcelConfig.getSearchSettings();
    const delivered = parcels.filter((p) => p.status === "DELIVERED");
    const riderPayout = Math.round(
      (delivered.reduce(
        (sum, p) => sum + computeRiderParcelEarnings(p, settings),
        0,
      ) +
        Number.EPSILON) *
        100,
    ) / 100;
    const adminCommission = Math.round(
      (revenue - riderPayout + Number.EPSILON) * 100,
    ) / 100;

    return handleResponse(res, 200, "Reports retrieved successfully", {
      totalDeliveries,
      completed,
      cancelled,
      revenue,
      riderSharePercent: settings.riderSharePercent,
      riderBaseFareSharePercent: settings.riderBaseFareSharePercent,
      riderDistanceFareSharePercent: settings.riderDistanceFareSharePercent,
      riderPayout,
      adminCommission,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminGetActiveDeliveries = async (req, res) => {
  try {
    const activeParcels = await Parcel.find({
      status: { $in: ["SEARCHING", "REQUESTED", "ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED", "PICKED_UP", "OUT_FOR_DELIVERY"] }
    })
      .populate("customerId", "name phone")
      .populate("deliveryPartnerId", "name phone");

    return handleResponse(res, 200, "Active deliveries retrieved successfully", activeParcels);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminResetAllParcelData = async (req, res) => {
  try {
    const confirm = String(req.body?.confirm || "").trim();
    if (confirm !== "RESET_PARCEL") {
      return handleResponse(
        res,
        400,
        'Send { "confirm": "RESET_PARCEL" } to wipe all parcel data.',
      );
    }

    const summary = await resetAllParcelData();
    return handleResponse(res, 200, "All parcel data cleared successfully", summary);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminGetRiders = async (req, res) => {
  try {
    const riders = await Delivery.find({ isVerified: true });
    
    // Sort riders:
    // 1. Available (online, free, parcel-ready) first
    // 2. Others next
    const sortedRiders = [...riders].sort((a, b) => {
      const aAvailable = a.isOnline && !a.isBusy && a.isParcelService;
      const bAvailable = b.isOnline && !b.isBusy && b.isParcelService;
      if (aAvailable && !bAvailable) return -1;
      if (!aAvailable && bAvailable) return 1;
      return 0;
    });

    return handleResponse(res, 200, "Verified riders retrieved successfully", sortedRiders);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ==========================================================================
   DELIVERY PARTNER CONTROLLERS
   ========================================================================== */

export const riderGetAssignedParcels = async (req, res) => {
  try {
    // Return both assigned but not yet accepted or currently in-progress parcels
    const parcels = await Parcel.find({
      deliveryPartnerId: req.user.id,
      status: { $ne: "DELIVERED" }
    })
      .select("-otp")
      .populate("customerId", "name phone")
      .populate("sellerId", "name shopName phone address location")
      .sort({ createdAt: -1 });

    return handleResponse(res, 200, "Assigned parcels retrieved successfully", parcels);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Road route for assigned parcel task map.
 * Query: phase=pickup|seller|agency|drop|full, originLat, originLng.
 * Rider job is pickup (user) → parcel hub seller; courier city is not the map destination.
 */
export const getParcelRoute = async (req, res) => {
  try {
    const { parcelId } = req.params;
    const phase = String(req.query.phase || "seller").toLowerCase();
    const originLat = parseFloat(req.query.originLat);
    const originLng = parseFloat(req.query.originLng);

    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      return handleResponse(res, 400, "originLat and originLng required");
    }

    const parcel = await Parcel.findById(parcelId)
      .populate("sellerId", "location shopName")
      .lean();
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this parcel");
    }

    const pickup = {
      lat: Number(parcel.pickupAddress?.lat),
      lng: Number(parcel.pickupAddress?.lng),
    };
    const drop = {
      lat: Number(parcel.dropAddress?.lat),
      lng: Number(parcel.dropAddress?.lng),
    };

    const sellerCoords = parcel.sellerId?.location?.coordinates;
    const seller =
      Array.isArray(sellerCoords) && sellerCoords.length >= 2
        ? { lat: Number(sellerCoords[1]), lng: Number(sellerCoords[0]) }
        : null;

    if (!Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) {
      return handleResponse(res, 400, "Pickup location missing");
    }

    const origin = { lat: originLat, lng: originLng };
    let dest = pickup;
    if (phase === "seller" || phase === "agency") {
      if (!seller || !Number.isFinite(seller.lat) || !Number.isFinite(seller.lng)) {
        return handleResponse(res, 400, "Seller hub location missing");
      }
      dest = seller;
    } else if (phase === "drop" || phase === "full") {
      if (!Number.isFinite(drop.lat) || !Number.isFinite(drop.lng)) {
        return handleResponse(res, 400, "Drop location missing");
      }
      dest = drop;
    }

    const route = await getCachedRoute(origin, dest, "driving", null, phase);
    return handleResponse(res, 200, "Route", { ...route, destination: dest });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const riderUpdateStatus = async (req, res) => {
  try {
    const { parcelId, status, pickupProofImage } = req.body;

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this parcel");
    }

    const validTransitions = ["ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED", "PICKED_UP", "OUT_FOR_DELIVERY", "CANCELLED"];
    if (!validTransitions.includes(status)) {
      return handleResponse(res, 400, "Invalid status transition");
    }

    // After a rider has accepted, the parcel job cannot be cancelled.
    if (status === "CANCELLED") {
      return handleResponse(
        res,
        409,
        "Parcel cannot be cancelled after a delivery partner has accepted the request",
      );
    }

    // Pickup from customer requires OTP confirmation before hub-drop screen.
    if (status === "PICKED_UP") {
      const providedOtp = String(req.body?.otp || "").trim();
      if (!providedOtp) {
        return handleResponse(
          res,
          400,
          "Enter the customer OTP to confirm parcel pickup",
        );
      }
      if (providedOtp !== String(parcel.otp || "").trim()) {
        return handleResponse(res, 400, "Invalid pickup OTP");
      }
      const proofUrl = String(pickupProofImage || "").trim();
      if (
        !proofUrl ||
        !(
          /^https?:\/\//i.test(proofUrl) ||
          /^data:image\//i.test(proofUrl)
        )
      ) {
        return handleResponse(
          res,
          400,
          "Upload a pickup photo proof at the customer location",
        );
      }
      parcel.pickupProofImage = proofUrl;
    }

    parcel.status = status;

    // COD: rider collects full fare cash from customer at pickup.
    if (status === "PICKED_UP" && isParcelCod(parcel)) {
      if (!parcel.codSettlement) parcel.codSettlement = {};
      parcel.codSettlement.collectAmount = getParcelCollectAmount(parcel);
      if (parcel.codSettlement.status === "COLLECT_PENDING" || !parcel.codSettlement.status) {
        parcel.codSettlement.status = "RIDER_HOLDING";
        parcel.codSettlement.riderCollectedAt = new Date();
      }
    }

    // OTP is only verified at customer pickup. Hub drop needs no OTP/SMS.
    await parcel.save();

    const populated = await Parcel.findById(parcel._id)
      .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber profileImage location")
      .populate("sellerId", "name shopName phone address location");

    emitToAdmins("parcel:status:update", populated || parcel);
    emitToCustomer(parcel.customerId, {
      event: "parcel:status:update",
      payload: {
        parcelId: String(parcel._id),
        status,
        parcel: populated || parcel,
        // Share pickup OTP while captain is going to / at customer.
        otp:
          status === "PICKUP_REACHED" ||
          status === "RIDER_ASSIGNED" ||
          status === "ACCEPTED"
            ? parcel.otp
            : undefined,
      },
    });

    if (status === "CANCELLED") {
      await syncDeliveryPartnerBusyFlag(req.user.id);
    }

    // Map status to customer-friendly notification descriptions
    let msg = "";
    if (status === "ACCEPTED") msg = "Your parcel delivery request has been accepted by the rider.";
    else if (status === "RIDER_ASSIGNED") msg = "Rider is on the way to pick up your parcel.";
    else if (status === "PICKUP_REACHED") {
      msg = `Rider has reached your pickup location. Share pickup OTP ${parcel.otp} with the captain.`;
    }
    else if (status === "PICKED_UP") msg = "Rider has picked up your parcel. Live tracking has ended.";
    else if (status === "OUT_FOR_DELIVERY") msg = "Your parcel has been collected and is being dropped at the seller hub.";
    else if (status === "CANCELLED") msg = "Your parcel delivery was cancelled by the rider.";

    await sendParcelNotification(
      parcel.customerId,
      "customer",
      status === "PICKUP_REACHED"
        ? "Share pickup OTP with captain"
        : `Parcel status: ${status}`,
      msg,
      NOTIFICATION_EVENTS.PARCEL_STATUS_UPDATE,
      parcel._id
    );

    const resultDoc = populated || parcel;
    const resultPayload = resultDoc.toObject ? resultDoc.toObject() : { ...resultDoc };
    // Never expose OTP to the delivery partner response payload.
    delete resultPayload.otp;

    return handleResponse(res, 200, "Parcel status updated successfully", resultPayload);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const riderCompleteDelivery = async (req, res) => {
  try {
    const { parcelId, deliveryProofImage } = req.body;

    if (!parcelId) {
      return handleResponse(res, 400, "Parcel ID is required");
    }

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this parcel");
    }

    // Hub drop: no OTP. Customer OTP already verified at pickup.
    if (!["PICKED_UP", "OUT_FOR_DELIVERY"].includes(parcel.status)) {
      return handleResponse(
        res,
        409,
        "Parcel can only be dropped at hub after customer pickup is confirmed",
      );
    }

    const hubProofUrl = String(deliveryProofImage || "").trim();
    if (
      !hubProofUrl ||
      !(
        /^https?:\/\//i.test(hubProofUrl) ||
        /^data:image\//i.test(hubProofUrl)
      )
    ) {
      return handleResponse(
        res,
        400,
        "Upload a photo proof when dropping the parcel at the hub",
      );
    }

    parcel.status = "DELIVERED";
    parcel.deliveryProofImage = hubProofUrl;

    // COD: rider hands full cash to seller; admin payment waits for seller Razorpay remit.
    // UPI/online: already PAID at booking.
    if (isParcelCod(parcel)) {
      if (!parcel.codSettlement) parcel.codSettlement = {};
      parcel.codSettlement.collectAmount = getParcelCollectAmount(parcel);
      parcel.codSettlement.status = "WITH_SELLER";
      parcel.codSettlement.handedToSellerAt = new Date();
      if (!parcel.codSettlement.riderCollectedAt) {
        parcel.codSettlement.riderCollectedAt = new Date();
      }
      // Keep paymentStatus PENDING until seller remits to admin.
      if (parcel.paymentStatus !== "PAID") {
        parcel.paymentStatus = "PENDING";
      }
    } else {
      parcel.paymentStatus = "PAID";
    }

    await parcel.save();

    try {
      await applyParcelDeliveredRiderEarning(parcel);
    } catch (earnErr) {
      console.error("[parcel] rider earning credit failed:", earnErr?.message || earnErr);
    }

    const populated = await Parcel.findById(parcel._id)
      .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber profileImage location")
      .populate("sellerId", "name shopName phone address location");

    emitToAdmins("parcel:status:update", populated || parcel);
    emitToCustomer(parcel.customerId, {
      event: "parcel:status:update",
      payload: {
        parcelId: String(parcel._id),
        status: "DELIVERED",
        parcel: populated || parcel,
      },
    });

    if (parcel.sellerId) {
      emitToSeller(String(parcel.sellerId?._id || parcel.sellerId), {
        event: "parcel:status:update",
        payload: {
          parcelId: String(parcel._id),
          status: "DELIVERED",
          parcel: populated || parcel,
          codPending:
            isParcelCod(parcel) && parcel.codSettlement?.status === "WITH_SELLER",
        },
      });
    }

    await syncDeliveryPartnerBusyFlag(req.user.id);

    await sendParcelNotification(
      parcel.customerId,
      "customer",
      "Parcel dropped at hub",
      isParcelCod(parcel)
        ? `Your parcel was dropped at the seller hub. COD ₹${getParcelCollectAmount(parcel)} was collected at pickup.`
        : `Your parcel was dropped at the seller hub successfully.`,
      NOTIFICATION_EVENTS.PARCEL_DELIVERED,
      parcel._id
    );

    return handleResponse(res, 200, "Parcel dropped at hub successfully", populated || parcel);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const riderGetEarnings = async (req, res) => {
  try {
    const completedParcels = await Parcel.find({
      deliveryPartnerId: req.user.id,
      status: "DELIVERED"
    });
    const settings = await ParcelConfig.getSearchSettings();

    const totalDeliveries = completedParcels.length;
    const totalEarnings = completedParcels.reduce(
      (sum, p) => sum + computeRiderParcelEarnings(p, settings),
      0,
    );
    const roundedEarnings = Math.round((totalEarnings + Number.EPSILON) * 100) / 100;

    return handleResponse(res, 200, "Rider earnings retrieved successfully", {
      totalDeliveries,
      totalEarnings: roundedEarnings,
      riderBaseFareSharePercent: settings.riderBaseFareSharePercent,
      riderDistanceFareSharePercent: settings.riderDistanceFareSharePercent,
      deliveries: completedParcels,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const riderGetAvailableParcels = async (req, res) => {
  try {
    const parcels = await fetchAvailableParcelsForRider(req.user.id);
    const settings = await ParcelConfig.getSearchSettings();
    const withEarnings = parcels.map((parcel) => ({
      ...parcel,
      riderBaseFareSharePercent: settings.riderBaseFareSharePercent,
      riderDistanceFareSharePercent: settings.riderDistanceFareSharePercent,
      earnings: computeRiderParcelEarnings(parcel, settings),
    }));
    return handleResponse(
      res,
      200,
      withEarnings.length ? "Available parcels fetched" : "No parcels found",
      withEarnings,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const riderAcceptParcel = async (req, res) => {
  try {
    const { parcelId } = req.params;
    const idempotencyKey = req.headers["idempotency-key"] || req.body?.idempotencyKey;

    if (!parcelId) {
      return handleResponse(res, 400, "Parcel ID is required");
    }

    const { parcel, duplicate } = await parcelAcceptAtomic(
      req.user.id,
      parcelId,
      idempotencyKey,
    );

    if (!duplicate) {
      await syncDeliveryPartnerBusyFlag(req.user.id);
    }

    return handleResponse(
      res,
      200,
      duplicate ? "Parcel already accepted" : "Parcel accepted successfully",
      parcel,
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const riderRejectParcel = async (req, res) => {
  try {
    const { parcelId } = req.params;
    if (!parcelId) {
      return handleResponse(res, 400, "Parcel ID is required");
    }

    await parcelRejectAtomic(req.user.id, parcelId);
    return handleResponse(res, 200, "Parcel offer skipped");
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/** Parcel hub sellers: assigned + in-radius searching parcels. */
export const sellerGetParcels = async (req, res) => {
  try {
    const parcels = await fetchParcelsForSeller(req.user.id);
    return handleResponse(res, 200, "Seller parcels retrieved", parcels);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

function assertSellerOwnsParcel(parcel, sellerId) {
  if (!parcel?.sellerId || String(parcel.sellerId) !== String(sellerId)) {
    const err = new Error("You are not assigned to this parcel");
    err.statusCode = 403;
    throw err;
  }
}

/** Seller confirms COD cash received from rider (optional explicit step). */
export const sellerConfirmCodReceived = async (req, res) => {
  try {
    const { parcelId } = req.body;
    const parcel = await Parcel.findById(parcelId);
    if (!parcel) return handleResponse(res, 404, "Parcel not found");
    assertSellerOwnsParcel(parcel, req.user.id);

    if (!isParcelCod(parcel)) {
      return handleResponse(res, 400, "This parcel is not COD");
    }
    if (parcel.status !== "DELIVERED") {
      return handleResponse(res, 400, "Parcel must be delivered before confirming COD cash");
    }

    if (!parcel.codSettlement) parcel.codSettlement = {};
    parcel.codSettlement.collectAmount = getParcelCollectAmount(parcel);
    parcel.codSettlement.status = "WITH_SELLER";
    parcel.codSettlement.sellerConfirmedAt = new Date();
    if (!parcel.codSettlement.handedToSellerAt) {
      parcel.codSettlement.handedToSellerAt = new Date();
    }
    await parcel.save();

    emitToAdmins("parcel:status:update", parcel);
    return handleResponse(res, 200, "COD cash confirmed with seller", parcel);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/** Seller starts Razorpay checkout to remit COD cash to admin. */
export const sellerCreateCodRemitPayment = async (req, res) => {
  try {
    const { parcelId } = req.body;
    const parcel = await Parcel.findById(parcelId);
    if (!parcel) return handleResponse(res, 404, "Parcel not found");
    assertSellerOwnsParcel(parcel, req.user.id);

    if (!isParcelCod(parcel)) {
      return handleResponse(res, 400, "This parcel is not COD");
    }
    if (parcel.status !== "DELIVERED") {
      return handleResponse(res, 400, "Parcel must be delivered before remitting COD");
    }
    if (parcel.codSettlement?.status === "REMITTED_TO_ADMIN" || parcel.paymentStatus === "PAID") {
      return handleResponse(res, 400, "COD already remitted to admin");
    }
    if (
      parcel.codSettlement?.status !== "WITH_SELLER" &&
      parcel.codSettlement?.status !== "RIDER_HOLDING"
    ) {
      // Allow remit once delivered even if status lag; force WITH_SELLER.
      if (!parcel.codSettlement) parcel.codSettlement = {};
      parcel.codSettlement.status = "WITH_SELLER";
      parcel.codSettlement.handedToSellerAt =
        parcel.codSettlement.handedToSellerAt || new Date();
    }

    const amount = getParcelCollectAmount(parcel);
    if (amount <= 0) {
      return handleResponse(res, 400, "Invalid COD collect amount");
    }
    parcel.codSettlement.collectAmount = amount;

    const razorpay = await createParcelCodRemitRazorpayOrder(parcel, req.user.id);
    parcel.codSettlement.sellerRazorpayOrderId = razorpay.orderId;
    await parcel.save();

    return handleResponse(res, 200, "Complete Razorpay payment to remit COD to admin", {
      parcel,
      razorpay,
      collectAmount: amount,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/** Verify seller Razorpay remittance — marks COD paid to admin. */
export const sellerVerifyCodRemitPayment = async (req, res) => {
  try {
    const {
      parcelId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body;

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) return handleResponse(res, 404, "Parcel not found");
    assertSellerOwnsParcel(parcel, req.user.id);

    if (!isParcelCod(parcel)) {
      return handleResponse(res, 400, "This parcel is not COD");
    }
    if (parcel.codSettlement?.status === "REMITTED_TO_ADMIN" && parcel.paymentStatus === "PAID") {
      return handleResponse(res, 200, "COD already remitted", parcel);
    }

    verifyParcelRazorpaySignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (
      parcel.codSettlement?.sellerRazorpayOrderId &&
      parcel.codSettlement.sellerRazorpayOrderId !== razorpayOrderId
    ) {
      return handleResponse(res, 400, "Razorpay order mismatch");
    }

    if (!parcel.codSettlement) parcel.codSettlement = {};
    parcel.codSettlement.status = "REMITTED_TO_ADMIN";
    parcel.codSettlement.remittedAt = new Date();
    parcel.codSettlement.sellerConfirmedAt =
      parcel.codSettlement.sellerConfirmedAt || new Date();
    parcel.codSettlement.sellerRazorpayOrderId = razorpayOrderId;
    parcel.codSettlement.sellerRazorpayPaymentId = razorpayPaymentId;
    parcel.codSettlement.collectAmount = getParcelCollectAmount(parcel);
    parcel.paymentStatus = "PAID";
    await parcel.save();

    emitToAdmins("parcel:status:update", parcel);
    emitToSeller(String(req.user.id), {
      event: "parcel:status:update",
      payload: { parcelId: String(parcel._id), status: parcel.status, parcel },
    });

    return handleResponse(res, 200, "COD remitted to admin successfully", parcel);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
