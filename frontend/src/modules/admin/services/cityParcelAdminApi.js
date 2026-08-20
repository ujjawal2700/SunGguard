import axiosInstance from "@core/api/axios";

/**
 * City Parcel — admin API.
 *
 * The pickup-service admin endpoints under /parcel/admin are untouched.
 */
export const cityParcelAdminApi = {
  /** Supports status, search, from/to, paymentMethod, withheld, stuck, page, limit. */
  list: (params = {}) => axiosInstance.get("/city-parcel/admin/all", { params }),

  /** Headline counts and money, filtered the same way as the list. */
  stats: (params = {}) => axiosInstance.get("/city-parcel/admin/stats", { params }),

  /** One parcel plus its full event log. */
  getOne: (id) => axiosInstance.get(`/city-parcel/admin/${id}`),

  getConfig: () => axiosInstance.get("/city-parcel/admin/config"),
  updateConfig: (body) => axiosInstance.put("/city-parcel/admin/config", body),

  /** Riders who could take a parked parcel. */
  listRiders: () => axiosInstance.get("/city-parcel/admin/riders"),
  assignRider: (id, deliveryPartnerId) =>
    axiosInstance.put(`/city-parcel/admin/${id}/assign`, { deliveryPartnerId }),

  /** Cancel on the customer's behalf. Refused once a rider holds the parcel. */
  cancel: (id, reason) =>
    axiosInstance.put(`/city-parcel/admin/${id}/cancel`, { reason }),

  /** Clear or reject a delivery completed past the proximity gate. */
  reviewOverride: (id, body) =>
    axiosInstance.put(`/city-parcel/admin/${id}/review-override`, body),
};

export default cityParcelAdminApi;
