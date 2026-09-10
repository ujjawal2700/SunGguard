import mongoose from "mongoose";
import { ALL_PAYMENT_GATEWAYS } from "../constants/payment.js";

const paymentWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    gatewayName: {
      type: String,
      enum: ALL_PAYMENT_GATEWAYS,
      required: true,
      default: "RAZORPAY",
    },
    eventType: {
      type: String,
      required: true,
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },
    /**
     * Set instead of `payment` when the event belonged to a porter booking or
     * a rider cash deposit.
     *
     * One webhook route serves both ledgers — the gateway has one endpoint and
     * one secret — so the dedupe record has to be able to point at either. An
     * event with neither set was genuinely for nothing we know about, which is
     * a real and legitimate outcome worth being able to see.
     */
    porterPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PorterPayment",
      default: null,
      index: true,
    },
    publicOrderId: {
      type: String,
      default: null,
      index: true,
    },
    payloadHash: {
      type: String,
      required: true,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

paymentWebhookEventSchema.index({ gatewayName: 1, processedAt: -1 });

export default mongoose.model("PaymentWebhookEvent", paymentWebhookEventSchema);