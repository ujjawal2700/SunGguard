import mongoose from "mongoose";
import Warehouse from "../models/warehouse.js";
import handleResponse from "../utils/helper.js";

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

    const warehouse = await Warehouse.create({
      name: String(name).trim(),
      address: String(address).trim(),
      city: String(city || "").trim(),
      pincode: String(pincode || "").trim(),
      phone: String(phone || "").trim(),
      email: String(email || "").trim(),
      contactPerson: String(contactPerson || "").trim(),
      lat: numLat,
      lng: numLng,
      location: {
        type: "Point",
        coordinates: [numLng, numLat],
      },
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

    if (lat !== undefined || lng !== undefined) {
      const numLat = Number(lat !== undefined ? lat : warehouse.lat);
      const numLng = Number(lng !== undefined ? lng : warehouse.lng);

      if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
        return handleResponse(res, 400, "Valid latitude and longitude are required");
      }

      if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
        return handleResponse(res, 400, "Coordinates are out of range");
      }

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

    const nearest = await Warehouse.findNearestActive(numLat, numLng);
    if (!nearest) {
      return handleResponse(res, 404, "No active warehouse found near this location");
    }

    return handleResponse(res, 200, "Nearest warehouse found", nearest);
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

