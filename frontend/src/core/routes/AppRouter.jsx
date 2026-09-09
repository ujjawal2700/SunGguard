import React, { lazy, useMemo, useEffect, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom';
import ProtectedRoute from '../guards/ProtectedRoute';
import RoleGuard from '../guards/RoleGuard';
import { UserRole } from '../constants/roles';
import RootErrorBoundary from '../../shared/components/RootErrorBoundary';
import { setActiveRole, ROLES } from '../auth/activeRoleStore';

// Providers for Customer Module
import { WishlistProvider } from '../../modules/customer/context/WishlistContext';
import { CartProvider } from '../../modules/customer/context/CartContext';
import { CartAnimationProvider } from '../../modules/customer/context/CartAnimationContext';
import { ProductDetailProvider } from '../../modules/customer/context/ProductDetailContext';
import { LocationProvider } from '../../modules/customer/context/LocationContext';
import ScrollToTop from '../../modules/customer/components/shared/ScrollToTop';
import NotFoundPage from '../../shared/components/NotFoundPage';

// Public Pages
import Auth from '../../modules/seller/pages/Auth';
import ApplicationPending from '../../modules/seller/pages/ApplicationPending';
import AdminAuth from '../../modules/admin/pages/AdminAuth';
import DeliveryAuth from '../../modules/delivery/pages/DeliveryAuth';
import DeliveryApplicationPending from '../../modules/delivery/pages/ApplicationPending';
// CAR WASH DISABLED
// import CarWashPartnerAuth from '../../modules/delivery/pages/CarWashPartnerAuth';
// import CarWashPartnerDashboard from '../../modules/delivery/pages/CarWashPartnerDashboard';
import CustomerAuth from '../../modules/customer/pages/CustomerAuth';

// QUICK COMMERCE DISABLED
// const Home = lazy(() => import('../../modules/customer/pages/Home'));
// const CategoriesPage = lazy(() => import('../../modules/customer/pages/CategoriesPage'));
// const CategoryProductsPage = lazy(() => import('../../modules/customer/pages/CategoryProductsPage'));
// const WishlistPage = lazy(() => import('../../modules/customer/pages/WishlistPage'));
// const OffersPage = lazy(() => import('../../modules/customer/pages/OffersPage'));
// const ShopByStorePage = lazy(() => import('../../modules/customer/pages/ShopByStorePage'));
// const OrdersPage = lazy(() => import('../../modules/customer/pages/OrdersPage'));
// const OrderTransactionsPage = lazy(() => import('../../modules/customer/pages/OrderTransactionsPage'));
// const OrderDetailPage = lazy(() => import('../../modules/customer/pages/OrderDetailPage'));
// const ProductDetailPage = lazy(() => import('../../modules/customer/pages/ProductDetailPage'));
// const CheckoutPage = lazy(() => import('../../modules/customer/pages/CheckoutPage'));
// const SearchPage = lazy(() => import('../../modules/customer/pages/SearchPage'));

const ProfilePage = lazy(() => import('../../modules/customer/pages/ProfilePage'));
const AddressesPage = lazy(() => import('../../modules/customer/pages/AddressesPage'));
const SettingsPage = lazy(() => import('../../modules/customer/pages/SettingsPage'));
const SupportPage = lazy(() => import('../../modules/customer/pages/SupportPage'));
const ChatPage = lazy(() => import('../../modules/customer/pages/ChatPage'));
const TermsPage = lazy(() => import('../../modules/customer/pages/TermsPage'));
const PrivacyPage = lazy(() => import('../../modules/customer/pages/PrivacyPage'));
const AboutPage = lazy(() => import('../../modules/customer/pages/AboutPage'));
const EditProfilePage = lazy(() => import('../../modules/customer/pages/EditProfilePage'));
const PaymentStatusPage = lazy(() => import('../../modules/customer/pages/PaymentStatusPage'));
const WalletPage = lazy(() => import('../../modules/customer/pages/WalletPage'));
const ParcelHome = lazy(() => import('../../modules/customer/pages/ParcelHome'));
const CityParcelBooking = lazy(() => import('../../modules/customer/pages/CityParcelBooking'));
const CityParcelTracking = lazy(() => import('../../modules/customer/pages/CityParcelTracking'));
const WaybillHistory = lazy(() => import('../../modules/customer/pages/WaybillHistory'));
const ParcelDeliveryPage = lazy(() => import('../../modules/customer/pages/ParcelDeliveryPage'));
const ParcelSearchTrackingPage = lazy(() => import('../../modules/customer/pages/ParcelSearchTrackingPage'));
const ParcelDetail = lazy(() => import('../../modules/customer/pages/ParcelDetail'));
// CAR WASH DISABLED
// const CarWashBookingPage = lazy(() => import('../../modules/customer/pages/CarWashBookingPage'));
// const CarWashTrackingPage = lazy(() => import('../../modules/customer/pages/CarWashTrackingPage'));


// Lazy load heavy modules
const SellerModule = lazy(() => import('../../modules/seller/routes/index'));
const AdminModule = lazy(() => import('../../modules/admin/routes/index'));
const DeliveryModule = lazy(() => import('../../modules/delivery/routes/index'));

import CustomerLayout from '../../modules/customer/components/layout/CustomerLayout';

const CustomerLayoutWrapper = () => {
    useEffect(() => {
        setActiveRole(ROLES.CUSTOMER);
    }, []);

    return (
        <LocationProvider>
            <WishlistProvider>
                <CartProvider>
                    <CartAnimationProvider>
                        <ProductDetailProvider>
                            <ScrollToTop />
                            <CustomerLayout>
                                <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                                    <Outlet />
                                </Suspense>
                            </CustomerLayout>
                        </ProductDetailProvider>
                    </CartAnimationProvider>
                </CartProvider>
            </WishlistProvider>
        </LocationProvider>
    );
};

const AppRouter = () => {
    const router = useMemo(() => createBrowserRouter([
        {
            path: '/',
            element: <Outlet />,
            errorElement: <RootErrorBoundary />,
            children: [
                {
                    path: 'login',
                    element: <CustomerAuth />,
                },
                {
                    path: 'signup',
                    element: <CustomerAuth />,
                },
                {
                    path: 'seller/auth',
                    element: <Auth />,
                },
                {
                    path: 'seller/pending-approval',
                    element: <ApplicationPending />,
                },
                {
                    path: 'admin/auth',
                    element: <AdminAuth />,
                },
                {
                    path: 'delivery/auth',
                    element: <DeliveryAuth />,
                },
                {
                    path: 'delivery/pending-approval',
                    element: (
                        <ProtectedRoute>
                            <DeliveryApplicationPending />
                        </ProtectedRoute>
                    ),
                },
                // CAR WASH DISABLED — partner auth / dashboard routes
                // {
                //     path: 'delivery/car-wash-auth',
                //     element: <CarWashPartnerAuth />,
                // },
                // {
                //     path: 'car-wash/partner/auth',
                //     element: <CarWashPartnerAuth />,
                // },
                // {
                //     path: 'car-wash/partner/dashboard',
                //     element: (
                //         <ProtectedRoute>
                //             <RoleGuard allowedRoles={[UserRole.DELIVERY]}>
                //                 <CarWashPartnerDashboard />
                //             </RoleGuard>
                //         </ProtectedRoute>
                //     ),
                // },
                {
                    path: 'seller/*',
                    element: (
                        <ProtectedRoute>
                            <RoleGuard allowedRoles={[UserRole.SELLER]}>
                                <SellerModule />
                            </RoleGuard>
                        </ProtectedRoute>
                    ),
                },
                {
                    path: 'admin/*',
                    element: (
                        <ProtectedRoute>
                            <RoleGuard allowedRoles={[UserRole.ADMIN]}>
                                <AdminModule />
                            </RoleGuard>
                        </ProtectedRoute>
                    ),
                },
                {
                    path: 'delivery/*',
                    element: (
                        <ProtectedRoute>
                            <RoleGuard allowedRoles={[UserRole.DELIVERY]}>
                                <DeliveryModule />
                            </RoleGuard>
                        </ProtectedRoute>
                    ),
                },
                {
                    path: 'unauthorized',
                    element: <div className="flex h-screen items-center justify-center font-outfit">Unauthorized Access</div>,
                },
                {
                    element: <CustomerLayoutWrapper />,
                    children: [
                        { index: true, element: <ProtectedRoute><ParcelHome /></ProtectedRoute> },
                        // QUICK COMMERCE DISABLED
                        // { path: 'categories', element: <CategoriesPage /> },
                        // { path: 'category/:categoryName', element: <CategoryProductsPage /> },
                        // { path: 'product/:id', element: <ProductDetailPage /> },
                        // { path: 'offers', element: <OffersPage /> },
                        // { path: 'shop-by-store', element: <ShopByStorePage /> },
                        // { path: 'wishlist', element: <ProtectedRoute><WishlistPage /></ProtectedRoute> },
                        // { path: 'orders', element: <ProtectedRoute><OrdersPage /></ProtectedRoute> },
                        // { path: 'orders/:orderId', element: <ProtectedRoute><OrderDetailPage /></ProtectedRoute> },
                        // { path: 'transactions', element: <ProtectedRoute><OrderTransactionsPage /></ProtectedRoute> },
                        // { path: 'checkout', element: <ProtectedRoute><CheckoutPage /></ProtectedRoute> },
                        // { path: 'search', element: <SearchPage /> },

                        { path: 'terms', element: <TermsPage /> },
                        { path: 'privacy', element: <PrivacyPage /> },
                        { path: 'about', element: <AboutPage /> },
                        { path: 'addresses', element: <ProtectedRoute><AddressesPage /></ProtectedRoute> },
                        { path: 'settings', element: <ProtectedRoute><SettingsPage /></ProtectedRoute> },
                        { path: 'support', element: <ProtectedRoute><SupportPage /></ProtectedRoute> },
                        { path: 'chat', element: <ProtectedRoute><ChatPage /></ProtectedRoute> },
                        { path: 'payment-status', element: <PaymentStatusPage /> },
                        { path: 'profile', element: <ProtectedRoute><ProfilePage /></ProtectedRoute> },
                        { path: 'profile/edit', element: <ProtectedRoute><EditProfilePage /></ProtectedRoute> },
                        { path: 'profile/parcel-history', element: <ProtectedRoute><WaybillHistory /></ProtectedRoute> },
                        { path: 'wallet', element: <ProtectedRoute><WalletPage /></ProtectedRoute> },
                        { path: 'parcel', element: <ProtectedRoute><ParcelHome /></ProtectedRoute> },
                        { path: 'parcel/outstation', element: <ProtectedRoute><ParcelDeliveryPage /></ProtectedRoute> },
                        { path: 'parcel/local', element: <ProtectedRoute><CityParcelBooking /></ProtectedRoute> },
                        { path: 'parcel/local/track/:cityParcelId', element: <ProtectedRoute><CityParcelTracking /></ProtectedRoute> },
                        { path: 'parcel/search/:id', element: <ProtectedRoute><ParcelSearchTrackingPage /></ProtectedRoute> },
                        { path: 'parcel/outstation/:parcelId', element: <ProtectedRoute><ParcelDetail /></ProtectedRoute> },
                        // CAR WASH DISABLED — customer booking / tracking
                        // { path: 'car-wash', element: <ProtectedRoute><CarWashBookingPage /></ProtectedRoute> },
                        // { path: 'car-wash/track/:id', element: <ProtectedRoute><CarWashTrackingPage /></ProtectedRoute> },
                    ]
                },
                {
                    path: '*',
                    element: <NotFoundPage homePath="/" />,
                }
            ]
        }
    ]), []);

    return <RouterProvider router={router} />;
};

export default AppRouter;
