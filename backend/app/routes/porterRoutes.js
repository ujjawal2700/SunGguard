import express from "express";
import { adminGetPorterDashboard } from "../controller/porterDashboardController.js";
import { adminGetPorterRiderPayouts } from "../controller/porterPayoutsController.js";
import {
  adminListZones,
  adminGetZone,
  adminCreateZone,
  adminUpdateZone,
  adminDeleteZone,
} from "../controller/deliveryZoneController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

/**
 * The porter desk: the parcel-side dashboard and the delivery zones drawn to
 * serve it. Mounted on its own prefix rather than under /admin so it cannot
 * shadow, or be shadowed by, the admin auth router.
 */

const router = express.Router();

const adminOnly = [verifyToken, allowRoles("admin", "parcel_admin")];

router.get("/admin/dashboard", ...adminOnly, adminGetPorterDashboard);
router.get("/admin/rider-payouts", ...adminOnly, adminGetPorterRiderPayouts);

router.get("/admin/zones", ...adminOnly, adminListZones);
router.post("/admin/zones", ...adminOnly, adminCreateZone);
router.get("/admin/zones/:id", ...adminOnly, adminGetZone);
router.put("/admin/zones/:id", ...adminOnly, adminUpdateZone);
router.delete("/admin/zones/:id", ...adminOnly, adminDeleteZone);

export default router;
