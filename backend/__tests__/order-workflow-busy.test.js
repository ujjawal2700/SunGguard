import { jest } from "@jest/globals";
import mongoose from "mongoose";

const mockDeliveryFindById = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockOrderOtpFindOne = jest.fn();
const mockOrderOtpHashCode = jest.fn();
const mockHasActiveJob = jest.fn();
const mockMarkBusy = jest.fn();
const mockSyncBusy = jest.fn();
const mockOrderFindOne = jest.fn().mockImplementation((query) => {
  const orderObj = {
    orderId: query?.orderId || "ORD-TEST",
    workflowVersion: 2,
    workflowStatus: "OUT_FOR_DELIVERY",
    status: "out_for_delivery",
    customer: { _id: "cust-1", name: "Customer", phone: "123" },
    deliveryBoy: query?.deliveryBoy || "rider-1",
  };
  return {
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(orderObj),
    then: jest.fn((resolve) => resolve(orderObj)),
    catch: jest.fn(),
  };
});

jest.unstable_mockModule("../app/models/delivery.js", () => ({
  default: {
    findById: mockDeliveryFindById,
  },
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOneAndUpdate: mockOrderFindOneAndUpdate,
    findOne: mockOrderFindOne,
  },
}));

jest.unstable_mockModule("../app/models/orderOtp.js", () => ({
  default: {
    findOne: mockOrderOtpFindOne,
    hashCode: mockOrderOtpHashCode,
    updateOne: jest.fn().mockResolvedValue(true),
  },
}));

jest.unstable_mockModule("../app/models/deliveryAssignment.js", () => ({
  default: {
    findOne: jest.fn().mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    }),
  },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {},
}));

jest.unstable_mockModule("../app/models/customer.js", () => ({
  default: {},
}));

jest.unstable_mockModule("../app/services/deliveryBusyService.js", () => ({
  deliveryPartnerHasActiveJob: mockHasActiveJob,
  markDeliveryPartnerBusy: mockMarkBusy,
  clearDeliveryPartnerBusy: jest.fn(),
  syncDeliveryPartnerBusyFlag: mockSyncBusy,
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

const {
  deliveryAcceptAtomic,
  verifyHandoffOtpAndDeliver,
} = await import("../app/services/orderWorkflowService.js");

describe("orderWorkflowService busy locking & completion sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("deliveryAcceptAtomic rejects with 409 when rider has an active job", async () => {
    const riderId = new mongoose.Types.ObjectId();
    const orderId = "ORD-TEST-101";

    mockDeliveryFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: riderId,
        isVerified: true,
      }),
    });

    mockHasActiveJob.mockResolvedValue(true);

    await expect(deliveryAcceptAtomic(riderId, orderId)).rejects.toMatchObject({
      statusCode: 409,
      message: "Finish your current job before taking another.",
    });

    expect(mockHasActiveJob).toHaveBeenCalledWith(riderId);
    expect(mockMarkBusy).not.toHaveBeenCalled();
    expect(mockOrderFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test("deliveryAcceptAtomic accepts order and marks rider busy when free", async () => {
    const riderId = new mongoose.Types.ObjectId();
    const orderId = "ORD-TEST-102";

    mockDeliveryFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: riderId,
        isVerified: true,
      }),
    });

    mockHasActiveJob.mockResolvedValue(false);

    const updatedOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderId,
      deliveryBoy: riderId,
      customer: "cust-1",
      seller: "seller-1",
      deliverySearchMeta: { attempt: 1 },
    };

    mockOrderFindOneAndUpdate.mockResolvedValue(updatedOrder);

    const result = await deliveryAcceptAtomic(riderId, orderId);

    expect(mockHasActiveJob).toHaveBeenCalledWith(riderId);
    expect(mockMarkBusy).toHaveBeenCalledWith(riderId);
    expect(result.duplicate).toBe(false);
  });

  test("verifyHandoffOtpAndDeliver calls syncDeliveryPartnerBusyFlag instead of clearBusy", async () => {
    const riderId = new mongoose.Types.ObjectId();
    const orderId = "ORD-TEST-103";
    const customerId = new mongoose.Types.ObjectId();

    mockOrderOtpFindOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({
        codeHash: "valid-hash",
        attempts: 0,
        maxAttempts: 3,
        expiresAt: new Date(Date.now() + 60000),
        save: jest.fn().mockResolvedValue(true),
      }),
    });
    mockOrderOtpHashCode.mockReturnValue("valid-hash");

    mockOrderFindOneAndUpdate.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      orderId,
      customer: customerId,
      workflowStatus: "delivered",
    });

    mockSyncBusy.mockResolvedValue(false);

    const result = await verifyHandoffOtpAndDeliver(riderId, orderId, "123456");

    expect(result.order.orderId).toBe(orderId);
    expect(mockSyncBusy).toHaveBeenCalledWith(riderId);
  });
});
