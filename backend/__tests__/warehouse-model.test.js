import { jest } from "@jest/globals";
import mongoose from "mongoose";
import Warehouse from "../app/models/warehouse.js";

describe("Warehouse Model Unit Tests", () => {
  describe("findNearestActive calculation", () => {
    test("returns null if coordinates are invalid", async () => {
      const res1 = await Warehouse.findNearestActive(NaN, 75.8);
      const res2 = await Warehouse.findNearestActive(26.9, null);
      const res3 = await Warehouse.findNearestActive("invalid", "invalid");
      expect(res1).toBeNull();
      expect(res2).toBeNull();
      expect(res3).toBeNull();
    });

    test("falls back to Haversine calculation to find the closest active warehouse", async () => {
      const wJaipur = {
        _id: new mongoose.Types.ObjectId(),
        name: "Jaipur Hub",
        address: "MI Road, Jaipur",
        lat: 26.9124,
        lng: 75.7873,
        isActive: true,
      };

      const wDelhi = {
        _id: new mongoose.Types.ObjectId(),
        name: "Delhi Hub",
        address: "Connaught Place, Delhi",
        lat: 28.6328,
        lng: 77.2197,
        isActive: true,
      };

      const wInactiveClose = {
        _id: new mongoose.Types.ObjectId(),
        name: "Closed Jaipur Hub",
        address: "Tonk Road, Jaipur",
        lat: 26.89,
        lng: 75.80,
        isActive: false,
      };

      jest.spyOn(Warehouse, "findOne").mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error("No 2dsphere index in unit test")),
      });
      jest.spyOn(Warehouse, "find").mockReturnValue({
        lean: jest.fn().mockResolvedValue([wJaipur, wDelhi, wInactiveClose]),
      });

      // Customer is in Jaipur at (26.90, 75.79)
      const nearest = await Warehouse.findNearestActive(26.90, 75.79);

      expect(nearest).not.toBeNull();
      expect(nearest.name).toBe("Jaipur Hub");
      expect(nearest.distanceMeters).toBeGreaterThan(0);
      expect(nearest.distanceMeters).toBeLessThan(50000); // Less than 50km
    });
  });
});

