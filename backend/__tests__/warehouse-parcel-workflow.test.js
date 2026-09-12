import { jest } from "@jest/globals";
import mongoose from "mongoose";

const mockWarehouseFind = jest.fn();
const mockWarehouseFindOne = jest.fn();
const mockWarehouseFindNearestActive = jest.fn();
const mockParcelFindByIdAndUpdate = jest.fn();
const mockParcelFindOneAndUpdate = jest.fn();
const mockGetSearchSettings = jest.fn().mockResolvedValue({ baseSearchRadiusKm: 5 });
const mockIoEmit = jest.fn();
const mockIoTo = jest.fn().mockReturnValue({ emit: mockIoEmit });

jest.unstable_mockModule("../app/models/warehouse.js", () => ({
  default: {
    find: mockWarehouseFind,
    findOne: mockWarehouseFindOne,
    findNearestActive: mockWarehouseFindNearestActive,
  },
}));

jest.unstable_mockModule("../app/models/parcel.js", () => ({
  default: {
    findByIdAndUpdate: mockParcelFindByIdAndUpdate,
    findOneAndUpdate: mockParcelFindOneAndUpdate,
  },
}));

jest.unstable_mockModule("../app/models/parcelConfig.js", () => ({
  default: {
    getSearchSettings: mockGetSearchSettings,
  },
}));

