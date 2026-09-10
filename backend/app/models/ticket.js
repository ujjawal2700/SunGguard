import mongoose from "mongoose";
import { ALL_USER_MODEL_NAMES_WITH_LEGACY } from "../constants/refModels.js";

const ticketSchema = new mongoose.Schema(
    {
        // Populate target depends on who raised the ticket — a customer's
        // userId lives in the "User" collection, a rider's in "Delivery".
        // Without this, admin screens always looked the id up in "User" and
        // silently got nothing back for rider-raised tickets.
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "userType",
            required: true,
        },
        // Phase 5 P5-2: enum widened to include canonical "User" / "Delivery"
        // while still accepting legacy "Customer" / "Rider" rows. The
        // migration script rewrites existing values to the canonical form;
        // new code should write the canonical names.
        userType: {
            type: String,
            enum: ALL_USER_MODEL_NAMES_WITH_LEGACY,
            required: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        /** High-level reason so admin can filter complaints. */
        category: {
            type: String,
            enum: [
                "order",
                "parcel",
                "payment",
                "delivery",
                "product",
                "refund",
                "app",
                // Delivery-partner specific reasons (raised from the rider app).
                "earnings",
                "account",
                "vehicle",
                "safety",
                "other",
            ],
            default: "other",
            index: true,
        },
        relatedOrderId: {
            type: String,
            trim: true,
            default: "",
        },
        relatedParcelId: {
            type: String,
            trim: true,
            default: "",
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high"],
            default: "medium",
        },
        status: {
            type: String,
            enum: ["open", "processing", "closed"],
            default: "open",
        },
        messages: [
            {
                sender: {
                    type: String,
                    required: true,
                },
                senderId: {
                    type: mongoose.Schema.Types.ObjectId,
                    refPath: 'messages.senderType',
                },
                senderType: {
                    type: String,
                    enum: ["User", "Admin"],
                    required: true,
                },
                text: {
                    type: String,
                    default: "",
                    required: function requiredText() {
                        return !this.mediaUrl;
                    },
                },
                mediaUrl: {
                    type: String,
                    default: "",
                    trim: true,
                },
                mediaType: {
                    type: String,
                    enum: ["", "image"],
                    default: "",
                    trim: true,
                },
                mimeType: {
                    type: String,
                    default: "",
                    trim: true,
                },
                createdAt: {
                    type: Date,
                    default: Date.now,
                },
                isAdmin: {
                    type: Boolean,
                    default: false,
                }
            },
        ],
    },
    { timestamps: true }
);

ticketSchema.index({ userId: 1, userType: 1, createdAt: -1 });
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ category: 1, status: 1, createdAt: -1 });

export default mongoose.model("Ticket", ticketSchema);
