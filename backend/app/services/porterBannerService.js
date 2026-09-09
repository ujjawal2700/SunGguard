import PorterBanner from "../models/porterBanner.js";
import * as cacheService from "./cacheService.js";
import logger from "./logger.js";

// In-memory fallback cache for sub-millisecond local responses
const memoryCache = new Map();
const MEMORY_CACHE_TTL_MS = 60 * 1000; // 1 minute

const CACHE_TTL_SECONDS = 300; // 5 minutes in Redis

/**
 * Invalidate all Porter banner caches (both Redis and memory)
 */
export async function invalidateBannerCache() {
  try {
    memoryCache.clear();
    const pattern = cacheService.buildKey("porter", "banners", "*");
    await cacheService.invalidate(pattern);
    // Also invalidate without version prefix if any
    await cacheService.delPattern("cache:*porter*banner*");
    await cacheService.delPattern("cache:porter:banners:*");
  } catch (err) {
    logger.error("[PorterBannerService] Cache invalidation error:", err);
  }
}

/**
 * Get active banners for customer app (with cache)
 * @param {Object} options
 * @param {string} [options.serviceType="all"] "all" | "local" | "outstation"
 * @returns {Promise<Array>}
 */
export async function getActiveBanners({ serviceType = "all" } = {}) {
  const normalizedType = String(serviceType || "all").toLowerCase();
  const cacheKey = cacheService.buildKey("porter", "banners", `active:${normalizedType}`);

  // 1. Check in-memory cache
  const memCached = memoryCache.get(cacheKey);
  if (memCached && Date.now() - memCached.timestamp < MEMORY_CACHE_TTL_MS) {
    return memCached.data;
  }

  // 2. Check Redis cache
  try {
    const redisCached = await cacheService.get(cacheKey);
    if (redisCached && Array.isArray(redisCached)) {
      memoryCache.set(cacheKey, { timestamp: Date.now(), data: redisCached });
      return redisCached;
    }
  } catch (e) {
    // Non-fatal, proceed to DB
  }

  // 3. Query Database
  const now = new Date();
  // 5-minute future buffer so banners scheduled for current minute / today are immediately active without clock drift
  const futureTolerance = new Date(now.getTime() + 5 * 60 * 1000);

  // Filter by service: banner with serviceType 'all' matches both 'local' and 'outstation'
  const serviceQuery =
    normalizedType === "local"
      ? { serviceType: { $in: ["all", "local"] } }
      : normalizedType === "outstation"
      ? { serviceType: { $in: ["all", "outstation"] } }
      : { serviceType: { $in: ["all", "local", "outstation"] } };

  // Date and Default criteria:
  // - If isDefault: true, show unless future startDate or passed endDate
  // - If isDefault: false, must be currently within startDate <= now <= endDate
  const dateCriteria = {
    $or: [
      {
        isDefault: true,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: futureTolerance } }] },
          { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
        ],
      },
      {
        isDefault: false,
        startDate: { $lte: futureTolerance },
        endDate: { $gte: now },
      },
    ],
  };

  const banners = await PorterBanner.find({
    isActive: true,
    ...serviceQuery,
    ...dateCriteria,
  })
    .select("_id title subtitle imageUrl isDefault displayOrder serviceType")
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();

  // Asynchronously increment impression counts
  if (banners.length > 0) {
    const ids = banners.map((b) => b._id);
    PorterBanner.updateMany({ _id: { $in: ids } }, { $inc: { impressions: 1 } }).exec().catch(() => {});
  }

  // 4. Cache results
  memoryCache.set(cacheKey, { timestamp: Date.now(), data: banners });
  try {
    await cacheService.set(cacheKey, banners, CACHE_TTL_SECONDS);
  } catch (e) {
    // Non-fatal
  }

  return banners;
}

/**
 * List banners for Admin desk with dynamic status calculation and aggregate statistics
 * @param {Object} queryOptions
 */
export async function listAdminBanners({ search, status, serviceType, page = 1, limit = 50 } = {}) {
  const query = {};

  if (serviceType && serviceType !== "all") {
    query.serviceType = serviceType;
  }

  if (search && String(search).trim()) {
    const term = String(search).trim();
    query.$or = [
      { title: { $regex: term, $options: "i" } },
      { subtitle: { $regex: term, $options: "i" } },
    ];
  }

  const allBanners = await PorterBanner.find(query)
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();

  const now = new Date();

  // Compute runtime status for every banner and calculate aggregate counts
  let activeCount = 0;
  let scheduledCount = 0;
  let expiredCount = 0;
  let defaultCount = 0;
  let inactiveCount = 0;

  const decorated = allBanners.map((b) => {
    const bannerStatus = PorterBanner.computeStatus(b, now);

    if (bannerStatus === "active") activeCount++;
    else if (bannerStatus === "scheduled") scheduledCount++;
    else if (bannerStatus === "expired") expiredCount++;
    else if (bannerStatus === "default") defaultCount++;
    else if (bannerStatus === "inactive") inactiveCount++;

    return {
      ...b,
      status: bannerStatus,
    };
  });

  // Filter by status if specified
  let filtered = decorated;
  if (status && status !== "all") {
    filtered = decorated.filter((b) => b.status === status);
  }

  // Pagination
  const total = filtered.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = filtered.slice(startIndex, startIndex + limitNum);

  return {
    banners: paginated,
    counts: {
      total: allBanners.length,
      active: activeCount,
      scheduled: scheduledCount,
      expired: expiredCount,
      default: defaultCount,
      inactive: inactiveCount,
    },
    total,
    page: pageNum,
    limit: limitNum,
  };
}

/**
 * Get banner by ID
 */
export async function getBannerById(id) {
  const banner = await PorterBanner.findById(id).lean();
  if (!banner) return null;
  return {
    ...banner,
    status: PorterBanner.computeStatus(banner),
  };
}

/**
 * Create a new banner
 */
export async function createBanner(data, adminId) {
  const banner = new PorterBanner({
    ...data,
    createdBy: adminId || null,
  });

  await banner.save();
  await invalidateBannerCache();

  const plain = banner.toObject();
  return {
    ...plain,
    status: PorterBanner.computeStatus(plain),
  };
}

/**
 * Update an existing banner
 */
export async function updateBanner(id, data) {
  const banner = await PorterBanner.findById(id);
  if (!banner) return null;

  Object.assign(banner, data);
  await banner.save();
  await invalidateBannerCache();

  const plain = banner.toObject();
  return {
    ...plain,
    status: PorterBanner.computeStatus(plain),
  };
}

/**
 * Toggle banner active status
 */
export async function toggleBannerStatus(id) {
  const banner = await PorterBanner.findById(id);
  if (!banner) return null;

  banner.isActive = !banner.isActive;
  await banner.save();
  await invalidateBannerCache();

  const plain = banner.toObject();
  return {
    ...plain,
    status: PorterBanner.computeStatus(plain),
  };
}

/**
 * Delete a banner
 */
export async function deleteBanner(id) {
  const banner = await PorterBanner.findByIdAndDelete(id);
  if (banner) {
    await invalidateBannerCache();
  }
  return banner;
}

/**
 * Record a banner click
 */
export async function trackBannerClick(id) {
  return PorterBanner.findByIdAndUpdate(id, { $inc: { clicks: 1 } }).exec();
}
