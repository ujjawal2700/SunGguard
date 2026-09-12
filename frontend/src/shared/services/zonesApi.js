import axiosInstance from "@core/api/axios";

/**
 * Active porter delivery zones — public, no auth required.
 *
 * Shared by rider onboarding/profile (picking the one zone to work),
 * the admin warehouse form (which zone a warehouse belongs to, and the
 * boundary its map pin must land inside), and the customer outstation
 * pickup picker (which zone a pickup point resolves to). One fetch, cached
 * by the caller for the life of the screen, is enough — zones change rarely
 * and every consumer here just needs the same `points` ring to test against.
 */
export const zonesApi = {
  getActiveZones: () => axiosInstance.get("/porter/zones/active"),
};

export default zonesApi;
