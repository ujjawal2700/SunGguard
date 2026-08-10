import React, { useEffect, useMemo } from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import DashboardLayout from "@shared/layout/DashboardLayout";
import NotFoundPage from "@shared/components/NotFoundPage";
import { setActiveRole, ROLES } from "@core/auth/activeRoleStore";
import { useAuth } from "@core/context/AuthContext";
import Orders from "../pages/Orders";
import {
  HiOutlineSquares2X2,
  HiOutlineCube,
  HiOutlineCurrencyDollar,
  HiOutlineUser,
  HiOutlineTruck,
  HiOutlineArchiveBox,
  HiOutlineChartBarSquare,
  HiOutlineCreditCard,
  HiOutlineMapPin,
} from "react-icons/hi2";

const Dashboard = React.lazy(() => import("../pages/Dashboard"));
const ProductManagement = React.lazy(
  () => import("../pages/ProductManagement"),
);
const StockManagement = React.lazy(() => import("../pages/StockManagement"));
const AddProduct = React.lazy(() => import("../pages/AddProduct"));
const Returns = React.lazy(() => import("../pages/Returns"));
const Earnings = React.lazy(() => import("../pages/Earnings"));
const Analytics = React.lazy(() => import("../pages/Analytics"));
const Transactions = React.lazy(() => import("../pages/Transactions"));
const DeliveryTracking = React.lazy(() => import("../pages/DeliveryTracking"));
const Profile = React.lazy(() => import("../pages/Profile"));
const Withdrawals = React.lazy(() => import("../pages/Withdrawals"));
const SellerParcels = React.lazy(() => import("../pages/SellerParcels"));
const SellerParcelDashboard = React.lazy(() => import("../pages/SellerParcelDashboard"));
const SellerParcelTracking = React.lazy(() => import("../pages/SellerParcelTracking"));
const SellerParcelReports = React.lazy(() => import("../pages/SellerParcelReports"));

const ALL_NAV_ITEMS = [
  { label: "Dashboard", path: "/seller", icon: HiOutlineSquares2X2, end: true, quick: true, parcel: true },
  { label: "Orders", path: "/seller/orders", icon: HiOutlineTruck, quick: true, parcel: true },
  { label: "Products", path: "/seller/products", icon: HiOutlineCube, quick: true },
  { label: "Stock", path: "/seller/inventory", icon: HiOutlineArchiveBox, quick: true },
  { label: "Returns", path: "/seller/returns", icon: HiOutlineArchiveBox, quick: true },
  { label: "Track Orders", path: "/seller/tracking", icon: HiOutlineMapPin, quick: true, parcel: true },
  {
    label: "Reports",
    path: "/seller/analytics",
    icon: HiOutlineChartBarSquare,
    quick: true,
    parcel: true,
  },
  {
    label: "Money Request",
    path: "/seller/withdrawals",
    icon: HiOutlineCurrencyDollar,
    quick: true,
  },
  {
    label: "Payment History",
    path: "/seller/transactions",
    icon: HiOutlineCreditCard,
    quick: true,
  },
  {
    label: "Earnings",
    path: "/seller/earnings",
    icon: HiOutlineCurrencyDollar,
    quick: true,
  },
  { label: "Profile", path: "/seller/profile", icon: HiOutlineUser, quick: true, parcel: true },
];

const SellerRoutes = () => {
  const { user } = useAuth();

  useEffect(() => {
    setActiveRole(ROLES.SELLER);
  }, []);

  const isParcelSeller = user?.isParcelService === true;
  const isQuickSeller = user?.isQuickCommerceService !== false;

  const navItems = useMemo(() => {
    if (isParcelSeller && !isQuickSeller) {
      return ALL_NAV_ITEMS.filter((item) => item.parcel);
    }
    if (isQuickSeller && !isParcelSeller) {
      return ALL_NAV_ITEMS.filter((item) => item.quick);
    }
    return ALL_NAV_ITEMS;
  }, [isParcelSeller, isQuickSeller]);

  const defaultPath = "/seller";

  return (
    <Routes>
      <Route
        element={
          <DashboardLayout navItems={navItems} title="Seller Panel">
            <Outlet />
          </DashboardLayout>
        }
      >
        <Route
          path="/"
          element={
            isParcelSeller && !isQuickSeller ? <SellerParcelDashboard /> : <Dashboard />
          }
        />
        {isParcelSeller && !isQuickSeller ? (
          <>
            <Route path="/orders" element={<SellerParcels />} />
            <Route path="/tracking" element={<SellerParcelTracking />} />
            <Route path="/analytics" element={<SellerParcelReports />} />
          </>
        ) : (
          <>
            <Route path="/products" element={<ProductManagement />} />
            <Route path="/products/add" element={<AddProduct />} />
            <Route path="/inventory" element={<StockManagement />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/tracking" element={<DeliveryTracking />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/earnings" element={<Earnings />} />
            <Route path="/withdrawals" element={<Withdrawals />} />
          </>
        )}
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<NotFoundPage homePath={defaultPath} />} />
    </Routes>
  );
};

export default SellerRoutes;
