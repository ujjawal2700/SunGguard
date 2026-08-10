/**
 * CAR WASH FEATURE DISABLED — model unused while /car-wash API is unmounted.
 */
import mongoose from "mongoose";

const carWashBookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
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
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      default: null,
      index: true,
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CarWashPackage",
      required: true,
    },
    vehicleType: {
      type: String,
      enum: ["Bike", "Hatchback", "Sedan", "SUV"],
      required: true,
    },
    bookingType: {
      type: String,
      enum: ["INSTANT", "SCHEDULED"],
      required: true,
    },
    scheduledDateTime: {
      type: Date,
      default: null,
    },
    address: {
      fullAddress: {
        type: String,
        required: true,
      },
      lat: {
        type: Number,
        required: true,
      },
      lng: {
        type: Number,
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
      landmark: {
        type: String,
        default: "",
      },
    },
    fare: {
      type: Number,
      required: true,
    },
    commission: {
      type: Number,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["UPI", "CARD", "WALLET", "COD"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "ACCEPTED",
        "ARRIVED",
        "WASHING",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "REQUESTED",
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    beforeWashImage: {
      type: String,
      default: "",
    },
    afterWashImage: {
      type: String,
      default: "",
    },
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
      default: null,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    comment: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("CarWashBooking", carWashBookingSchema);
