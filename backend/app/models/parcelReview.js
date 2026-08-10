import mongoose from "mongoose";

/**
 * Customer rating/review for the parcel platform service
 * (submitted after a parcel is DELIVERED).
 */
const parcelReviewSchema = new mongoose.Schema(
  {
    parcelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parcel",
      required: true,
      unique: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    /** Auto-published so other users see it; admin can hide via rejected. */
    status: {
      type: String,
      enum: ["approved", "rejected", "hidden"],
      default: "approved",
      index: true,
    },
  },
  { timestamps: true },
);

parcelReviewSchema.index({ status: 1, createdAt: -1 });
parcelReviewSchema.index({ customerId: 1, createdAt: -1 });

export default mongoose.model("ParcelReview", parcelReviewSchema);
