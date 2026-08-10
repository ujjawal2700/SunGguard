import Delivery from "../../models/delivery.js";
import Order from "../../models/order.js";
import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";

export const getDeliveryPartners = async (req, res) => {
  try {
    const { status, verified, search } = req.query;
    const query = {};

    if (status === "online") {
      query.isOnline = true;
    } else if (status === "offline") {
      query.isOnline = false;
    }

    if (verified === "true") {
      query.isVerified = true;
    } else if (verified === "false") {
      query.isVerified = false;
    }

    if (search && String(search).trim()) {
      const term = String(search).trim();
      query.$or = [
        { name: { $regex: term, $options: "i" } },
        { phone: { $regex: term, $options: "i" } },
        { email: { $regex: term, $options: "i" } },
        { vehicleNumber: { $regex: term, $options: "i" } },
        { drivingLicenseNumber: { $regex: term, $options: "i" } },
      ];
    }

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const partnerFields = [
      "name",
      "phone",
      "email",
      "address",
      "vehicleType",
      "vehicleNumber",
      "drivingLicenseNumber",
      "aadharNumber",
      "panNumber",
      "accountHolder",
      "accountNumber",
      "ifsc",
      "profileImage",
      "documents",
      "isVerified",
      "isParcelService",
      "isQuickCommerceService",
      // CAR WASH DISABLED — "isCarWashService",
      "experience",
      "experienceDetails",
      "currentArea",
      "createdAt",
    ].join(" ");

    const [deliveryPartners, total] = await Promise.all([
      Delivery.find(query)
        .select(partnerFields)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Delivery.countDocuments(query),
    ]);

    return handleResponse(res, 200, "Delivery partners fetched successfully", {
      items: deliveryPartners,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getDeliveryPartnerById = async (req, res) => {
  try {
    const rider = await Delivery.findById(req.params.id)
      .select(
        "name phone email address vehicleType vehicleNumber drivingLicenseNumber aadharNumber panNumber accountHolder accountNumber ifsc profileImage documents isVerified isParcelService isQuickCommerceService experience experienceDetails currentArea createdAt",
        // CAR WASH DISABLED — removed isCarWashService from select
      )
      .lean();
    if (!rider) {
      return handleResponse(res, 404, "Delivery partner not found");
    }
    return handleResponse(res, 200, "Delivery partner fetched successfully", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateDeliveryPartnerIdentity = async (req, res) => {
  try {
    const { aadharNumber, panNumber } = req.body || {};
    const rider = await Delivery.findById(req.params.id);
    if (!rider) {
      return handleResponse(res, 404, "Delivery partner not found");
    }

    const updates = {};
    if (aadharNumber !== undefined) {
      const digits = String(aadharNumber).replace(/\D/g, "").slice(0, 12);
      if (digits.length !== 12) {
        return handleResponse(res, 400, "Aadhar number must be exactly 12 digits");
      }
      updates.aadharNumber = digits;
    }
    if (panNumber !== undefined) {
      const pan = String(panNumber).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
        return handleResponse(res, 400, "Invalid PAN format");
      }
      updates.panNumber = pan;
    }

    if (!Object.keys(updates).length) {
      return handleResponse(res, 400, "No identity fields to update");
    }

    Object.assign(rider, updates);
    await rider.save();

    return handleResponse(res, 200, "Identity details updated", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const approveDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndUpdate(
      id,
      { isVerified: true },
      { new: true },
    );

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(res, 200, "Rider approved successfully", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const rejectDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndDelete(id);

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(
      res,
      200,
      "Rider application rejected and removed",
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getActiveFleet = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = {
      deliveryBoy: { $ne: null },
      status: {
        $in: ["confirmed", "packed", "shipped", "out_for_delivery"],
      },
    };

    const [activeOrders, total] = await Promise.all([
      Order.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("deliveryBoy", "name phone documents vehicleType")
        .populate("seller", "shopName address name")
        .populate("customer", "name phone")
        .lean(),
      Order.countDocuments(query),
    ]);

    const fleetData = activeOrders.map((order) => ({
      id: order.orderId,
      status:
        order.status === "out_for_delivery"
          ? "On the Way"
          : order.status === "packed"
            ? "At Pickup"
            : order.status === "shipped"
              ? "In Transit"
              : "Assigned",
      deliveryBoy: {
        name: order.deliveryBoy?.name || "Unknown",
        phone: order.deliveryBoy?.phone || "N/A",
        id: order.deliveryBoy?._id || "N/A",
        vehicle: order.deliveryBoy?.vehicleType || "N/A",
        image:
          order.deliveryBoy?.documents?.profileImage ||
          "https://via.placeholder.com/200",
      },
      seller: {
        name: order.seller?.shopName || order.seller?.name || "Unknown",
      },
      customer: {
        name: order.customer?.name || "Guest",
        phone: order.customer?.phone || "N/A",
      },
      lastUpdate: order.updatedAt,
    }));

    return handleResponse(res, 200, "Active fleet fetched successfully", {
      items: fleetData,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
