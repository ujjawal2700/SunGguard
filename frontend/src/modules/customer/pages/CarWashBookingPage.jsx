/**
 * CAR WASH FEATURE DISABLED — page unmounted from AppRouter.
 * Re-enable by uncommenting lazy import + route in AppRouter.jsx.
 */
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  MapPin,
  Sparkles,
  ArrowRight,
  CreditCard,
  History,
  Calendar,
  Clock,
  User,
  Phone,
  AlertTriangle,
  ChevronLeft,
  Check,
  Zap,
  Car
} from "lucide-react";
import { toast } from "sonner";
import { carWashApi } from "../services/carWashApi";
import MapPicker from "../../../shared/components/MapPicker";
import { useAuth } from "@core/context/AuthContext";
import { useLocation } from "../context/LocationContext";

const VEHICLE_TYPES = [
  { key: "Hatchback", label: "Hatchback / Coupe", icon: "🚗", desc: "Small compact cars" },
  { key: "Sedan", label: "Sedan / Saloon", icon: "🚙", desc: "Standard 4-door cars" },
  { key: "SUV", label: "SUV / Crossover", icon: "🚘", desc: "Large cabin vehicles" },
  { key: "Bike", label: "Motorcycle / Scooter", icon: "🏍️", desc: "Two wheelers" }
];

