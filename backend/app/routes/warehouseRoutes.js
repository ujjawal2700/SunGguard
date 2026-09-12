import express from "express";
import {
  adminListWarehouses,
  adminCreateWarehouse,
  adminUpdateWarehouse,
  adminDeleteWarehouse,
  getNearestWarehouse,
  getActiveWarehouses,
  listWarehousesForRider,
  listWarehousesForParcel,
} from "../controller/warehouseController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import {
  adminCreateWarehouseSchema,
  adminUpdateWarehouseSchema,
} from "../validation/porterAdminValidation.js";

const router = express.Router();

// Public / operational endpoints (querying warehouses for booking / delivery)
router.get("/nearest", getNearestWarehouse);
router.get("/active", getActiveWarehouses);

// The signed-in rider's own zone warehouses, nearest first.
router.get("/mine", verifyToken, allowRoles("delivery"), listWarehousesForRider);
// Warehouses the rider may drop a specific accepted parcel at.
router.get("/for-parcel/:parcelId", verifyToken, allowRoles("delivery"), listWarehousesForParcel);

// Admin CRUD routes
router.get("/", verifyToken, allowRoles("admin", "parcel_admin"), adminListWarehouses);
router.post("/", verifyToken, allowRoles("admin", "parcel_admin"), validate(adminCreateWarehouseSchema), adminCreateWarehouse);
router.put("/:id", verifyToken, allowRoles("admin", "parcel_admin"), validate(adminUpdateWarehouseSchema), adminUpdateWarehouse);
router.delete("/:id", verifyToken, allowRoles("admin", "parcel_admin"), adminDeleteWarehouse);

export default router;

