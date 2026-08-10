import Order from "../models/order.js";
import { orderMatchQueryFromRouteParam } from "../utils/orderLookup.js";
import Transaction from "../models/transaction.js";
import Delivery from "../models/delivery.js";
import DeliveryAssignment from "../models/deliveryAssignment.js";
import Wallet from "../models/wallet.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import {
  writeDeliveryLocation,
  appendTrailPoint,
  clearOrderTracking,
  clearRiderPresence,
} from "../services/firebaseService.js";
import { applyDeliveredSettlement } from "../services/orderSettlement.js";
import { roundCurrency } from "../utils/money.js";
import logger from "../services/logger.js";
import { shouldThrottle as throttleLocationUpdate } from "../services/delivery/locationThrottleService.js";
import {
  getDeliveryStats as getDeliveryStatsFromService,
  getDeliveryEarnings as getDeliveryEarningsFromService,
  getDeliveryCodCashSummary as getDeliveryCodCashSummaryFromService,
} from "../services/delivery/deliveryEarningsService.js";
import Parcel from "../models/parcel.js";
import ParcelConfig from "../models/parcelConfig.js";
import { computeRiderParcelEarnings } from "../services/parcelWorkflowService.js";

const PARCEL_ACTIVE_STATUSES = new Set([
  "REQUESTED",
  "SEARCHING",
  "ACCEPTED",
  "RIDER_ASSIGNED",
  "PICKUP_REACHED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
]);

function mapParcelForDeliveryHistory(parcel, deliveryBoyId, settings) {
  const riderId = String(deliveryBoyId);
  const assignedToMe =
    parcel.deliveryPartnerId != null &&
    String(parcel.deliveryPartnerId?._id || parcel.deliveryPartnerId) === riderId;
  const rejectedByMe =
    !assignedToMe &&
    Array.isArray(parcel.skippedBy) &&
    parcel.skippedBy.some((id) => String(id) === riderId);

  const status = rejectedByMe ? "REJECTED" : String(parcel.status || "REQUESTED").toUpperCase();
  const sellerDoc =
    parcel.sellerId && typeof parcel.sellerId === "object" ? parcel.sellerId : null;
  const customerDoc =
    parcel.customerId && typeof parcel.customerId === "object" ? parcel.customerId : null;

  const earnings = assignedToMe
    ? computeRiderParcelEarnings(parcel, settings)
    : 0;

  return {
    kind: "parcel",
    _id: parcel._id,
    orderId: `PCL-${String(parcel._id).slice(-6).toUpperCase()}`,
    status: status.toLowerCase(),
    workflowStatus: status,
    historyRole: rejectedByMe ? "rejected" : assignedToMe ? "assigned" : "related",
    createdAt: parcel.createdAt,
    updatedAt: parcel.updatedAt,
    customer: customerDoc
      ? { name: customerDoc.name, phone: customerDoc.phone }
      : {
          name: parcel.pickupAddress?.name || "Customer",
          phone: parcel.pickupAddress?.phone || "",
        },
    seller: {
      shopName: sellerDoc?.shopName || sellerDoc?.name || "Parcel hub",
      address: sellerDoc?.address || "",
    },
    pickupAddress: parcel.pickupAddress,
    dropAddress: parcel.dropAddress,
    fare: Number(parcel.fare) || 0,
    distance: Number(parcel.distance) || 0,
    paymentMethod: parcel.paymentMethod,
    deliverySpeed: parcel.deliverySpeed,
    pricing: { total: Number(parcel.fare) || 0 },
    earnings,
    riderEarnings: earnings,
  };
}

function parcelMatchesHistoryFilter(item, normalized) {
  const status = String(item.workflowStatus || item.status || "").toUpperCase();
  if (normalized === "all") return true;
  if (normalized === "delivered") return status === "DELIVERED";
  if (normalized === "cancelled") return status === "CANCELLED";
  if (normalized === "rejected") return status === "REJECTED" || item.historyRole === "rejected";
  if (normalized === "active") return PARCEL_ACTIVE_STATUSES.has(status);
  if (normalized === "returns") return false;
  return true;
}

