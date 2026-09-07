import { jest } from "@jest/globals";
import mongoose from "mongoose";

const mockOrderFindOne = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
  },
}));

const { getAssignedOrder } = await import("../app/controller/orderController.js");
const orderRoutes = (await import("../app/routes/orderRoutes.js")).default;

function makeQueryChain(result) {
  return {
    sort: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

describe("Assigned Store Order Endpoint and Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Route registration", () => {
    test("registers GET /assigned and GET /rider/assigned in order router", () => {
      const routes = orderRoutes.stack
        .filter((layer) => layer.route)
        .map((layer) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      const assignedRoute = routes.find((r) => r.path === "/assigned");
      const riderAssignedRoute = routes.find((r) => r.path === "/rider/assigned");

      expect(assignedRoute).toBeDefined();
      expect(assignedRoute.methods).toContain("get");

      expect(riderAssignedRoute).toBeDefined();
      expect(riderAssignedRoute.methods).toContain("get");
    });
  });

  describe("getAssignedOrder controller", () => {
    test("rejects request when userId is missing", async () => {
      const req = { user: null };
      const res = createMockRes();

      await getAssignedOrder(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Unauthorized/i);
    });

    test("rejects access for non-delivery and non-admin roles", async () => {
      const req = {
        user: { id: "507f1f77bcf86cd799439011", role: "customer" },
      };
      const res = createMockRes();

      await getAssignedOrder(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Access denied/i);
    });

    test("returns 200 with result: null when rider has no active assigned order", async () => {
      mockOrderFindOne.mockReturnValue(makeQueryChain(null));

      const req = {
        user: { id: "6a9ab4ee32197c0eef3de0a7", role: "delivery" },
      };
      const res = createMockRes();

      await getAssignedOrder(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.error).toBe(false);
      expect(res.body.message).toBe("No active assigned store order");
      expect(res.body.result).toBeNull();
    });

    test("returns 200 with populated assigned order payload when active order exists", async () => {
      const mockOrderData = {
        _id: "699b4cbdbdd7f3ef4dbd7c74",
        orderId: "ORD177178540540545",
        status: "confirmed",
        workflowStatus: "DELIVERY_SEARCH",
        orderStatus: "pending",
        seller: {
          _id: "6999782fd49e8099e8a7b11c",
          name: "Harsh",
          shopName: "Harsh's Hub",
          phone: "6268423925",
          address: "Indore, MP",
          location: {
            type: "Point",
            coordinates: [75.8564, 22.7174],
          },
        },
        customer: {
          _id: "6999d3bc345bd585624bf33b",
          name: "Harshvardhan Panchal",
          phone: "9876543210",
        },
        address: {
          type: "Home",
          name: "Harshvardhan Panchal",
          address: "81 Pipliyahana Road",
          city: "Indore",
        },
        items: [
          {
            _id: "item1",
            name: "sare",
            quantity: 1,
            price: 500,
            image: "https://res.cloudinary.com/dv1l9sb4p/image/upload/sample.png",
          },
        ],
        payment: {
          method: "cash",
          status: "pending",
        },
        pricing: {
          subtotal: 500,
          deliveryFee: 0,
          platformFee: 3,
          gst: 25,
          tip: 0,
          total: 528,
        },
        deliveryBoy: {
          _id: "6a9ab4ee32197c0eef3de0a7",
          name: "monu",
          phone: "9632587410",
        },
      };

      mockOrderFindOne.mockReturnValue(makeQueryChain(mockOrderData));

      const req = {
        user: { id: "6a9ab4ee32197c0eef3de0a7", role: "delivery" },
      };
      const res = createMockRes();

      await getAssignedOrder(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.error).toBe(false);
      expect(res.body.message).toBe("Assigned store order retrieved successfully");
      expect(res.body.result).toBeDefined();
      expect(res.body.result._id).toBe("699b4cbdbdd7f3ef4dbd7c74");
      expect(res.body.result.orderId).toBe("ORD177178540540545");
      expect(res.body.result.seller.shopName).toBe("Harsh's Hub");
      expect(res.body.result.customer.phone).toBe("9876543210");
      expect(res.body.result.items[0].name).toBe("sare");
      expect(res.body.result.deliveryBoy._id).toBe("6a9ab4ee32197c0eef3de0a7");
    });

    test("allows admin role to access assigned store order", async () => {
      mockOrderFindOne.mockReturnValue(makeQueryChain(null));

      const req = {
        user: { id: "admin123", role: "admin" },
      };
      const res = createMockRes();

      await getAssignedOrder(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test("handles return delivery boy assignment", async () => {
      const mockReturnOrder = {
        _id: "returnOrder123",
        orderId: "RET177178540540545",
        status: "confirmed",
        returnStatus: "return_pickup_assigned",
        returnDeliveryBoy: {
          _id: "6a9ab4ee32197c0eef3de0a7",
          name: "monu",
        },
      };

      mockOrderFindOne.mockReturnValue(makeQueryChain(mockReturnOrder));

      const req = {
        user: { id: "6a9ab4ee32197c0eef3de0a7", role: "delivery" },
      };
      const res = createMockRes();

      await getAssignedOrder(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.result.orderId).toBe("RET177178540540545");
      expect(res.body.result.returnDeliveryBoy.name).toBe("monu");
    });

    test("verifies MongoDB query filters out delivered, cancelled, and returned statuses", async () => {
      mockOrderFindOne.mockReturnValue(makeQueryChain(null));

      const req = {
        user: { id: "6a9ab4ee32197c0eef3de0a7", role: "delivery" },
      };
      const res = createMockRes();

      await getAssignedOrder(req, res);

      expect(mockOrderFindOne).toHaveBeenCalledTimes(1);
      const queryArg = mockOrderFindOne.mock.calls[0][0];

      // Verify the query structure
      expect(queryArg.$or).toBeDefined();
      const storeOrderCondition = queryArg.$or[0];
      expect(storeOrderCondition.status.$nin).toEqual(["delivered", "cancelled", "returned"]);
      expect(storeOrderCondition.orderStatus.$nin).toEqual(["delivered", "cancelled", "returned"]);
      expect(storeOrderCondition.workflowStatus.$nin).toEqual(["DELIVERED", "CANCELLED"]);
    });

    test("normalizes fallbacks for image, deliveryPartner, pricing, and payment", async () => {
      const mockRawOrder = {
        _id: "699b4cbdbdd7f3ef4dbd7c74",
        orderId: "ORD177178540540545",
        status: "confirmed",
        deliveryPartner: {
          _id: "6a9ab4ee32197c0eef3de0a7",
          name: "monu",
        },
        items: [
          {
            _id: "item1",
            name: "product without direct image",
            product: { mainImage: "https://example.com/fallback.png" },
          },
        ],
        paymentMode: "ONLINE",
        paymentStatus: "PAID",
        paymentBreakdown: {
          productSubtotal: 100,
          deliveryFeeCharged: 20,
          handlingFeeCharged: 5,
          taxTotal: 10,
          tipTotal: 0,
          grandTotal: 135,
        },
      };

      mockOrderFindOne.mockReturnValue(makeQueryChain(mockRawOrder));

      const req = {
        user: { id: "6a9ab4ee32197c0eef3de0a7", role: "delivery" },
      };
      const res = createMockRes();

      await getAssignedOrder(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.result.deliveryBoy._id).toBe("6a9ab4ee32197c0eef3de0a7");
      expect(res.body.result.items[0].image).toBe("https://example.com/fallback.png");
      expect(res.body.result.pricing.total).toBe(135);
      expect(res.body.result.payment.method).toBe("online");
    });

    test("normalizes address and seller locations to GeoJSON coordinates", async () => {
      const mockRawOrder = {
        _id: "699b4cbdbdd7f3ef4dbd7c74",
        orderId: "ORD177178540540545",
        status: "confirmed",
        seller: {
          _id: "seller123",
          location: {
            type: "Point",
            coordinates: [75.8564, 22.7174],
          },
        },
        address: {
          name: "Harshvardhan",
          location: {
            lat: 22.7278,
            lng: 75.8844,
          },
        },
      };

      mockOrderFindOne.mockReturnValue(makeQueryChain(mockRawOrder));

      const req = {
        user: { id: "6a9ab4ee32197c0eef3de0a7", role: "delivery" },
      };
      const res = createMockRes();

      await getAssignedOrder(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.result.address.location.type).toBe("Point");
      expect(res.body.result.address.location.coordinates).toEqual([75.8844, 22.7278]);
      expect(res.body.result.address.location.lat).toBe(22.7278);
      expect(res.body.result.address.location.lng).toBe(75.8844);

      expect(res.body.result.seller.location.type).toBe("Point");
      expect(res.body.result.seller.location.coordinates).toEqual([75.8564, 22.7174]);
      expect(res.body.result.seller.location.lat).toBe(22.7174);
      expect(res.body.result.seller.location.lng).toBe(75.8564);
    });
  });
});


