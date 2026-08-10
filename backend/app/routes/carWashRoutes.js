/**
 * CAR WASH FEATURE DISABLED
 * Original route handlers are commented out below. Re-enable by restoring
 * the imports/handlers and uncommenting `router.use("/car-wash", ...)` in index.js.
 */
import express from "express";
// import multer from "multer";
// import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
// import {
//   getPackages,
//   calculateFare,
//   createBooking,
//   getCustomerBookings,
//   getBookingDetails,
//   cancelBooking,
//   addReview,
//   partnerGetAvailableBookings,
//   partnerAcceptBooking,
//   partnerGetAssignedBooking,
//   partnerUpdateStatus,
//   partnerCompleteBooking,
//   adminGetBookings,
//   adminAssignPartner,
//   adminGetConfig,
//   adminUpdateConfig,
//   adminCreatePackage,
//   adminUpdatePackage,
//   adminDeletePackage,
//   adminGetReports,
// } from "../controller/carWashController.js";

const router = express.Router();
// const upload = multer({ storage: multer.memoryStorage() });

/* ==========================================================================
   PUBLIC & CUSTOMER API ROUTES — DISABLED
   ========================================================================== */
// router.get("/packages", getPackages);
// router.post("/calculate-fare", verifyToken, calculateFare);
// router.post("/booking", verifyToken, createBooking);
// router.get("/bookings/customer", verifyToken, getCustomerBookings);
// router.get("/bookings/:id", verifyToken, getBookingDetails);
// router.post("/bookings/:id/cancel", verifyToken, cancelBooking);
// router.post("/bookings/:id/review", verifyToken, addReview);

/* ==========================================================================
   SERVICE PARTNER API ROUTES — DISABLED
   ========================================================================== */
// router.get("/partner/available", verifyToken, allowRoles("delivery"), partnerGetAvailableBookings);
// router.get("/partner/assigned", verifyToken, allowRoles("delivery"), partnerGetAssignedBooking);
// router.post("/partner/accept", verifyToken, allowRoles("delivery"), partnerAcceptBooking);
// router.put("/partner/status", verifyToken, allowRoles("delivery"), upload.any(), partnerUpdateStatus);
// router.put("/partner/complete", verifyToken, allowRoles("delivery"), upload.any(), partnerCompleteBooking);

/* ==========================================================================
   ADMIN API ROUTES — DISABLED
   ========================================================================== */
// router.get("/admin/bookings", verifyToken, allowRoles("admin"), adminGetBookings);
// router.post("/admin/assign-partner", verifyToken, allowRoles("admin"), adminAssignPartner);
// router.get("/admin/config", verifyToken, allowRoles("admin"), adminGetConfig);
// router.put("/admin/config", verifyToken, allowRoles("admin"), adminUpdateConfig);
// router.post("/admin/packages", verifyToken, allowRoles("admin"), upload.any(), adminCreatePackage);
// router.put("/admin/packages/:id", verifyToken, allowRoles("admin"), upload.any(), adminUpdatePackage);
// router.delete("/admin/packages/:id", verifyToken, allowRoles("admin"), adminDeletePackage);
// router.get("/admin/reports", verifyToken, allowRoles("admin"), adminGetReports);

export default router;
