import axiosInstance from "@core/api/axios";
import { getWithDedupe } from "@core/api/dedupe";

/**
 * City Parcel — customer API.
 *
 * The outstation flow keeps using `parcelApi` against /parcel. Nothing here
 * touches those endpoints.
 */
export const cityParcelApi = {
  // forceRefresh matters for the retry button: without it a failed first load
  // would be served the cached failure and the button would do nothing.
  getBookingConfig: (options = {}) =>
    getWithDedupe("/city-parcel/booking-config", {}, {
      ttl: options.ttl ?? 30000,
      forceRefresh: options.forceRefresh ?? false,
    }),

  getServiceability: (params) =>
    axiosInstance.get("/city-parcel/serviceability", { params }),

  calculateFare: (body) => axiosInstance.post("/city-parcel/calculate-fare", body),

  create: (body) => axiosInstance.post("/city-parcel/create", body),

  /** Sends the gateway's signed receipt back for verification. */
  verifyPayment: (cityParcelId, body) =>
    axiosInstance.post(`/city-parcel/${cityParcelId}/verify-payment`, body),

  getHistory: (options = {}) =>
    getWithDedupe("/city-parcel/history", {}, {
      ttl: options.ttl ?? 15000,
      forceRefresh: options.forceRefresh ?? false,
    }),

  track: (cityParcelId) => axiosInstance.get(`/city-parcel/track/${cityParcelId}`),

  /** Issues a fresh code and texts it — hashed codes cannot be read back. */
  requestMyCode: (cityParcelId) =>
    axiosInstance.post(`/city-parcel/${cityParcelId}/my-code`),

  /** The customer's answer to "we couldn't deliver — what now?". */
  respondToFailure: (cityParcelId, body) =>
    axiosInstance.post(`/city-parcel/${cityParcelId}/failure-response`, body),

  cancel: (cityParcelId, body = {}) =>
    axiosInstance.post(`/city-parcel/${cityParcelId}/cancel`, body),
};

export default cityParcelApi;
