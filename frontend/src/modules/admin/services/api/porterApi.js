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

    /** Supports search, status (active|inactive) and city. */
    getZones: (params) => axiosInstance.get('/porter/admin/zones', { params }),
    getZone: (id) => axiosInstance.get(`/porter/admin/zones/${id}`),
    createZone: (data) => axiosInstance.post('/porter/admin/zones', data),
    updateZone: (id, data) => axiosInstance.put(`/porter/admin/zones/${id}`, data),
    deleteZone: (id) => axiosInstance.delete(`/porter/admin/zones/${id}`),
};

export default adminPorterApi;
