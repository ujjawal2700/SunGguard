import CityParcel, { RIDER_SAFE_FIELDS } from "../models/cityParcel.js";
import CityParcelConfig from "../models/cityParcelConfig.js";
import CityParcelEvent from "../models/cityParcelEvent.js";
import { handleResponse } from "../utils/helper.js";
import { transition, recordEvent } from "../services/cityParcelStateMachine.js";
import {
  quoteTrip,
  checkServiceability,
  computeCityParcelFare,
  computeRiderEarning,
  computeDeliverySla,
} from "../services/cityParcelFareService.js";
import {
  startBroadcast,
  fetchAvailableForRider,
  acceptAtomic,
  skipJob,
} from "../services/cityParcelWorkflowService.js";
import {
  issueOtp,
  resendOtp,
  verifyOtp,
  checkDropProximity,
  verifyDeliveryHandover,
} from "../services/cityParcelVerificationService.js";
import {
  recordFailedAttempt,
  applyCustomerChoice,
  flagCustomerUnreachable,
} from "../services/cityParcelReturnService.js";
import {
  creditDeliveryEarning,
  creditReturnEarning,
  releaseWithheldPayout,
} from "../services/cityParcelSettlementService.js";
import {
  syncDeliveryPartnerBusyFlag,
  markDeliveryPartnerBusy,
  deliveryPartnerHasActiveJob,
} from "../services/deliveryBusyService.js";
import Delivery from "../models/delivery.js";
import {
  createCityParcelOrder,
  verifyCityParcelSignature,
  isRazorpayConfigured,
} from "../services/cityParcelRazorpayService.js";
import {
  notifyRiderAssigned,
  notifyCustomerOfStatus,
} from "../services/cityParcelNotifyService.js";
import { emitToCustomer, emitToAdmins, emitToDelivery } from "../services/orderSocketEmitter.js";
import {
  CITY_PARCEL_STATUS as S,
  CITY_PARCEL_RETURN_STATUS as R,
  CITY_PARCEL_OTP_TYPE,
  CITY_PARCEL_EVENT_ACTOR,
} from "../constants/cityParcelWorkflow.js";
import logger from "../services/logger.js";

/** Turn a thrown service error into the status code it asked for. */
function fail(res, error, fallback = 500) {
  const code = Number(error?.statusCode) || fallback;
  return handleResponse(res, code, error?.message || "Something went wrong");
}

/* ==========================================================================
   CUSTOMER
   ========================================================================== */

export const getBookingConfig = async (req, res) => {
  try {
    const config = await CityParcelConfig.getConfig();
    if (!config.isEnabled) {
      return handleResponse(res, 200, "City delivery is unavailable", {
        isEnabled: false,
      });
    }
    return handleResponse(res, 200, "Booking config", {
      isEnabled: true,
      packageTypes: config.packageTypes.filter((t) => t.isActive),
      packageDescriptionPlaceholder: config.packageDescriptionPlaceholder,
      maxWeightKg: config.maxWeightKg,
      maxTripDistanceKm: config.maxTripDistanceKm,
      baseFare: config.baseFare,
      perKmCharge: config.perKmCharge,
      weightCharge: config.weightCharge,
      minFare: config.minFare,
      expressCharge: config.expressCharge,
    });
  } catch (error) {
    return fail(res, error);
  }
};

export const getServiceability = async (req, res) => {
  try {
    const { pickupLat, pickupLng, dropLat, dropLng } = req.query;
    const result = await checkServiceability({
      pickup: { lat: pickupLat, lng: pickupLng },
      drop: { lat: dropLat, lng: dropLng },
    });
    return handleResponse(res, 200, "Serviceability", result);
  } catch (error) {
    return fail(res, error);
  }
};

export const calculateFare = async (req, res) => {
  try {
    const { pickupAddress, dropAddress, package: pkg, deliverySpeed } = req.body;

    const quote = await quoteTrip({
      pickup: pickupAddress,
      drop: dropAddress,
      weightKg: pkg?.weightKg,
      deliverySpeed,
    });

    if (!quote.serviceable) {
      return handleResponse(res, 400, quote.reason, {
        code: quote.code,
        distanceKm: quote.distanceKm,
      });
    }

    return handleResponse(res, 200, "Fare calculated", {
      distanceKm: quote.distanceKm,
      distanceSource: quote.distanceSource,
      fare: quote.fare,
      fareBreakdown: quote.fareBreakdown,
      etaMinutes: quote.etaMinutes,
      deliveryEta: quote.deliveryEta,
    });
  } catch (error) {
    return fail(res, error);
  }
};