const CarWashBookingPage = () => {
  const { user } = useAuth();
  const { currentLocation } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "history" ? "history" : "book";

  const [activeTab, setActiveTab] = useState(initialTab); // 'book' or 'history'
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState([]);
  const [history, setHistory] = useState([]);
  
  // Selection States
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState("Sedan");
  const [bookingType, setBookingType] = useState("INSTANT"); // 'INSTANT' or 'SCHEDULED'
  const [scheduledDateTime, setScheduledDateTime] = useState("");
  
  // Address State
  const [addressDetails, setAddressDetails] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    fullAddress: currentLocation?.name || "",
    lat: currentLocation?.latitude || null,
    lng: currentLocation?.longitude || null
  });

  // Sync with currentLocation if it is fetched or loaded later
  useEffect(() => {
    if (currentLocation && !addressDetails.lat) {
      setAddressDetails(prev => ({
        ...prev,
        fullAddress: prev.fullAddress || currentLocation.name || "",
        lat: currentLocation.latitude,
        lng: currentLocation.longitude
      }));
    }
  }, [currentLocation]);

  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [fareEstimation, setFareEstimation] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Load active wash packages
  const fetchPackages = useCallback(async () => {
    try {
      const response = await carWashApi.getPackages();
      if (response.data && response.data.success) {
        const pkgs = response.data.results || response.data.result || [];
        setPackages(pkgs);
        if (pkgs.length > 0) {
          setSelectedPackage(pkgs[0]);
        }
      }
    } catch (error) {
      console.error("Failed to load wash packages:", error);
    }
  }, []);

  // Load customer bookings history
  const fetchHistory = useCallback(async () => {
    try {
      const response = await carWashApi.getCustomerBookings();
      if (response.data && response.data.success) {
        setHistory(response.data.results || response.data.result || []);
      }
    } catch (error) {
      console.error("Failed to load booking history:", error);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
    fetchHistory();
  }, [fetchPackages, fetchHistory]);

  useEffect(() => {
    const tab = searchParams.get("tab") === "history" ? "history" : "book";
    setActiveTab(tab);
    if (tab === "history") fetchHistory();
  }, [searchParams, fetchHistory]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    if (tab === "history") {
      fetchHistory();
      setSearchParams({ tab: "history" }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  // Handle Dynamic Fare Calculation
  useEffect(() => {
    const calcFare = async () => {
      if (selectedPackage && selectedVehicle) {
        setEstimating(true);
        try {
          const res = await carWashApi.calculateFare({
            packageId: selectedPackage._id,
            vehicleType: selectedVehicle
          });
          if (res.data && res.data.success) {
            setFareEstimation(res.data.result);
          }
        } catch (error) {
          console.error("Failed to calculate fare:", error);
        } finally {
          setEstimating(false);
        }
      }
    };

    calcFare();
  }, [selectedPackage, selectedVehicle]);

  const handleMapConfirm = (location) => {
    setAddressDetails(prev => ({
      ...prev,
      fullAddress: location.address || "",
      lat: location.lat,
      lng: location.lng
    }));
    toast.success("Location coordinates updated!");
    setShowMapPicker(false);
  };

  const handleBookWash = async (e) => {
    e.preventDefault();
    if (!selectedPackage) {
      return toast.error("Please select a wash package.");
    }
    if (!addressDetails.fullAddress || !addressDetails.lat || !addressDetails.lng) {
      return toast.error("Please select a valid address.");
    }
    if (!addressDetails.name || !addressDetails.phone) {
      return toast.error("Please enter contact name and phone.");
    }
    if (bookingType === "SCHEDULED" && !scheduledDateTime) {
      return toast.error("Please select a date and time for scheduled wash.");
    }

    setLoading(true);
    try {
      const payload = {
        packageId: selectedPackage._id,
        vehicleType: selectedVehicle,
        bookingType,
        scheduledDateTime: bookingType === "SCHEDULED" ? scheduledDateTime : undefined,
        address: addressDetails,
        paymentMethod
      };

      const response = await carWashApi.createBooking(payload);
      if (response.data && response.data.success) {
        toast.success("Doorstep Car Wash requested successfully!");
        const newBooking = response.data.result;
        // Direct to tracking page
        navigate(`/car-wash/track/${newBooking._id}`);
      } else {
        toast.error(response.data.message || "Failed to book service");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Booking failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 font-outfit mt-4">
      {/* Header card */}
      <div className="bg-gradient-to-r from-cyan-600 to-blue-600 rounded-3xl p-6 md:p-8 text-white shadow-xl mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-white/85 hover:text-white font-bold text-xs mb-4 transition-all hover:-translate-x-1"
          >
            <ChevronLeft size={16} /> Back to Home
          </button>
          <span className="bg-white/20 text-xs font-extrabold uppercase px-3 py-1.5 rounded-full tracking-widest flex items-center gap-1.5 w-fit">
            <Sparkles size={12} className="animate-spin" /> Doorstep Eco Wash
          </span>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-3">
            Doorstep Car Wash
          </h1>
          <p className="text-white/80 font-medium text-sm md:text-base mt-2 max-w-lg">
            Professional car wash delivered to your doorstep. We bring eco-friendly shampoo, water, and tools right to your location.
          </p>
        </div>
        <div className="flex gap-2 bg-white/10 p-1.5 rounded-2xl backdrop-blur-sm self-stretch md:self-auto justify-center">
          <button
            onClick={() => switchTab("book")}
            className={`flex-1 md:flex-initial px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === "book"
                ? "bg-white text-cyan-600 shadow-md"
                : "hover:bg-white/10 text-white"
            }`}
          >
            <Zap size={16} /> Book Service
          </button>
          <button
            onClick={() => switchTab("history")}
            className={`flex-1 md:flex-initial px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === "history"
                ? "bg-white text-cyan-600 shadow-md"
                : "hover:bg-white/10 text-white"
            }`}
          >
            <History size={16} /> History
          </button>
        </div>
      </div>

      {activeTab === "book" && (
        <form onSubmit={handleBookWash} className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
          {/* Left Column: Details & Address */}
          <div className="space-y-6">
            {/* Vehicle Type Selection */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Car className="text-cyan-600" size={20} /> Select Vehicle Type
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {VEHICLE_TYPES.map((v) => (
                  <div
                    key={v.key}
                    onClick={() => setSelectedVehicle(v.key)}
                    className={`border-2 rounded-2xl p-3 cursor-pointer transition-all hover:bg-slate-50 relative flex flex-col justify-between h-24 ${
                      selectedVehicle === v.key ? "border-cyan-500 bg-cyan-50/20" : "border-slate-100"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-2xl">{v.icon}</span>
                      {selectedVehicle === v.key && (
                        <div className="bg-cyan-500 text-white p-0.5 rounded-full">
                          <Check size={10} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800">{v.label}</h4>
                      <p className="text-[9px] text-slate-400 font-bold leading-none mt-0.5">{v.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Address & Contact Details */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <MapPin className="text-cyan-600" size={20} /> Wash Address
              </h2>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Contact Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      required
                      placeholder="Name"
                      value={addressDetails.name}
                      onChange={(e) => setAddressDetails(p => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Contact Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="tel"
                      required
                      placeholder="Phone"
                      value={addressDetails.phone}
                      onChange={(e) => setAddressDetails(p => ({ ...p, phone: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Complete Address</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Street details, building, house number, landmarks..."
                  value={addressDetails.fullAddress}
                  onChange={(e) => setAddressDetails(p => ({ ...p, fullAddress: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowMapPicker(true)}
                className="w-full py-2.5 rounded-xl border border-dashed border-cyan-500 bg-cyan-50/30 hover:bg-cyan-50 text-cyan-600 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <MapPin size={14} /> Set Location on Map {addressDetails.lat ? "✓" : ""}
              </button>
            </div>

            {/* Schedule Preference */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Calendar className="text-cyan-600" size={20} /> Service Schedule
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <label
                  onClick={() => setBookingType("INSTANT")}
                  className={`border-2 rounded-2xl p-3 flex flex-col cursor-pointer transition-all hover:bg-slate-50 ${
                    bookingType === "INSTANT" ? "border-cyan-500 bg-cyan-50/20" : "border-slate-100"
                  }`}
                >
                  <span className="text-xs font-black text-slate-800">Wash Now</span>
                  <span className="text-[9px] text-slate-400 mt-1">Assign nearest available partner immediately</span>
                </label>
                <label
                  onClick={() => setBookingType("SCHEDULED")}
                  className={`border-2 rounded-2xl p-3 flex flex-col cursor-pointer transition-all hover:bg-slate-50 ${
                    bookingType === "SCHEDULED" ? "border-cyan-500 bg-cyan-50/20" : "border-slate-100"
                  }`}
                >
                  <span className="text-xs font-black text-slate-800">Schedule Wash</span>
                  <span className="text-[9px] text-slate-400 mt-1">Book wash for a later date & time</span>
                </label>
              </div>

              {bookingType === "SCHEDULED" && (
                <div className="space-y-1 animate-slideDown">
                  <label className="text-xs font-bold text-slate-500 uppercase">Select Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Packages, Payment, Price & Confirm */}
          <div className="space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Wash Package Selection */}
              <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Sparkles className="text-cyan-600" size={20} /> Select Wash Package
                </h2>
                
                {packages.length === 0 ? (
                  <p className="text-xs text-slate-400">Loading available wash packages...</p>
                ) : (
                  <div className="space-y-3">
                    {packages.map((pkg) => (
                      <div
                        key={pkg._id}
                        onClick={() => setSelectedPackage(pkg)}
                        className={`border-2 rounded-2xl p-4 flex gap-4 cursor-pointer transition-all hover:bg-slate-50 relative ${
                          selectedPackage?._id === pkg._id ? "border-cyan-500 bg-cyan-50/10 shadow-sm" : "border-slate-100"
                        }`}
                      >
                        {pkg.image && (
                          <img
                            src={pkg.image}
                            alt={pkg.name}
                            className="w-16 h-16 rounded-xl object-cover border border-slate-100 shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <h4 className="font-extrabold text-sm text-slate-800 truncate">{pkg.name}</h4>
                            <span className="text-sm font-black text-cyan-600">₹{pkg.basePrice}</span>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">{pkg.description}</p>
                          <span className="inline-flex items-center text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-150 px-2 py-0.5 rounded mt-2">
                            <Clock size={10} className="mr-1" /> {pkg.durationMinutes} mins
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment Methods */}
              <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <CreditCard className="text-cyan-600" size={20} /> Payment Option
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {["COD", "UPI", "CARD", "WALLET"].map((method) => (
                    <label
                      key={method}
                      className={`border-2 rounded-2xl p-3 flex items-center justify-between cursor-pointer transition-all hover:bg-slate-50 ${
                        paymentMethod === method ? "border-cyan-500 bg-cyan-50/10" : "border-slate-100"
                      }`}
                    >
                      <div>
                        <span className="text-xs font-black text-slate-800 uppercase">{method}</span>
                        <p className="text-[9px] text-slate-400 font-bold leading-none mt-0.5">
                          {method === "COD" ? "Pay at Service" : method === "WALLET" ? "Wallet Wallet" : "Instant Online"}
                        </p>
                      </div>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method}
                        checked={paymentMethod === method}
                        onChange={() => setPaymentMethod(method)}
                        className="accent-cyan-500 h-4 w-4"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Price Estimator & Book CTA */}
            <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl mt-6 space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Total Estimation</span>
                  {estimating ? (
                    <div className="h-10 flex items-center">
                      <span className="animate-pulse text-sm text-slate-400">Calculating...</span>
                    </div>
                  ) : (
                    <div className="text-3xl font-black text-white mt-1">
                      ₹{fareEstimation ? fareEstimation.fare : "0.00"}
                    </div>
                  )}
                </div>
                {fareEstimation && (
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Vehicle Multiplier</span>
                    <div className="text-lg font-bold text-white mt-0.5">{fareEstimation.vehicleMultiplier}x</div>
                  </div>
                )}
              </div>

              {fareEstimation && (
                <div className="border-t border-b border-white/10 py-3 space-y-2 text-xs text-slate-300 font-medium">
                  <div className="flex justify-between">
                    <span>Package Price ({selectedPackage?.name})</span>
                    <span>₹{fareEstimation.packagePrice}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vehicle Multiplier ({selectedVehicle})</span>
                    <span>x{fareEstimation.vehicleMultiplier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Service Rider Base Fare</span>
                    <span>₹{fareEstimation.baseFare}</span>
                  </div>
                </div>
              )}

              {!addressDetails.lat ? (
                <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 rounded-2xl p-3 text-xs font-semibold">
                  <AlertTriangle size={14} className="shrink-0" />
                  Please select your wash address on the map to estimate the doorstep booking details.
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading || estimating || !addressDetails.lat || !selectedPackage}
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all border-none"
              >
                {loading ? "Requesting Car Wash..." : "Confirm & Book Wash"}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Booking History Tab */}
      {activeTab === "history" && (
        <div className="space-y-4 animate-fadeIn">
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-2">
            <History className="text-cyan-600" size={22} /> Doorstep Booking Requests
          </h2>

          {history.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-100 text-center space-y-3">
              <div className="h-16 w-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <Sparkles size={32} />
              </div>
              <p className="text-slate-800 font-bold text-lg">No wash bookings found</p>
              <p className="text-slate-400 text-sm max-w-sm mx-auto">
                You haven't requested any doorstep washes yet. Create your first booking today!
              </p>
              <button
                onClick={() => switchTab("book")}
                className="px-6 py-2.5 bg-cyan-600 text-white font-bold text-sm rounded-xl hover:bg-cyan-700 transition-all border-none"
              >
                Book a Wash
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {history.map((booking) => (
                <div key={booking._id} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        ID: {booking.bookingId}
                      </span>
                      <span className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase ${
                        booking.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                        booking.status === "CANCELLED" ? "bg-red-100 text-red-600" :
                        "bg-cyan-100 text-cyan-700 animate-pulse"
                      }`}>
                        {booking.status}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="font-extrabold text-sm text-slate-800">{booking.packageId?.name || "Wash Package"}</h4>
                      <p className="text-xs text-slate-400">Vehicle: <span className="uppercase font-bold text-slate-600">{booking.vehicleType}</span></p>
                      
                      <div className="flex gap-2 items-center text-xs text-slate-500 pt-2">
                        <MapPin size={12} className="text-cyan-500 shrink-0" />
                        <span className="truncate">{booking.address?.fullAddress}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Fare Paid</span>
                      <span className="text-base font-black text-slate-900">₹{booking.fare}</span>
                    </div>
                    
                    <button
                      onClick={() => navigate(`/car-wash/track/${booking._id}`)}
                      className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl transition-all"
                    >
                      Track & Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Map Picker Modal */}
      {showMapPicker && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 max-w-lg w-full relative">
            <h3 className="text-base font-black text-slate-800 mb-4">Choose Wash Location</h3>
            <div className="h-96 w-full rounded-2xl overflow-hidden border border-slate-100 relative">
              <MapPicker
                onConfirm={handleMapConfirm}
                onCancel={() => setShowMapPicker(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CarWashBookingPage;
