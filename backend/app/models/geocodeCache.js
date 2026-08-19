import mongoose from "mongoose";

/**
 * Persistent geocode cache as a fallback when Redis is disabled/unavailable.
 * TTL is enforced via expiresAt index (MongoDB TTL monitor).
 */
const geocodeCacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    formattedAddress: { type: String },
    placeId: { type: String },
    types: { type: [String], default: [] },
    /**
     * Structured address parts from a reverse lookup — line, locality, city,
     * state, pincode, country. Stored so a cache hit can still fill a booking
     * form; without this field the schema's strict mode would drop it on
     * write and every cached hit would come back with no usable parts.
     */
    components: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    source: { type: String, enum: ["geocode-api"], default: "geocode-api" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Mongo TTL index. Documents expire after expiresAt passes.
geocodeCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("GeocodeCache", geocodeCacheSchema);
