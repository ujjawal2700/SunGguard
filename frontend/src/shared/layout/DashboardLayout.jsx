import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNav from './BottomNav';
import { sellerApi } from '@/modules/seller/services/sellerApi';
import { useAuth } from "@core/context/AuthContext";
import { motion, AnimatePresence } from 'framer-motion';
import { BellRing, Check, X, Clock, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import SellerOrdersContext from '@/modules/seller/context/SellerOrdersContext';
import SellerEarningsContext, { defaultEarnings } from '@/modules/seller/context/SellerEarningsContext';
import { getOrderSocket, onSellerOrderNew, onReturnDropOtp, onParcelNew } from '@/core/services/orderSocket';
import { createSocketTokenReader } from '@core/utils/authStorage';
import { STORAGE_KEYS } from '@core/utils/storage';
import orderAlertSound from '@/assets/sounds/order_alert.mp3';

const POLL_INTERVAL_MS = 15000;

function secondsLeftUntilSellerExpiry(order) {
    if (!order) return 0;
    const raw = order.sellerPendingExpiresAt ?? order.expiresAt;
    if (!raw) return 60;
    const ms = new Date(raw).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 1000));
}

function isSellerAlertEligible(order) {
    if (!order?.orderId) return false;
    const ws = String(order.workflowStatus || '').toUpperCase();
    const status = String(order.status || '').toLowerCase();
    const hasExpiry = Boolean(order.sellerPendingExpiresAt ?? order.expiresAt);

    if (hasExpiry && secondsLeftUntilSellerExpiry(order) <= 0) return false;
    if (ws) return ws === 'SELLER_PENDING';
    return status === 'pending';
}

const DashboardLayout = ({ children, navItems, title }) => {
    const [newOrderAlert, setNewOrderAlert] = useState(null);
    const [newReturnAlert, setNewReturnAlert] = useState(null);
    const [newParcelAlert, setNewParcelAlert] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const acceptWindowTotalRef = useRef(60);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const { user, role } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const [sellerOrders, setSellerOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [sellerEarningsData, setSellerEarningsData] = useState(defaultEarnings);
    const [earningsLoading, setEarningsLoading] = useState(false);

    const shownOrderIdsRef = useRef(new Set());
    const isFirstLoadRef = useRef(true);
    const newOrderAlertRef = useRef(null);
    const fetchOrdersRef = useRef(null);
    const orderRingtoneRef = useRef(null);

    const getOrderRingtone = () => {
        if (!orderRingtoneRef.current) {
            const audio = new Audio(orderAlertSound);
            audio.loop = true;
            audio.preload = 'auto';
            orderRingtoneRef.current = audio;
        }
        return orderRingtoneRef.current;
    };

    const startOrderRingtone = () => {
        const audio = getOrderRingtone();
        audio.play().catch(() => {});
    };

    const stopOrderRingtone = () => {
        if (orderRingtoneRef.current) {
            orderRingtoneRef.current.pause();
            orderRingtoneRef.current.currentTime = 0;
        }
    };

    const refreshOrders = async () => {};
    const refreshEarnings = async () => {};

    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    return (
        <div className="min-h-screen bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative antialiased selection:bg-primary/20 selection:text-primary">
            {/* Background Ambient Glow */}
            <div className="fixed top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/[0.04] to-transparent pointer-events-none -z-10" />
            <div className="fixed -top-40 right-0 w-96 h-96 bg-primary/[0.03] rounded-full blur-3xl pointer-events-none -z-10" />

            <Sidebar
                items={navItems}
                title={title}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            <div className={cn(
                "transition-all duration-300 min-h-screen flex flex-col",
                (role === "admin" || role === "seller") ? "pl-0 md:pl-72" : "pl-72"
            )}>
                <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
                
                <main className="flex-1 p-4 md:p-8 max-w-[1600px] w-full mx-auto">
                    <SellerOrdersContext.Provider
                        value={{
                            orders: role === 'seller' ? sellerOrders : [],
                            ordersLoading: role === 'seller' ? ordersLoading : false,
                            refreshOrders,
                        }}
                    >
                        <SellerEarningsContext.Provider
                            value={{
                                earningsData: role === 'seller' ? sellerEarningsData : defaultEarnings,
                                earningsLoading: role === 'seller' ? earningsLoading : false,
                                refreshEarnings,
                            }}
                        >
                            {children}
                        </SellerEarningsContext.Provider>
                    </SellerOrdersContext.Provider>
                </main>
            </div>
        </div>
    );
};

export default DashboardLayout;
