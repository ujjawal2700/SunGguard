import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";

// There is no database in this suite. Without this, any handler that reaches
// Mongoose parks for the default ten-second buffer window and the test times
// out with no useful signal. Failing fast turns that into a 500, which is all
// these assertions need: a 500 proves the route resolved, a 404 proves it did
// not. Behaviour that needs real persistence is not tested here.
mongoose.set("bufferTimeoutMS", 50);

/**
 * Proves the City Parcel router is mounted and reachable, and — just as
 * importantly — that mounting it did not disturb the pickup-service routes
 * it sits alongside.
 *
 * Auth is stubbed to a fixed identity so these assert routing and guards,
 * not token handling.
 */

let currentUser = { id: "507f1f77bcf86cd799439011", role: "customer" };

jest.unstable_mockModule("../app/middleware/authMiddleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.user = currentUser;
    next();
  },
  optionalVerifyToken: (req, _res, next) => {
    req.user = currentUser;
    next();
  },
  allowRoles:
    (...roles) =>
    (req, res, next) =>
      roles.includes(req.user?.role)
        ? next()
        : res.status(403).json({ message: "forbidden" }),
  requireApprovedSeller: (_req, _res, next) => next(),
  // The booking routes gate on an active customer/delivery account; these
  // tests assert routing, not account state, so both always pass here.
  requireActiveCustomer: (_req, _res, next) => next(),
  requireActiveDelivery: (_req, _res, next) => next(),
}));

const setupRoutes = (await import("../app/routes/index.js")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  setupRoutes(app);
  return app;
}

describe("city parcel routes", () => {
  let app;

  beforeEach(() => {
    app = makeApp();
    currentUser = { id: "507f1f77bcf86cd799439011", role: "customer" };
  });

  test("the module is mounted at /api/city-parcel", async () => {
    const res = await request(app).get("/api/city-parcel/booking-config");
    // Anything but 404 proves the route resolved. It may 500 without a DB,
    // which is fine here -- we are testing wiring, not persistence.
    expect(res.status).not.toBe(404);
  });

  test("mounting it left the pickup-service routes alone", async () => {
    const res = await request(app).get("/api/parcel/booking-config");
    expect(res.status).not.toBe(404);
  });

  test("an unknown city-parcel path still 404s", async () => {
    const res = await request(app).get("/api/city-parcel/not-a-real-route");
    expect(res.status).toBe(404);
  });

  test("static rider paths are not swallowed by :cityParcelId", async () => {
    // /rider/available must reach the rider handler, not be parsed as an id.
    currentUser = { id: "507f1f77bcf86cd799439011", role: "delivery" };
    const res = await request(app).get("/api/city-parcel/rider/available");
    expect(res.status).not.toBe(404);
  });

  test("static admin paths are not swallowed by :cityParcelId", async () => {
    currentUser = { id: "507f1f77bcf86cd799439011", role: "admin" };
    const res = await request(app).get("/api/city-parcel/admin/config");
    expect(res.status).not.toBe(404);
  });

  test("rider routes reject a customer", async () => {
    const res = await request(app).get("/api/city-parcel/rider/available");
    expect(res.status).toBe(403);
  });

  test("admin routes reject a rider", async () => {
    currentUser = { id: "507f1f77bcf86cd799439011", role: "delivery" };
    const res = await request(app).get("/api/city-parcel/admin/all");
    expect(res.status).toBe(403);
  });

  test("booking payload is validated before it reaches the controller", async () => {
    const res = await request(app)
      .post("/api/city-parcel/create")
      .send({ pickupAddress: { fullAddress: "x", lat: 999, lng: 0 } });

    expect(res.status).toBe(400);
    // A useful message, not a cast error from deep inside Mongoose.
    expect(JSON.stringify(res.body)).toMatch(/receiver|lat|address|required/i);
  });

  test("a receiver name and phone are both required", async () => {
    const res = await request(app)
      .post("/api/city-parcel/create")
      .send({
        pickupAddress: { fullAddress: "12 MG Road, Indore", lat: 22.71, lng: 75.85 },
        dropAddress: { fullAddress: "4 Vijay Nagar, Indore", lat: 22.75, lng: 75.89 },
        package: { packageType: "document", weightKg: 0.5 },
        paymentMethod: "COD",
        receiver: { name: "Priya" },
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/phone|number/i);
  });
});
