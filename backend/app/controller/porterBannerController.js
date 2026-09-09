import mongoose from "mongoose";
import handleResponse from "../utils/helper.js";
import * as bannerService from "../services/porterBannerService.js";
import logger from "../services/logger.js";

/**
 * Validate banner dates
 * @param {Object} data 
 * @returns {string|null} error message or null if valid
 */
function validateDates(data) {
  const { isDefault, startDate, endDate } = data;

  if (isDefault) {
    // For default banner, dates are optional
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e.getTime() <= s.getTime()) {
        return "End date and time must be later than start date and time";
      }
    }
    return null;
  }

  // Non-default banners must have both start and end dates
  if (!startDate) {
    return "Start date and time is required for scheduled banners";
  }
  if (!endDate) {
    return "End date and time is required for scheduled banners";
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime())) {
    return "Start date and time is invalid";
  }
  if (isNaN(end.getTime())) {
    return "End date and time is invalid";
  }
  if (end.getTime() <= start.getTime()) {
    return "End date and time must be later than start date and time";
  }

  return null;
}

/**
 * Admin: List all banners with search, filter, and status counts
 */
export async function adminListBanners(req, res) {
  try {
    const { search, status, serviceType, page, limit } = req.query;
    const result = await bannerService.listAdminBanners({
      search,
      status,
      serviceType,
      page,
      limit,
    });

    return handleResponse(res, 200, "Banners fetched successfully", result);
  } catch (error) {
    logger.error("[PorterBannerController] Error listing banners:", error);
    return handleResponse(res, 500, error.message || "Failed to fetch banners");
  }
}

/**
 * Admin: Get single banner
 */
export async function adminGetBanner(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid banner ID");
    }

    const banner = await bannerService.getBannerById(id);
    if (!banner) {
      return handleResponse(res, 404, "Banner not found");
    }

    return handleResponse(res, 200, "Banner retrieved successfully", banner);
  } catch (error) {
    logger.error("[PorterBannerController] Error getting banner:", error);
    return handleResponse(res, 500, error.message || "Failed to get banner");
  }
}

/**
 * Admin: Create banner
 */
export async function adminCreateBanner(req, res) {
  try {
    const {
      title,
      subtitle,
      imageUrl,
      startDate,
      endDate,
      isDefault,
      isActive,
      displayOrder,
      serviceType,
    } = req.body || {};

    if (!imageUrl || !String(imageUrl).trim()) {
      return handleResponse(res, 400, "Banner image is required");
    }

    const dateError = validateDates({
      isDefault: Boolean(isDefault),
      startDate,
      endDate,
    });
    if (dateError) {
      return handleResponse(res, 400, dateError);
    }

    const payload = {
      title: String(title || "").trim(),
      subtitle: String(subtitle || "").trim(),
      imageUrl: String(imageUrl).trim(),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      isDefault: Boolean(isDefault),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      displayOrder: Number.isFinite(Number(displayOrder)) ? Number(displayOrder) : 0,
      serviceType: ["all", "local", "outstation"].includes(serviceType) ? serviceType : "all",
    };

    const created = await bannerService.createBanner(payload, req.user?.id);
    return handleResponse(res, 201, "Banner created successfully", created);
  } catch (error) {
    logger.error("[PorterBannerController] Error creating banner:", error);
    return handleResponse(res, 500, error.message || "Failed to create banner");
  }
}

/**
 * Admin: Update banner
 */
export async function adminUpdateBanner(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid banner ID");
    }

    const {
      title,
      subtitle,
      imageUrl,
      startDate,
      endDate,
      isDefault,
      isActive,
      displayOrder,
      serviceType,
    } = req.body || {};

    if (imageUrl !== undefined && !String(imageUrl).trim()) {
      return handleResponse(res, 400, "Banner image cannot be empty");
    }

    const dateError = validateDates({
      isDefault: Boolean(isDefault),
      startDate,
      endDate,
    });
    if (dateError) {
      return handleResponse(res, 400, dateError);
    }

    const payload = {};
    if (title !== undefined) payload.title = String(title || "").trim();
    if (subtitle !== undefined) payload.subtitle = String(subtitle || "").trim();
    if (imageUrl !== undefined) payload.imageUrl = String(imageUrl).trim();
    if (startDate !== undefined) payload.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) payload.endDate = endDate ? new Date(endDate) : null;
    if (isDefault !== undefined) payload.isDefault = Boolean(isDefault);
    if (isActive !== undefined) payload.isActive = Boolean(isActive);
    if (displayOrder !== undefined) payload.displayOrder = Number(displayOrder) || 0;
    if (serviceType !== undefined) {
      payload.serviceType = ["all", "local", "outstation"].includes(serviceType) ? serviceType : "all";
    }

    const updated = await bannerService.updateBanner(id, payload);
    if (!updated) {
      return handleResponse(res, 404, "Banner not found");
    }

    return handleResponse(res, 200, "Banner updated successfully", updated);
  } catch (error) {
    logger.error("[PorterBannerController] Error updating banner:", error);
    return handleResponse(res, 500, error.message || "Failed to update banner");
  }
}

/**
 * Admin: Toggle banner active/inactive
 */
export async function adminToggleStatus(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid banner ID");
    }

    const updated = await bannerService.toggleBannerStatus(id);
    if (!updated) {
      return handleResponse(res, 404, "Banner not found");
    }

    return handleResponse(
      res,
      200,
      `Banner marked as ${updated.isActive ? "active" : "inactive"}`,
      updated
    );
  } catch (error) {
    logger.error("[PorterBannerController] Error toggling status:", error);
    return handleResponse(res, 500, error.message || "Failed to toggle banner status");
  }
}

/**
 * Admin: Delete banner
 */
export async function adminDeleteBanner(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid banner ID");
    }

    const deleted = await bannerService.deleteBanner(id);
    if (!deleted) {
      return handleResponse(res, 404, "Banner not found");
    }

    return handleResponse(res, 200, "Banner deleted successfully");
  } catch (error) {
    logger.error("[PorterBannerController] Error deleting banner:", error);
    return handleResponse(res, 500, error.message || "Failed to delete banner");
  }
}

/**
 * Customer / Public: Get active banners
 */
export async function getActivePorterBanners(req, res) {
  try {
    const { serviceType = "all" } = req.query;
    const banners = await bannerService.getActiveBanners({ serviceType });

    return handleResponse(res, 200, "Active banners fetched", banners);
  } catch (error) {
    logger.error("[PorterBannerController] Error fetching active banners:", error);
    return handleResponse(res, 500, error.message || "Failed to fetch active banners");
  }
}

/**
 * Customer / Public: Track click
 */
export async function trackClick(req, res) {
  try {
    const { id } = req.params;
    if (mongoose.Types.ObjectId.isValid(id)) {
      await bannerService.trackBannerClick(id);
    }
    return handleResponse(res, 200, "Click recorded");
  } catch (error) {
    return handleResponse(res, 200, "Ignored");
  }
}
