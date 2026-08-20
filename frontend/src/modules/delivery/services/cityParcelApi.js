import axiosInstance from "@core/api/axios";
import { getWithDedupe } from "@core/api/dedupe";

/**
 * City Parcel — rider API.
 *
 * Separate from `deliveryApi` and from the customer's `parcelApi`. The
 * pickup-service endpoints under /parcel are untouched; everything here
 * lives under /city-parcel.
 */
export const cityParcelApi = {
  getAvailable: (options = {}) =>
    getWithDedupe("/city-parcel/rider/available", {}, {
      ttl: options.ttl ?? 20000,
      forceRefresh: options.forceRefresh ?? false,
    }),

  getAssigned: (options = {}) =>
    getWithDedupe("/city-parcel/rider/assigned", {}, {
      ttl: options.ttl ?? 15000,
      forceRefresh: options.forceRefresh ?? false,
    }),

  accept: (cityParcelId, idempotencyKey) =>
    axiosInstance.post(
      `/city-parcel/rider/${cityParcelId}/accept`,
      {},
      idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined,
    ),

  skip: (cityParcelId) =>
    axiosInstance.post(`/city-parcel/rider/${cityParcelId}/skip`),

  /** Hand an accepted job back to the pool. Only before pickup. */
  release: (cityParcelId, reason) =>
    axiosInstance.post(`/city-parcel/rider/${cityParcelId}/release`, { reason }),

  updateStatus: (cityParcelId, body) =>
    axiosInstance.put(`/city-parcel/rider/${cityParcelId}/status`, body),

  verifyPickup: (cityParcelId, body) =>
    axiosInstance.post(`/city-parcel/rider/${cityParcelId}/verify-pickup`, body),

  sendDeliveryOtp: (cityParcelId, body = {}) =>
    axiosInstance.post(`/city-parcel/rider/${cityParcelId}/delivery-otp`, body),

  /** Live read of the proximity gate, so the sheet can warn before submitting. */
  checkProximity: (cityParcelId, params) =>
    axiosInstance.get(`/city-parcel/rider/${cityParcelId}/proximity`, { params }),

  verifyDelivery: (cityParcelId, body) =>
    axiosInstance.post(`/city-parcel/rider/${cityParcelId}/verify-delivery`, body),

  reportFailedAttempt: (cityParcelId, body) =>
    axiosInstance.post(`/city-parcel/rider/${cityParcelId}/failed-attempt`, body),

  verifyReturn: (cityParcelId, body) =>
    axiosInstance.post(`/city-parcel/rider/${cityParcelId}/verify-return`, body),

  reportCustomerUnreachable: (cityParcelId, body = {}) =>
    axiosInstance.post(`/city-parcel/rider/${cityParcelId}/customer-unreachable`, body),
};

export default cityParcelApi;
