import mongoose from "mongoose";
import { distanceMeters } from "../utils/geoUtils.js";

const warehouseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    pincode: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      default: "",
    },
    contactPerson: {
      type: String,
      trim: true,
      default: "",
    },
    lat: {
      type: Number,
      required: true,
    },
    lng: {
      type: Number,
      required: true,
    },
    /**
     * The serviceable zone this warehouse belongs to. An admin can only pin
     * the warehouse's map location inside this zone's boundary (enforced in
     * the controller, not here, since the check needs the zone's polygon).
     *
     * Outstation dispatch reads this to decide which warehouse a rider ever
     * sees for a given pickup: only ones sharing the pickup's zone, never one
     * from another zone even if it happens to be geographically closer.
     */
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryZone",
      default: null,
      index: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

warehouseSchema.index({ location: "2dsphere" });

warehouseSchema.pre("validate", function (next) {
  if (Number.isFinite(this.lat) && Number.isFinite(this.lng)) {
    this.location = {
      type: "Point",
      coordinates: [Number(this.lng), Number(this.lat)],
    };
  }
  next();
});

/**
 * Finds the nearest active warehouse to given coordinates [lat, lng].
 * Uses $near / $geoNear if possible, with a robust Haversine fallback.
 *
 * `zoneId`, when given, restricts the search to warehouses belonging to that
 * zone — so outstation dispatch never routes a parcel to a warehouse outside
 * the zone its pickup was resolved into, even if that warehouse is nearer in
 * a straight line.
 */
warehouseSchema.statics.findNearestActive = async function (lat, lng, maxDistanceMeters = null, zoneId = null) {
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return null;

  const zoneFilter = zoneId ? { zoneId } : {};

  try {
    const geoQuery = {
      isActive: true,
      ...zoneFilter,
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [numLng, numLat],
          },
          ...(maxDistanceMeters ? { $maxDistance: maxDistanceMeters } : {}),
        },
      },
    };
    const nearest = await this.findOne(geoQuery).lean();
    if (nearest) return nearest;
    // A zoned search that finds nothing inside the zone stops there — falling
    // through to the Haversine scan below would ignore the zone filter it was
    // just given, defeating the whole point of passing one.
    if (zoneId) return null;
  } catch (err) {
    // Geo index query may fail if 2dsphere index is building or in in-memory tests
  }

  // Robust Haversine fallback over all active warehouses (unzoned callers only)
  const warehouses = await this.find({ isActive: true, ...zoneFilter }).lean();
  if (!warehouses || warehouses.length === 0) return null;

  let best = null;
  let bestDist = Infinity;

  for (const w of warehouses) {
    const wLat = Number(w.lat ?? w.location?.coordinates?.[1]);
    const wLng = Number(w.lng ?? w.location?.coordinates?.[0]);
    if (!Number.isFinite(wLat) || !Number.isFinite(wLng)) continue;

    const dist = distanceMeters(numLat, numLng, wLat, wLng);
    if (maxDistanceMeters && dist > maxDistanceMeters) continue;

    if (dist < bestDist) {
      bestDist = dist;
      best = { ...w, distanceMeters: Math.round(dist) };
    }
  }

  return best;
};

/**
 * Every active warehouse in a zone, nearest first — the rider's "warehouses
 * near me" list. Unlike `findNearestActive` this deliberately has no radius
 * cutoff: the zone boundary is the only scope that matters here, and a rider
 * should be able to see all of them, just ranked by which to head to first.
 */
warehouseSchema.statics.listActiveInZone = async function (zoneId, lat, lng) {
  if (!zoneId) return [];
  const warehouses = await this.find({ isActive: true, zoneId }).lean();

  const numLat = Number(lat);
  const numLng = Number(lng);
  const hasOrigin = Number.isFinite(numLat) && Number.isFinite(numLng);

  const withDistance = warehouses.map((w) => {
    const wLat = Number(w.lat ?? w.location?.coordinates?.[1]);
    const wLng = Number(w.lng ?? w.location?.coordinates?.[0]);
    const distanceMetersValue =
      hasOrigin && Number.isFinite(wLat) && Number.isFinite(wLng)
        ? distanceMeters(numLat, numLng, wLat, wLng)
        : null;
    return { ...w, distanceMeters: distanceMetersValue != null ? Math.round(distanceMetersValue) : null };
  });

  withDistance.sort((a, b) => {
    if (a.distanceMeters == null && b.distanceMeters == null) return 0;
    if (a.distanceMeters == null) return 1;
    if (b.distanceMeters == null) return -1;
    return a.distanceMeters - b.distanceMeters;
  });

  return withDistance;
};

export default mongoose.model("Warehouse", warehouseSchema);