export const createCityParcel = async (req, res) => {
  try {
    const {
      pickupAddress,
      dropAddress,
      receiver,
      package: pkg,
      deliverySpeed = "normal",
      paymentMethod,
    } = req.body;

    const quote = await quoteTrip({
      pickup: pickupAddress,
      drop: dropAddress,
      weightKg: pkg?.weightKg,
      deliverySpeed,
    });

    if (!quote.serviceable) {
      return handleResponse(res, 400, quote.reason, { code: quote.code });
    }

    const isCod = String(paymentMethod).toUpperCase() === "COD";
    const sla = computeDeliverySla({
      distanceKm: quote.distanceKm,
      config: quote.config,
    });

    const parcel = await CityParcel.createWithReference({
      customerId: req.user.id,
      receiver: {
        name: receiver.name,
        phone: receiver.phone,
        altPhone: receiver.altPhone || "",
        allowAlternate: Boolean(receiver.allowAlternate),
      },
      pickupAddress,
      dropAddress,
      package: pkg,
      distanceKm: quote.distanceKm,
      deliverySpeed,
      fare: quote.fare,
      fareBreakdown: quote.fareBreakdown,
      paymentMethod: String(paymentMethod).toUpperCase(),
      paymentStatus: "PENDING",
      codCollection: isCod
        ? { amount: quote.fare, status: "COLLECT_PENDING" }
        : { amount: 0, status: "NOT_APPLICABLE" },
      deliveryEta: sla.deliveryEta,
      deliveryDeadline: sla.deliveryDeadline,
      trackToDoor: true,
      status: S.REQUESTED,
    });

    await recordEvent({
      cityParcelId: parcel._id,
      status: S.REQUESTED,
      actor: CITY_PARCEL_EVENT_ACTOR.CUSTOMER,
      actorId: req.user.id,
      note: "Booking created",
    });

    // COD needs no gateway step — start looking for a rider immediately.
    if (isCod) {
      const { parcel: searching } = await startBroadcast(parcel._id);
      return handleResponse(res, 201, "Looking for a delivery partner", {
        parcel: searching,
        requiresPayment: false,
      });
    }

    // Online payment: open a Razorpay order now and hand the client what it
    // needs to launch checkout. The parcel stays REQUESTED and unbroadcast
    // until a verified signature comes back — no rider is dispatched against
    // money that has not actually moved.
    if (!isRazorpayConfigured()) {
      await CityParcel.findByIdAndUpdate(parcel._id, {
        $set: {
          status: S.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: "Online payment unavailable",
        },
      });
      return handleResponse(
        res,
        503,
        "Online payment is unavailable right now. Choose cash on pickup.",
      );
    }

    try {
      const razorpay = await createCityParcelOrder(parcel);
      parcel.razorpayOrderId = razorpay.orderId;
      await parcel.save();

      return handleResponse(res, 201, "Complete payment to confirm", {
        parcel,
        requiresPayment: true,
        razorpay,
      });
    } catch (payErr) {
      await CityParcel.findByIdAndUpdate(parcel._id, {
        $set: {
          status: S.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: "Could not start payment",
        },
      });
      return fail(res, payErr);
    }
  } catch (error) {
    return fail(res, error);
  }
};

/**
 * Confirm an online payment and release the parcel to riders.
 *
 * The signature is the whole point: it is an HMAC only Razorpay can produce,
 * so it proves the gateway actually took the money. The previous version of
 * this endpoint marked the booking PAID on request alone, which meant anyone
 * who could call it got a free delivery.
 */
export const verifyPayment = async (req, res) => {
  try {
    const { cityParcelId } = req.params;
    const {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body || {};

    const parcel = await CityParcel.findOne({
      _id: cityParcelId,
      customerId: req.user.id,
    });
    if (!parcel) return handleResponse(res, 404, "Booking not found");

    // Replaying a verification must not start a second search.
    if (parcel.paymentStatus === "PAID") {
      return handleResponse(res, 200, "Already paid", { parcel });
    }
    if (parcel.isCod()) {
      return handleResponse(res, 400, "This booking is cash on pickup");
    }
    if (parcel.status !== S.REQUESTED) {
      return handleResponse(res, 409, "This booking is already in progress");
    }

    // The order id must be the one we opened, not one supplied by the caller.
    if (
      parcel.razorpayOrderId &&
      String(razorpayOrderId) !== String(parcel.razorpayOrderId)
    ) {
      return handleResponse(res, 400, "This payment belongs to another booking");
    }

    try {
      verifyCityParcelSignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      });
    } catch (sigErr) {
      await CityParcel.findByIdAndUpdate(cityParcelId, {
        $set: { paymentStatus: "FAILED" },
      });
      logger.warn("City parcel payment verification failed", {
        referenceId: parcel.referenceId,
        reason: sigErr?.code || sigErr?.message,
      });
      return fail(res, sigErr);
    }

    parcel.paymentStatus = "PAID";
    parcel.razorpayPaymentId = razorpayPaymentId;
    await parcel.save();

    await recordEvent({
      cityParcelId: parcel._id,
      status: S.REQUESTED,
      previousStatus: S.REQUESTED,
      actor: CITY_PARCEL_EVENT_ACTOR.CUSTOMER,
      actorId: req.user.id,
      note: "Payment confirmed",
      meta: { razorpayPaymentId },
    });

    const { parcel: searching } = await startBroadcast(parcel._id);
    return handleResponse(res, 200, "Payment confirmed", { parcel: searching });
  } catch (error) {
    return fail(res, error);
  }
};

