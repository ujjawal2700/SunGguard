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
import { COUNTER } from '@shared/design/tokens';

/** Counter ink for the dot grid — 5.5%, per the DepotGround recipe. */
const DOT = 'rgba(15,23,42,0.055)';

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
        <div
            className="relative min-h-screen antialiased text-slate-900 selection:bg-[color:var(--primary)]/20"
            style={{ background: COUNTER }}
        >
            {/* The counter the paperwork lies on: a dot grid at 5.5% ink, the
                same ground the customer's note is filed against (design.md §6).
                Replaces the ambient gradient glows, which §3 rules out. */}
            <div
                aria-hidden
                className="pointer-events-none fixed inset-0 -z-10"
                style={{
                    backgroundImage: `radial-gradient(${DOT} 1px, transparent 1px)`,
                    backgroundSize: '22px 22px',
                }}
            />

            <Sidebar
                items={navItems}
                title={title}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            <div className={cn(
                "flex min-h-screen flex-col",
                // The topbar is fixed on mobile and sticky from md up, so only
                // the mobile case needs to be cleared.
                (role === "admin" || role === "seller")
                    ? "pl-0 pt-[68px] md:pl-[272px] md:pt-0"
                    // This branch's topbar is fixed at every width, so the
                    // offset must not be dropped at md.
                    : "pl-[272px] pt-[68px]"
            )}>
                <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
                
                <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-8 md:py-8">
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
