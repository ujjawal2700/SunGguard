import mongoose from "mongoose";
import Warehouse from "../models/warehouse.js";
import Delivery from "../models/delivery.js";
import Parcel from "../models/parcel.js";
import handleResponse from "../utils/helper.js";
import { backfillAddressLabels } from "../services/locationBackfillService.js";
import {
  getActiveZoneById,
  isPointInZoneId,
  isZoneGatingActive,
  resolveZoneForPoint,
} from "../services/deliveryZoneService.js";

/**
 * List all warehouses for admin
 */
export const adminListWarehouses = async (req, res) => {
  try {
    const warehouses = await Warehouse.find()
      .sort({ createdAt: -1 })
      .lean();
    return handleResponse(res, 200, "Warehouses retrieved", warehouses);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Create a new warehouse
 */
export const adminCreateWarehouse = async (req, res) => {
  try {
    const {
      name,
      address,
      city,
      pincode,
      phone,
      email,
      contactPerson,
      lat,
      lng,
      zoneId,
      isActive,
      notes,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return handleResponse(res, 400, "Warehouse name is required");
    }

    if (!address || !String(address).trim()) {
      return handleResponse(res, 400, "Warehouse address is required");
    }

    const numLat = Number(lat);
    const numLng = Number(lng);

    if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
      return handleResponse(res, 400, "Valid latitude and longitude are required");
    }

    if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
      return handleResponse(res, 400, "Coordinates are out of range");
    }

    /**
     * A warehouse has to belong to a zone once any zone exists, and its pin
     * has to actually sit inside that zone's boundary — otherwise outstation
     * dispatch (which now only ever offers a rider a warehouse from their own
     * zone) could file a warehouse nobody's pickup zone can ever reach.
     */
    let resolvedZoneId = null;
    if (await isZoneGatingActive()) {
      if (!zoneId) {
        return handleResponse(res, 400, "Please select which zone this warehouse belongs to");
      }
      const zone = await getActiveZoneById(zoneId);
      if (!zone) {
        return handleResponse(res, 400, "The selected zone is no longer available. Please pick another.");
      }
      const inside = await isPointInZoneId(zone._id, numLat, numLng);
      if (!inside) {
        return handleResponse(
          res,
          400,
          `The pinned location is outside the "${zone.name}" zone boundary. Pick a point inside the zone.`,
        );
      }
      resolvedZoneId = zone._id;
    }

    // Anything the admin left blank is read back off the coordinates, so a
    // warehouse is never filed with a pin but no place name.
    const filled = await backfillAddressLabels({
      lat: numLat,
      lng: numLng,
      city,
      pincode,
    });

    const warehouse = await Warehouse.create({
      name: String(name).trim(),
      address: String(address).trim(),
      city: String(city || filled.city || "").trim(),
      pincode: String(pincode || filled.pincode || "").trim(),
      phone: String(phone || "").trim(),
      email: String(email || "").trim(),
      contactPerson: String(contactPerson || "").trim(),
      lat: numLat,
      lng: numLng,
      location: {
        type: "Point",
        coordinates: [numLng, numLat],
      },
      zoneId: resolvedZoneId,
      isActive: isActive !== false && isActive !== "false",
      notes: String(notes || "").trim(),
    });

    return handleResponse(res, 201, "Warehouse created successfully", warehouse);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Update an existing warehouse
 */
export const adminUpdateWarehouse = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid warehouse ID");
    }

    const warehouse = await Warehouse.findById(id);
    if (!warehouse) {
      return handleResponse(res, 404, "Warehouse not found");
    }

    const {
      name,
      address,
      city,
      pincode,
      phone,
      email,
      contactPerson,
      lat,
      lng,
      zoneId,
      isActive,
      notes,
    } = req.body || {};

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return handleResponse(res, 400, "Warehouse name cannot be empty");
      warehouse.name = trimmed;
    }

    if (address !== undefined) {
      const trimmed = String(address).trim();
      if (!trimmed) return handleResponse(res, 400, "Warehouse address cannot be empty");
      warehouse.address = trimmed;
    }

    if (city !== undefined) warehouse.city = String(city).trim();
    if (pincode !== undefined) warehouse.pincode = String(pincode).trim();
    if (phone !== undefined) warehouse.phone = String(phone).trim();
    if (email !== undefined) warehouse.email = String(email).trim();
    if (contactPerson !== undefined) warehouse.contactPerson = String(contactPerson).trim();
    if (notes !== undefined) warehouse.notes = String(notes).trim();

    if (isActive !== undefined) {
      warehouse.isActive = isActive !== false && isActive !== "false";
    }

    const wantsLatLngChange = lat !== undefined || lng !== undefined;
    const numLat = wantsLatLngChange ? Number(lat !== undefined ? lat : warehouse.lat) : Number(warehouse.lat);
    const numLng = wantsLatLngChange ? Number(lng !== undefined ? lng : warehouse.lng) : Number(warehouse.lng);

    if (wantsLatLngChange) {
      if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
        return handleResponse(res, 400, "Valid latitude and longitude are required");
      }
      if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
        return handleResponse(res, 400, "Coordinates are out of range");
      }
    }

    /**
     * The zone/geofence check re-runs whenever either the zone or the pin
     * changes, so an admin cannot move an already-zoned warehouse's pin out
     * of its zone by editing coordinates alone, nor re-zone it to a zone its
     * existing pin sits outside.
     */
    const wantsZoneChange = zoneId !== undefined;
    if ((wantsZoneChange || wantsLatLngChange) && (await isZoneGatingActive())) {
      const targetZoneId = wantsZoneChange ? zoneId : warehouse.zoneId;
      if (!targetZoneId) {
        return handleResponse(res, 400, "Please select which zone this warehouse belongs to");
      }
      const zone = await getActiveZoneById(targetZoneId);
      if (!zone) {
        return handleResponse(res, 400, "The selected zone is no longer available. Please pick another.");
      }
      const inside = await isPointInZoneId(zone._id, numLat, numLng);
      if (!inside) {
        return handleResponse(
          res,
          400,
          `The pinned location is outside the "${zone.name}" zone boundary. Pick a point inside the zone.`,
        );
      }
      warehouse.zoneId = zone._id;
    }

    if (wantsLatLngChange) {
      warehouse.lat = numLat;
      warehouse.lng = numLng;
      warehouse.location = {
        type: "Point",
        coordinates: [numLng, numLat],
      };
    }

    await warehouse.save();
    return handleResponse(res, 200, "Warehouse updated successfully", warehouse);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Delete warehouse
 */
