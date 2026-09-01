import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { cn } from "@/lib/utils";
import { HiChevronDown } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Shield, LogOut } from "lucide-react";

const SidebarItem = ({
  item,
  isOpen,
  onToggle,
  onMouseEnter,
  onMouseLeave,
}) => {
  const location = useLocation();
  const badgeCount = Number(item?.badgeCount || 0);
  const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount);

  const hasChildren = item.children && item.children.length > 0;
  const isChildActive =
    hasChildren &&
    item.children.some((child) => location.pathname === child.path);

  if (hasChildren) {
    return (
      <div className="space-y-1 my-1.5">
        <button
          onClick={onToggle}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className={cn(
            "w-full flex items-center justify-between rounded-2xl px-4 py-3 transition-all duration-200 group relative select-none",
            isChildActive || isOpen
              ? "bg-slate-800/90 text-white font-bold border border-slate-700/80 shadow-md"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50",
          )}
        >
          <div className="flex items-center space-x-3.5 min-w-0">
            <div
              className={cn(
                "p-2 rounded-xl transition-all duration-200 flex items-center justify-center shrink-0 shadow-sm",
                isChildActive || isOpen
                  ? "bg-primary text-white shadow-primary/30"
                  : "bg-slate-800/90 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-100",
              )}
            >
              {item.icon && <item.icon className="h-5 w-5" />}
            </div>
            <span className="text-sm font-bold truncate tracking-tight">
              {item.label}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {badgeCount > 0 && !isOpen && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center shadow-md">
                {badgeLabel}
              </span>
            )}
            <div
              className={cn(
                "transition-transform duration-200 text-slate-400 group-hover:text-slate-200",
                isOpen && "rotate-180 text-primary"
              )}
            >
              <HiChevronDown className="h-4 w-4" />
            </div>
          </div>
        </button>

        {isOpen && (
          <div className="pl-7 pr-2 py-1.5 space-y-1 relative before:absolute before:left-6 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-800 animate-in slide-in-from-top-2 fade-in duration-200">
            {item.children.map((child) => {
              const showChildBadge =
                badgeCount > 0 && String(child?.path || "") === "/admin/support-tickets";

              return (
                <NavLink
                  key={child.path}
                  to={child.path}
                  end={child.end !== undefined ? child.end : false}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center justify-between text-sm py-2.5 px-3.5 rounded-xl transition-all duration-150 relative group",
                      isActive
                        ? "text-white font-bold bg-primary/20 text-primary border border-primary/30"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 font-medium",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={cn(
                          "w-2 h-2 rounded-full transition-colors shrink-0",
                          isActive ? "bg-primary" : "bg-slate-600 group-hover:bg-slate-400"
                        )} />
                        <span className="truncate">{child.label}</span>
                      </div>
                      {showChildBadge && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {badgeLabel}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.path}
      end={item.end !== undefined ? item.end : false}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={({ isActive }) =>
        cn(
          "flex items-center justify-between rounded-2xl px-4 py-3 my-1.5 transition-all duration-200 group relative select-none",
          isActive
            ? "bg-primary text-white font-bold shadow-md shadow-primary/25 border border-primary/30"
            : "text-slate-400 hover:text-white hover:bg-slate-800/50",
        )
      }
    >
      {({ isActive }) => (
        <>
          <div className="flex items-center space-x-3.5 min-w-0">
            <div
              className={cn(
                "p-2 rounded-xl transition-all duration-200 flex items-center justify-center shrink-0",
                isActive
                  ? "bg-white/25 text-white"
                  : "bg-slate-800/90 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-100",
              )}
            >
              {item.icon && <item.icon className="h-5 w-5" />}
            </div>
            <span className="text-sm font-bold truncate tracking-tight">
              {item.label}
            </span>
          </div>

          {badgeCount > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center shadow-md">
              {badgeLabel}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
};

const SidebarContent = ({ items, title, onClose, openMenu, handleToggle }) => {
  const { settings } = useSettings();
  const { user, logout } = useAuth();
  const appName = settings?.appName || 'SunGguard';

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0B0F19] text-slate-300">
      {/* Brand Header */}
      <div className="flex-shrink-0 flex h-20 items-center justify-between px-6 border-b border-slate-800/90 bg-slate-900/40">
        <div className="flex items-center space-x-3.5 min-w-0">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-primary to-orange-500 flex items-center justify-center text-white shadow-lg shadow-primary/25 shrink-0">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-black tracking-tight text-white leading-tight truncate">
              {appName}
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest truncate">
                Admin Center
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Close Button */}
        <button
          onClick={onClose}
          className="p-2 md:hidden text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav
        data-lenis-prevent
        className="flex-1 px-4 py-5 space-y-1.5 overflow-y-auto overscroll-contain custom-scrollbar-dark min-h-0 relative z-20"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="px-3 pb-2 pt-1 flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
          <span>Main Navigation</span>
          <span className="text-[10px] font-mono text-slate-600">v2.0</span>
        </div>

        <AnimatePresence>
          {items.map((item, idx) => (
            <SidebarItem
              key={idx}
              item={item}
              isOpen={openMenu === item.label}
              onToggle={() => handleToggle(item.label)}
            />
          ))}
        </AnimatePresence>
      </nav>

      {/* Admin Profile Footer */}
      <div className="p-4 border-t border-slate-800/90 bg-slate-900/60 flex-shrink-0">
        <div className="bg-slate-800/80 rounded-2xl p-3.5 border border-slate-700/60 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-primary/30 to-purple-500/30 border border-primary/50 flex items-center justify-center text-primary font-bold text-base shrink-0">
              {user?.name?.[0] || 'A'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">
                {user?.name || "Admin"}
              </p>
              <p className="text-xs text-emerald-400 font-semibold truncate flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Super Admin
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-xl bg-slate-700/60 text-slate-300 hover:text-rose-400 hover:bg-slate-700 transition-colors"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ items, title, isOpen, onClose }) => {
  const { role } = useAuth();
  const [openMenu, setOpenMenu] = useState(null);

  const handleToggle = (label) => {
    setOpenMenu((prev) => (prev === label ? null : label));
  };

  const commonProps = {
    items,
    title,
    onClose,
    openMenu,
    handleToggle,
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={cn(
        "fixed left-0 inset-y-0 w-72 bg-[#0B0F19] text-slate-300 border-r border-slate-800/90 shadow-2xl md:flex flex-col z-50 transition-all duration-300",
        (role === "admin" || role === "seller") ? "hidden md:flex" : "flex",
      )}>
        <SidebarContent {...commonProps} />
      </aside>

      {/* Mobile Sidebar (Drawer) */}
      <AnimatePresence mode="wait">
        {isOpen && (
          <div className="fixed inset-0 z-[100] md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm pointer-events-auto"
            />
            <div className="absolute left-0 inset-y-0 w-72 flex flex-col pointer-events-none">
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
                className="flex-1 bg-[#0B0F19] shadow-2xl flex flex-col pointer-events-auto min-h-0"
              >
                <SidebarContent {...commonProps} />
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
