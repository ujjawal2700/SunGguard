import { jest } from "@jest/globals";
import mongoose from "mongoose";

/**
 * End-to-End (E2E) Cross-Module Busy Isolation Test
 *
 * Validates the full lifecycle and cross-module mutual exclusion between:
 * 1. Store Orders (Quick Commerce)
 * 2. Standard Parcels
 * 3. Return Pickups
 * 4. City Parcels
 */

// In-memory data store for E2E simulation
const db = {
  deliveries: new Map(),
  orders: new Map(),
  parcels: new Map(),
  cityParcels: new Map(),
};

const mockDelivery = {
  findById: jest.fn((id) => {
    const d = db.deliveries.get(id?.toString());
    return {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(d ? { ...d } : null),
      then: jest.fn((resolve) => resolve(d ? { ...d } : null)),
      catch: jest.fn(),
    };
  }),
  findByIdAndUpdate: jest.fn((id, update) => {
    const d = db.deliveries.get(id?.toString());
    if (d && update.$set) {
      Object.assign(d, update.$set);
    }
    return Promise.resolve(d);
  }),
  find: jest.fn((filter) => {
    const list = Array.from(db.deliveries.values()).filter((d) => {
      if (filter.isOnline !== undefined && d.isOnline !== filter.isOnline) return false;
      if (filter.isVerified !== undefined && d.isVerified !== filter.isVerified) return false;
      if (filter.isParcelService !== undefined && d.isParcelService !== filter.isParcelService) return false;
      if (filter.isQuickCommerceService !== undefined && d.isQuickCommerceService !== filter.isQuickCommerceService) return false;
      if (filter.isBusy?.$ne !== undefined && d.isBusy === filter.isBusy.$ne) return false;
      return true;
    });
    return {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(list.map((d) => ({ ...d }))),
    };
  }),
};

const mockOrder = {
  exists: jest.fn((query) => {
    const list = Array.from(db.orders.values());
    const match = list.some((o) => {
      if (query.deliveryBoy && o.deliveryBoy?.toString() !== query.deliveryBoy.toString()) return false;
      if (query.returnDeliveryBoy && o.returnDeliveryBoy?.toString() !== query.returnDeliveryBoy.toString()) return false;
      if (query.$or) {
        // active workflow or legacy check
        const isActive = query.$or.some((sub) => {
          if (sub.workflowStatus?.$in && sub.workflowStatus.$in.includes(o.workflowStatus)) return true;
          if (sub.status?.$in && sub.status.$in.includes(o.status)) return true;
          return false;
        });
        if (!isActive) return false;
      }
      if (query.returnStatus?.$in && !query.returnStatus.$in.includes(o.returnStatus)) return false;
      return true;
    });
    return Promise.resolve(match);
  }),
  findOne: jest.fn((query) => {
    const o = Array.from(db.orders.values()).find((item) => {
      if (query.orderId && item.orderId !== query.orderId) return false;
      if (query._id && item._id?.toString() !== query._id.toString()) return false;
      return true;
    });
    return {
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(o ? { ...o } : null),
      then: jest.fn((resolve) => resolve(o ? { ...o } : null)),
      catch: jest.fn(),
    };
  }),
  findOneAndUpdate: jest.fn((filter, update) => {
    const o = Array.from(db.orders.values()).find((item) => {
      if (filter.orderId && item.orderId !== filter.orderId) return false;
      return true;
    });
    if (o && update.$set) {
      Object.assign(o, update.$set);
    }
    return Promise.resolve(o);
  }),
};

const mockParcel = {
  exists: jest.fn((query) => {
    const list = Array.from(db.parcels.values());
    const match = list.some((p) => {
      if (query.deliveryPartnerId && p.deliveryPartnerId?.toString() !== query.deliveryPartnerId.toString()) return false;
      if (query.status?.$in && !query.status.$in.includes(p.status)) return false;
      return true;
    });
    return Promise.resolve(match);
  }),
  findById: jest.fn((id) => {
    const p = db.parcels.get(id?.toString());
    return {
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(p ? { ...p } : null),
      then: jest.fn((resolve) => resolve(p ? { ...p } : null)),
      catch: jest.fn(),
    };
  }),
  findOneAndUpdate: jest.fn((filter, update) => {
    const p = db.parcels.get(filter._id?.toString());
    if (p && update.$set) {
      Object.assign(p, update.$set);
    }
    return {
      populate: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve(p ? { ...p } : null)),
      catch: jest.fn(),
    };
  }),
  find: jest.fn(() => ({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(Array.from(db.parcels.values()).map((p) => ({ ...p }))),
  })),
};