jest.unstable_mockModule("../app/models/delivery.js", () => ({
  default: {
    find: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule("../app/models/notification.js", () => ({
  default: {
    insertMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({}),
  },
}));

const mockGetParcelRiderIdsNearPickup = jest.fn().mockResolvedValue([]);
jest.unstable_mockModule("../app/services/deliveryNearbyService.js", () => ({
  getParcelRiderIdsNearPickup: mockGetParcelRiderIdsNearPickup,
  getDeliveryPartnerIdsWithinSellerRadius: jest.fn().mockResolvedValue([]),
  getDeliveryPartnerIdsWithinCustomerRadius: jest.fn().mockResolvedValue([]),
}));

const mockGetParcelSellerIdsNearPickup = jest.fn().mockResolvedValue(["seller-123"]);
const mockFindNearestParcelSellerNearPickup = jest.fn().mockResolvedValue({ _id: "seller-123" });

jest.unstable_mockModule("../app/services/sellerNearbyService.js", () => ({
  getParcelSellerIdsNearPickup: mockGetParcelSellerIdsNearPickup,
  findNearestParcelSellerNearPickup: mockFindNearestParcelSellerNearPickup,
  findNearestParcelSellerWithDistance: jest.fn(),
  getApprovedParcelSeller: jest.fn(),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
  NOTIFICATION_EVENTS: {
    NEW_PARCEL_BROADCAST: "notification:parcel:new_broadcast",
  },
}));

/**
 * Every status change now appends a row to the parcel's timeline. That write
 * goes to a real mongoose model, which — with no connection open under a unit
 * test — buffers instead of failing, so an accept or a status update hung
 * until the test timed out. The trail itself is covered elsewhere; here it
 * only has to not block the transition being tested.
 */
jest.unstable_mockModule("../app/services/parcelEventService.js", () => ({
  recordParcelEvent: jest.fn(async () => null),
  PARCEL_EVENT_ACTOR: {
    CUSTOMER: "customer",
    DELIVERY: "delivery",
    ADMIN: "admin",
    SYSTEM: "system",
  },
}));

jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: jest.fn().mockReturnValue(null),
}));

const {
  registerOrderSocketGetter,
  emitParcelNewToNearbySellers,
} = await import("../app/services/orderSocketEmitter.js");

registerOrderSocketGetter(() => ({
  to: mockIoTo,
}));

const {
  tryAutoAssignParcelToWarehouse,
  tryAutoAssignParcelToSeller,
  startParcelBroadcast,
  parcelBroadcastPayloadFromDoc,
} = await import("../app/services/parcelWorkflowService.js");

describe("Warehouse & Outstation Parcel Workflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("tryAutoAssignParcelToWarehouse", () => {
    test("assigns nearest warehouse, updates dropAddress, and sets deliveryInstruction", async () => {
      const warehouseId = new mongoose.Types.ObjectId();
      const parcelId = new mongoose.Types.ObjectId();

      mockWarehouseFindNearestActive.mockResolvedValueOnce({
        _id: warehouseId,
        name: "Central Logistics Hub",
        address: "123 Industrial Area, Phase 2",
        city: "Jaipur",
        pincode: "302001",
        phone: "9876543210",
        contactPerson: "Rajesh Kumar",
        lat: 26.85,
        lng: 75.80,
      });

      const updatedParcel = {
        _id: parcelId,
        warehouseId,
        deliveryInstruction: "deliver_to_warehouse",
        dropAddress: {
          fullAddress: "123 Industrial Area, Phase 2, Jaipur",
          lat: 26.85,
          lng: 75.80,
          name: "Central Logistics Hub",
          phone: "9876543210",
        },
      };

      mockParcelFindOneAndUpdate.mockResolvedValueOnce(updatedParcel);

      const result = await tryAutoAssignParcelToWarehouse({
        _id: parcelId,
        pickupAddress: { lat: 26.90, lng: 75.78 },
      });

      // Zone-scoped when the parcel has one — this parcel doesn't, so the
      // zone arg is null (see tryAutoAssignParcelToWarehouse).
      expect(mockWarehouseFindNearestActive).toHaveBeenCalledWith(26.90, 75.78, null, null);
      expect(mockParcelFindOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: parcelId }),
        expect.objectContaining({
          $set: expect.objectContaining({
            warehouseId,
            deliveryInstruction: "deliver_to_warehouse",
            dropAddress: expect.objectContaining({
              name: "Central Logistics Hub",
              phone: "9876543210",
            }),
          }),
        }),
        { new: true }
      );
      expect(result).toEqual(updatedParcel);
    });

    test("returns null if no pickup coordinates are available", async () => {
      const result = await tryAutoAssignParcelToWarehouse({
        _id: new mongoose.Types.ObjectId(),
        pickupAddress: {},
      });
      expect(result).toBeNull();
      expect(mockWarehouseFindNearestActive).not.toHaveBeenCalled();
    });

    test("returns null if no active warehouse is found", async () => {
      mockWarehouseFindNearestActive.mockResolvedValueOnce(null);
      const result = await tryAutoAssignParcelToWarehouse({
        _id: new mongoose.Types.ObjectId(),
        pickupAddress: { lat: 26.90, lng: 75.78 },
      });
      expect(result).toBeNull();
      expect(mockParcelFindOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("startParcelBroadcast differentiation", () => {
    test("for outstation parcel: assigns warehouse and never queries/assigns seller", async () => {
      const parcelId = new mongoose.Types.ObjectId();
      const warehouseId = new mongoose.Types.ObjectId();

      mockWarehouseFindNearestActive.mockResolvedValueOnce({
        _id: warehouseId,
        name: "North Hub",
        address: "Site A",
        lat: 28.6,
        lng: 77.2,
      });

      mockParcelFindOneAndUpdate.mockResolvedValueOnce({
        _id: parcelId,
        warehouseId,
      });

      mockParcelFindByIdAndUpdate.mockResolvedValueOnce({
        _id: parcelId,
        status: "SEARCHING",
        parcelType: "outstation",
        pickupAddress: { lat: 28.5, lng: 77.1 },
        customerId: "cust-1",
      });

      await startParcelBroadcast({
        _id: parcelId,
        parcelType: "outstation",
        pickupAddress: { lat: 28.5, lng: 77.1 },
      });

      // Assigned warehouse (unzoned parcel, so the zone arg is null)
      expect(mockWarehouseFindNearestActive).toHaveBeenCalledWith(28.5, 77.1, null, null);
      // No seller lookup or seller socket emission
      expect(mockFindNearestParcelSellerNearPickup).not.toHaveBeenCalled();
      expect(mockIoTo).not.toHaveBeenCalledWith(expect.stringMatching(/^seller:/));
    });

    test("for local parcel: assigns seller and does NOT look up warehouse", async () => {
      const parcelId = new mongoose.Types.ObjectId();

      mockParcelFindOneAndUpdate.mockResolvedValueOnce({
        _id: parcelId,
        sellerId: "seller-123",
      });

      mockParcelFindByIdAndUpdate.mockResolvedValueOnce({
        _id: parcelId,
        status: "SEARCHING",
        parcelType: "local",
        pickupAddress: { lat: 28.5, lng: 77.1 },
        customerId: "cust-1",
      });

      await startParcelBroadcast({
        _id: parcelId,
        parcelType: "local",
        pickupAddress: { lat: 28.5, lng: 77.1 },
      });

      // Assigned seller
      expect(mockFindNearestParcelSellerNearPickup).toHaveBeenCalledWith(28.5, 77.1);
      // No warehouse lookup
      expect(mockWarehouseFindNearestActive).not.toHaveBeenCalled();
    });
  });

  describe("emitParcelNewToNearbySellers protection", () => {
    test("does NOT emit to seller app when parcelType is outstation", async () => {
      await emitParcelNewToNearbySellers({
        _id: "parcel-outstation-1",
        parcelType: "outstation",
        pickupAddress: { lat: 28.5, lng: 77.1 },
      });

      expect(mockGetParcelSellerIdsNearPickup).not.toHaveBeenCalled();
      expect(mockIoTo).not.toHaveBeenCalled();
    });

    test("emits to seller app when parcelType is local", async () => {
      await emitParcelNewToNearbySellers({
        _id: "parcel-local-1",
        parcelType: "local",
        pickupAddress: { lat: 28.5, lng: 77.1 },
      });

      expect(mockGetParcelSellerIdsNearPickup).toHaveBeenCalledWith(28.5, 77.1);
      expect(mockIoTo).toHaveBeenCalledWith("seller:seller-123");
      expect(mockIoEmit).toHaveBeenCalledWith("parcel:new", expect.anything());
    });
  });

  describe("parcelBroadcastPayloadFromDoc", () => {
    test("includes parcelType, deliveryInstruction, and warehouseId in broadcast preview", () => {
      const warehouseId = new mongoose.Types.ObjectId();
      const parcel = {
        _id: "p-123",
        status: "SEARCHING",
        parcelType: "outstation",
        deliveryInstruction: "deliver_to_warehouse",
        warehouseId,
        pickupAddress: { fullAddress: "Customer Home, Jaipur" },
        dropAddress: { fullAddress: "Central Warehouse, Jaipur" },
        fare: 150,
      };

      const payload = parcelBroadcastPayloadFromDoc(parcel);

      expect(payload.preview.parcelType).toBe("outstation");
      expect(payload.preview.deliveryInstruction).toBe("deliver_to_warehouse");
      expect(String(payload.preview.warehouseId)).toBe(String(warehouseId));
      expect(payload.preview.drop).toBe("Central Warehouse, Jaipur");
    });
  });
});

