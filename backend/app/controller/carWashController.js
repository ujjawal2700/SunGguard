/**
 * CAR WASH FEATURE DISABLED
 * This module is not mounted (see routes/index.js). Keep for re-enable later.
 */
import CarWashBooking from "../models/carWashBooking.js";
import CarWashPackage from "../models/carWashPackage.js";
import CarWashConfig from "../models/carWashConfig.js";
import Delivery from "../models/delivery.js";
import handleResponse from "../utils/helper.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import { emitToAdmins, emitToDelivery } from "../services/orderSocketEmitter.js";

// Helper to generate a unique readable Booking ID
const generateBookingId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "CW-";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/* ==========================================================================
   PUBLIC & CUSTOMER CONTROLLERS
   ========================================================================== */

// Get all active wash packages
export const getPackages = async (req, res) => {
  try {
    const packages = await CarWashPackage.find({ isActive: true }).sort({ basePrice: 1 });
    return handleResponse(res, 200, "Packages retrieved successfully", packages);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Calculate estimated fare
export const calculateFare = async (req, res) => {
  try {
    const { packageId, vehicleType } = req.body;

    if (!packageId || !vehicleType) {
      return handleResponse(res, 400, "Package ID and Vehicle Type are required");
    }

    const pkg = await CarWashPackage.findById(packageId);
    if (!pkg) {
      return handleResponse(res, 404, "Wash package not found");
    }

    const config = await CarWashConfig.getOrCreate();
    const multiplier = config.vehicleMultipliers.get(vehicleType) || 1.0;
    const baseFare = config.baseFare;

    const totalFare = Math.round(pkg.basePrice * multiplier + baseFare);

    return handleResponse(res, 200, "Fare calculated successfully", {
      packagePrice: pkg.basePrice,
      vehicleMultiplier: multiplier,
      baseFare,
      fare: totalFare,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Create a new doorstep car wash booking
export const createBooking = async (req, res) => {
  try {
    const {
      packageId,
      vehicleType,
      bookingType,
      scheduledDateTime,
      address,
      paymentMethod,
    } = req.body;

    if (!packageId || !vehicleType || !bookingType || !address || !paymentMethod) {
      return handleResponse(res, 400, "Missing required booking details");
    }

    const pkg = await CarWashPackage.findById(packageId);
    if (!pkg) {
      return handleResponse(res, 404, "Wash package not found");
    }

    const config = await CarWashConfig.getOrCreate();
    const multiplier = config.vehicleMultipliers.get(vehicleType) || 1.0;
    const baseFare = config.baseFare;

    const totalFare = Math.round(pkg.basePrice * multiplier + baseFare);
    const commission = Math.round(totalFare * (config.commissionRate / 100));

    // Generate random 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const bookingId = generateBookingId();

    const booking = await CarWashBooking.create({
      bookingId,
      customerId: req.user.id,
      packageId,
      vehicleType,
      bookingType,
      scheduledDateTime: bookingType === "SCHEDULED" ? new Date(scheduledDateTime) : null,
      address,
      fare: totalFare,
      commission,
      paymentStatus: paymentMethod === "COD" ? "PENDING" : "PAID",
      paymentMethod,
      otp,
      status: "REQUESTED",
    });

    // Notify admins via socket
    emitToAdmins("carwash:new", booking);

    return handleResponse(res, 201, "Car wash booking created successfully", booking);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Get booking history for customer
export const getCustomerBookings = async (req, res) => {
  try {
    const bookings = await CarWashBooking.find({ customerId: req.user.id })
      .populate("packageId", "name description basePrice image")
      .populate("partnerId", "name phone profileImage vehicleNumber")
      .sort({ createdAt: -1 });

    return handleResponse(res, 200, "Customer bookings retrieved successfully", bookings);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Get single booking details (Customer / Partner / Admin)
export const getBookingDetails = async (req, res) => {
  try {
    const booking = await CarWashBooking.findById(req.params.id)
      .populate("packageId", "name description basePrice durationMinutes image")
      .populate("customerId", "name phone email")
      .populate("partnerId", "name phone profileImage vehicleType vehicleNumber location");

    if (!booking) {
      return handleResponse(res, 404, "Booking not found");
    }

    return handleResponse(res, 200, "Booking details retrieved successfully", booking);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Cancel booking (Customer)
export const cancelBooking = async (req, res) => {
  try {
    const booking = await CarWashBooking.findById(req.params.id);
    if (!booking) {
      return handleResponse(res, 404, "Booking not found");
    }

    // Customer can cancel only if status is REQUESTED
    if (booking.status !== "REQUESTED") {
      return handleResponse(res, 400, "Booking cannot be cancelled once accepted by a partner");
    }

    booking.status = "CANCELLED";
    await booking.save();

    // Release partner if somehow assigned
    if (booking.partnerId) {
      const partner = await Delivery.findById(booking.partnerId);
      if (partner) {
        partner.isBusy = false;
        await partner.save();
      }
    }

    return handleResponse(res, 200, "Booking cancelled successfully", booking);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Submit rating and review for booking
export const addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return handleResponse(res, 400, "Invalid rating. Must be between 1 and 5");
    }

    const booking = await CarWashBooking.findById(req.params.id);
    if (!booking) {
      return handleResponse(res, 404, "Booking not found");
    }

    if (String(booking.customerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized to review this booking");
    }

    if (booking.status !== "COMPLETED") {
      return handleResponse(res, 400, "You can only review completed wash services");
    }

    booking.rating = rating;
    booking.comment = comment || "";
    await booking.save();

    return handleResponse(res, 200, "Review submitted successfully", booking);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};


/* ==========================================================================
   SERVICE PARTNER CONTROLLERS
   ========================================================================== */

// Fetch requests within 10km radius of the online partner
export const partnerGetAvailableBookings = async (req, res) => {
  try {
    const partner = await Delivery.findById(req.user.id);
    if (!partner) {
      return handleResponse(res, 404, "Delivery partner not found");
    }

    if (!partner.isOnline || !partner.isCarWashService) {
      return handleResponse(res, 200, "Partner is offline or has car wash disabled", []);
    }

    // Find requested bookings that have no partner assigned yet
    const bookings = await CarWashBooking.find({
      status: "REQUESTED",
      partnerId: null,
    })
      .populate("packageId", "name description basePrice image")
      .populate("customerId", "name phone")
      .sort({ createdAt: -1 });

    // Filter by coordinates distance < 10km (if coordinates are provided/valid)
    const [pLng, pLat] = partner.location?.coordinates || [0, 0];
    const filteredBookings = bookings.filter((booking) => {
      if (!booking.address?.lat || !booking.address?.lng || (pLng === 0 && pLat === 0)) {
        return true; // Fallback to all if coordinates missing
      }
      
      // Calculate distance using simple formula (or geoutils if needed)
      const R = 6371; // Earth radius in km
      const dLat = (booking.address.lat - pLat) * Math.PI / 180;
      const dLon = (booking.address.lng - pLng) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(pLat * Math.PI / 180) * Math.cos(booking.address.lat * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      return distance <= 10.0; // 10km limit
    });

    return handleResponse(res, 200, "Available wash requests retrieved", filteredBookings);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Accept a wash request
export const partnerAcceptBooking = async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) {
      return handleResponse(res, 400, "Booking ID is required");
    }

    const booking = await CarWashBooking.findById(bookingId);
    if (!booking) {
      return handleResponse(res, 404, "Booking not found");
    }

    if (booking.status !== "REQUESTED" || booking.partnerId !== null) {
      return handleResponse(res, 400, "Booking has already been accepted by another partner or cancelled");
    }

    const partner = await Delivery.findById(req.user.id);
    if (!partner) {
      return handleResponse(res, 404, "Partner not found");
    }

    booking.partnerId = partner._id;
    booking.status = "ACCEPTED";
    await booking.save();

    partner.isBusy = true;
    await partner.save();

    // Notify partner in real-time
    emitToDelivery(partner._id, {
      event: "carwash:assigned",
      payload: booking,
    });

    return handleResponse(res, 200, "Booking accepted successfully", booking);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Update booking status (e.g. ARRIVED, WASHING)
export const partnerUpdateStatus = async (req, res) => {
  try {
    const { bookingId, status } = req.body;
    if (!bookingId || !status) {
      return handleResponse(res, 400, "Booking ID and Status are required");
    }

    const booking = await CarWashBooking.findById(bookingId);
    if (!booking) {
      return handleResponse(res, 404, "Booking not found");
    }

    if (String(booking.partnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this booking");
    }

    const validStatuses = ["ARRIVED", "WASHING"];
    if (!validStatuses.includes(status)) {
      return handleResponse(res, 400, "Invalid status transition");
    }

    booking.status = status;

    // If partner reached location, they can upload a beforeWashImage
    if (status === "WASHING") {
      let beforeWashUrl = req.body.beforeWashImage || "";
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          if (file.fieldname === "beforeWashImage") {
            beforeWashUrl = await uploadToCloudinary(file.buffer, "carwash/bookings");
          }
        }
      }
      booking.beforeWashImage = beforeWashUrl;
    }

    await booking.save();
    return handleResponse(res, 200, `Status updated to ${status}`, booking);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Complete booking with OTP verification
export const partnerCompleteBooking = async (req, res) => {
  try {
    const { bookingId, otp } = req.body;
    if (!bookingId || !otp) {
      return handleResponse(res, 400, "Booking ID and OTP are required");
    }

    const booking = await CarWashBooking.findById(bookingId);
    if (!booking) {
      return handleResponse(res, 404, "Booking not found");
    }

    if (String(booking.partnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this booking");
    }

    if (booking.otp !== String(otp).trim()) {
      return handleResponse(res, 400, "Invalid verification OTP");
    }

    let afterWashUrl = req.body.afterWashImage || "";
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        if (file.fieldname === "afterWashImage") {
          afterWashUrl = await uploadToCloudinary(file.buffer, "carwash/bookings");
        }
      }
    }

    booking.afterWashImage = afterWashUrl;
    booking.status = "COMPLETED";
    booking.paymentStatus = "PAID";
    await booking.save();

    // Release partner
    const partner = await Delivery.findById(req.user.id);
    if (partner) {
      partner.isBusy = false;
      await partner.save();
    }

    return handleResponse(res, 200, "Wash service completed successfully", booking);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Fetch currently active assigned booking for the partner
export const partnerGetAssignedBooking = async (req, res) => {
  try {
    const booking = await CarWashBooking.findOne({
      partnerId: req.user.id,
      status: { $in: ["ACCEPTED", "ARRIVED", "WASHING"] },
    })
      .populate("packageId", "name description basePrice image durationMinutes")
      .populate("customerId", "name phone email");
    return handleResponse(res, 200, "Assigned wash retrieved successfully", booking || null);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};


/* ==========================================================================
   ADMIN CONTROLLERS
   ========================================================================== */

// Fetch all bookings
export const adminGetBookings = async (req, res) => {
  try {
    const bookings = await CarWashBooking.find()
      .populate("packageId", "name basePrice")
      .populate("customerId", "name phone email")
      .populate("partnerId", "name phone vehicleNumber")
      .sort({ createdAt: -1 });

    return handleResponse(res, 200, "All bookings retrieved successfully", bookings);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Manually assign a partner (Admin Override)
export const adminAssignPartner = async (req, res) => {
  try {
    const { bookingId, partnerId } = req.body;
    if (!bookingId || !partnerId) {
      return handleResponse(res, 400, "Booking ID and Partner ID are required");
    }

    const booking = await CarWashBooking.findById(bookingId);
    if (!booking) {
      return handleResponse(res, 404, "Booking not found");
    }

    const partner = await Delivery.findById(partnerId);
    if (!partner) {
      return handleResponse(res, 404, "Partner not found");
    }

    booking.partnerId = partner._id;
    booking.status = "ACCEPTED";
    await booking.save();

    partner.isBusy = true;
    await partner.save();

    emitToDelivery(partner._id, {
      event: "carwash:assigned",
      payload: booking,
    });

    return handleResponse(res, 200, "Partner assigned successfully by admin", booking);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Get pricing configuration
export const adminGetConfig = async (req, res) => {
  try {
    const config = await CarWashConfig.getOrCreate();
    return handleResponse(res, 200, "Pricing configuration retrieved", config);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Update pricing configuration
export const adminUpdateConfig = async (req, res) => {
  try {
    const { baseFare, perKmCharge, vehicleMultipliers, commissionRate } = req.body;

    const config = await CarWashConfig.getOrCreate();
    if (baseFare !== undefined) config.baseFare = baseFare;
    if (perKmCharge !== undefined) config.perKmCharge = perKmCharge;
    if (commissionRate !== undefined) config.commissionRate = commissionRate;
    if (vehicleMultipliers !== undefined) {
      config.vehicleMultipliers = vehicleMultipliers;
    }

    await config.save();
    return handleResponse(res, 200, "Pricing config updated successfully", config);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Create a new wash package
export const adminCreatePackage = async (req, res) => {
  try {
    const { name, description, basePrice, durationMinutes, isActive } = req.body;
    if (!name || !description || basePrice === undefined) {
      return handleResponse(res, 400, "Missing required package details");
    }

    let imageUrl = "";
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        if (file.fieldname === "image") {
          imageUrl = await uploadToCloudinary(file.buffer, "carwash/packages");
        }
      }
    } else if (req.body.image) {
      imageUrl = req.body.image;
    }

    const newPackage = await CarWashPackage.create({
      name,
      description,
      basePrice,
      durationMinutes: durationMinutes || 45,
      image: imageUrl,
      isActive: isActive !== undefined ? (isActive === "true" || isActive === true) : true,
    });

    return handleResponse(res, 201, "Wash package created successfully", newPackage);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Update a wash package
export const adminUpdatePackage = async (req, res) => {
  try {
    const { name, description, basePrice, durationMinutes, isActive } = req.body;
    const pkg = await CarWashPackage.findById(req.params.id);
    if (!pkg) {
      return handleResponse(res, 404, "Package not found");
    }

    if (name !== undefined) pkg.name = name;
    if (description !== undefined) pkg.description = description;
    if (basePrice !== undefined) pkg.basePrice = basePrice;
    if (durationMinutes !== undefined) pkg.durationMinutes = durationMinutes;
    if (isActive !== undefined) {
      pkg.isActive = (isActive === "true" || isActive === true);
    }

    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        if (file.fieldname === "image") {
          pkg.image = await uploadToCloudinary(file.buffer, "carwash/packages");
        }
      }
    } else if (req.body.image !== undefined) {
      pkg.image = req.body.image;
    }

    await pkg.save();
    return handleResponse(res, 200, "Wash package updated successfully", pkg);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Delete a package (soft delete via isActive = false)
export const adminDeletePackage = async (req, res) => {
  try {
    const pkg = await CarWashPackage.findById(req.params.id);
    if (!pkg) {
      return handleResponse(res, 404, "Package not found");
    }

    pkg.isActive = false;
    await pkg.save();

    return handleResponse(res, 200, "Package deleted successfully", pkg);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Get analytics reports
export const adminGetReports = async (req, res) => {
  try {
    const bookings = await CarWashBooking.find();
    const totalBookings = bookings.length;
    const completed = bookings.filter((b) => b.status === "COMPLETED").length;
    const cancelled = bookings.filter((b) => b.status === "CANCELLED").length;
    const active = bookings.filter((b) => !["COMPLETED", "CANCELLED"].includes(b.status)).length;

    const totalRevenue = bookings
      .filter((b) => b.status === "COMPLETED")
      .reduce((sum, b) => sum + b.fare, 0);

    const platformCommission = bookings
      .filter((b) => b.status === "COMPLETED")
      .reduce((sum, b) => sum + b.commission, 0);

    return handleResponse(res, 200, "Reports retrieved successfully", {
      totalBookings,
      completed,
      cancelled,
      active,
      totalRevenue,
      platformCommission,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
