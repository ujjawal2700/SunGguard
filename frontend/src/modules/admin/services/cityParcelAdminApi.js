import axiosInstance from "@core/api/axios";

/**
 * City Parcel — admin API.
 *
 * The pickup-service admin endpoints under /parcel/admin are untouched.
 */
export const cityParcelAdminApi = {
  list: (params = {}) => axiosInstance.get("/city-parcel/admin/all", { params }),
  getOne: (id) => axiosInstance.get(`/city-parcel/admin/${id}`),

  getConfig: () => axiosInstance.get("/city-parcel/admin/config"),
  updateConfig: (body) => axiosInstance.put("/city-parcel/admin/config", body),

  /** Riders who could take a parked parcel. */
  listRiders: () => axiosInstance.get("/city-parcel/admin/riders"),
  assignRider: (id, deliveryPartnerId) =>
    axiosInstance.put(`/city-parcel/admin/${id}/assign`, { deliveryPartnerId }),

  /** Clear or reject a delivery completed past the proximity gate. */
  reviewOverride: (id, body) =>
    axiosInstance.put(`/city-parcel/admin/${id}/review-override`, body),
};

export default cityParcelAdminApi;
