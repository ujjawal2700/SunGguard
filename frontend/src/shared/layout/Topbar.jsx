import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@core/context/AuthContext';
import {
    LogOut,
    Bell,
    Search,
    Menu,
    ExternalLink,
    Shield,
    Sparkles,
    Command,
    Clock,
    User
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { sellerApi } from '@/modules/seller/services/sellerApi';
import { adminApi } from '@/modules/admin/services/adminApi';
import { AnimatePresence } from 'framer-motion';
import NotificationPopup from './NotificationPopup';
import { toast } from 'sonner';
import { useSettings } from '@core/context/SettingsContext';
import { onNotificationNew } from '@core/services/orderSocket';

const Topbar = ({ onMenuClick }) => {
    const { user, logout, role, token } = useAuth();
    const { settings } = useSettings();
    const navigate = useNavigate();
    const location = useLocation();

    const appName = settings?.appName || 'SunGguard';
    const logoUrl = settings?.logoUrl || '';

    const [searchQuery, setSearchQuery] = useState('');
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifications, setShowNotifications] = useState(false);
    const notificationRef = useRef(null);

    const isSeller = location.pathname.startsWith('/seller');
    const isAdmin = location.pathname.startsWith('/admin');

    const handleSearchSubmit = (e) => {
        e?.preventDefault();
        const q = (searchQuery || '').trim();
        if (!q) return;
        if (isSeller) {
            navigate(`/seller/products?q=${encodeURIComponent(q)}`);
        } else if (isAdmin) {
            navigate(`/admin/products?search=${encodeURIComponent(q)}`);
        }
    };

    const isSellerRef = useRef(isSeller);
    const isAdminRef = useRef(isAdmin);
    useEffect(() => { isSellerRef.current = isSeller; }, [isSeller]);
    useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

    const fetchNotifications = useCallback(async () => {
        try {
            const sellerMode = isSellerRef.current;
            const adminMode = isAdminRef.current;
            if (!sellerMode && !adminMode) return;
            const response = sellerMode
                ? await sellerApi.getNotifications()
                : await adminApi.getNotifications();
            if (response.data.success) {
                setNotifications(response.data.result?.notifications || []);
                setUnreadCount(response.data.result?.unreadCount || 0);
            }
        } catch (error) {
            console.error("Notif Fetch Error:", error);
        }
    }, []);

    useEffect(() => {
        if (!isSeller && !isAdmin) return undefined;
        fetchNotifications();

        const getToken = () => token;
        let scheduled = null;
        const refresh = () => {
            if (scheduled) return;
            scheduled = setTimeout(() => {
                scheduled = null;
                fetchNotifications();
            }, 200);
        };

        const offNotification = token ? onNotificationNew(getToken, refresh) : null;
        const poll = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                return;
            }
            fetchNotifications();
        }, 60000);

        return () => {
            clearInterval(poll);
            if (offNotification) offNotification();
        };
    }, [isSeller, isAdmin, token, fetchNotifications]);

    const handleMarkAsRead = async (notifId) => {
        try {
            if (isSeller) await sellerApi.markNotificationRead(notifId);
            if (isAdmin) await adminApi.markNotificationRead(notifId);
            setNotifications(prev =>
                prev.map(n => n._id === notifId ? { ...n, isRead: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            toast.error("Failed to update notification");
        }
    };

    const handleNotificationClick = (notif) => {
        const link = notif?.data?.link || notif?.link;
        const parcelId = notif?.data?.parcelId || notif?.parcelId;
        const eventType = notif?.type || notif?.data?.eventType;

        setShowNotifications(false);

        if (link && typeof link === "string") {
            try {
                const url = new URL(link, window.location.origin);
                if (url.origin === window.location.origin) {
                    navigate(`${url.pathname}${url.search}${url.hash}`);
                    return;
                }
            } catch {
                /* fall through */
            }
        }

        if (isAdmin && (eventType === "PARCEL_REQUESTED" || parcelId)) {
            navigate(parcelId ? `/admin/parcels?parcelId=${parcelId}` : "/admin/parcels");
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            if (isSeller) await sellerApi.markAllNotificationsRead();
            if (isAdmin) await adminApi.markAllNotificationsRead();
            fetchNotifications();
            toast.success("All notifications cleared");
        } catch (error) {
            toast.error("Failed to mark all as read");
        }
    };

    return (
        <header className={cn(
            "bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between transition-all duration-300 z-40 shadow-sm",
            (role === 'admin' || role === 'seller')
                ? "fixed top-0 left-0 right-0 h-18 px-5 md:sticky md:top-0 md:px-8"
                : "fixed top-0 left-72 right-0 h-18 px-8"
        )}>
            {/* Left section: mobile hamburger & search */}
            <div className="flex items-center flex-1 mr-6">
                <button
                    onClick={onMenuClick}
                    className="p-2.5 mr-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl text-slate-700 dark:text-slate-200 transition-colors md:hidden shadow-sm"
                >
                    <Menu className="h-6 w-6" />
                </button>

                {/* Mobile App Logo */}
                <div className="flex items-center space-x-2 mr-3 md:hidden">
                    {logoUrl ? (
                        <div className="h-9 w-9 rounded-2xl overflow-hidden shadow-sm ring-1 ring-slate-200">
                            <img src={logoUrl} alt={appName} className="h-full w-full object-cover" />
                        </div>
                    ) : (
                        <div className="h-9 w-9 rounded-2xl bg-primary flex items-center justify-center text-white font-black text-sm shadow-md">
                            {appName.charAt(0)}
                        </div>
                    )}
                </div>

                {/* Desktop Global Search Bar */}
                <form onSubmit={handleSearchSubmit} className="relative w-full max-w-lg hidden md:block group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                    <input
                        type="text"
                        placeholder={isSeller ? "Search products, inventory, orders..." : "Search orders, products, users, or coupons..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-14 py-2.5 bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                        <kbd className="px-2 py-0.5 text-xs font-mono font-bold text-slate-500 bg-slate-200/70 dark:bg-slate-700/70 rounded-lg border border-slate-300 dark:border-slate-600">⌘K</kbd>
                    </div>
                </form>
            </div>

            {/* Right section: System telemetry, notifications & profile */}
            <div className="flex items-center space-x-3 sm:space-x-5">
                {/* Live Status Pill */}
                <div className="hidden xl:flex items-center gap-2 px-3.5 py-2 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 shadow-sm">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Live Network Active</span>
                </div>

                {/* Notifications Trigger */}
                <div className="relative" ref={notificationRef}>
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={cn(
                            "p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-primary rounded-2xl transition-all relative shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700",
                            showNotifications && "bg-primary/10 text-primary border-primary/20"
                        )}
                        aria-label="Notifications"
                    >
                        <Bell className="h-5 w-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 ring-2 ring-white dark:ring-slate-900"></span>
                            </span>
                        )}
                    </button>

                    <AnimatePresence>
                        {showNotifications && (
                            <NotificationPopup
                                notifications={notifications}
                                onMarkAsRead={handleMarkAsRead}
                                onMarkAllAsRead={handleMarkAllAsRead}
                                onNotificationClick={handleNotificationClick}
                                onClose={() => setShowNotifications(false)}
                            />
                        )}
                    </AnimatePresence>
                </div>

                <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />

                {/* Profile Widget */}
                <button
                    onClick={() => {
                        if (location.pathname.startsWith('/admin')) {
                            navigate('/admin/profile');
                        } else if (location.pathname.startsWith('/seller')) {
                            navigate('/seller/profile');
                        } else {
                            navigate('/profile');
                        }
                    }}
                    className="flex items-center space-x-3 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all group"
                >
                    <div className="h-9 w-9 rounded-2xl bg-gradient-to-tr from-primary to-orange-500 flex items-center justify-center text-white font-black text-sm shadow-md">
                        {user?.name?.[0] || 'A'}
                    </div>
                    <div className="hidden sm:block text-left">
                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight group-hover:text-primary transition-colors">{user?.name || 'Admin'}</p>
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{user?.role || 'Admin'}</p>
                    </div>
                </button>

                {/* Sign Out Button */}
                <button
                    onClick={logout}
                    className="flex items-center space-x-2 px-3.5 py-2.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-2xl transition-all font-bold text-xs shadow-sm border border-transparent hover:border-rose-200"
                    title="Sign Out"
                >
                    <LogOut className="h-4 w-4" />
                    <span className="hidden lg:inline">Logout</span>
                </button>
            </div>
        </header>
    );
};

export default Topbar;