export const adminDeleteWarehouse = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid warehouse ID");
    }

    const deleted = await Warehouse.findByIdAndDelete(id);
    if (!deleted) {
      return handleResponse(res, 404, "Warehouse not found");
    }

    return handleResponse(res, 200, "Warehouse deleted successfully", { id });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Find nearest active warehouse for a given coordinate
 */
export const getNearestWarehouse = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const numLat = Number(lat);
    const numLng = Number(lng);

    if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
      return handleResponse(res, 400, "Valid lat and lng query parameters are required");
    }

    /**
     * Matches the actual outstation dispatch rule (see
     * tryAutoAssignParcelToWarehouse in parcelWorkflowService.js): once a
     * point resolves to a zone, only that zone's warehouses are candidates.
     * Showing the customer an out-of-zone "nearest" warehouse here would be a
     * preview that lies about what the booking will actually get assigned to.
     */
    const zone = await resolveZoneForPoint(numLat, numLng);
    const nearest = await Warehouse.findNearestActive(numLat, numLng, null, zone?._id || null);
    if (!nearest) {
      return handleResponse(res, 404, "No active warehouse found near this location");
    }

    return handleResponse(res, 200, "Nearest warehouse found", nearest);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Every active warehouse in the signed-in rider's own zone, nearest first.
 *
 * Outstation delivery only ever routes a rider to a warehouse in their zone
 * (see tryAutoAssignParcelToWarehouse), so this is the reference list a rider
 * can check on their own — e.g. to know their options before heading out —
 * without it ever showing a warehouse they could not actually be assigned to.
 */
export const listWarehousesForRider = async (req, res) => {
  try {
    const rider = await Delivery.findById(req.user.id).select("zoneIds location").lean();
    if (!rider) {
      return handleResponse(res, 404, "Delivery partner not found");
    }

    const riderZoneId = rider.zoneIds?.[0] || null;
    const [riderLng, riderLat] = rider.location?.coordinates || [];

    const zoneId = riderZoneId || (await resolveZoneForPoint(riderLat, riderLng))?._id || null;
    if (!zoneId) {
      return handleResponse(res, 200, "No zone assigned yet", []);
    }

    const warehouses = await Warehouse.listActiveInZone(zoneId, riderLat, riderLng);
    return handleResponse(res, 200, "Warehouses in your zone", warehouses);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Every active warehouse the assigned rider may drop THIS parcel at,
 * nearest to their current position first.
 *
 * Scoped to the parcel's own `zoneId` (resolved once at booking, see
 * createParcel) rather than the rider's live assignment — the two are meant
 * to agree under the dispatch rule, but the parcel's zone is the one that
 * actually decides where this specific job may be dropped.
 */
export const listWarehousesForParcel = async (req, res) => {
  try {
    const { parcelId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(parcelId)) {
      return handleResponse(res, 400, "Invalid parcel ID");
    }

    const parcel = await Parcel.findById(parcelId)
      .select("zoneId deliveryPartnerId deliveryInstruction")
      .lean();
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }
    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this parcel");
    }
    if (parcel.deliveryInstruction !== "deliver_to_warehouse") {
      return handleResponse(res, 400, "This parcel is not routed to a warehouse");
    }

    const rider = await Delivery.findById(req.user.id).select("location").lean();
    const [riderLng, riderLat] = rider?.location?.coordinates || [];

    if (!parcel.zoneId) {
      // Unzoned (booked before zones existed, or none configured at the
      // time) — every active warehouse was always a candidate for it, same
      // as the auto-assign fallback in tryAutoAssignParcelToWarehouse.
      const warehouses = await Warehouse.find({ isActive: true }).sort({ name: 1 }).lean();
      return handleResponse(res, 200, "Warehouses for this parcel", warehouses);
    }

    const warehouses = await Warehouse.listActiveInZone(parcel.zoneId, riderLat, riderLng);
    return handleResponse(res, 200, "Warehouses for this parcel", warehouses);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * List active warehouses (public / app)
 */
export const getActiveWarehouses = async (req, res) => {
  try {
    const warehouses = await Warehouse.find({ isActive: true })
      .sort({ name: 1 })
      .select("name address city pincode phone lat lng")
      .lean();
    return handleResponse(res, 200, "Active warehouses retrieved", warehouses);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

