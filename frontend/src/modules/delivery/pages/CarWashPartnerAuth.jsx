/**
 * CAR WASH FEATURE DISABLED — page unmounted from AppRouter / delivery routes.
 */
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Phone,
  ArrowRight,
  CheckCircle,
  ShieldCheck,
  ChevronLeft,
  User,
  Sparkles,
  Mail,
  MapPin,
  FileText,
  Upload,
  X,
  Camera,
  Lock,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { deliveryApi } from "../services/deliveryApi";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { toast } from "sonner";
import { setActiveRole, ROLES } from "@core/auth/activeRoleStore";

const CarWashPartnerAuth = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const appName = settings?.appName || "SunGuard";
  const { login } = useAuth();

  useEffect(() => {
    setActiveRole(ROLES.DELIVERY);
  }, []);

  // mode: "login" | "signup"
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState("form"); // "form" | "otp"

  // Login state
  const [loginPhone, setLoginPhone] = useState("");

  // Signup state
  const [signupStep, setSignupStep] = useState(1);
  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupAddress, setSignupAddress] = useState("");
  const [signupPanNumber, setSignupPanNumber] = useState("");
  const [signupAadharNumber, setSignupAadharNumber] = useState("");
  const [signupAccountNumber, setSignupAccountNumber] = useState("");
  const [signupIfsc, setSignupIfsc] = useState("");
  const [signupAccountHolder, setSignupAccountHolder] = useState("");
  const [signupExperience, setSignupExperience] = useState("");
  const [signupExperienceDetails, setSignupExperienceDetails] = useState("");
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState("");

  // Document states
  const [aadharFile, setAadharFile] = useState(null);
  const [panFile, setPanFile] = useState(null);

  // OTP state
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(30);

  useEffect(() => {
    let interval;
    if (step === "otp" && timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  const handleFileUpload = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size should not exceed 5MB");
      return;
    }

    if (type === "profile") {
      setProfileImageFile(file);
      setProfileImagePreview(URL.createObjectURL(file));
      toast.success("Profile photo uploaded!");
    } else if (type === "aadhar") {
      setAadharFile(file);
      toast.success("Aadhar Card uploaded!");
    } else if (type === "pan") {
      setPanFile(file);
      toast.success("PAN Card uploaded!");
    }
  };

  const handleSendOtp = async () => {
    try {
      setLoading(true);
      if (mode === "login") {
        if (!loginPhone || loginPhone.length < 10) {
          toast.error("Please enter a valid 10-digit phone number");
          return;
        }
        const res = await deliveryApi.sendLoginOtp({ phone: loginPhone });
        toast.success(res.data?.message || "OTP sent!");
      } else {
        if (!signupName.trim()) { toast.error("Please enter your name"); return; }
        if (!signupPhone || signupPhone.length < 10) { toast.error("Please enter a valid 10-digit phone number"); return; }
        if (!profileImageFile) { toast.error("Please upload your profile photo"); return; }
        if (!signupAadharNumber) { toast.error("Please enter your Aadhaar number"); return; }
        if (!signupPanNumber) { toast.error("Please enter your PAN card number"); return; }

        const formData = new FormData();
        formData.append("name", signupName.trim());
        formData.append("phone", signupPhone);
        formData.append("email", signupEmail);
        formData.append("address", signupAddress);
        formData.append("accountHolder", signupAccountHolder);
        formData.append("accountNumber", signupAccountNumber);
        formData.append("ifsc", signupIfsc);
        formData.append("experience", signupExperience);
        formData.append("experienceDetails", signupExperienceDetails);
        formData.append("isParcelService", "false"); // disabled for doorstep washer
        formData.append("isCarWashService", "true");  // enabled for doorstep washer

        if (profileImageFile) formData.append("profileImage", profileImageFile);
        if (aadharFile) formData.append("aadhar", aadharFile);
        if (panFile) formData.append("pan", panFile);

        // Add dummy/empty vehicle info since washers do not require it
        formData.append("vehicleType", "bike");
        formData.append("vehicleNumber", "N/A");
        formData.append("drivingLicenseNumber", "N/A");

        const res = await deliveryApi.sendSignupOtp(formData);
        toast.success(res.data?.message || "OTP sent successfully!");
      }
      setOtp(["", "", "", ""]);
      setTimer(30);
      setStep("otp");
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.some((d) => d === "") || !agreed) return;
    setLoading(true);
    try {
      const phone = mode === "login" ? loginPhone : signupPhone;
      const otpString = otp.join("");
      const response = await deliveryApi.verifyOtp({ phone, otp: otpString });
      const { token, delivery } = response.data.result;

      login({ ...delivery, token, role: "delivery" });

      toast.success("Welcome! Redirecting to dashboard...");
      navigate("/car-wash/partner/dashboard");
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 3) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setStep("form");
    setOtp(["", "", "", ""]);
    setLoginPhone("");
    setSignupStep(1);
    setSignupName("");
    setSignupPhone("");
    setSignupEmail("");
    setSignupAddress("");
    setSignupPanNumber("");
    setSignupAadharNumber("");
    setSignupAccountNumber("");
    setSignupIfsc("");
    setSignupAccountHolder("");
    setSignupExperience("");
    setSignupExperienceDetails("");
    setProfileImageFile(null);
    setProfileImagePreview("");
    setAadharFile(null);
    setPanFile(null);
  };

  return (
    <div className="min-h-screen bg-[#F0F4FF] flex flex-col items-center justify-center p-5 font-['Outfit',_sans-serif]">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-brand-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[420px] relative z-10"
      >
        {/* Card */}
        <div className="bg-white rounded-[2.5rem] shadow-[0_24px_60px_rgba(99,102,241,0.1)] border border-brand-50 overflow-hidden">
          
          {/* Header */}
          <div className="bg-gradient-to-br from-brand-50 to-purple-50 p-8 flex flex-col items-center relative border-b border-brand-50/50">
            <div className="w-14 h-14 rounded-2xl bg-white border border-brand-100 shadow-sm flex items-center justify-center overflow-hidden mb-4">
              <Sparkles size={28} className="text-brand-600 animate-spin-slow" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              {appName} Car Wash
            </h1>
            <p className="text-xs text-gray-400 font-bold tracking-wider uppercase mt-1">
              DOORSTEP PARTNER PORTAL
            </p>
          </div>

          <div className="p-8">
            <AnimatePresence mode="wait">
              {step === "form" ? (
                <motion.div
                  key="form-view"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="space-y-6"
                >
                  {/* Login Mode */}
                  {mode === "login" && (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Registered Mobile Number</label>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                          <input
                            type="tel"
                            maxLength={10}
                            placeholder="Enter 10-digit mobile number"
                            value={loginPhone}
                            onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, ""))}
                            className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl pl-12 pr-4 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleSendOtp}
                        disabled={loading || loginPhone.length < 10}
                        className="w-full h-12 bg-black hover:bg-brand-700 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-brand-200 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <>Request OTP <ArrowRight size={14} /></>}
                      </button>

                      <div className="text-center pt-2">
                        <span className="text-xs text-gray-400 font-semibold">New to the service? </span>
                        <button
                          onClick={() => switchMode("signup")}
                          className="text-xs font-black text-brand-600 hover:text-brand-700 hover:underline uppercase tracking-wider"
                        >
                          Register Now
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Signup Mode */}
                  {mode === "signup" && (
                    <div className="space-y-5">
                      {/* Step Indicators */}
                      <div className="flex justify-between items-center bg-gray-50 p-2.5 rounded-2xl border border-gray-100 mb-4">
                        {[1, 2, 3].map((s) => (
                          <div key={s} className="flex items-center gap-1.5 px-2 py-0.5">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                              signupStep >= s ? "bg-brand-500 text-white" : "bg-white text-gray-400 border border-gray-100 shadow-sm"
                            }`}>
                              {s}
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-wider ${
                              signupStep === s ? "text-brand-600" : "text-gray-400"
                            }`}>
                              {s === 1 ? "Details" : s === 2 ? "Bank" : "Docs"}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Step 1: Personal Info */}
                      {signupStep === 1 && (
                        <div className="space-y-4">
                          {/* Profile Image */}
                          <div className="flex flex-col items-center mb-6">
                            <div className="relative group">
                              <div className="h-20 w-20 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shadow-inner">
                                {profileImagePreview ? (
                                  <img src={profileImagePreview} alt="Profile" className="h-full w-full object-cover" />
                                ) : (
                                  <User size={32} className="text-gray-300" />
                                )}
                              </div>
                              <label className="absolute bottom-[-6px] right-[-6px] bg-black text-white p-1.5 rounded-xl cursor-pointer hover:bg-brand-600 transition-colors shadow-lg">
                                <Camera size={14} />
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, "profile")} />
                              </label>
                            </div>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-3">Upload Profile Photo</span>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Full Name</label>
                            <input
                              type="text"
                              placeholder="As per identification docs"
                              value={signupName}
                              onChange={(e) => setSignupName(e.target.value)}
                              className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl px-4 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Phone Number</label>
                            <input
                              type="tel"
                              maxLength={10}
                              placeholder="10-digit mobile number"
                              value={signupPhone}
                              onChange={(e) => setSignupPhone(e.target.value.replace(/\D/g, ""))}
                              className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl px-4 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Email Address (Optional)</label>
                            <input
                              type="email"
                              placeholder="example@mail.com"
                              value={signupEmail}
                              onChange={(e) => setSignupEmail(e.target.value)}
                              className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl px-4 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Full Address</label>
                            <div className="relative">
                              <MapPin className="absolute left-4 top-4 text-gray-300" size={16} />
                              <textarea
                                rows={2}
                                placeholder="Home/Shop Address details"
                                value={signupAddress}
                                onChange={(e) => setSignupAddress(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-100 rounded-2xl pl-12 pr-4 py-3 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all resize-none h-24"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Detailing Experience</label>
                            <select
                              value={signupExperience}
                              onChange={(e) => setSignupExperience(e.target.value)}
                              className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl px-4 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all cursor-pointer"
                            >
                              <option value="">Select Detailing Experience</option>
                              <option value="Fresh / None">Fresh / No prior detailing experience</option>
                              <option value="Under 1 year">Less than 1 year</option>
                              <option value="1-2 years">1 to 2 years</option>
                              <option value="2-5 years">2 to 5 years</option>
                              <option value="5+ years">More than 5 years</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Past Experience Details (Optional)</label>
                            <input
                              type="text"
                              placeholder="Briefly describe your previous experience or skills"
                              value={signupExperienceDetails}
                              onChange={(e) => setSignupExperienceDetails(e.target.value)}
                              className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl px-4 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
                            />
                          </div>

                          <button
                            onClick={() => {
                              if (!signupName.trim() || signupPhone.length < 10 || !profileImageFile || !signupAddress.trim()) {
                                toast.error("Please fill all fields and upload a profile photo.");
                                return;
                              }
                              if (!signupExperience) {
                                toast.error("Please select your detailing experience");
                                return;
                              }
                              setSignupStep(2);
                            }}
                            className="w-full h-12 bg-black hover:bg-brand-700 text-white rounded-2xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                          >
                            Next Step <ArrowRight size={14} />
                          </button>
                        </div>
                      )}

                      {/* Step 2: Identification & Bank details */}
                      {signupStep === 2 && (
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Aadhaar Card Number</label>
                            <input
                              type="text"
                              maxLength={12}
                              placeholder="12-digit Aadhaar number"
                              value={signupAadharNumber}
                              onChange={(e) => setSignupAadharNumber(e.target.value.replace(/\D/g, ""))}
                              className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl px-4 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all font-mono"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">PAN Card Number</label>
                            <input
                              type="text"
                              maxLength={10}
                              placeholder="10-digit alphanumeric PAN"
                              value={signupPanNumber}
                              onChange={(e) => setSignupPanNumber(e.target.value.toUpperCase())}
                              className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl px-4 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all font-mono"
                            />
                          </div>

                          <div className="pt-4 border-t border-gray-100">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 ml-1">Bank Account Information</span>
                            <div className="space-y-3">
                              <div className="space-y-1.5">
                                <input
                                  type="text"
                                  placeholder="Account Holder Name"
                                  value={signupAccountHolder}
                                  onChange={(e) => setSignupAccountHolder(e.target.value)}
                                  className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl px-4 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <input
                                  type="text"
                                  placeholder="Bank Account Number"
                                  value={signupAccountNumber}
                                  onChange={(e) => setSignupAccountNumber(e.target.value.replace(/\D/g, ""))}
                                  className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl px-4 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <input
                                  type="text"
                                  placeholder="IFSC Code (e.g. SBIN0001234)"
                                  value={signupIfsc}
                                  onChange={(e) => setSignupIfsc(e.target.value.toUpperCase())}
                                  className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl px-4 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button
                              onClick={() => setSignupStep(1)}
                              className="flex-1 h-12 bg-gray-100 text-gray-600 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center justify-center gap-1"
                            >
                              <ChevronLeft size={14} /> Back
                            </button>
                            <button
                              onClick={() => {
                                if (!signupAadharNumber || !signupPanNumber || !signupAccountNumber || !signupIfsc || !signupAccountHolder) {
                                  toast.error("Please fill in Aadhaar, PAN and Bank details.");
                                  return;
                                }
                                setSignupStep(3);
                              }}
                              className="flex-1 h-12 bg-black hover:bg-brand-700 text-white rounded-2xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-1"
                            >
                              Next <ArrowRight size={14} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Step 3: File Uploads */}
                      {signupStep === 3 && (
                        <div className="space-y-5">
                          <div className="space-y-4">
                            {/* Aadhar Upload */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Aadhaar Card Copy</label>
                              <label className={`w-full h-14 border-2 border-dashed rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition-all ${
                                aadharFile ? "border-brand-200 bg-brand-50/50 text-brand-700" : "border-gray-100 bg-gray-50 text-gray-400 hover:border-brand-200 hover:bg-brand-50/30"
                              }`}>
                                <Upload size={16} />
                                <span className="text-xs font-bold">{aadharFile ? "Aadhaar Card Attached ✓" : "Upload Aadhaar Card Image"}</span>
                                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFileUpload(e, "aadhar")} />
                              </label>
                            </div>

                            {/* PAN Upload */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">PAN Card Copy</label>
                              <label className={`w-full h-14 border-2 border-dashed rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition-all ${
                                panFile ? "border-brand-200 bg-brand-50/50 text-brand-700" : "border-gray-100 bg-gray-50 text-gray-400 hover:border-brand-200 hover:bg-brand-50/30"
                              }`}>
                                <Upload size={16} />
                                <span className="text-xs font-bold">{panFile ? "PAN Card Attached ✓" : "Upload PAN Card Image"}</span>
                                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFileUpload(e, "pan")} />
                              </label>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <button
                              onClick={() => setSignupStep(2)}
                              className="flex-1 h-12 bg-gray-100 text-gray-600 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center justify-center gap-1"
                            >
                              <ChevronLeft size={14} /> Back
                            </button>
                            <button
                              onClick={handleSendOtp}
                              className="flex-1 h-12 bg-black hover:bg-brand-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-1"
                            >
                              Register <CheckCircle size={14} />
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="text-center pt-2">
                        <span className="text-xs text-gray-400 font-semibold">Already registered? </span>
                        <button
                          onClick={() => switchMode("login")}
                          className="text-xs font-black text-brand-600 hover:text-brand-700 hover:underline uppercase tracking-wider"
                        >
                          Login Here
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="otp-view"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6"
                >
                  <div className="text-center">
                    <div className="inline-flex h-12 w-12 bg-brand-50 text-brand-600 rounded-full items-center justify-center mb-3 border border-brand-100">
                      <ShieldCheck size={24} />
                    </div>
                    <h3 className="text-base font-bold text-gray-900">Verification Code</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      We sent a 4-digit code to <strong className="text-gray-700">{mode === "login" ? loginPhone : signupPhone}</strong>
                    </p>
                  </div>

                  {/* OTP Inputs */}
                  <div className="flex justify-center gap-3">
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        id={`otp-${i}`}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        className="w-12 h-14 bg-gray-50 border border-gray-100 rounded-2xl text-center text-xl font-bold text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                      />
                    ))}
                  </div>

                  <div className="space-y-4">
                    {/* Terms Acceptance */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        className="mt-0.5 rounded border-gray-200 text-brand-600 focus:ring-brand-500/20 focus:outline-none"
                      />
                      <span className="text-[11px] text-gray-400 leading-normal select-none group-hover:text-gray-500 transition-colors">
                        I agree to the Partner Terms of Service and Privacy Policy, and certify that all details submitted are accurate.
                      </span>
                    </label>

                    <button
                      onClick={handleVerifyOtp}
                      disabled={loading || otp.some((d) => d === "") || !agreed}
                      className="w-full h-12 bg-black hover:bg-brand-700 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-brand-200 active:scale-98 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <>Verify & Access Dashboard <ArrowRight size={14} /></>}
                    </button>

                    <div className="flex justify-between items-center text-xs">
                      <button
                        onClick={() => setStep("form")}
                        className="text-gray-400 hover:text-gray-600 uppercase tracking-wider font-bold"
                      >
                        Change Details
                      </button>
                      {timer > 0 ? (
                        <span className="text-gray-400 font-medium">Resend in {timer}s</span>
                      ) : (
                        <button
                          onClick={handleSendOtp}
                          className="text-brand-600 hover:text-brand-700 font-bold uppercase tracking-wider hover:underline"
                        >
                          Resend Code
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default CarWashPartnerAuth;
