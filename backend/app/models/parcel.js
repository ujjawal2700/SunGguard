import mongoose from "mongoose";

const addressDetailsSchema = new mongoose.Schema({
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
}, { _id: false });

const packageDetailsSchema = new mongoose.Schema({
  packageType: {
    type: String,
    required: true,
    trim: true,
  },
  /** Customer segment: 'personal' or 'business' (optional). */
  packageSegment: {
    type: String,
    trim: true,
    default: "",
  },
  /** Category chosen within the selected segment (optional). */
  packageCategory: {
    type: String,
    trim: true,
    default: "",
  },
  weight: {
    type: Number,
    required: true,
    max: 50,
  },
  description: {
    type: String,
    trim: true,
  },
}, { _id: false });

const parcelSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pickupAddress: {
      type: addressDetailsSchema,
      required: true,
    },
    dropAddress: {
      type: addressDetailsSchema,
      required: true,
    },
    packageDetails: {
      type: packageDetailsSchema,
      required: true,
    },
    /** Preferred courier company for drop-off (e.g. Blue Dart, DTDC). */
    courierCompany: {
      type: String,
      trim: true,
      default: "",
    },
    /** Delivery speed chosen by customer: normal | express */
    deliverySpeed: {
      type: String,
      enum: ["normal", "express"],
      default: "normal",
      index: true,
    },
    /** Destination city where the parcel should go. */
    destinationCity: {
      type: String,
      trim: true,
      default: "",
    },
    /** Preferred date / window end for parcel pickup. */
    preferredPickupDate: {
      type: Date,
      default: null,
    },
    /** When delivery boy can come: today | 7_days | 15_days | 30_days | custom_days | specific */
    pickupWindow: {
      type: String,
      enum: ["today", "7_days", "15_days", "30_days", "custom_days", "specific"],
      default: "today",
    },
    /** Number of days in window (0 for today, null for specific date). */
    pickupWindowDays: {
      type: Number,
      default: 0,
    },
    weight: {
      type: Number,
      required: true,
      max: 50,
    },
    distance: {
      type: Number,
      required: true,
    },
    fare: {
      type: Number,
      required: true,
    },
    /** Snapshot used for rider payout (base + distance only; weight/courier excluded). */
    fareBreakdown: {
      baseFare: { type: Number, default: 0 },
      distanceFare: { type: Number, default: 0 },
      weightFare: { type: Number, default: 0 },
      courierCharge: { type: Number, default: 0 },
      platformCharge: { type: Number, default: 0 },
      companyCharge: { type: Number, default: 0 },
      expressCharge: { type: Number, default: 0 },
      /** Per-day fare before multi-day multiplier. */
      dailyFare: { type: Number, default: 0 },
      /** Number of days charged (today=1, 7/15/30, or till-date span). */
      billableDays: { type: Number, default: 1 },
    },
    courierCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourierCompany",
      default: null,
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
    /**
     * COD cash chain:
     * Customer → Rider (collect) → Seller (handover) → Admin (Razorpay remit)
     */
    codSettlement: {
      collectAmount: { type: Number, default: 0 },
      status: {
        type: String,
        enum: [
          "NOT_APPLICABLE",
          "COLLECT_PENDING",
          "RIDER_HOLDING",
          "WITH_SELLER",
          "REMITTED_TO_ADMIN",
        ],
        default: "NOT_APPLICABLE",
        index: true,
      },
      riderCollectedAt: { type: Date, default: null },
      handedToSellerAt: { type: Date, default: null },
      sellerConfirmedAt: { type: Date, default: null },
      remittedAt: { type: Date, default: null },
      sellerRazorpayOrderId: { type: String, default: null },
      sellerRazorpayPaymentId: { type: String, default: null },
    },
    /** Razorpay order id for UPI/online parcel payments. */
    razorpayOrderId: {
      type: String,
      default: null,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      default: null,
      index: true,
    },
    /** Parcel hub seller who auto-accepts within their service radius. */
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      default: null,
      index: true,
    },
    searchExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    searchMeta: {
      radiusKm: { type: Number, default: 5 },
      attempt: { type: Number, default: 1 },
      lastBroadcastAt: { type: Date, default: null },
    },
    skippedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    }],
    acceptedAt: {
      type: Date,
      default: null,
    },
    /**
     * Customer late-pickup refund request (Normal 30-min SLA).
     * COD still collects full cash; admin may credit wallet as compensation.
     */
    lateRefundRequest: {
      status: {
        type: String,
        enum: ["none", "requested", "approved", "rejected"],
        default: "none",
        index: true,
      },
      reason: { type: String, default: "", trim: true },
      requestedAt: { type: Date, default: null },
      requestedAmount: { type: Number, default: 0 },
      /** Snapshot: how late captain was when customer requested. */
      measuredAt: { type: Date, default: null },
      deadlineAt: { type: Date, default: null },
      lateByMinutes: { type: Number, default: 0 },
      lateByLabel: { type: String, default: "" },
      approvedAmount: { type: Number, default: 0 },
      approvedAt: { type: Date, default: null },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      rejectedAt: { type: Date, default: null },
      rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      adminNote: { type: String, default: "", trim: true },
    },
    otp: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "SEARCHING",
        "ACCEPTED",
        "RIDER_ASSIGNED",
        "PICKUP_REACHED",
        "PICKED_UP",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED"
      ],
      default: "REQUESTED",
      index: true,
    },
    pickupProofImage: {
      type: String,
      default: "",
    },
    deliveryProofImage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Parcel", parcelSchema);