const mockCityParcel = {
  exists: jest.fn((query) => {
    const list = Array.from(db.cityParcels.values());
    const match = list.some((cp) => {
      if (query.deliveryPartnerId && cp.deliveryPartnerId?.toString() !== query.deliveryPartnerId.toString()) return false;
      if (query.status?.$in && !query.status.$in.includes(cp.status)) return false;
      return true;
    });
    return Promise.resolve(match);
  }),
};

jest.unstable_mockModule("../app/models/delivery.js", () => ({ default: mockDelivery }));
jest.unstable_mockModule("../app/models/order.js", () => ({ default: mockOrder }));
jest.unstable_mockModule("../app/models/parcel.js", () => ({ default: mockParcel }));
jest.unstable_mockModule("../app/models/cityParcel.js", () => ({ default: mockCityParcel }));
jest.unstable_mockModule("../app/models/seller.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/parcelConfig.js", () => ({
  default: { getSearchSettings: jest.fn().mockResolvedValue({ baseSearchRadiusKm: 10 }) },
}));
jest.unstable_mockModule("../app/models/orderOtp.js", () => ({
  default: {
    findOne: jest.fn().mockReturnValue({
      sort: jest.fn().mockResolvedValue({
        codeHash: "hash-123",
        attempts: 0,
        maxAttempts: 3,
        expiresAt: new Date(Date.now() + 60000),
        save: jest.fn().mockResolvedValue(true),
      }),
    }),
    hashCode: jest.fn().mockReturnValue("hash-123"),
    updateOne: jest.fn().mockResolvedValue(true),
  },
}));
jest.unstable_mockModule("../app/models/deliveryAssignment.js", () => ({
  default: { findOne: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(null) }) },
}));
jest.unstable_mockModule("../app/services/firebaseService.js", () => ({
  clearOrderTracking: jest.fn().mockResolvedValue(true),
  clearRiderPresence: jest.fn().mockResolvedValue(true),
}));
jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: jest.fn().mockResolvedValue(true),
}));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(),
  emitToSeller: jest.fn(),
  emitDeliveryBroadcastForSeller: jest.fn(),
  emitReturnBroadcastForCustomer: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToDelivery: jest.fn(),
  emitToOrder: jest.fn(),
  emitToAdmins: jest.fn(),
  emitParcelBroadcast: jest.fn(),
  retractParcelBroadcast: jest.fn().mockResolvedValue({}),
  retractDeliveryBroadcastForOrder: jest.fn().mockResolvedValue({}),
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));
jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: jest.fn().mockReturnValue(null),
  createBullRedisClient: jest.fn().mockReturnValue(null),
  getRedisOptionsForBull: jest.fn().mockReturnValue({}),
  validateRedisConnection: jest.fn().mockResolvedValue(false),
  waitForRedis: jest.fn().mockResolvedValue(false),
  isRedisEnabled: jest.fn().mockReturnValue(false),
}));

// Real business services
const {
  deliveryPartnerHasActiveJob,
  syncDeliveryPartnerBusyFlag,
} = await import("../app/services/deliveryBusyService.js");

const {
  getAllEligibleParcelRiderIds,
  getParcelRiderIdsNearPickup,
} = await import("../app/services/deliveryNearbyService.js");

const {
  fetchAvailableParcelsForRider,
  parcelAcceptAtomic,
} = await import("../app/services/parcelWorkflowService.js");

const {
  deliveryAcceptAtomic,
  verifyHandoffOtpAndDeliver,
} = await import("../app/services/orderWorkflowService.js");

