import express from "express";
import mongoose from "mongoose";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import {
  calculateCityFareSchema,
  createCityParcelSchema,
  serviceabilitySchema,
  cancelCityParcelSchema,
  failureResponseSchema,
  riderVerifyPickupSchema,
  riderVerifyDeliverySchema,
  riderFailedAttemptSchema,
  riderVerifyReturnSchema,
  riderUpdateStatusSchema,
  sendDeliveryOtpSchema,
  adminOverrideDecisionSchema,
  adminUpdateCityConfigSchema,
  adminAssignRiderSchema,
} from "../validation/cityParcelValidation.js";
import {
  getBookingConfig,
  getServiceability,
  calculateFare,
  createCityParcel,
  verifyPayment,
  getHistory,
  trackCityParcel,
  respondToFailedDelivery,
  getMyCode,
  cancelCityParcel,
  riderGetAvailable,
  riderGetAssigned,
  riderAccept,
  riderSkip,
  riderUpdateStatus,
  riderVerifyPickup,
  riderSendDeliveryOtp,
  riderCheckProximity,
  riderVerifyDelivery,
  riderReportFailedAttempt,
  riderVerifyReturn,
  riderReportCustomerUnreachable,
  adminList,
  adminGetOne,
  adminReviewOverride,
  adminAssignRider,
  adminListAvailableRiders,
  adminGetConfig,
  adminUpdateConfig,
} from "../controller/cityParcelController.js";

/**
 * City Parcel routes — mounted at /api/city-parcel.
 *
 * A separate router from `parcelRoutes.js` on purpose. The pickup-service
 * routes are untouched and keep their exact contract; nothing here shadows
 * or overrides them.
 */
const router = express.Router();

/**
 * Reject a malformed parcel id before it reaches Mongoose.
 *
 * Without this, `/track/not-an-id` throws a CastError that surfaces as a 500
 * carrying the internal model name and field path — an error the caller
 * cannot act on and shouldn't see. A bad id in the URL is the caller's
 * mistake, so it belongs in the 400 range.
 *
 * Registered as a param handler so every route taking :cityParcelId is
 * covered, including ones added later.
 */
router.param("cityParcelId", (req, res, next, value) => {
  if (!mongoose.Types.ObjectId.isValid(String(value))) {
    return res.status(400).json({
      success: false,
      error: true,
      message: "That parcel reference is not valid",
    });
  }
  return next();
});

/* ==========================================================================
   CUSTOMER
   ========================================================================== */
router.get("/booking-config", verifyToken, getBookingConfig);
router.get(
  "/serviceability",
  verifyToken,
  validate(serviceabilitySchema, "query"),
  getServiceability,
);
router.post("/calculate-fare", verifyToken, validate(calculateCityFareSchema), calculateFare);
router.post("/create", verifyToken, validate(createCityParcelSchema), createCityParcel);
// Signature-verified. Replaces the earlier confirm-payment route, which
// marked a booking PAID on request alone.
router.post("/:cityParcelId/verify-payment", verifyToken, verifyPayment);
router.get("/history", verifyToken, getHistory);
router.get("/track/:cityParcelId", verifyToken, trackCityParcel);
router.post("/:cityParcelId/my-code", verifyToken, getMyCode);
router.post(
  "/:cityParcelId/failure-response",
  verifyToken,
  validate(failureResponseSchema),
  respondToFailedDelivery,
);
router.post(
  "/:cityParcelId/cancel",
  verifyToken,
  validate(cancelCityParcelSchema),
  cancelCityParcel,
);

/* ==========================================================================
   RIDER
   Static paths are declared before any parameterised ones so that
   /rider/available is never captured as an :cityParcelId.
   ========================================================================== */
router.get("/rider/available", verifyToken, allowRoles("delivery"), riderGetAvailable);
router.get("/rider/assigned", verifyToken, allowRoles("delivery"), riderGetAssigned);

router.post(
  "/rider/:cityParcelId/accept",
  verifyToken,
  allowRoles("delivery"),
  riderAccept,
);
router.post("/rider/:cityParcelId/skip", verifyToken, allowRoles("delivery"), riderSkip);
router.put(
  "/rider/:cityParcelId/status",
  verifyToken,
  allowRoles("delivery"),
  validate(riderUpdateStatusSchema),
  riderUpdateStatus,
);
router.post(
  "/rider/:cityParcelId/verify-pickup",
  verifyToken,
  allowRoles("delivery"),
  validate(riderVerifyPickupSchema),
  riderVerifyPickup,
);
router.post(
  "/rider/:cityParcelId/delivery-otp",
  verifyToken,
  allowRoles("delivery"),
  validate(sendDeliveryOtpSchema),
  riderSendDeliveryOtp,
);
router.get(
  "/rider/:cityParcelId/proximity",
  verifyToken,
  allowRoles("delivery"),
  riderCheckProximity,
);
router.post(
  "/rider/:cityParcelId/verify-delivery",
  verifyToken,
  allowRoles("delivery"),
  validate(riderVerifyDeliverySchema),
  riderVerifyDelivery,
);
router.post(
  "/rider/:cityParcelId/failed-attempt",
  verifyToken,
  allowRoles("delivery"),
  validate(riderFailedAttemptSchema),
  riderReportFailedAttempt,
);
router.post(
  "/rider/:cityParcelId/verify-return",
  verifyToken,
  allowRoles("delivery"),
  validate(riderVerifyReturnSchema),
  riderVerifyReturn,
);
router.post(
  "/rider/:cityParcelId/customer-unreachable",
  verifyToken,
  allowRoles("delivery"),
  riderReportCustomerUnreachable,
);

/* ==========================================================================
   ADMIN
   Same ordering rule: /admin/config before /admin/:cityParcelId.
   ========================================================================== */
router.get("/admin/config", verifyToken, allowRoles("admin", "parcel_admin"), adminGetConfig);
router.put(
  "/admin/config",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  validate(adminUpdateCityConfigSchema),
  adminUpdateConfig,
);
router.get("/admin/all", verifyToken, allowRoles("admin", "parcel_admin"), adminList);
router.get(
  "/admin/riders",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  adminListAvailableRiders,
);
router.put(
  "/admin/:cityParcelId/assign",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  validate(adminAssignRiderSchema),
  adminAssignRider,
);
router.put(
  "/admin/:cityParcelId/review-override",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  validate(adminOverrideDecisionSchema),
  adminReviewOverride,
);
router.get(
  "/admin/:cityParcelId",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  adminGetOne,
);

export default router;
