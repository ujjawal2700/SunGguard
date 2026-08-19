import mongoose from "mongoose";
import {
  CITY_PARCEL_STATUSES,
  CITY_PARCEL_EVENT_ACTORS,
} from "../constants/cityParcelWorkflow.js";

/**
 * Append-only timeline for a city parcel.
 *
 * The tracking screen reads this rather than inferring history from the
 * current `status`, and disputes get an audit trail with GPS attached.
 * Written as a side effect of every state transition, so the timeline can
 * never drift from the parcel.
 *
 * Never updated, never deleted while the parcel exists.
 */
const cityParcelEventSchema = new mongoose.Schema(
  {
    cityParcelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CityParcel",
      required: true,
      index: true,
    },

    /** The status the parcel moved INTO. */
    status: {
      type: String,
      enum: CITY_PARCEL_STATUSES,
      required: true,
    },
    /** Where it came from. Null for the first event. */
    previousStatus: { type: String, default: null },

    actor: { type: String, enum: CITY_PARCEL_EVENT_ACTORS, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },

    at: { type: Date, default: Date.now, index: true },

    /** Where the actor was, when we know. Attached to rider events. */
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracyM: { type: Number, default: null },
    },

    /** Short human-readable line, safe to show on the tracking screen. */
    note: { type: String, trim: true, default: "" },

    /** Anything else worth keeping: attempt outcome, override reason, etc. */
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: false },
);

cityParcelEventSchema.index({ cityParcelId: 1, at: 1 });

export default mongoose.model("CityParcelEvent", cityParcelEventSchema);
