import axiosInstance from '@core/api/axios';

/**
 * Admin porter-desk endpoints: the parcel-side dashboard and delivery zones.
 *
 * Paths carry `/admin/` so the axios interceptor picks the admin token.
 */
export const adminPorterApi = {
    /** Merged pickup + city-parcel figures. `days` clamps to 1..90 server-side. */
    getPorterDashboard: (params) =>
        axiosInstance.get('/porter/admin/dashboard', { params }),

    /**
     * Rider earnings attributable to porter jobs only. Supports kind
     * (parcel|city_parcel|city_parcel_return), page and limit.
     */
    getRiderPayouts: (params) =>
        axiosInstance.get('/porter/admin/rider-payouts', { params }),

    /**
     * Parcel-category support tickets. Reuses the shared ticket endpoints —
     * the general support queue passes no category and is unaffected.
     */
    getTickets: (params) =>
        axiosInstance.get('/tickets/admin/all', { params: { ...params, category: 'parcel' } }),
    replyTicket: (id, text) =>
        axiosInstance.post(`/tickets/reply/${id}`, { text, isAdmin: true }),
    updateTicketStatus: (id, status) =>
        axiosInstance.patch(`/tickets/admin/status/${id}`, { status }),

    /**
     * Porter Wallet — revenue vs rider earning vs admin margin, plus the
     * rider wallet/withdrawal picture. `getWalletWithdrawals` supports
     * status (pending|settled|all), page and limit.
     */
    getWalletOverview: () => axiosInstance.get('/porter/admin/wallet/overview'),
    getWalletWithdrawals: (params) =>
        axiosInstance.get('/porter/admin/wallet/withdrawals', { params }),


    /**
     * Rider COD cash. `getCashHoldings` is what the fleet is still holding;
     * `getCashDeposits` is the review queue (status PENDING|APPROVED|REJECTED|all).
     * Approving a deposit is the only thing that marks its bookings remitted.
     */
    getCashHoldings: () => axiosInstance.get('/porter/admin/cash-holdings'),
    getCashDeposits: (params) =>
        axiosInstance.get('/porter/admin/cash-deposits', { params }),
    reviewCashDeposit: (id, data) =>
        axiosInstance.patch(`/porter/admin/cash-deposits/${id}/review`, data),

    /** Where riders should send that cash — UPI / QR / bank account. */
    getCashPayoutDestination: () =>
        axiosInstance.get('/porter/admin/cash-payout-destination'),
    updateCashPayoutDestination: (data) =>
        axiosInstance.put('/porter/admin/cash-payout-destination', data),

    /** Supports search, status (active|inactive) and city. */
    getZones: (params) => axiosInstance.get('/porter/admin/zones', { params }),
    getZone: (id) => axiosInstance.get(`/porter/admin/zones/${id}`),
    createZone: (data) => axiosInstance.post('/porter/admin/zones', data),
    updateZone: (id, data) => axiosInstance.put(`/porter/admin/zones/${id}`, data),
    deleteZone: (id) => axiosInstance.delete(`/porter/admin/zones/${id}`),

    /** Porter Banners Management */
    getBanners: (params) => axiosInstance.get('/porter/admin/banners', { params }),
    getBanner: (id) => axiosInstance.get(`/porter/admin/banners/${id}`),
    createBanner: (data) => axiosInstance.post('/porter/admin/banners', data),
    updateBanner: (id, data) => axiosInstance.put(`/porter/admin/banners/${id}`, data),
    toggleBannerStatus: (id) => axiosInstance.patch(`/porter/admin/banners/${id}/status`),
    deleteBanner: (id) => axiosInstance.delete(`/porter/admin/banners/${id}`),

    /**
     * Porter Customers — real booking counts and spend, merged across the
     * pickup and city-parcel flows. Supports search, status (active|inactive)
     * and sortBy (totalBookings|totalSpent|lastBookingAt|joinedDate).
     */
    getCustomers: (params) => axiosInstance.get('/porter/admin/customers', { params }),
    getCustomer: (id) => axiosInstance.get(`/porter/admin/customers/${id}`),
    updateCustomerStatus: (id, isActive) =>
        axiosInstance.patch(`/porter/admin/customers/${id}/status`, { isActive }),
};

export default adminPorterApi;
