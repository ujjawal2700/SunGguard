/**
 * CAR WASH FEATURE DISABLED — page unmounted from AppRouter.
 */
import React, { useState, useEffect } from "react";
import {
  Bell,
  Star,
  MapPin,
  CheckCircle,
  XCircle,
  IndianRupee,
  AlertCircle,
  Camera,
  ShieldCheck,
  LogOut,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";

import { useAuth } from "@core/context/AuthContext";
import { deliveryApi } from "../services/deliveryApi";
import { carWashApi } from "../../customer/services/carWashApi";
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from "@react-google-maps/api";

const CarWashMap = ({ address, status }) => {
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places"],
  });

  const [currentLocation, setCurrentLocation] = useState(null);
  const [directions, setDirections] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !window.google || !currentLocation || !address?.lat || !address?.lng) return;

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: currentLocation,
        destination: { lat: Number(address.lat), lng: Number(address.lng) },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);
        } else {
          console.error(`Directions request failed: ${status}`);
        }
      }
    );
  }, [isLoaded, currentLocation, address?.lat, address?.lng]);

  if (!isLoaded) {
    return (
      <div className="h-44 w-full bg-slate-100 rounded-2xl flex items-center justify-center animate-pulse">
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Loading Navigation Map...</span>
      </div>
    );
  }

  const center = currentLocation || {
    lat: Number(address?.lat || 0),
    lng: Number(address?.lng || 0),
  };

  const mapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-inner relative h-48 w-full z-10">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center}
        zoom={14}
        options={mapOptions}
      >
        {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: true }} />}

        {currentLocation && (
          <Marker
            position={currentLocation}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: "#0891b2",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            }}
            title="Your Location"
          />
        )}

        {address?.lat && address?.lng && (
          <Marker
            position={{ lat: Number(address.lat), lng: Number(address.lng) }}
            label={{
              text: "W",
              color: "white",
              fontWeight: "black",
            }}
            title={`Wash Location: ${address.fullAddress}`}
          />
        )}
      </GoogleMap>
    </div>
  );
};