export const getHistory = async (req, res) => {
  try {
    const parcels = await CityParcel.find({ customerId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber")
      .lean();
    return handleResponse(res, 200, "History", { parcels });
  } catch (error) {
    return fail(res, error);
  }
};

export const trackCityParcel = async (req, res) => {
  try {
    const parcel = await CityParcel.findOne({
      _id: req.params.cityParcelId,
      customerId: req.user.id,
    })
      .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber profileImage location")
      .lean();

    if (!parcel) return handleResponse(res, 404, "Parcel not found");

    const timeline = await CityParcelEvent.find({ cityParcelId: parcel._id })
      .sort({ at: 1 })
      .lean();

    return handleResponse(res, 200, "Tracking", { parcel, timeline });
  } catch (error) {
    return fail(res, error);
  }
};

/** The customer's answer to "we could not deliver — what now?". */
export const respondToFailedDelivery = async (req, res) => {
  try {
    const result = await applyCustomerChoice({
      cityParcelId: req.params.cityParcelId,
      customerId: req.user.id,
      choice: req.body.choice,
      newAddress: req.body.newAddress || null,
    });

    return handleResponse(
      res,
      200,
      result.action === "RETRY"
        ? "We will try again"
        : "Your parcel is on its way back to you",
      result,
    );
  } catch (error) {
    return fail(res, error);
  }
};

/**
 * The code the customer has to read out — at pickup, or when a failed parcel
 * comes back to them.
 *
 * Codes are stored hashed and cannot be read back, so "show me my code"
 * necessarily means "issue a fresh one". That is the safer behaviour anyway:
 * anything already spoken aloud stops working.
 */
export const getMyCode = async (req, res) => {
  try {
    const parcel = await CityParcel.findOne({
      _id: req.params.cityParcelId,
      customerId: req.user.id,
    })
      .populate("customerId", "phone")
      .lean();

    if (!parcel) return handleResponse(res, 404, "Parcel not found");

    // Which code is live depends on where the parcel is in its life.
    const type =
      parcel.status === S.RETURN_IN_TRANSIT
        ? CITY_PARCEL_OTP_TYPE.RETURN_DROP
        : CITY_PARCEL_OTP_TYPE.PICKUP;

    const stillNeedsPickupCode = [
      S.ACCEPTED,
      S.RIDER_ASSIGNED,
      S.PICKUP_REACHED,
    ].includes(parcel.status);

    if (type === CITY_PARCEL_OTP_TYPE.PICKUP && !stillNeedsPickupCode) {
      return handleResponse(res, 409, "There is no code to share right now");
    }

    const phone = parcel.customerId?.phone;
    if (!phone) {
      return handleResponse(res, 400, "Add a phone number to your profile first");
    }

    const result = await issueOtp({
      cityParcelId: parcel._id,
      type,
      phone,
      referenceId: parcel.referenceId,
    });

    return handleResponse(res, 200, "Code sent to your phone", {
      type,
      sentToPhone: `••••••${String(phone).slice(-4)}`,
      expiresAt: result.expiresAt,
      // Present only in mock mode, so the flow is usable before launch.
      devCode: result.devCode,
    });
  } catch (error) {
    return fail(res, error);
  }
};

export const cancelCityParcel = async (req, res) => {
  try {
    const parcel = await CityParcel.findOne({
      _id: req.params.cityParcelId,
      customerId: req.user.id,
    });
    if (!parcel) return handleResponse(res, 404, "Parcel not found");

    // Once a rider is holding the parcel there is nothing to cancel — the
    // only way out is a return, which is a different thing entirely.
    if (parcel.isInRiderCustody()) {
      return handleResponse(
        res,
        409,
        "The rider already has your parcel. Ask for it to be brought back instead.",
      );
    }

    const updated = await transition({
      cityParcelId: parcel._id,
      to: S.CANCELLED,
      set: { cancelledAt: new Date(), cancelReason: req.body?.reason || "" },
      unset: { searchExpiresAt: 1 },
      actor: CITY_PARCEL_EVENT_ACTOR.CUSTOMER,
      actorId: req.user.id,
      note: "Cancelled by customer",
    });

    if (updated.deliveryPartnerId) {
      emitToDelivery(updated.deliveryPartnerId, {
        event: "cityparcel:cancelled",
        payload: { cityParcelId: String(updated._id) },
      });
      await syncDeliveryPartnerBusyFlag(updated.deliveryPartnerId);
    }
    emitToAdmins("cityparcel:status:update", updated);

    return handleResponse(res, 200, "Cancelled", { parcel: updated });
  } catch (error) {
    return fail(res, error);
  }
};

/* ==========================================================================
   RIDER
   ========================================================================== */

/** Rider-facing explanations for an empty list. */
const NO_JOBS_MESSAGE = {
  OFFLINE: "You're offline. Go online to receive city deliveries.",
  NOT_APPROVED: "Your account is still pending approval.",
  PARCEL_DISABLED: "Parcel delivery isn't enabled on your account.",
  NO_LOCATION: "We can't read your location. Turn GPS on to see jobs near you.",
  ON_A_JOB: "Finish your current job to take another.",
  NONE_NEARBY: "No city deliveries waiting near you right now.",
  INVALID_RIDER: "We couldn't load your account.",
};

export const riderGetAvailable = async (req, res) => {
  try {
    const { parcels, reason, canAccept } = await fetchAvailableForRider(req.user.id);

    return handleResponse(res, 200, "Available jobs", {
      parcels,
      reason,
      canAccept: canAccept !== false,
      // So the app never has to guess why the list is empty.
      hint: reason === "OK" ? "" : NO_JOBS_MESSAGE[reason] || "",
    });
  } catch (error) {
    return fail(res, error);
  }
};

export const riderGetAssigned = async (req, res) => {
  try {
    const parcels = await CityParcel.find({
      deliveryPartnerId: req.user.id,
      status: { $nin: [S.DELIVERED, S.RETURNED, S.CANCELLED] },
    })
      // receiver.phone is selected so the last four can be derived below, and
      // is stripped before the response leaves. Selecting only receiver.name
      // left phoneLast4 empty, which made the read-back check impossible to
      // satisfy and blocked every delivery from the rider app.
      .select(
        RIDER_SAFE_FIELDS +
          " receiver.name receiver.phone receiver.allowAlternate customerId",
      )
      .populate("customerId", "name phone")
      .sort({ createdAt: -1 })
      .lean();

    // The receiver's full number is never sent to the rider app. They see
    // the last four to read back, which is all the check requires.
    const masked = parcels.map((p) => {
      // Destructured out rather than spread over: spreading the receiver and
      // adding phoneLast4 would keep the full number in the payload.
      const { phone, ...receiverSafe } = p.receiver || {};
      return {
        ...p,
        receiver: {
          ...receiverSafe,
          phoneLast4: String(phone || "").replace(/\D/g, "").slice(-4),
        },
      };
    });

    return handleResponse(res, 200, "Assigned jobs", { parcels: masked });
  } catch (error) {
    return fail(res, error);
  }
};

export const riderAccept = async (req, res) => {
  try {
    const result = await acceptAtomic({
      deliveryId: req.user.id,
      cityParcelId: req.params.cityParcelId,
      idempotencyKey: req.headers["idempotency-key"] || null,
    });

    // The customer's pickup code is issued the moment a rider is on the way.
    if (!result.duplicate) {
      const customerPhone = result.parcel.customerId?.phone;
      if (customerPhone) {
        await issueOtp({
          cityParcelId: result.parcel._id,
          type: CITY_PARCEL_OTP_TYPE.PICKUP,
          phone: customerPhone,
          referenceId: result.parcel.referenceId,
        });
      }
    }

    return handleResponse(res, 200, "Job accepted", result);
  } catch (error) {
    return fail(res, error);
  }
};

export const riderSkip = async (req, res) => {
  try {
    await skipJob({ deliveryId: req.user.id, cityParcelId: req.params.cityParcelId });
    return handleResponse(res, 200, "Skipped");
  } catch (error) {
    return fail(res, error);
  }
};

/** Movement between milestones that need no verification. */
export const riderUpdateStatus = async (req, res) => {
  try {
    const { cityParcelId } = req.params;
    const { status, location } = req.body;

    const parcel = await CityParcel.findById(cityParcelId).select(
      "deliveryPartnerId status",
    );
    if (!parcel) return handleResponse(res, 404, "Parcel not found");
    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "This is not your job");
    }

    const updated = await transition({
      cityParcelId,
      to: status,
      actor: CITY_PARCEL_EVENT_ACTOR.RIDER,
      actorId: req.user.id,
      location,
      note: `Rider marked ${status}`,
    });

    emitToCustomer(updated.customerId, {
      event: "cityparcel:status:update",
      payload: { cityParcelId, status, parcel: updated },
    });
    emitToAdmins("cityparcel:status:update", updated);

    return handleResponse(res, 200, "Status updated", { parcel: updated });
  } catch (error) {
    return fail(res, error);
  }
};

