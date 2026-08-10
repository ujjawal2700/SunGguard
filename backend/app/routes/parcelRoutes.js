import express from "express";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import {
  calculateFare,
  createParcel,
  verifyParcelPayment,
  getBookingConfig,
  getParcelHistory,
  trackParcel,
  cancelParcelByCustomer,
  requestParcelLateRefund,
  adminApproveParcelLateRefund,
  adminRejectParcelLateRefund,
  adminGetParcels,
  adminGetParcelById,
  adminAssignRider,
  adminGetPricingConfig,
  adminUpdatePricingConfig,
  adminGetReports,
  adminGetActiveDeliveries,
  adminResetAllParcelData,
  adminGetRiders,
  riderGetAssignedParcels,
  riderGetAvailableParcels,
  getParcelRoute,
  riderAcceptParcel,
  riderRejectParcel,
  riderUpdateStatus,
  riderCompleteDelivery,
  riderGetEarnings,
  sellerGetParcels,
  sellerConfirmCodReceived,
  sellerCreateCodRemitPayment,
  sellerVerifyCodRemitPayment,
} from "../controller/parcelController.js";
import { requireApprovedSeller } from "../middleware/authMiddleware.js";
import {
  adminListCourierCompanies,
  adminCreateCourierCompany,
  adminUpdateCourierCompany,
  adminDeleteCourierCompany,
} from "../controller/courierCompanyController.js";
import {
  submitParcelReview,
  getMyParcelReview,
  listPublicParcelReviews,
  adminListParcelReviews,
  adminUpdateParcelReviewStatus,
} from "../controller/parcelReviewController.js";

const router = express.Router();

/* ==========================================================================
   CUSTOMER API ROUTES
   ========================================================================== */
router.post("/calculate-fare", verifyToken, calculateFare);
router.post("/create", verifyToken, createParcel);
router.post("/verify-payment", verifyToken, verifyParcelPayment);
router.get("/booking-config", verifyToken, getBookingConfig);
router.get("/history", verifyToken, getParcelHistory);
router.get("/track/:id", verifyToken, trackParcel);
router.post("/cancel/:parcelId", verifyToken, cancelParcelByCustomer);
router.post("/:parcelId/late-refund-request", verifyToken, requestParcelLateRefund);
router.get("/reviews", verifyToken, listPublicParcelReviews);
router.get("/review/:parcelId", verifyToken, getMyParcelReview);
router.post("/review", verifyToken, submitParcelReview);

/* ==========================================================================
   ADMIN API ROUTES
   ========================================================================== */
router.get("/admin/all", verifyToken, allowRoles("admin", "parcel_admin"), adminGetParcels);
router.post("/admin/assign-rider", verifyToken, allowRoles("admin", "parcel_admin"), adminAssignRider);
router.get("/admin/pricing", verifyToken, allowRoles("admin", "parcel_admin"), adminGetPricingConfig);
router.put("/admin/pricing", verifyToken, allowRoles("admin", "parcel_admin"), adminUpdatePricingConfig);
router.get("/admin/reports", verifyToken, allowRoles("admin", "parcel_admin"), adminGetReports);
router.get("/admin/active", verifyToken, allowRoles("admin", "parcel_admin"), adminGetActiveDeliveries);
router.post(
  "/admin/reset-data",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  adminResetAllParcelData,
);
router.get("/admin/riders", verifyToken, allowRoles("admin", "parcel_admin"), adminGetRiders);
router.put(
  "/admin/late-refund/:parcelId/approve",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  adminApproveParcelLateRefund,
);
router.put(
  "/admin/late-refund/:parcelId/reject",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  adminRejectParcelLateRefund,
);
router.get(
  "/admin/couriers",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  adminListCourierCompanies,
);
router.post(
  "/admin/couriers",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  adminCreateCourierCompany,
);
router.put(
  "/admin/couriers/:id",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  adminUpdateCourierCompany,
);
router.delete(
  "/admin/couriers/:id",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  adminDeleteCourierCompany,
);
router.get(
  "/admin/reviews",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  adminListParcelReviews,
);
router.put(
  "/admin/reviews/:id",
  verifyToken,
  allowRoles("admin", "parcel_admin"),
  adminUpdateParcelReviewStatus,
);
// Keep parameterized route AFTER static /admin/* paths.
router.get("/admin/:parcelId", verifyToken, allowRoles("admin", "parcel_admin"), adminGetParcelById);

/* ==========================================================================
   DELIVERY PARTNER API ROUTES
   ========================================================================== */
router.get("/rider/assigned", verifyToken, allowRoles("delivery"), riderGetAssignedParcels);
router.get("/rider/route/:parcelId", verifyToken, allowRoles("delivery"), getParcelRoute);
router.get("/rider/available", verifyToken, allowRoles("delivery"), riderGetAvailableParcels);
router.post("/rider/accept/:parcelId", verifyToken, allowRoles("delivery"), riderAcceptParcel);
router.post("/rider/reject/:parcelId", verifyToken, allowRoles("delivery"), riderRejectParcel);
router.put("/rider/status", verifyToken, allowRoles("delivery"), riderUpdateStatus);
router.put("/rider/complete", verifyToken, allowRoles("delivery"), riderCompleteDelivery);
router.get("/rider/earnings", verifyToken, allowRoles("delivery"), riderGetEarnings);

/* ==========================================================================
   PARCEL HUB SELLER API ROUTES
   ========================================================================== */
router.get(
  "/seller/parcels",
  verifyToken,
  allowRoles("seller"),
  requireApprovedSeller,
  sellerGetParcels,
);
router.post(
  "/seller/cod/confirm",
  verifyToken,
  allowRoles("seller"),
  requireApprovedSeller,
  sellerConfirmCodReceived,
);
router.post(
  "/seller/cod/remit/create",
  verifyToken,
  allowRoles("seller"),
  requireApprovedSeller,
  sellerCreateCodRemitPayment,
);
router.post(
  "/seller/cod/remit/verify",
  verifyToken,
  allowRoles("seller"),
  requireApprovedSeller,
  sellerVerifyCodRemitPayment,
);

export default router;
