/**
 * CAR WASH FEATURE DISABLED — model unused while /car-wash API is unmounted.
 */
import mongoose from "mongoose";

const carWashPackageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    durationMinutes: {
      type: Number,
      default: 45,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    image: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("CarWashPackage", carWashPackageSchema);