/** Collect from the customer at point A. */
export const riderVerifyPickup = async (req, res) => {
  try {
    const { cityParcelId } = req.params;
    const { otp, proofImage, location } = req.body;

    const parcel = await CityParcel.findById(cityParcelId);
    if (!parcel) return handleResponse(res, 404, "Parcel not found");
    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "This is not your job");
    }

    const proximity = await checkDropProximity({
      target: parcel.pickupAddress,
      riderLocation: location,
      deliveryPartnerId: req.user.id,
    });
    if (!proximity.passed && proximity.reason === "TOO_FAR") {
      return handleResponse(res, 400, proximity.message, { proximity });
    }

    const otpResult = await verifyOtp({
      cityParcelId,
      type: CITY_PARCEL_OTP_TYPE.PICKUP,
      code: otp,
    });
    if (!otpResult.ok) {
      return handleResponse(res, 400, otpResult.message, { reason: otpResult.reason });
    }

    const isCod = parcel.isCod();
    const updated = await transition({
      cityParcelId,
      to: S.PICKED_UP,
      expectedFrom: [S.PICKUP_REACHED],
      set: {
        pickupProofImage: proofImage,
        pickedUpAt: new Date(),
        ...(isCod
          ? {
              "codCollection.status": "RIDER_HOLDING",
              "codCollection.collectedAt": new Date(),
            }
          : {}),
      },
      actor: CITY_PARCEL_EVENT_ACTOR.RIDER,
      actorId: req.user.id,
      location,
      note: "Collected from the customer",
    });

    // The receiver's code goes out now, so it is waiting on their phone
    // by the time the rider arrives.
    await issueOtp({
      cityParcelId,
      type: CITY_PARCEL_OTP_TYPE.DELIVERY,
      phone: updated.receiver.phone,
      referenceId: updated.referenceId,
    });

    emitToCustomer(updated.customerId, {
      event: "cityparcel:status:update",
      payload: { cityParcelId, status: S.PICKED_UP, parcel: updated },
    });
    emitToAdmins("cityparcel:status:update", updated);

    return handleResponse(res, 200, "Picked up", { parcel: updated });
  } catch (error) {
    return fail(res, error);
  }
};