/* ===============================
   GET DELIVERY DASHBOARD STATS
================================ */
export const getDeliveryStats = async (req, res) => {
    try {
        const result = await getDeliveryStatsFromService(req.user.id);
        return handleResponse(res, 200, "Stats fetched", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET DELIVERY EARNINGS
================================ */
export const getDeliveryEarnings = async (req, res) => {
    try {
        const result = await getDeliveryEarningsFromService(req.user.id);
        return handleResponse(res, 200, "Earnings fetched", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET DELIVERY COD CASH SUMMARY
================================ */
export const getDeliveryCodCashSummary = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        const result = await getDeliveryCodCashSummaryFromService(rawId);
        return handleResponse(res, 200, "COD cash summary fetched", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   SUBMIT DELIVERY COD CASH
================================ */
export const submitDeliveryCodCashToAdmin = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        if (!rawId) {
            return handleResponse(res, 401, "Unauthorized");
        }
        if (!mongoose.Types.ObjectId.isValid(String(rawId))) {
            return handleResponse(res, 401, "Invalid user id");
        }

        const deliveryBoyId = new mongoose.Types.ObjectId(String(rawId));
        const orders = await Order.find({
            deliveryBoy: deliveryBoyId,
            paymentMode: "COD",
            status: { $ne: "cancelled" },
            orderStatus: { $ne: "cancelled" },
            "financeFlags.codMarkedCollected": true,
            "paymentBreakdown.codPendingAmount": { $gt: 0 },
        })
            .select("orderId paymentBreakdown.codPendingAmount")
            .sort({ createdAt: 1 })
            .lean();

        if (!orders.length) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }

        const totalAvailable = roundCurrency(
            orders.reduce(
                (sum, order) => sum + Number(order?.paymentBreakdown?.codPendingAmount || 0),
                0,
            ),
        );
        const requestedRaw = req.body?.amount;
        const requestedAmount =
            requestedRaw == null || requestedRaw === ""
                ? null
                : roundCurrency(requestedRaw);

        if (requestedAmount != null && (!Number.isFinite(Number(requestedRaw)) || requestedAmount <= 0)) {
            return handleResponse(res, 400, "Enter a valid amount to submit");
        }

        const amountToSubmit = requestedAmount == null ? totalAvailable : requestedAmount;
        if (amountToSubmit <= 0) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }
        if (amountToSubmit > totalAvailable) {
            return handleResponse(
                res,
                400,
                `You can submit up to ${String.fromCharCode(8377)}${totalAvailable.toLocaleString()}`,
            );
        }

        const settledOrders = [];
        let totalSubmitted = 0;
        let remaining = amountToSubmit;

        for (const order of orders) {
            const amount = roundCurrency(order?.paymentBreakdown?.codPendingAmount || 0);
            if (amount <= 0 || remaining <= 0) continue;
            const settleAmount = roundCurrency(Math.min(amount, remaining));

            await reconcileCodCash(
                order._id,
                settleAmount,
                deliveryBoyId,
                {
                    actorId: req.user?.id || null,
                    metadata: {
                        source: "delivery_cod_cash_page",
                        initiatedBy: "delivery_partner",
                    },
                },
            );

            totalSubmitted = roundCurrency(totalSubmitted + settleAmount);
            remaining = roundCurrency(remaining - settleAmount);
            settledOrders.push({
                orderId: order.orderId,
                amount: settleAmount,
            });
        }

        if (totalSubmitted <= 0) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }

        await Transaction.create({
            user: deliveryBoyId,
            userModel: "Delivery",
            type: "Cash Settlement",
            amount: -Math.abs(totalSubmitted),
            status: "Settled",
            reference: `CSH-SET-${deliveryBoyId}-${Date.now()}`,
            meta: {
                source: "delivery_cod_cash_page",
                orders: settledOrders.map((item) => item.orderId),
            },
        });

        const wallet = await Wallet.findOne({
            ownerType: "DELIVERY_PARTNER",
            ownerId: deliveryBoyId,
        })
            .select("cashInHand")
            .lean();

        return handleResponse(res, 200, "COD cash submitted to admin successfully", {
            totalSubmitted,
            orderCount: settledOrders.length,
            orders: settledOrders,
            cashInHand: roundCurrency(wallet?.cashInHand || 0),
        });
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET DELIVERY ORDER HISTORY
================================ */
/**
 * Any order this rider was linked to: primary assignment, return pickup, or v2 broadcast winner.
 */
async function buildAssignedToPartnerFilter(deliveryBoyId) {
    const clauses = [
        { deliveryBoy: deliveryBoyId },
        { returnDeliveryBoy: deliveryBoyId },
    ];
    try {
        const winnerOrderIds = await DeliveryAssignment.distinct("orderId", {
            winnerDeliveryId: deliveryBoyId,
        });
        if (winnerOrderIds?.length) {
            clauses.push({ orderId: { $in: winnerOrderIds } });
        }
    } catch {
        /* ignore */
    }
    return { $or: clauses };
}

export const getMyDeliveryOrders = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        if (!rawId) {
            return handleResponse(res, 401, "Unauthorized");
        }
        if (!mongoose.Types.ObjectId.isValid(String(rawId))) {
            return handleResponse(res, 401, "Invalid user id");
        }
        const deliveryBoyId = new mongoose.Types.ObjectId(String(rawId));
        const { status } = req.query;
        const normalized = (status || "all").toLowerCase();

        const assignedToPartner = await buildAssignedToPartnerFilter(deliveryBoyId);

        /** v2 orders use workflowStatus; legacy uses status — both must be respected. */
        let query;
        if (normalized === "delivered") {
            query = {
                $and: [
                    assignedToPartner,
                    {
                        $or: [
                            { status: "delivered" },
                            { workflowStatus: WORKFLOW_STATUS.DELIVERED },
                        ],
                    },
                ],
            };
        } else if (normalized === "cancelled") {
            query = {
                $and: [
                    assignedToPartner,
                    {
                        $or: [
                            { status: "cancelled" },
                            { workflowStatus: WORKFLOW_STATUS.CANCELLED },
                        ],
                    },
                ],
            };
        } else if (normalized === "active") {
            query = {
                $and: [
                    assignedToPartner,
                    {
                        $nor: [
                            { status: "delivered" },
                            { status: "cancelled" },
                            { workflowStatus: WORKFLOW_STATUS.DELIVERED },
                            { workflowStatus: WORKFLOW_STATUS.CANCELLED },
                        ],
                    },
                ],
            };
        } else if (normalized === "rejected") {
            // QC orders do not persist rider rejects on Order; parcels handled below.
            query = { _id: { $exists: false } };
        } else if (normalized === "returns") {
            query = {
                returnStatus: { $ne: "none" },
                $or: [
                    { deliveryBoy: deliveryBoyId },
                    { returnDeliveryBoy: deliveryBoyId },
                ],
            };
        } else {
            // all — every status for this rider
            query = assignedToPartner;
        }

        const [orders, parcelDocs, parcelSettings] = await Promise.all([
            Order.find(query)
                .sort({ createdAt: -1 })
                .limit(100)
                .populate("seller", "shopName address")
                .populate("customer", "name phone")
                .lean(),
            Parcel.find({
                $or: [
                    { deliveryPartnerId: deliveryBoyId },
                    { skippedBy: deliveryBoyId },
                ],
            })
                .select("-otp")
                .populate("customerId", "name phone")
                .populate("sellerId", "name shopName phone address")
                .sort({ createdAt: -1 })
                .limit(100)
                .lean(),
            ParcelConfig.getSearchSettings().catch(() => ({
                riderBaseFareSharePercent: 80,
                riderDistanceFareSharePercent: 80,
                riderSharePercent: 80,
            })),
        ]);

        const orderItems = (orders || []).map((order) => ({
            ...order,
            kind: "order",
            earnings:
                order.riderEarnings != null
                    ? Number(order.riderEarnings)
                    : Math.round((Number(order.pricing?.total) || 0) * 0.1),
        }));

        const parcelItems = (parcelDocs || [])
            .map((p) => mapParcelForDeliveryHistory(p, deliveryBoyId, parcelSettings))
            .filter((item) => parcelMatchesHistoryFilter(item, normalized));

        const merged = [...orderItems, ...parcelItems].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

        return handleResponse(res, 200, "Delivery orders fetched", merged.slice(0, 150));
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   REQUEST WITHDRAWAL (Delivery)
================================ */
export const requestWithdrawal = async (req, res) => {
    try {
        const deliveryBoyId = req.user.id;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return handleResponse(res, 400, "Please enter a valid amount");
        }

        // 1. Calculate current available balance
        const transactions = await Transaction.find({ user: deliveryBoyId, userModel: 'Delivery' });

        const settledBalance = transactions
            .filter(t => t.status === 'Settled')
            .reduce((acc, t) => acc + t.amount, 0);

        const pendingPayouts = transactions
            .filter(t => (t.status === 'Pending' || t.status === 'Processing') && t.type === 'Withdrawal')
            .reduce((acc, t) => acc + Math.abs(t.amount), 0);

        const availableBalance = settledBalance - pendingPayouts;

        if (amount > availableBalance) {
            return handleResponse(res, 400, `Insufficient balance. Available: ₹${availableBalance}`);
        }

        // 2. Create Withdrawal Transaction
        const withdrawal = await Transaction.create({
            user: deliveryBoyId,
            userModel: "Delivery",
            type: "Withdrawal",
            amount: -Math.abs(amount),
            status: "Pending",
            reference: `WDR-DL-${Date.now()}`
        });

        return handleResponse(res, 201, "Withdrawal request submitted successfully", withdrawal);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   UPDATE LIVE LOCATION (Delivery)
================================ */
export const updateDeliveryLocation = async (req, res) => {
    try {
        const deliveryId = req.user.id;
        const { lat, lng, accuracy, heading, speed, orderId } = req.body || {};

        if (
            typeof lat !== "number" ||
            typeof lng !== "number" ||
            Number.isNaN(lat) ||
            Number.isNaN(lng)
        ) {
            return handleResponse(res, 400, "Valid numeric lat and lng are required");
        }

        const throttled = await throttleLocationUpdate(deliveryId, lat, lng);
        if (throttled) {
            return handleResponse(res, 200, "Location update throttled", {
                throttled: true,
            });
        }

        // Normalize to [lng, lat] as required by GeoJSON
        const coordinates = [Number(lng), Number(lat)];

        const delivery = await Delivery.findByIdAndUpdate(
            deliveryId,
            {
                $set: {
                    location: {
                        type: "Point",
                        coordinates,
                    },
                    lastLocationAt: new Date(),
                },
            },
            { new: true }
        ).select("_id location isOnline");

        if (!delivery) {
            return handleResponse(res, 404, "Delivery partner not found");
        }

        // SECURITY: when an orderId is supplied, the rider is telling us which
        // active delivery this ping belongs to. We MUST verify the assignment
        // synchronously before fanning out to Firebase — otherwise a rider can
        // pollute another order's live-tracking path (and the customer map
        // would render the wrong rider). The previous fire-and-forget check
        // ran *after* the Firebase write and never blocked anything.
        //
        // Rules:
        //   - orderId omitted          -> only the delivery-keyed RTDB entry is
        //                                 written (no per-order fanout). Trail
        //                                 is skipped. This preserves the
        //                                 "background heartbeat" code path.
        //   - orderId references a doc -> rider must equal order.deliveryBoy,
        //                                 otherwise 403/404 and no RTDB write.
        //   - canonical orderId        -> always read from Mongo, never from
        //                                 the request body, so the RTDB path
        //                                 cannot be spoofed via case-drift or
        //                                 alternate ids.
        let activeOrderId = null;
        if (orderId) {
            const orderMatch = orderMatchQueryFromRouteParam(orderId);
            if (!orderMatch) {
                return handleResponse(res, 400, "Invalid orderId");
            }

            const order = await Order.findOne(orderMatch)
                .select("orderId deliveryBoy")
                .lean();

            if (!order) {
                return handleResponse(res, 404, "Order not found");
            }

            const assignedRiderId = order.deliveryBoy
                ? String(order.deliveryBoy)
                : null;
            if (assignedRiderId !== String(deliveryId)) {
                return handleResponse(
                    res,
                    403,
                    "Order is not assigned to this delivery partner"
                );
            }

            activeOrderId = order.orderId;
        }

        const snapshot = {
            lat,
            lng,
            accuracy: typeof accuracy === "number" ? accuracy : undefined,
            heading: typeof heading === "number" ? heading : undefined,
            speed: typeof speed === "number" ? speed : undefined,
            lastUpdatedAt: new Date().toISOString(),
            deliveryId,
            orderId: activeOrderId,
        };

        // Fan out to Firebase and trail — fire-and-forget, never block the
        // response. Reaching this line guarantees activeOrderId (if set) is
        // the canonical id of an order this rider is actually assigned to.
        writeDeliveryLocation(deliveryId, activeOrderId, snapshot).catch(() => {});
        if (activeOrderId) {
            appendTrailPoint(activeOrderId, { lat, lng, t: Date.now() }).catch(() => {});
        }

        return handleResponse(res, 200, "Location updated", {
            location: delivery.location,
            activeOrderId,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
/*
 * DEPRECATED + REMOVED: Delivery-completion OTP generation/validation moved
 * to the canonical workflow service:
 *   POST /orders/workflow/:orderId/otp/request  -> requestHandoffOtpAtomic
 *   POST /orders/workflow/:orderId/otp/verify   -> verifyHandoffOtpAndDeliver
 *
 * The previous generateDeliveryOtp / validateDeliveryOtp controllers
 * and their /delivery/orders/:orderId/(generate|validate)-otp routes
 * were removed once the workflow state machine became the single source
 * of truth for delivery completion. All behaviors (Delivery.location
 * fallback, proximity check, Firebase tracking cleanup on success,
 * structured OTP error codes, otpValidatedAt + otpValidationLocation
 * persistence, delivery:otp:validated socket fan-out) now live in
 * app/services/orderWorkflowService.js.
 */