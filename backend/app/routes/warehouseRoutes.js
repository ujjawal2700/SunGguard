import express from "express";
import {
  adminListWarehouses,
  adminCreateWarehouse,
  adminUpdateWarehouse,
  adminDeleteWarehouse,
  getNearestWarehouse,
  getActiveWarehouses,
} from "../controller/warehouseController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public / operational endpoints (querying warehouses for booking / delivery)
router.get("/nearest", getNearestWarehouse);
router.get("/active", getActiveWarehouses);

// Admin CRUD routes
router.get("/", verifyToken, allowRoles("admin", "parcel_admin"), adminListWarehouses);
router.post("/", verifyToken, allowRoles("admin", "parcel_admin"), adminCreateWarehouse);
router.put("/:id", verifyToken, allowRoles("admin", "parcel_admin"), adminUpdateWarehouse);
router.delete("/:id", verifyToken, allowRoles("admin", "parcel_admin"), adminDeleteWarehouse);

export default router;

