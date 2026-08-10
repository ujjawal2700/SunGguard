/**
 * CAR WASH FEATURE DISABLED — page unmounted from AppRouter.
 */
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  MapPin,
  Sparkles,
  Clock,
  ChevronLeft,
  ShieldCheck,
  Star,
  User,
  Phone,
  Camera,
  Heart
} from "lucide-react";
import { toast } from "sonner";
import { carWashApi } from "../services/carWashApi";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const libraries = ["places"];

const TrackingMap = ({ address, partner }) => {
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  if (!isLoaded) {
    return (
      <div className="h-64 w-full bg-slate-100 rounded-3xl flex items-center justify-center animate-pulse">
        <span className="text-xs text-slate-400 font-bold">Loading Map...</span>
      </div>
    );
  }

  const mapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  };

  const center = {
    lat: Number(address?.lat) || 0,
    lng: Number(address?.lng) || 0,
  };

  const partnerCoordinates = partner?.location?.coordinates;
  const partnerPos =
    Array.isArray(partnerCoordinates) && partnerCoordinates.length === 2
      ? { lat: Number(partnerCoordinates[1]), lng: Number(partnerCoordinates[0]) }
      : null;

  return (
    <div className="rounded-3xl overflow-hidden border border-slate-100 shadow-md relative h-64 w-full z-10">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center}
        zoom={14}
        options={mapOptions}
      >
        <Marker
          position={center}
          label={{
            text: "W",
            color: "white",
            fontWeight: "black",
          }}
          title={`Wash Location: ${address?.fullAddress}`}
        />

        {partnerPos && (
          <Marker
            position={partnerPos}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#06b6d4",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            }}
            title={`Wash Professional: ${partner?.name}`}
          />
        )}
      </GoogleMap>
    </div>
  );
};

const CarWashTrackingPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  // Review states
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchBooking = async () => {
    try {
      const response = await carWashApi.getBookingDetails(id);
      if (response.data && response.data.success) {
        setBooking(response.data.result);
      }
    } catch (error) {
      console.error("Failed to load tracking details:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooking();
    // Poll updates every 6 seconds
    const interval = setInterval(fetchBooking, 6000);
    return () => clearInterval(interval);
  }, [id]);

  const handleCancelBooking = async () => {
    if (!window.confirm("Are you sure you want to cancel this booking request?")) return;
    try {
      const response = await carWashApi.cancelBooking(id);
      if (response.data && response.data.success) {
        toast.success("Booking cancelled successfully!");
        fetchBooking();
      } else {
        toast.error(response.data.message || "Failed to cancel booking");
      }
    } catch (error) {
      toast.error("Cancel request failed");
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      const response = await carWashApi.addReview(id, { rating, comment });
      if (response.data && response.data.success) {
        toast.success("Thank you for your rating & review!");
        fetchBooking();
      } else {
        toast.error(response.data.message || "Failed to save review");
      }
    } catch (error) {
      toast.error("Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-bold text-gray-500">Loading tracking status...</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-12 text-center space-y-4">
        <h3 className="text-lg font-black text-slate-800">Booking details not found</h3>
        <p className="text-xs text-slate-400">The requested car wash booking may have expired or is unavailable.</p>
        <button
          onClick={() => navigate("/car-wash")}
          className="px-6 py-2.5 bg-cyan-600 text-white font-bold text-xs rounded-xl border-none hover:bg-cyan-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  const statusSteps = [
    { key: "REQUESTED", label: "Requested", desc: "Waiting to assign doorstep service provider." },
    { key: "ACCEPTED", label: "Accepted", desc: "Service partner is traveling to your location." },
    { key: "ARRIVED", label: "Arrived", desc: "Partner arrived at location & reviewing vehicle." },
    { key: "WASHING", label: "Washing", desc: "Eco wash is currently in progress." },
    { key: "COMPLETED", label: "Completed", desc: "Wash finished. Thank you for booking!" }
  ];

  const currentStatusIdx = statusSteps.findIndex(s => s.key === booking.status);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 font-outfit mt-4">
      {/* Header */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/car-wash")}
          className="p-2 hover:bg-slate-50 rounded-xl transition-all"
        >
          <ChevronLeft size={20} className="text-slate-700" />
        </button>
        <div>
          <h2 className="text-base font-black text-slate-800">Track Wash Status</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            Booking ID: #{booking.bookingId}
          </p>
        </div>
        <span className={`ml-auto text-xs font-black px-3 py-1.5 rounded-full uppercase ${
          booking.status === "COMPLETED" ? "bg-green-100 text-green-700" :
          booking.status === "CANCELLED" ? "bg-red-100 text-red-600" :
          "bg-cyan-100 text-cyan-700"
        }`}>
          {booking.status}
        </span>
      </div>

      {/* Map visualization */}
      {booking.status !== "CANCELLED" && (
        <div className="mb-6">
          <TrackingMap address={booking.address} partner={booking.partnerId} />
        </div>
      )}

      {/* Booking Status Timeline */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-6">
        {/* OTP Code display */}
        {["REQUESTED", "ACCEPTED", "ARRIVED", "WASHING"].includes(booking.status) && (
          <div className="bg-gradient-to-r from-cyan-600 to-blue-600 rounded-2xl p-5 text-white flex justify-between items-center shadow-md">
            <div>
              <span className="text-[10px] font-black uppercase text-white/70 tracking-widest">
                Service Completion OTP
              </span>
              <p className="text-xs text-white/90 font-medium mt-1">
                Share this 4-digit code with the washer only after verifying the work.
              </p>
            </div>
            <div className="text-3xl font-black tracking-widest bg-white/10 px-4 py-2 rounded-xl border border-white/20">
              {booking.otp}
            </div>
          </div>
        )}

        {/* Timeline details */}
        {booking.status !== "CANCELLED" ? (
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-850 uppercase tracking-wider">Service History</h3>
            <div className="relative pl-6 space-y-6 border-l-2 border-slate-200 ml-3">
              {statusSteps.map((step, idx) => {
                const isPassed = idx <= currentStatusIdx;
                const isCurrent = idx === currentStatusIdx;
                
                return (
                  <div key={step.key} className="relative">
                    {/* Circle Pin */}
                    <div className={`absolute -left-[31px] top-0.5 w-4 h-4 rounded-full border-2 transition-all ${
                      isCurrent ? "bg-cyan-500 border-cyan-500 scale-125 shadow-md shadow-cyan-300" :
                      isPassed ? "bg-cyan-600 border-cyan-600" :
                      "bg-white border-slate-300"
                    }`} />
                    
                    <div>
                      <h4 className={`text-xs font-black transition-all ${
                        isCurrent ? "text-cyan-600" :
                        isPassed ? "text-slate-800" :
                        "text-slate-400"
                      }`}>
                        {step.label}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-red-50 text-red-700 border border-red-100 rounded-2xl p-5 text-center text-xs font-bold">
            This booking was cancelled.
          </div>
        )}

        {/* Cancel option */}
        {booking.status === "REQUESTED" && (
          <button
            onClick={handleCancelBooking}
            className="w-full py-3 bg-red-50 text-red-600 hover:bg-red-100/60 transition-all font-black text-xs uppercase tracking-widest rounded-2xl border-none"
          >
            Cancel Request
          </button>
        )}
      </div>

      {/* verification photos display if uploaded */}
      {(booking.beforeWashImage || booking.afterWashImage) && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm mt-6 space-y-4">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Camera className="text-cyan-500" size={16} /> Verification Photos
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {booking.beforeWashImage ? (
              <div className="space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Before Wash</span>
                <img
                  src={booking.beforeWashImage}
                  alt="Before Wash verification"
                  className="rounded-2xl h-40 w-full object-cover border border-slate-100 shadow-sm"
                />
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-100 rounded-2xl h-40 flex items-center justify-center p-4 text-center">
                <span className="text-[10px] text-slate-400 font-bold leading-normal">Before wash photo will appear when partner begins.</span>
              </div>
            )}

            {booking.afterWashImage ? (
              <div className="space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">After Wash</span>
                <img
                  src={booking.afterWashImage}
                  alt="After Wash verification"
                  className="rounded-2xl h-40 w-full object-cover border border-slate-100 shadow-sm"
                />
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-100 rounded-2xl h-40 flex items-center justify-center p-4 text-center">
                <span className="text-[10px] text-slate-400 font-bold leading-normal">After wash photo will appear upon completion.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* service partner details */}
      {booking.partnerId && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm mt-6 space-y-4">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Service Professional</h3>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center shrink-0 border border-cyan-100 overflow-hidden">
              {booking.partnerId.profileImage ? (
                <img src={booking.partnerId.profileImage} alt={booking.partnerId.name} className="w-full h-full object-cover" />
              ) : (
                <User className="text-cyan-600" size={24} />
              )}
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-slate-800">{booking.partnerId.name}</h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                {booking.partnerId.vehicleNumber} ({booking.partnerId.vehicleType})
              </p>
            </div>
            <a
              href={`tel:${booking.partnerId.phone}`}
              className="ml-auto p-3 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all"
            >
              <Phone size={16} />
            </a>
          </div>
        </div>
      )}

      {/* Completed rating review card */}
      {booking.status === "COMPLETED" && (
        <div className="bg-white rounded-3xl p-6 border border-cyan-100 shadow-lg mt-6 space-y-4">
          <div className="flex items-center gap-2 text-cyan-600">
            <Heart size={20} className="animate-pulse fill-cyan-500" />
            <h3 className="text-sm font-black uppercase tracking-wider">Wash Experience</h3>
          </div>
          
          {booking.rating ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-600 font-medium">You submitted a rating for this wash service:</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <Star key={star} size={18} className={`fill-amber-400 text-amber-400`} />
                ))}
              </div>
              {booking.comment && (
                <p className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 italic text-slate-500 mt-2">
                  "{booking.comment}"
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <p className="text-xs text-slate-500 leading-normal">
                How was the eco wash professional's service? Share your feedback to help us keep quality high.
              </p>
              
              <div className="flex gap-1.5 justify-center py-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star
                      size={28}
                      className={star <= rating ? "fill-amber-400 text-amber-400" : "text-slate-350"}
                    />
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Review Comments</label>
                <textarea
                  rows={2}
                  placeholder="Share details about the wash quality, professional promptness..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-cyan-500"
                />
              </div>

              <button
                type="submit"
                disabled={submittingReview}
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-black py-3 rounded-2xl text-xs uppercase tracking-widest shadow-md transition-all border-none"
              >
                {submittingReview ? "Saving Feedback..." : "Submit Review"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default CarWashTrackingPage;
