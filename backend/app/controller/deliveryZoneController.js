import mongoose from "mongoose";
import DeliveryZone from "../models/deliveryZone.js";
import handleResponse from "../utils/helper.js";
import { normalizePoints } from "../utils/zoneGeometry.js";
import { invalidateZoneCache } from "../services/deliveryZoneService.js";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const MAX_POINTS = 200;
/** A name has to contain a letter — digits alone are a mistyped field. */
const HAS_LETTER = /\p{L}/u;

/** Shared by create and update so both refuse the same nonsense. */
const readName = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text) return { error: `${label} is required` };
  if (text.length < 2) return { error: `${label} must be at least 2 characters` };
  if (text.length > 80) return { error: `${label} cannot exceed 80 characters` };
  if (!HAS_LETTER.test(text)) {
    return { error: `${label} must contain letters, not just numbers` };
  }
  return { value: text };
};

/** Escapes a user string so it cannot smuggle regex syntax into a search. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Validates and coerces the ring an admin drew.
 * Returns `{ points }` or `{ error }` — never both.
 */
const readPoints = (input) => {
  const points = normalizePoints(input);

  if (points.length === 0) {
    return { error: "Zone boundary coordinates are invalid" };
  }
  if (points.length < 3) {
    return { error: "A zone needs at least 3 points on the map" };
  }
  if (points.length > MAX_POINTS) {
    return { error: `A zone cannot have more than ${MAX_POINTS} points` };
  }

  return { points };
};

/**
 * List zones. Supports ?search=, ?status=active|inactive and ?city=.
 * Unpaginated on purpose — an operation runs tens of zones, not thousands.
 *
 * `-area` drops the GeoJSON twin of `points`: nothing on the list or edit
 * screens reads it, so shipping it on every row is pure duplicate payload.
 */
export const adminListZones = async (req, res) => {
  try {
    const { search, status, city } = req.query || {};
    const query = {};

    if (status === "active") query.isActive = true;
    if (status === "inactive") query.isActive = false;
    if (city && String(city).trim()) query.city = String(city).trim();

    if (search && String(search).trim()) {
      const pattern = new RegExp(escapeRegex(String(search).trim()), "i");
      query.$or = [{ name: pattern }, { city: pattern }];
    }

    const zones = await DeliveryZone.find(query)
      .select("-area")
      .sort({ createdAt: -1 })
      .lean();
    return handleResponse(res, 200, "Zones retrieved", zones);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Active zones for anyone who needs to pick or validate against one without
 * admin rights: delivery-partner onboarding/profile (choosing their one work
 * zone), and the customer outstation-pickup picker (checking a point falls
 * inside a serviceable zone before it ever reaches the server).
 *
 * Ships `points` (the same ring the admin map editor draws) so callers can
 * run the point-in-polygon check locally instead of round-tripping to the
 * server for every pin the user drops.
 */
export const publicListActiveZones = async (req, res) => {
  try {
    const zones = await DeliveryZone.find({ isActive: true })
      .select("_id name city color points")
      .sort({ name: 1 })
      .lean();
    return handleResponse(res, 200, "Zones retrieved", zones);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminGetZone = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid zone ID");
    }

    const zone = await DeliveryZone.findById(id).select("-area").lean();
    if (!zone) {
      return handleResponse(res, 404, "Zone not found");
    }

    return handleResponse(res, 200, "Zone retrieved", zone);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** Strips the GeoJSON twin before a single-document response goes out. */
const withoutArea = (zoneDoc) => {
  const obj = zoneDoc.toObject();
  delete obj.area;
  return obj;
};

export const adminCreateZone = async (req, res) => {
  try {
    const { name, city, color, points, isActive } = req.body || {};

    const zoneName = readName(name, "Zone name");
    if (zoneName.error) {
      return handleResponse(res, 400, zoneName.error);
    }

    const cityText = String(city || "").trim();
    if (cityText && !HAS_LETTER.test(cityText)) {
      return handleResponse(res, 400, "City must contain letters, not just numbers");
    }

    const ring = readPoints(points);
    if (ring.error) {
      return handleResponse(res, 400, ring.error);
    }

    if (color && !HEX_COLOR.test(String(color))) {
      return handleResponse(res, 400, "Colour must be a hex value like #2563EB");
    }

    const zone = await DeliveryZone.create({
      name: zoneName.value,
      city: cityText,
      color: color ? String(color) : undefined,
      points: ring.points,
      isActive: isActive !== false && isActive !== "false",
      createdBy: req.user?.id || null,
    });

    invalidateZoneCache();
    return handleResponse(res, 201, "Zone created successfully", withoutArea(zone));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminUpdateZone = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid zone ID");
    }

    const zone = await DeliveryZone.findById(id);
    if (!zone) {
      return handleResponse(res, 404, "Zone not found");
    }

    const { name, city, color, points, isActive } = req.body || {};

    if (name !== undefined) {
      const zoneName = readName(name, "Zone name");
      if (zoneName.error) return handleResponse(res, 400, zoneName.error);
      zone.name = zoneName.value;
    }

    if (color !== undefined) {
      if (!HEX_COLOR.test(String(color))) {
        return handleResponse(res, 400, "Colour must be a hex value like #2563EB");
      }
      zone.color = String(color);
    }

    if (points !== undefined) {
      const ring = readPoints(points);
      if (ring.error) {
        return handleResponse(res, 400, ring.error);
      }
      zone.points = ring.points;
    }

    if (city !== undefined) {
      const cityText = String(city).trim();
      if (cityText && !HAS_LETTER.test(cityText)) {
        return handleResponse(res, 400, "City must contain letters, not just numbers");
      }
      zone.city = cityText;
    }
    if (isActive !== undefined) zone.isActive = isActive !== false && isActive !== "false";

    await zone.save();
    invalidateZoneCache();
    return handleResponse(res, 200, "Zone updated successfully", withoutArea(zone));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminDeleteZone = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid zone ID");
    }

    const deleted = await DeliveryZone.findByIdAndDelete(id);
    if (!deleted) {
      return handleResponse(res, 404, "Zone not found");
    }

    invalidateZoneCache();
    return handleResponse(res, 200, "Zone deleted successfully", { id });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
