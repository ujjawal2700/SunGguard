/**
 * CAR WASH FEATURE DISABLED — model unused while /car-wash API is unmounted.
 */
import mongoose from "mongoose";

const carWashConfigSchema = new mongoose.Schema(
  {
    baseFare: {
      type: Number,
      default: 50,
      min: 0,
    },
    perKmCharge: {
      type: Number,
      default: 8,
      min: 0,
    },
    vehicleMultipliers: {
      type: Map,
      of: Number,
      default: {
        Bike: 0.6,
        Hatchback: 0.9,
        Sedan: 1.0,
        SUV: 1.3,
      },
    },
    commissionRate: {
      type: Number,
      default: 15, // platform fee percentage (e.g. 15%)
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

// Helper static method to get the singleton config or create default
carWashConfigSchema.statics.getOrCreate = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({
      baseFare: 50,
      perKmCharge: 8,
      vehicleMultipliers: {
        Bike: 0.6,
        Hatchback: 0.9,
        Sedan: 1.0,
        SUV: 1.3,
      },
      commissionRate: 15,
    });
  }
  return config;
};

export default mongoose.model("CarWashConfig", carWashConfigSchema);
