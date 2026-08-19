import express from "express";
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
  confirmPayment,
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
router.post("/:cityParcelId/confirm-payment", verifyToken, confirmPayment);
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