export const riderSendDeliveryOtp = async (req, res) => {
  try {
    const parcel = await CityParcel.findById(req.params.cityParcelId).lean();
    if (!parcel) return handleResponse(res, 404, "Parcel not found");
    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "This is not your job");
    }

    const result = req.body?.resend
      ? await resendOtp({
          cityParcelId: parcel._id,
          type: CITY_PARCEL_OTP_TYPE.DELIVERY,
          phone: parcel.receiver.phone,
          referenceId: parcel.referenceId,
        })
      : await issueOtp({
          cityParcelId: parcel._id,
          type: CITY_PARCEL_OTP_TYPE.DELIVERY,
          phone: parcel.receiver.phone,
          referenceId: parcel.referenceId,
        });

    return handleResponse(res, 200, "Code sent to the receiver", result);
  } catch (error) {
    return fail(res, error);
  }
};

/** Live read of the proximity gate, so the app can warn before submitting. */
export const riderCheckProximity = async (req, res) => {
  try {
    const parcel = await CityParcel.findById(req.params.cityParcelId)
      .select("dropAddress deliveryPartnerId")
      .lean();
    if (!parcel) return handleResponse(res, 404, "Parcel not found");
    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "This is not your job");
    }

    const proximity = await checkDropProximity({
      target: parcel.dropAddress,
      riderLocation: {
        lat: req.query.lat,
        lng: req.query.lng,
        accuracyM: req.query.accuracyM,
      },
      deliveryPartnerId: req.user.id,
    });

    return handleResponse(res, 200, "Proximity", proximity);
  } catch (error) {
    return fail(res, error);
  }
};

/** The handover at point B — the terminal call for a successful delivery. */
export const riderVerifyDelivery = async (req, res) => {
  try {
    const { cityParcelId } = req.params;
    const {
      otp,
      nameConfirmed,
      phoneLast4,
      proofImage,
      location,
      receivedByName = "",
      relationToReceiver = "",
      overrideReason = "",
    } = req.body;

    const parcel = await CityParcel.findById(cityParcelId);
    if (!parcel) return handleResponse(res, 404, "Parcel not found");
    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "This is not your job");
    }

    // Handing to someone other than the named receiver is only allowed if
    // the customer said so when they booked.
    if (receivedByName && !parcel.receiver.allowAlternate) {
      return handleResponse(
        res,
        400,
        `Only ${parcel.receiver.name} can take this parcel. If they are not there, report a failed attempt.`,
      );
    }

    const verdict = await verifyDeliveryHandover({
      parcel,
      otp,
      nameConfirmed,
      phoneLast4,
      riderLocation: location,
      overrideReason,
    });

    if (!verdict.ok) {
      return handleResponse(res, 400, verdict.message, {
        reason: verdict.reason,
        proximity: verdict.proximity,
        canOverride: verdict.canOverride,
      });
    }

    const updated = await transition({
      cityParcelId,
      to: S.DELIVERED,
      expectedFrom: [S.DROP_REACHED, S.OUT_FOR_DELIVERY],
      set: {
        deliveredAt: new Date(),
        deliveryProofImage: proofImage,
        payoutWithheld: verdict.withholdPayout,
        "receiver.receivedByName": receivedByName,
        "receiver.relationToReceiver": relationToReceiver,
        "dropVerification.otpVerifiedAt": verdict.verifiedAt,
        "dropVerification.nameConfirmed": true,
        "dropVerification.phoneLast4": phoneLast4,
        "dropVerification.photoUrl": proofImage,
        "dropVerification.riderLat": verdict.proximity.lat ?? null,
        "dropVerification.riderLng": verdict.proximity.lng ?? null,
        "dropVerification.distanceMeters": verdict.proximity.distanceMeters ?? null,
        "dropVerification.gpsAccuracyM": verdict.proximity.gpsAccuracyM ?? null,
        "dropVerification.proximityPassed": verdict.proximity.passed,
        "dropVerification.overrideReason": verdict.overridden ? overrideReason : "",
        ...(parcel.isCod() ? { paymentStatus: "PAID" } : {}),
      },
      actor: CITY_PARCEL_EVENT_ACTOR.RIDER,
      actorId: req.user.id,
      location,
      note: verdict.overridden
        ? "Delivered — completed past the location check, pending review"
        : "Delivered and verified",
      meta: { overridden: verdict.overridden },
    });

    await creditDeliveryEarning(updated);
    await syncDeliveryPartnerBusyFlag(req.user.id);

    emitToCustomer(updated.customerId, {
      event: "cityparcel:status:update",
      payload: { cityParcelId, status: S.DELIVERED, parcel: updated },
    });
    emitToAdmins("cityparcel:status:update", updated);

    if (verdict.overridden) {
      emitToAdmins("cityparcel:override-review", {
        cityParcelId: String(updated._id),
        referenceId: updated.referenceId,
        overrideReason,
        proximity: verdict.proximity,
      });
      logger.warn("City parcel delivered past proximity gate", {
        referenceId: updated.referenceId,
        distanceMeters: verdict.proximity.distanceMeters,
      });
    }

    return handleResponse(res, 200, "Delivered", {
      parcel: updated,
      payoutWithheld: verdict.withholdPayout,
    });
  } catch (error) {
    return fail(res, error);
  }
};