const CarWashPartnerDashboard = () => {
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();

  const [isOnline, setIsOnline] = useState(user?.isOnline || false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [availableWashes, setAvailableWashes] = useState([]);
  const [assignedWash, setAssignedWash] = useState(null);
  const [activeWashForOtp, setActiveWashForOtp] = useState(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [completionPhoto, setCompletionPhoto] = useState("");
  const [earnings, setEarnings] = useState({
    today: 0,
    deliveries: 0,
    incentives: 0,
    cashCollected: 0,
  });

  useEffect(() => {
    if (user) {
      setIsOnline(user.isOnline);
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      const response = await deliveryApi.getStats();
      if (response.data.success) {
        setEarnings((prev) => ({
          ...prev,
          ...response.data.result,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch statistics:", error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await deliveryApi.getNotifications();
      if (response.data.success && response.data.result) {
        setUnreadCount(response.data.result.unreadCount || 0);
      }
    } catch (error) {
      console.error("Failed to fetch notifications");
    }
  };

  const fetchAvailableWashes = async () => {
    try {
      const response = await carWashApi.partnerGetAvailable();
      if (response.data.success) {
        setAvailableWashes(response.data.results || response.data.result || []);
      }
    } catch (error) {
      console.error("Failed to fetch available washes:", error);
    }
  };

  const fetchAssignedWash = async () => {
    try {
      const response = await carWashApi.partnerGetAssigned();
      if (response.data.success) {
        setAssignedWash(response.data.result || null);
      }
    } catch (error) {
      console.error("Failed to fetch assigned wash:", error);
    }
  };

  const handleAcceptWash = async (bookingId) => {
    try {
      const response = await carWashApi.partnerAccept({ bookingId });
      if (response.data.success) {
        toast.success("Doorstep wash request accepted!");
        fetchAvailableWashes();
        fetchAssignedWash();
      } else {
        toast.error(response.data.message || "Failed to accept wash request");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to accept wash request");
    }
  };

  const handleUpdateWashStatus = async (bookingId, status, fileData = null) => {
    try {
      const formData = new FormData();
      formData.append("bookingId", bookingId);
      formData.append("status", status);
      if (fileData) {
        const blob = await fetch(fileData).then((r) => r.blob());
        formData.append("beforeWashImage", blob, "before-wash.jpg");
      }
      const response = await carWashApi.partnerUpdateStatus(formData);
      if (response.data.success) {
        toast.success(`Wash status updated to ${status}!`);
        fetchAssignedWash();
      } else {
        toast.error(response.data.message || "Failed to update status");
      }
    } catch (error) {
      toast.error("Status update request failed");
    }
  };

  const handleUploadPhoto = (e, callback) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      return toast.error("Photo size should be less than 2 MB");
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      callback(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCompleteWashSubmit = async (e) => {
    e.preventDefault();
    if (!otpCode) return toast.error("Please enter the verification OTP");
    try {
      const formData = new FormData();
      formData.append("bookingId", activeWashForOtp._id);
      formData.append("otp", otpCode);
      if (completionPhoto) {
        const blob = await fetch(completionPhoto).then((r) => r.blob());
        formData.append("afterWashImage", blob, "after-wash.jpg");
      }
      const response = await carWashApi.partnerComplete(formData);
      if (response.data.success) {
        toast.success("Wash booking completed successfully!");
        setShowOtpModal(false);
        setActiveWashForOtp(null);
        setOtpCode("");
        setCompletionPhoto("");
        setAssignedWash(null);
        fetchStats();
      } else {
        toast.error(response.data.message || "Failed to complete booking");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Complete booking request failed");
    }
  };

  useEffect(() => {
    fetchStats();
    fetchNotifications();
    if (isOnline) {
      fetchAvailableWashes();
      fetchAssignedWash();
    }
  }, [isOnline]);

  const handleOnlineToggle = async () => {
    const newStatus = !isOnline;
    try {
      await deliveryApi.updateProfile({ isOnline: newStatus });
      await refreshUser();
      setIsOnline(newStatus);
      if (newStatus) {
        toast.success("You are now ONLINE. Finding nearby wash bookings...");
      } else {
        toast.info("You are now OFFLINE. No new wash requests.");
      }
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  // Re-use pending review screen if not verified
  if (user && !user.isVerified) {
    return (
      <div className="min-h-screen bg-[#F0F4FF] flex flex-col justify-between p-6 relative overflow-hidden font-sans max-w-md mx-auto border-x border-gray-100 shadow-2xl">
        <div className="absolute top-[-10%] right-[-10%] h-[300px] w-[300px] rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] h-[300px] w-[300px] rounded-full bg-purple-200/30 blur-3xl" />

        <header className="flex justify-between items-center py-4 relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-brand-100 bg-white shadow-sm">
              <img
                src={user.profileImage || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900">{user.name}</h4>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Car Wash Partner</span>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2 bg-white border border-gray-100 rounded-full hover:bg-gray-50 transition-colors text-gray-400 hover:text-gray-600 shadow-sm"
          >
            <LogOut size={16} />
          </button>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center my-8 text-center relative z-10 max-w-sm mx-auto bg-white rounded-[2rem] p-6 shadow-[0_16px_40px_rgba(99,102,241,0.06)] border border-brand-50">
          <div className="w-20 h-20 bg-amber-5 border border-amber-100 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
            <Clock size={36} className="text-amber-500 animate-pulse" />
          </div>

          <h2 className="text-2xl font-black tracking-tight text-gray-900 mb-3">
            Application Under Review
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed mb-6 font-medium">
            Your documents are currently being verified by our operations team. Approval usually takes less than 24 hours.
          </p>

          <div className="w-full space-y-4 bg-gray-50 border border-gray-100/50 rounded-2xl p-5 text-left">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 block ml-1">Verification Checklist</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-5 border border-emerald-100 flex items-center justify-center text-[10px] text-emerald-600 font-bold">✓</div>
                <span className="text-xs font-bold text-gray-600">Identity & Documents Uploaded</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-5 border border-amber-100 flex items-center justify-center text-[10px] text-amber-600 font-black animate-pulse">●</div>
                <span className="text-xs font-bold text-gray-600">Background Verification in Progress</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] text-gray-400 font-bold">-</div>
                <span className="text-xs font-semibold text-gray-400">Account Activation</span>
              </div>
            </div>
          </div>
        </div>

        <footer className="space-y-3 relative z-10">
          <Button
            onClick={async () => {
              const res = await refreshUser();
              if (res?.isVerified) {
                toast.success("Congratulations! Your account has been verified.");
                window.location.reload();
              } else {
                toast.info("Verification is still in progress. Please check back later.");
              }
            }}
            variant="primary"
            className="w-full h-12 rounded-2xl font-black text-xs uppercase tracking-widest bg-black hover:bg-brand-700 text-white border-none shadow-lg"
          >
            <RefreshCw size={14} className="mr-2" />
            Refresh Status
          </Button>
          <div className="text-center text-[10px] font-bold text-gray-400 tracking-wider uppercase py-2">
            Support ID: #{user?._id ? user._id.slice(-6).toUpperCase() : "PENDING"}
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="bg-[#F0F4FF] min-h-screen pb-24 relative overflow-hidden font-sans max-w-md mx-auto border-x border-gray-100 shadow-2xl">
      {/* Header */}
      <header className="bg-white/85 backdrop-blur-md border-b border-gray-100 px-6 pt-12 pb-4 flex justify-between items-center sticky top-0 z-30 transition-all duration-300">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-cyan-500 ring-2 ring-cyan-100 shadow-sm">
            <img
              src={user?.profileImage || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h2 className="text-sm font-black text-gray-800 tracking-tight leading-tight">
              {user?.name || "Wash Partner"}
            </h2>
            <div className="flex items-center text-xs font-bold mt-0.5">
              <span className="flex items-center bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded border border-cyan-100">
                <Star size={10} fill="currentColor" className="mr-1" />
                4.9
              </span>
              <span className="text-gray-300 mx-2">•</span>
              <span className="text-gray-400 uppercase tracking-widest text-[9px]">Car Wash Partner</span>
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="p-2.5 bg-gray-50 border border-gray-100 rounded-full hover:bg-gray-100 transition-colors text-gray-500 shadow-sm"
        >
          <LogOut size={16} />
        </button>
      </header>

      {/* Online/Offline Toggle */}
      <div className="px-6 py-6">
        <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-brand-50">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Service Status</span>
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full animate-pulse",
                isOnline ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
              )} />
              <span className={cn(
                "text-[11px] font-bold uppercase tracking-wider",
                isOnline ? "text-emerald-600" : "text-rose-600"
              )}>
                {isOnline ? "Receiving Bookings" : "Currently Offline"}
              </span>
            </div>
          </div>

          <div
            className="relative w-full h-14 bg-gray-100/80 rounded-2xl flex items-center p-1.5 cursor-pointer shadow-inner overflow-hidden border border-gray-200/50"
            onClick={handleOnlineToggle}
          >
            <div className="absolute inset-0 flex w-full">
              <div className="w-1/2 flex items-center justify-center">
                <span className={cn(
                  "text-[10px] font-black tracking-widest transition-opacity duration-300",
                  isOnline ? "opacity-0" : "opacity-40 text-gray-500"
                )}>SLIDE TO GO ONLINE</span>
              </div>
              <div className="w-1/2 flex items-center justify-center">
                <span className={cn(
                  "text-[10px] font-black tracking-widest transition-opacity duration-300",
                  !isOnline ? "opacity-0" : "opacity-40 text-gray-500"
                )}>SLIDE TO GO OFFLINE</span>
              </div>
            </div>

            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.1}
              onDragEnd={(_, info) => {
                const swipePower = info.offset.x;
                if (swipePower > 50 && !isOnline) {
                  handleOnlineToggle();
                } else if (swipePower < -50 && isOnline) {
                  handleOnlineToggle();
                }
              }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "w-1/2 h-full rounded-xl shadow-md flex items-center justify-center gap-2 z-10 border transition-all duration-500 cursor-grab active:cursor-grabbing",
                isOnline 
                  ? "bg-gradient-to-r from-cyan-600 to-cyan-500 border-cyan-700 text-white" 
                  : "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-900 text-white"
              )}
              animate={{ x: isOnline ? "100%" : "0%" }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              {isOnline ? <CheckCircle size={18} strokeWidth={3} /> : <XCircle size={18} strokeWidth={3} />}
              <span className="text-xs font-black uppercase tracking-widest select-none">
                {isOnline ? "ONLINE" : "OFFLINE"}
              </span>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 space-y-6">
        {/* Earnings Card */}
        <Card className="bg-white rounded-[2rem] p-5 shadow-sm border border-brand-50 overflow-hidden relative">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl"></div>

          <div className="flex justify-between items-center mb-4 relative z-10">
            <div>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Today's Payout</span>
              <h2 className="text-3xl font-black text-slate-800 flex items-baseline">
                <span className="text-lg font-bold mr-0.5">₹</span>
                {earnings.today || 0}
              </h2>
            </div>
            <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-2.5 text-cyan-600">
              <IndianRupee size={22} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 relative z-10">
            <div>
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Completed Jobs</span>
              <span className="text-sm font-bold text-gray-800">{earnings.deliveries || 0} Washes</span>
            </div>
            <div>
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Cash Collected</span>
              <span className="text-sm font-bold text-gray-800">₹{earnings.cashCollected || 0}</span>
            </div>
          </div>
        </Card>

        {/* Available or Active washes */}
        <AnimatePresence mode="wait">
          {!isOnline ? (
            <motion.div
              key="offline-state"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 text-center border border-brand-50 flex flex-col items-center"
            >
              <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100 opacity-60">
                <Clock size={20} className="text-gray-400" />
              </div>
              <h4 className="text-sm font-bold text-gray-800 mb-1">You are currently offline</h4>
              <p className="text-[11px] text-gray-400 max-w-[200px]">Switch your status to online above to start receiving doorstep wash bookings.</p>
            </motion.div>
          ) : assignedWash ? (
            <motion.div
              key="active-wash"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-bold text-gray-800 tracking-tight">Active Wash Task</h3>
                <span className="text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-full uppercase border border-cyan-100">
                  {assignedWash.status}
                </span>
              </div>

              <Card className="p-5 border border-cyan-100 transition-all shadow-sm space-y-4 bg-white rounded-[2rem]">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black text-cyan-600 uppercase tracking-wider block mb-0.5">Partner Payout</span>
                    <span className="text-base font-black text-slate-800 block">₹{assignedWash.fare - assignedWash.commission}</span>
                    <span className="text-[10px] text-slate-400 font-bold block mt-1">ID: #{assignedWash.bookingId}</span>
                  </div>
                  <div className="text-right">
                    <span className="inline-block text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md uppercase">
                      {assignedWash.vehicleType}
                    </span>
                  </div>
                </div>

                {["ACCEPTED", "ARRIVED", "WASHING"].includes(assignedWash.status) && assignedWash.address?.lat && assignedWash.address?.lng && (
                  <CarWashMap
                    address={assignedWash.address}
                    status={assignedWash.status}
                  />
                )}

                <div className="space-y-2.5 text-xs text-slate-600 border-t border-b border-slate-100 py-3">
                  <div>
                    <strong className="text-slate-800 block mb-0.5">Customer Name & Phone:</strong>
                    <p>{assignedWash.customerId?.name || "Customer"} ({assignedWash.customerId?.phone || "N/A"})</p>
                  </div>
                  <div className="border-t border-slate-100 pt-2.5">
                    <strong className="text-slate-800 block mb-0.5">Wash Location:</strong>
                    <p className="text-slate-500">{assignedWash.address?.fullAddress}</p>
                  </div>
                  <div className="border-t border-slate-100 pt-2.5">
                    <strong className="text-slate-800 block mb-0.5">Package Details:</strong>
                    <p className="font-bold text-slate-700">{assignedWash.packageId?.name} ({assignedWash.packageId?.durationMinutes} Mins)</p>
                    <p className="text-slate-400 mt-0.5">{assignedWash.packageId?.description}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {assignedWash.status === "ACCEPTED" && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full text-[10px] font-black uppercase tracking-wider h-10 shadow-md bg-cyan-600 hover:bg-cyan-700 border-none rounded-xl"
                      onClick={() => handleUpdateWashStatus(assignedWash._id, "ARRIVED")}
                    >
                      Mark Arrived at Location
                    </Button>
                  )}

                  {assignedWash.status === "ARRIVED" && (
                    <div className="w-full space-y-2">
                      <label className="w-full h-10 border border-dashed border-cyan-500 bg-cyan-55/50 hover:bg-cyan-50 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer text-[10px] font-black text-cyan-600 uppercase transition-all">
                        <Camera size={14} />
                        Upload Before-Wash Photo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleUploadPhoto(e, (base64) => {
                            handleUpdateWashStatus(assignedWash._id, "WASHING", base64);
                          })}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-[10px] font-black uppercase tracking-wider h-9"
                        onClick={() => handleUpdateWashStatus(assignedWash._id, "WASHING")}
                      >
                        Skip Photo & Start Washing
                      </Button>
                    </div>
                  )}

                  {assignedWash.status === "WASHING" && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full text-[10px] font-black uppercase tracking-wider h-10 shadow-md bg-green-600 hover:bg-green-700 border-none rounded-xl"
                      onClick={() => {
                        setActiveWashForOtp(assignedWash);
                        setShowOtpModal(true);
                      }}
                    >
                      Verify OTP & Complete Wash
                    </Button>
                  )}
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="available-washes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-bold text-gray-800 tracking-tight">Available Wash Requests</h3>
                <span className="text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-full uppercase border border-cyan-100">
                  {availableWashes.length} Nearby
                </span>
              </div>

              {availableWashes.length > 0 ? (
                availableWashes.map((wash) => (
                  <Card key={wash._id} className="p-4 border border-brand-50 hover:border-brand-100 transition-all shadow-sm rounded-[2rem] bg-white">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-[10px] font-black text-cyan-600 uppercase tracking-widest mb-1 block">Doorstep Wash</span>
                        <h4 className="font-bold text-slate-800 text-sm">{wash.packageId?.name || "Wash Package"}</h4>
                        <span className="text-[10px] text-slate-400 font-bold block mt-0.5">Vehicle: <span className="uppercase text-slate-700">{wash.vehicleType}</span></span>
                      </div>
                      <div className="text-right">
                        <span className="block font-black text-cyan-600 text-lg">₹{wash.fare - wash.commission}</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Your Share</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-5">
                      <div className="flex items-center text-xs text-gray-600">
                        <MapPin size={12} className="mr-2 text-cyan-500" />
                        <span className="truncate">{wash.address?.fullAddress}</span>
                      </div>
                      <div className="flex items-center text-[11px] text-gray-500 font-medium">
                        <Sparkles size={12} className="mr-2 text-cyan-400 animate-pulse" />
                        <span>Requires Before/After photos & Customer OTP</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                       <Button 
                        variant="primary" 
                        size="sm" 
                        className="w-full font-black text-[10px] tracking-widest uppercase h-10 shadow-lg bg-cyan-600 hover:bg-cyan-750 text-white border-none rounded-xl"
                        onClick={() => handleAcceptWash(wash._id)}
                      >
                        Accept Job
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="bg-white rounded-[2rem] p-10 text-center border border-brand-50 flex flex-col items-center">
                  <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100 opacity-60">
                    <Sparkles size={20} className="text-cyan-400 animate-pulse" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-800 mb-1">No wash requests nearby</h4>
                  <p className="text-[11px] text-gray-400">We're looking for wash bookings in your area. Keep checking back.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* OTP Completion Modal */}
      {showOtpModal && activeWashForOtp && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form 
            onSubmit={handleCompleteWashSubmit} 
            className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 max-w-sm w-full space-y-4"
          >
            <div className="text-center space-y-2">
              <div className="h-12 w-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto border border-green-100">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-base font-black text-slate-800">Verify Job Completion OTP</h3>
              <p className="text-xs text-slate-400">
                Ask customer for the 4-digit OTP code to complete wash booking #{activeWashForOtp.bookingId}.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block ml-1">After-Wash Verification Code</label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="Enter 4-digit OTP"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full h-11 bg-slate-50 border border-slate-100 rounded-xl px-4 text-center text-sm font-bold text-slate-800 tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block ml-1">After-Wash Photo</label>
                {completionPhoto ? (
                  <div className="relative rounded-2xl overflow-hidden border border-slate-100 h-28 w-full group">
                    <img src={completionPhoto} alt="After Wash Proof" className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => setCompletionPhoto("")}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="w-full h-20 border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-2xl flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-slate-600 transition-all">
                    <Camera size={20} className="mb-1" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Capture After Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleUploadPhoto(e, setCompletionPhoto)}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1 text-[10px] font-black uppercase tracking-wider h-10 rounded-xl"
                onClick={() => {
                  setShowOtpModal(false);
                  setOtpCode("");
                  setCompletionPhoto("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="flex-1 text-[10px] font-black uppercase tracking-wider h-10 bg-green-600 hover:bg-green-700 border-none rounded-xl"
              >
                Complete Job
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CarWashPartnerDashboard;
