import { jest } from "@jest/globals";
import mongoose from "mongoose";

const mockOrderFind = jest.fn();
const mockOrderFindOne = jest.fn();
const mockOrderFindById = jest.fn();
const mockDeliveryFindById = jest.fn();
const mockHasActiveJob = jest.fn();
const mockMarkBusy = jest.fn();
const mockSyncBusy = jest.fn();
const mockValidateReturnDropOtp = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    find: mockOrderFind,
    findOne: mockOrderFindOne,
    findById: mockOrderFindById,
  },
}));

jest.unstable_mockModule("../app/models/delivery.js", () => ({
  default: {
    findById: mockDeliveryFindById,
  },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {},
}));

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    findByIdAndUpdate: jest.fn().mockResolvedValue(true),
  },
}));

jest.unstable_mockModule("../app/models/stockHistory.js", () => ({
  default: {
    create: jest.fn().mockResolvedValue(true),
  },
}));

jest.unstable_mockModule("../app/models/transaction.js", () => ({
  default: {
    create: jest.fn().mockResolvedValue(true),
    findOneAndUpdate: jest.fn().mockResolvedValue(true),
  },
}));

jest.unstable_mockModule("../app/services/deliveryBusyService.js", () => ({
  deliveryPartnerHasActiveJob: mockHasActiveJob,
  markDeliveryPartnerBusy: mockMarkBusy,
  syncDeliveryPartnerBusyFlag: mockSyncBusy,
  clearDeliveryPartnerBusy: jest.fn(),
}));

jest.unstable_mockModule("../app/services/deliveryOtpService.js", () => ({
  generateReturnPickupOtp: jest.fn(),
  validateReturnPickupOtp: jest.fn(),
  generateReturnDropOtp: jest.fn(),
  validateReturnDropOtp: mockValidateReturnDropOtp,
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: jest.fn(),
  sellerAcceptAtomic: jest.fn(),
  sellerRejectAtomic: jest.fn(),
  deliveryAcceptAtomic: jest.fn(),
  customerCancelV2: jest.fn(),
  startReturnPickupBroadcast: jest.fn(),
  removeReturnPickupTimeoutJob: jest.fn(),
  removeSellerTimeoutJob: jest.fn(),
  resolveWorkflowStatus: jest.fn((o) => o?.workflowStatus || "CREATED"),
  confirmPickupAtomic: jest.fn(),
  markArrivedAtStoreAtomic: jest.fn(),
  advanceDeliveryRiderUiAtomic: jest.fn(),
  requestHandoffOtpAtomic: jest.fn(),
  verifyHandoffOtpAndDeliver: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({
  compensateOrderCancellation: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  freezeFinancialSnapshot: jest.fn().mockResolvedValue(true),
  reverseOrderFinanceOnCancellation: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToSeller: jest.fn(),
  emitToDelivery: jest.fn(),
  emitReturnBroadcastForCustomer: jest.fn(),
  emitDeliveryBroadcastForSeller: jest.fn(),
  retractDeliveryBroadcastForOrder: jest.fn().mockResolvedValue({}),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));

const {
  acceptReturnPickup,
  acceptOrder,
  updateOrderStatus,
} = await import("../app/controller/orderController.js");

const {
  verifyReturnDropOtp,
} = await import("../app/controller/orderWorkflowController.js");

describe("Order Controller Busy Job Rejection & Sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("acceptReturnPickup returns 409 when rider has an active job", async () => {
    const riderId = new mongoose.Types.ObjectId();
    const orderId = "ORD-RET-201";

    mockDeliveryFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ isVerified: true }),
    });

    mockHasActiveJob.mockResolvedValue(true);

    const req = {
      params: { orderId },
      user: { id: riderId.toString(), role: "delivery" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await acceptReturnPickup(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Finish your current job before taking another.",
      }),
    );
  });

  test("legacy acceptOrder returns 409 when rider has an active job", async () => {
    const riderId = new mongoose.Types.ObjectId();
    const orderId = "ORD-LEGACY-202";

    mockDeliveryFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ isVerified: true }),
    });

    mockOrderFindOne.mockResolvedValue({
      orderId,
      workflowVersion: 1,
      deliveryBoy: null,
    });

    mockHasActiveJob.mockResolvedValue(true);

    const req = {
      params: { orderId },
      headers: {},
      user: { id: riderId.toString(), role: "delivery" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await acceptOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Finish your current job before taking another.",
      }),
    );
  });

  test("updateOrderStatus syncs rider busy flag when status becomes delivered", async () => {
    const riderId = new mongoose.Types.ObjectId();
    const orderId = "ORD-STATUS-203";

    const mockOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderId,
      status: "out_for_delivery",
      deliveryBoy: riderId,
      customer: "cust-1",
      seller: "seller-1",
      items: [],
      save: jest.fn().mockResolvedValue(true),
    };

    mockOrderFindOne.mockResolvedValue(mockOrder);
    mockOrderFindById.mockResolvedValue(mockOrder);

    const req = {
      params: { orderId },
      body: { status: "delivered" },
      user: { id: "admin-1", role: "admin" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await updateOrderStatus(req, res);

    expect(mockSyncBusy).toHaveBeenCalledWith(riderId);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("verifyReturnDropOtp calls syncDeliveryPartnerBusyFlag on drop completion", async () => {
    const riderId = new mongoose.Types.ObjectId();
    const orderId = "ORD-RET-204";

    const mockOrder = {
      orderId,
      customer: "cust-1",
      seller: "seller-1",
      returnDeliveryBoy: riderId.toString(),
      returnStatus: "return_drop_pending",
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockResolvedValue(true),
    };

    mockOrderFindOne.mockResolvedValue(mockOrder);
    mockValidateReturnDropOtp.mockResolvedValue({ valid: true });

    const req = {
      params: { orderId },
      body: { code: "123456" },
      user: { id: riderId.toString(), role: "delivery" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await verifyReturnDropOtp(req, res);

    expect(mockSyncBusy).toHaveBeenCalledWith(riderId.toString());
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