export const riderReportFailedAttempt = async (req, res) => {
  try {
    const result = await recordFailedAttempt({
      cityParcelId: req.params.cityParcelId,
      deliveryId: req.user.id,
      outcome: req.body.outcome,
      note: req.body.note,
      photoUrl: req.body.photoUrl,
      calledAt: req.body.calledAt,
      waitedMinutes: req.body.waitedMinutes,
      location: req.body.location,
    });

    return handleResponse(
      res,
      200,
      result.isLastAttempt
        ? "Logged. We have asked the customer where to return it."
        : "Logged. We have asked the customer what to do.",
      result,
    );
  } catch (error) {
    return fail(res, error);
  }
};

/** Hand a returned parcel back to the customer at point A. */
export const riderVerifyReturn = async (req, res) => {
  try {
    const { cityParcelId } = req.params;
    const { otp, proofImage, location } = req.body;

    const parcel = await CityParcel.findById(cityParcelId);
    if (!parcel) return handleResponse(res, 404, "Parcel not found");
    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "This is not your job");
    }

    const target = parcel.returnLeg?.returnAddress || parcel.pickupAddress;
    const proximity = await checkDropProximity({
      target,
      riderLocation: location,
      deliveryPartnerId: req.user.id,
    });
    if (!proximity.passed && proximity.reason === "TOO_FAR") {
      return handleResponse(res, 400, proximity.message, { proximity });
    }

    const otpResult = await verifyOtp({
      cityParcelId,
      type: CITY_PARCEL_OTP_TYPE.RETURN_DROP,
      code: otp,
    });
    if (!otpResult.ok) {
      return handleResponse(res, 400, otpResult.message, { reason: otpResult.reason });
    }

    const updated = await transition({
      cityParcelId,
      to: S.RETURNED,
      expectedFrom: [S.RETURN_IN_TRANSIT],
      set: {
        returnProofImage: proofImage,
        "returnLeg.status": R.RETURNED,
        "returnLeg.returnedAt": new Date(),
      },
      actor: CITY_PARCEL_EVENT_ACTOR.RIDER,
      actorId: req.user.id,
      location,
      note: "Returned to the customer",
    });

    // The rider is paid for the return leg. The failure was not theirs.
    await creditReturnEarning(updated);
    await syncDeliveryPartnerBusyFlag(req.user.id);

    emitToCustomer(updated.customerId, {
      event: "cityparcel:status:update",
      payload: { cityParcelId, status: S.RETURNED, parcel: updated },
    });
    emitToAdmins("cityparcel:status:update", updated);

    return handleResponse(res, 200, "Returned to the customer", { parcel: updated });
  } catch (error) {
    return fail(res, error);
  }
};

export const riderReportCustomerUnreachable = async (req, res) => {
  try {
    const updated = await flagCustomerUnreachable({
      cityParcelId: req.params.cityParcelId,
      deliveryId: req.user.id,
      note: req.body?.note || "",
    });
    return handleResponse(res, 200, "Escalated to support", { parcel: updated });
  } catch (error) {
    return fail(res, error);
  }
};

/* ==========================================================================
   ADMIN
   ========================================================================== */

/**
 * Build the query for the admin parcel list.
 *
 * Kept separate from the handler so the stats endpoint below counts exactly
 * what the list shows — a total that disagrees with the rows underneath it is
 * worse than no total.
 */
