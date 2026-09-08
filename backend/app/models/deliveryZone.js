import mongoose from "mongoose";
import { areaSqKm, centroidOf, pointsToPolygon } from "../utils/zoneGeometry.js";

/**
 * A serviceable area for the porter (parcel) side of the desk, drawn by an
 * admin as a polygon on a map.
 *
 * Storage mirrors models/warehouse.js: the drawable shape is kept alongside a
 * GeoJSON twin that carries the 2dsphere index, and a pre-validate hook is the
 * single place the two are reconciled so they cannot drift.
 */

const zonePointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const deliveryZoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    /** Hex swatch the map and the list share, so a zone reads the same in both. */
    color: {
      type: String,
      trim: true,
      default: "#2563EB",
    },
    /** The ring as drawn, in order. Source of truth for the map editor. */
    points: {
      type: [zonePointSchema],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length >= 3,
        message: "A zone needs at least 3 points",
      },
    },
    /**
     * GeoJSON twin of `points`, maintained by the pre-validate hook.
     *
     * Membership tests run in memory off `points` (see
     * services/deliveryZoneService.js) because they are asked on every quote
     * and every rider poll. This field is the canonical geo representation and
     * carries the 2dsphere index that any future server-side geo query needs;
     * it is excluded from every response as a duplicate of `points`.
     */
    area: {
      type: {
        type: String,
        enum: ["Polygon"],
        default: "Polygon",
      },
      coordinates: {
        type: [[[Number]]], // [ ring ][ vertex ][ lng, lat ]
        required: true,
      },
    },
    centroid: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    areaSqKm: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

deliveryZoneSchema.index({ area: "2dsphere" });
deliveryZoneSchema.index({ isActive: 1, createdAt: -1 });

deliveryZoneSchema.pre("validate", function (next) {
  const points = (this.points || []).map((p) => ({
    lat: Number(p.lat),
    lng: Number(p.lng),
  }));

  const polygon = pointsToPolygon(points);
  if (polygon) {
    this.area = polygon;
    this.centroid = centroidOf(points);
    this.areaSqKm = Number(areaSqKm(points).toFixed(4));
  }

  next();
});

export default mongoose.model("DeliveryZone", deliveryZoneSchema);