describe("E2E Cross-Module Single Job Isolation Flow", () => {
  const riderOid = new mongoose.Types.ObjectId();
  const riderId = riderOid.toString();

  beforeEach(() => {
    db.deliveries.clear();
    db.orders.clear();
    db.parcels.clear();
    db.cityParcels.clear();

    // Initial State: Free Rider, Online, Verified for both store delivery and parcels
    db.deliveries.set(riderId, {
      _id: riderOid,
      name: "Super Rider",
      phone: "9988776655",
      isOnline: true,
      isVerified: true,
      isBusy: false,
      isQuickCommerceService: true,
      isParcelService: true,
      location: {
        type: "Point",
        coordinates: [77.5946, 12.9716], // Bangalore
      },
    });
  });

  test("Full lifecycle: Store Order acceptance blocks Parcel broadcasts & claims -> OTP delivery frees rider -> allows next job", async () => {
    // 1. Verify initially rider is free and discoverable for parcels
    expect(await deliveryPartnerHasActiveJob(riderOid)).toBe(false);
    let eligibleParcelRiders = await getAllEligibleParcelRiderIds();
    expect(eligibleParcelRiders).toContain(riderId);

    // 2. Rider accepts a Quick Commerce Store Order
    const orderId = "ORD-E2E-001";
    db.orders.set(orderId, {
      _id: new mongoose.Types.ObjectId(),
      orderId,
      customer: new mongoose.Types.ObjectId(),
      seller: new mongoose.Types.ObjectId(),
      workflowVersion: 2,
      workflowStatus: "DELIVERY_SEARCH",
      status: "confirmed",
      deliveryBoy: null,
      deliverySearchExpiresAt: new Date(Date.now() + 60000),
    });

    const acceptResult = await deliveryAcceptAtomic(riderOid, orderId);
    expect(acceptResult.duplicate).toBe(false);

    // Check rider is now busy
    const riderAfterAccept = db.deliveries.get(riderId);
    expect(riderAfterAccept.isBusy).toBe(true);
    expect(await deliveryPartnerHasActiveJob(riderOid)).toBe(true);

    // 3. VERIFY: While busy on Store Order, Parcel Broadcasts EXCLUDE this rider
    eligibleParcelRiders = await getAllEligibleParcelRiderIds();
    expect(eligibleParcelRiders).not.toContain(riderId);

    const nearbyParcelRiders = await getParcelRiderIdsNearPickup(12.9716, 77.5946, 5);
    expect(nearbyParcelRiders).not.toContain(riderId);

    // 4. VERIFY: Available parcels list returns empty for this busy rider
    const availableParcels = await fetchAvailableParcelsForRider(riderOid);
    expect(availableParcels).toEqual([]);

    // 5. VERIFY: Competing Parcel Accept attempt FAILS with 409
    const parcelId = new mongoose.Types.ObjectId();
    db.parcels.set(parcelId.toString(), {
      _id: parcelId,
      status: "SEARCHING",
      deliveryPartnerId: null,
      pickupAddress: { lat: 12.9716, lng: 77.5946 },
      searchExpiresAt: new Date(Date.now() + 60000),
    });

    await expect(parcelAcceptAtomic(riderOid, parcelId)).rejects.toMatchObject({
      statusCode: 409,
      message: "Finish your current job before taking another.",
    });

    // 6. VERIFY: Competing second Store Order Accept attempt FAILS with 409
    const secondOrderId = "ORD-E2E-002";
    db.orders.set(secondOrderId, {
      _id: new mongoose.Types.ObjectId(),
      orderId: secondOrderId,
      workflowVersion: 2,
      workflowStatus: "DELIVERY_SEARCH",
      deliveryBoy: null,
      deliverySearchExpiresAt: new Date(Date.now() + 60000),
    });

    await expect(deliveryAcceptAtomic(riderOid, secondOrderId)).rejects.toMatchObject({
      statusCode: 409,
      message: "Finish your current job before taking another.",
    });

    // 7. Complete the Store Order via OTP handoff
    // Transition order to OUT_FOR_DELIVERY first
    const activeOrder = db.orders.get(orderId);
    activeOrder.workflowStatus = "OUT_FOR_DELIVERY";
    activeOrder.status = "out_for_delivery";

    await verifyHandoffOtpAndDeliver(riderOid, orderId, "123456");

    // Order status is now delivered
    activeOrder.workflowStatus = "DELIVERED";
    activeOrder.status = "delivered";

    // Sync busy flag: no remaining active jobs
    const isStillBusy = await syncDeliveryPartnerBusyFlag(riderOid);
    expect(isStillBusy).toBe(false);
    expect(db.deliveries.get(riderId).isBusy).toBe(false);

    // 8. VERIFY: Rider is once again free and eligible for parcel broadcasts
    eligibleParcelRiders = await getAllEligibleParcelRiderIds();
    expect(eligibleParcelRiders).toContain(riderId);

    const nearbyAfterCompletion = await getParcelRiderIdsNearPickup(12.9716, 77.5946, 5);
    expect(nearbyAfterCompletion).toContain(riderId);

    // 9. Rider can now successfully accept the Parcel
    const parcelAccept = await parcelAcceptAtomic(riderOid, parcelId);
    expect(parcelAccept.duplicate).toBe(false);
    expect(db.deliveries.get(riderId).isBusy).toBe(true);
    expect(await deliveryPartnerHasActiveJob(riderOid)).toBe(true);

    // 10. While busy on Parcel, Store Order accept attempts are rejected
    await expect(deliveryAcceptAtomic(riderOid, secondOrderId)).rejects.toMatchObject({
      statusCode: 409,
      message: "Finish your current job before taking another.",
    });
  });
});