function buildAdminParcelFilter(query = {}) {
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.withheld === "true") filter.payoutWithheld = true;
  if (query.stuck === "true") filter["returnLeg.status"] = R.CUSTOMER_UNREACHABLE;
  if (query.paymentMethod) {
    filter.paymentMethod = String(query.paymentMethod).toUpperCase();
  }

  // Booked between two dates. `to` covers the whole day, not the instant
  // midnight begins, or a same-day filter returns nothing.
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
    filter.createdAt = {};
    if (from && !Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
    if (to && !Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }

  // One box that searches the things support actually gets given on a call:
  // a waybill number, or somebody's phone.
  const search = String(query.search || "").trim();
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$or = [
      { referenceId: rx },
      { "receiver.name": rx },
      { "receiver.phone": rx },
      { "pickupAddress.fullAddress": rx },
      { "dropAddress.fullAddress": rx },
    ];
  }

  return filter;
}

export const adminList = async (req, res) => {
  try {
    const filter = buildAdminParcelFilter(req.query);

    // Capped regardless of what is asked for: an admin screen that tries to
    // render every parcel ever booked will hang the browser.
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const [parcels, total] = await Promise.all([
      CityParcel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("customerId", "name phone")
        .populate("deliveryPartnerId", "name phone")
        .lean(),
      CityParcel.countDocuments(filter),
    ]);

    return handleResponse(res, 200, "City parcels", {
      parcels,
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return fail(res, error);
  }
};

/**
 * Headline numbers for the console.
 *
 * Counts run against the same filter as the list, so the summary always
 * describes the rows on screen rather than the whole collection.
 */
export const adminGetStats = async (req, res) => {
  try {
    const filter = buildAdminParcelFilter(req.query);

    const [byStatus, money, needsAttention] = await Promise.all([
      CityParcel.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      CityParcel.aggregate([
        { $match: { ...filter, status: S.DELIVERED } },
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
      Promise.all([
        CityParcel.countDocuments({ ...filter, payoutWithheld: true }),
        CityParcel.countDocuments({
          ...filter,
          deliveryPartnerId: null,
          status: { $in: [S.REQUESTED, S.SEARCHING] },
        }),
        CityParcel.countDocuments({
          ...filter,
          "returnLeg.status": R.CUSTOMER_UNREACHABLE,
        }),
        CityParcel.countDocuments({ ...filter, status: S.DELIVERY_FAILED }),
      ]),
    ]);

    const statusCounts = byStatus.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});
    const totals = money[0] || {};
    const [withheld, unassigned, stuck, failed] = needsAttention;

    return handleResponse(res, 200, "Stats", {
      total: byStatus.reduce((n, r) => n + r.count, 0),
      statusCounts,
      delivered: totals.delivered || 0,
      revenue: Math.round((totals.revenue || 0) * 100) / 100,
      riderPay: Math.round((totals.riderPay || 0) * 100) / 100,
      // What the platform keeps once riders are paid.
      margin: Math.round(((totals.revenue || 0) - (totals.riderPay || 0)) * 100) / 100,
      distanceKm: Math.round((totals.distanceKm || 0) * 10) / 10,
      needsAttention: { withheld, unassigned, stuck, failed },
    });
  } catch (error) {
    return fail(res, error);
  }
};

export const adminGetOne = async (req, res) => {
  try {
    const parcel = await CityParcel.findById(req.params.cityParcelId)
      .populate("customerId", "name phone email")
      .populate("deliveryPartnerId", "name phone vehicleNumber")
      .lean();
    if (!parcel) return handleResponse(res, 404, "Not found");

    const timeline = await CityParcelEvent.find({ cityParcelId: parcel._id })
      .sort({ at: 1 })
      .lean();

    return handleResponse(res, 200, "City parcel", { parcel, timeline });
  } catch (error) {
    return fail(res, error);
  }
};

/** Clear or reject a delivery that completed past the proximity gate. */
export const adminReviewOverride = async (req, res) => {
  try {
    const { cityParcelId } = req.params;
    const { approve, note = "" } = req.body;

    const parcel = await CityParcel.findById(cityParcelId);
    if (!parcel) return handleResponse(res, 404, "Not found");
    if (!parcel.payoutWithheld) {
      return handleResponse(res, 409, "There is nothing to review on this parcel");
    }

    if (approve) {
      await CityParcel.findByIdAndUpdate(cityParcelId, {
        $set: {
          "dropVerification.overrideApprovedBy": req.user.id,
          "dropVerification.overrideApprovedAt": new Date(),
        },
      });
      await releaseWithheldPayout(cityParcelId);
    } else {
      await CityParcel.findByIdAndUpdate(cityParcelId, {
        $set: { "dropVerification.overrideRejectedAt": new Date() },
      });
    }

    await recordEvent({
      cityParcelId,
      status: parcel.status,
      previousStatus: parcel.status,
      actor: CITY_PARCEL_EVENT_ACTOR.ADMIN,
      actorId: req.user.id,
      note: approve ? `Override approved. ${note}` : `Override rejected. ${note}`,
      meta: { approve },
    });

    return handleResponse(
      res,
      200,
      approve ? "Approved and payout released" : "Rejected",
    );
  } catch (error) {
    return fail(res, error);
  }
};

/**
 * Riders an admin can hand a parcel to.
 *
 * Verified, parcel-enabled and not already carrying something. Sorted so the
 * ones actually online come first — assigning to an offline rider is how a
 * parked parcel stays parked.
 */
export const adminListAvailableRiders = async (req, res) => {
  try {
    const riders = await Delivery.find({
      isVerified: true,
      isParcelService: true,
    })
      .select("name phone isOnline isBusy vehicleType vehicleNumber lastLocationAt")
      .sort({ isOnline: -1, isBusy: 1, name: 1 })
      .limit(100)
      .lean();

    return handleResponse(res, 200, "Riders", { riders });
  } catch (error) {
    return fail(res, error);
  }
};

/**
 * Hand a parcel to a rider by hand.
 *
 * This is the escape hatch for a parcel the sweeper gave up on: after its
 * radius rounds are exhausted it parks back at REQUESTED and waits for a
 * human. Without this endpoint that parcel is stuck for good.
 */
export const adminAssignRider = async (req, res) => {
  try {
    const { cityParcelId } = req.params;
    const { deliveryPartnerId } = req.body;

    const parcel = await CityParcel.findById(cityParcelId);
    if (!parcel) return handleResponse(res, 404, "Parcel not found");

    if (parcel.deliveryPartnerId) {
      return handleResponse(res, 409, "This parcel already has a rider");
    }
    if (![S.REQUESTED, S.SEARCHING].includes(parcel.status)) {
      return handleResponse(
        res,
        409,
        `A parcel that is ${parcel.status} cannot be assigned`,
      );
    }

    const rider = await Delivery.findById(deliveryPartnerId)
      .select("name phone isVerified isParcelService")
      .lean();
    if (!rider) return handleResponse(res, 404, "Delivery partner not found");
    if (!rider.isVerified) {
      return handleResponse(res, 400, "That rider is not approved yet");
    }
    if (!rider.isParcelService) {
      return handleResponse(res, 400, "Parcel delivery is not enabled for that rider");
    }
    if (await deliveryPartnerHasActiveJob(deliveryPartnerId)) {
      return handleResponse(res, 409, "That rider is already on a job");
    }

    // Same guarded write the rider-facing accept uses, so a manual assignment
    // and a rider tapping accept cannot both land.
    const assigned = await CityParcel.findOneAndUpdate(
      {
        _id: cityParcelId,
        deliveryPartnerId: null,
        status: { $in: [S.REQUESTED, S.SEARCHING] },
      },
      {
        $set: {
          deliveryPartnerId,
          status: S.ACCEPTED,
          acceptedAt: new Date(),
        },
        $unset: { searchExpiresAt: 1 },
      },
      { new: true },
    ).populate("customerId", "name phone");

    if (!assigned) {
      return handleResponse(res, 409, "This parcel was taken while you were assigning it");
    }

    await recordEvent({
      cityParcelId: assigned._id,
      status: S.ACCEPTED,
      previousStatus: parcel.status,
      actor: CITY_PARCEL_EVENT_ACTOR.ADMIN,
      actorId: req.user.id,
      note: `Assigned to ${rider.name} by an admin`,
    });

    await markDeliveryPartnerBusy(deliveryPartnerId);

    // The customer still needs a pickup code, exactly as on a normal accept.
    const customerPhone = assigned.customerId?.phone;
    if (customerPhone) {
      await issueOtp({
        cityParcelId: assigned._id,
        type: CITY_PARCEL_OTP_TYPE.PICKUP,
        phone: customerPhone,
        referenceId: assigned.referenceId,
      });
    }

    emitToDelivery(deliveryPartnerId, {
      event: "cityparcel:assigned",
      payload: { cityParcelId: String(assigned._id), parcel: assigned },
    });
    emitToCustomer(assigned.customerId?._id || assigned.customerId, {
      event: "cityparcel:status:update",
      payload: {
        cityParcelId: String(assigned._id),
        status: S.ACCEPTED,
        parcel: assigned,
        rider: { name: rider.name, phone: rider.phone },
      },
    });
    emitToAdmins("cityparcel:status:update", assigned);

    notifyRiderAssigned(assigned, deliveryPartnerId);
    notifyCustomerOfStatus(assigned, { riderName: rider.name });

    return handleResponse(res, 200, `Assigned to ${rider.name}`, { parcel: assigned });
  } catch (error) {
    return fail(res, error);
  }
};

export const adminGetConfig = async (req, res) => {
  try {
    const config = await CityParcelConfig.getConfig();
    return handleResponse(res, 200, "Config", { config });
  } catch (error) {
    return fail(res, error);
  }
};

export const adminUpdateConfig = async (req, res) => {
  try {
    const config = await CityParcelConfig.getConfig();
    Object.assign(config, req.body);
    await config.save();
    return handleResponse(res, 200, "Config updated", { config });
  } catch (error) {
    return fail(res, error);
  }
};
