import axiosInstance from "@core/api/axios";
import { getWithDedupe } from "@core/api/dedupe";

/**
 * Customer Porter API - Banners & Porter services
 */
export const customerPorterApi = {
  /**
   * Fetch currently active porter banners.
   * Cached client-side with deduplication and short TTL.
   */
  getActiveBanners: (serviceType = "all", options = {}) =>
    getWithDedupe(
      "/porter/banners/active",
      { serviceType },
      {
        ttl: options.ttl ?? 5000, // 5s client cache for instant fresh updates
        forceRefresh: options.forceRefresh ?? false,
      }
    ),

  /**
   * Track banner click
   */
  trackClick: (id) =>
    axiosInstance.post(`/porter/banners/${id}/click`).catch(() => {}),
};

export default customerPorterApi;
