import { jest } from "@jest/globals";

const mockDeliveryFind = jest.fn();

jest.unstable_mockModule("../app/models/delivery.js", () => ({
  default: {
    find: mockDeliveryFind,
  },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {},
}));

const {
  getAllEligibleParcelRiderIds,
  getParcelRiderIdsNearPickup,
} = await import("../app/services/deliveryNearbyService.js");

describe("deliveryNearbyService parcel filters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getAllEligibleParcelRiderIds filters out busy riders in buildParcelDeliveryFilter", async () => {
    mockDeliveryFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { _id: "rider-1" },
      ]),
    });

    const ids = await getAllEligibleParcelRiderIds();

    expect(mockDeliveryFind).toHaveBeenCalledTimes(1);
    const queryArg = mockDeliveryFind.mock.calls[0][0];
    expect(queryArg).toEqual(
      expect.objectContaining({
        isOnline: true,
        isVerified: true,
        isParcelService: true,
        isBusy: { $ne: true },
      }),
    );
    expect(ids).toEqual(["rider-1"]);
  });

  test("getParcelRiderIdsNearPickup query base includes isBusy: { $ne: true }", async () => {
    mockDeliveryFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    await getParcelRiderIdsNearPickup(12.97, 77.59, 5);

    expect(mockDeliveryFind).toHaveBeenCalledTimes(1);
    const queryArg = mockDeliveryFind.mock.calls[0][0];
    expect(queryArg.isBusy).toEqual({ $ne: true });
  });
});

