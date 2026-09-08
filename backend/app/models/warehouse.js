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
 */
warehouseSchema.statics.findNearestActive = async function (lat, lng, maxDistanceMeters = null) {
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return null;

  try {
    const geoQuery = {
      isActive: true,
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
  } catch (err) {
    // Geo index query may fail if 2dsphere index is building or in in-memory tests
  }

  // Robust Haversine fallback over all active warehouses
  const warehouses = await this.find({ isActive: true }).lean();
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

export default mongoose.model("Warehouse", warehouseSchema);
