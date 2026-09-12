import axiosInstance from "@core/api/axios";
import { getWithDedupe } from "@core/api/dedupe";

export const deliveryApi = {
  sendLoginOtp: (data) => axiosInstance.post("/delivery/send-login-otp", data),
  sendSignupOtp: (data) =>
    axiosInstance.post("/delivery/send-signup-otp", data),
  verifyOtp: (data) => axiosInstance.post("/delivery/verify-otp", data),
  checkPhone: (phone) =>
    axiosInstance.get(`/delivery/check-phone/${encodeURIComponent(phone)}`),
  getProfile: () => axiosInstance.get("/delivery/profile"),
  /** Active warehouses in the rider's own zone, nearest first. */
  getMyWarehouses: () => axiosInstance.get("/warehouse/mine"),
  updateProfile: (data) => axiosInstance.put("/delivery/profile", data),
  getStats: () => axiosInstance.get("/delivery/stats"),
  getEarnings: () => axiosInstance.get("/delivery/earnings"),
  getCodCashSummary: () => axiosInstance.get("/delivery/cod/summary"),
  payCodCashToAdmin: (data) => axiosInstance.post("/delivery/cod/pay", data),
  getWalletSummary: () => axiosInstance.get("/delivery/wallet/summary"),
  getOrderHistory: (params, config = {}) =>
    axiosInstance.get("/delivery/order-history", { params, ...config }),
  getAvailableOrders: (params = {}, config = {}) => {
    // Abortable one-offs (layout poll) keep using axios directly.
    if (config?.signal) {
      return axiosInstance.get("/orders/available", { params, ...config });
    }
    return getWithDedupe("/orders/available", params, {
      ttl: config.ttl ?? 15000,
      forceRefresh: config.forceRefresh ?? false,
    });
  },
  getAssignedOrder: (config = {}) => {
    if (config?.signal || config?.forceRefresh) {
      return axiosInstance.get("/orders/assigned", config);
    }
    return getWithDedupe("/orders/assigned", {}, {
      ttl: config.ttl ?? 15000,
      forceRefresh: config.forceRefresh ?? false,
    });
  },
  acceptOrder: (orderId, idempotencyKey) =>
    axiosInstance.put(
      `/orders/accept/${encodeURIComponent(String(orderId))}`,
      {},
      {
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
      },
    ),
  skipOrder: (orderId) =>
    axiosInstance.put(`/orders/skip/${encodeURIComponent(String(orderId))}`),
  postLocation: (body, config = {}) =>
    axiosInstance.post("/delivery/location", body, config),
  confirmPickup: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/pickup/confirm`, body),
  markArrivedAtStore: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/pickup/ready`, body),
  advanceDeliveryRiderUi: (orderId) =>
    axiosInstance.post(`/orders/workflow/${orderId}/rider/advance-ui`, {}),
  requestDeliveryOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/otp/request`, body),
  verifyDeliveryOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/otp/verify`, body),
  getOrderRoute: (orderId, params, config = {}) =>
    axiosInstance.get(`/orders/workflow/${orderId}/route`, { params, ...config }),
  getOrderDetails: (orderId) =>
    axiosInstance.get(
      `/orders/details/${encodeURIComponent(String(orderId))}`,
    ),
  getNotifications: (config = {}) => axiosInstance.get("/notifications", config),
  markNotificationRead: (id) => axiosInstance.put(`/notifications/${id}/read`),
  markAllNotificationsRead: () =>
    axiosInstance.put("/notifications/mark-all-read"),
  requestWithdrawal: (data) =>
    axiosInstance.post("/delivery/request-withdrawal", data),

  /** Where withdrawals get paid — bank, UPI or an uploaded QR. */
  updatePayoutDetails: (data) =>
    axiosInstance.put("/delivery/payout-details", data),

  /**
   * Porter COD cash the rider is holding, and handing it back.
   * Separate from `getCodCashSummary` above, which is quick-commerce order cash.
   */
  getCashSummary: () => axiosInstance.get("/delivery/cash/summary"),
  submitCashDeposit: (data) => axiosInstance.post("/delivery/cash/deposit", data),
  getCashDeposits: (params) =>
    axiosInstance.get("/delivery/cash/deposits", { params }),
  /**
   * The cash-limit meter: what the rider holds, what they may hold, what is
   * left, and whether jobs have stopped.
   *
   * Polled alongside the job feed so the number is always live — a rider
   * whose jobs simply stop appearing with no explanation has been failed by
   * the product.
   */
  getCashStatus: () => axiosInstance.get("/delivery/cash/status"),

  /**
   * Depositing online.
   *
   * The amount is decided server-side from the bookings the rider actually
   * holds — never sent from here, or a rider could clear ₹5,000 of jobs by
   * paying ₹1. `startOnlineDeposit` returns a gateway order to launch
   * checkout against; `verifyOnlineDeposit` confirms it and raises the
   * deposit for admin approval.
   */
  startOnlineDeposit: () => axiosInstance.post("/delivery/cash/deposit/online"),
  verifyOnlineDeposit: (receipt) =>
    axiosInstance.post("/delivery/cash/deposit/online/verify", receipt),

  /**
   * @deprecated Superseded by the online deposit above. Kept so an operation
   * whose gateway is unavailable can still fall back to a manual transfer.
   */
  getCashPayoutDestination: () =>
    axiosInstance.get("/delivery/cash/payout-destination"),

  /** Doorstep switch from cash to online. `kind` is parcel | city_parcel. */
  createCodQr: (kind, id) => axiosInstance.post(`/delivery/cod-qr/${kind}/${id}`),
  checkCodQr: (kind, id) => axiosInstance.get(`/delivery/cod-qr/${kind}/${id}`),
  updateStatus: (orderId, data) =>
    axiosInstance.put(`/orders/status/${orderId}`, data),
  updateReturnStatus: (orderId, data) =>
    axiosInstance.put(`/orders/return-status/${orderId}`, data),
  acceptReturnPickup: (orderId) =>
    axiosInstance.put(`/orders/returns/${orderId}/accept-pickup`),
  rejectReturnPickup: (orderId) =>
    axiosInstance.put(`/orders/returns/${orderId}/reject-pickup`),
  requestReturnOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/return-otp/request`, body),
  verifyReturnOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/return-otp/verify`, body),
  uploadReturnPickupProof: (orderId, data) =>
    axiosInstance.post(`/orders/returns/${orderId}/pickup-proof`, data),
  requestReturnDropOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/return-drop-otp/request`, body),
  verifyReturnDropOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/return-drop-otp/verify`, body),

  /** Support tickets raised by the rider. Admin sees these in the same inbox as customer complaints. */
  createTicket: (data) => axiosInstance.post("/tickets/create", { ...data, userType: "Delivery" }),
  getMyTickets: () => getWithDedupe("/tickets/my-tickets"),
  replyTicket: (ticketId, text, options = {}) => {
    const { mediaUrl = "", mediaType = "", mimeType = "" } = options || {};
    return axiosInstance.post(`/tickets/reply/${encodeURIComponent(String(ticketId))}`, {
      text,
      isAdmin: false,
      mediaUrl,
      mediaType,
      mimeType,
    });
  },
};
