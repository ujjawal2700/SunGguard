import mongoose from "mongoose";

/**
 * A rider handing collected COD cash back to the platform.
 *
 * Before this existed, COD cash had nowhere to go. A porter rider collected
 * cash at pickup, the booking moved to RIDER_HOLDING, and then nothing —
 * `REMITTED_TO_ADMIN` was only ever written by a seller-side Razorpay flow
 * that outstation parcels (which carry no seller) could never reach. The cash
 * sat on the rider's ledger permanently.
 *
 * This is the missing half: the rider declares what they paid back, how, and
 * attaches proof; an admin checks the proof and approves. Only on approval do
 * the covered bookings move to REMITTED_TO_ADMIN. Nothing clears itself.
 *
 * `items` is resolved when the request is raised, oldest booking first, so an
 * approval maps to specific bookings rather than a floating balance — the
 * admin can always answer "which jobs did this ₹X cover".
 */

const depositItemSchema = new mongoose.Schema(
  {
    /** Which collection the booking lives in. */
    kind: {
      type: String,
      enum: ["parcel", "city_parcel"],
      required: true,
    },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    /** COD amount held for this booking, snapshotted at request time. */
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    /** Human reference shown to the admin (waybill / short id). */
    label: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const cashDepositSchema = new mongoose.Schema(
  {
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    /**
     * How the rider says they returned it. CASH means handed over in person
     * at the office — the other three move money electronically and should
     * carry a reference the admin can look up.
     */
    method: {
      type: String,
      enum: ["UPI", "BANK_TRANSFER", "CASH", "OTHER"],
      required: true,
    },

    /** UTR / transaction id the rider typed in. */
    reference: {
      type: String,
      trim: true,
      default: "",
    },

    /** Screenshot or receipt photo. The whole point of the approval step. */
    proofImageUrl: {
      type: String,
      trim: true,
      default: "",
    },

    note: {
      type: String,
      trim: true,
      default: "",
    },

    items: {
      type: [depositItemSchema],
      default: [],
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    adminNote: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

/** The rider's own history screen, newest first. */
cashDepositSchema.index({ riderId: 1, status: 1, createdAt: -1 });
/** The admin approval queue. */
cashDepositSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("CashDeposit", cashDepositSchema);
