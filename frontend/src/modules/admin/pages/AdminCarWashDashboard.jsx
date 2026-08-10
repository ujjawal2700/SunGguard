/**
 * CAR WASH FEATURE DISABLED — not wired into admin routes.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  DollarSign,
  TrendingUp,
  Settings,
  User,
  MapPin,
  ClipboardList,
  Activity,
  CheckCircle2,
  XCircle,
  Save,
  Plus,
  Trash2,
  Edit3,
  Clock,
  Car
} from "lucide-react";
import { toast } from "sonner";
import { carWashApi } from "../../customer/services/carWashApi";
import { parcelApi } from "../../customer/services/parcelApi";

const AdminCarWashDashboard = () => {
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'active', 'packages', 'pricing', 'reports'
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [riders, setRiders] = useState([]);
  const [packages, setPackages] = useState([]);
  
  // Assigning partner state
  const [assigningBooking, setAssigningBooking] = useState(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  
  // Selected booking detail state
  const [selectedBooking, setSelectedBooking] = useState(null);

  // Package CRUD Modal state
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [packageForm, setPackageForm] = useState({
    name: "",
    description: "",
    basePrice: 0,
    durationMinutes: 45,
    image: null,
    imageUrl: "",
    isActive: true
  });
  const [packageSaving, setPackageSaving] = useState(false);

  // Pricing Config state
  const [config, setConfig] = useState({
    baseFare: 50,
    perKmCharge: 8,
    commissionRate: 15,
    vehicleMultipliers: {
      Bike: 0.6,
      Hatchback: 0.9,
      Sedan: 1.0,
      SUV: 1.3
    }
  });
  const [configSaving, setConfigSaving] = useState(false);

  // Reports state
  const [reports, setReports] = useState({
    totalBookings: 0,
    completed: 0,
    cancelled: 0,
    active: 0,
    totalRevenue: 0,
    platformCommission: 0
  });

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      // Fetch Bookings
      const bookingsRes = await carWashApi.adminGetBookings();
      if (bookingsRes.data && bookingsRes.data.success) {
        setBookings(bookingsRes.data.results || bookingsRes.data.result || []);
      }

      // Fetch Packages
      const packagesRes = await carWashApi.getPackages();
      if (packagesRes.data && packagesRes.data.success) {
        setPackages(packagesRes.data.results || packagesRes.data.result || []);
      }

      // Fetch Pricing Config
      const configRes = await carWashApi.adminGetConfig();
      if (configRes.data && configRes.data.success) {
        const rawConfig = configRes.data.result;
        // Transform mongoose Map if needed
        const multipliers = rawConfig.vehicleMultipliers;
        setConfig({
          baseFare: rawConfig.baseFare || 50,
          perKmCharge: rawConfig.perKmCharge || 8,
          commissionRate: rawConfig.commissionRate || 15,
          vehicleMultipliers: multipliers instanceof Map 
            ? Object.fromEntries(multipliers) 
            : multipliers || { Bike: 0.6, Hatchback: 0.9, Sedan: 1.0, SUV: 1.3 }
        });
      }

      // Fetch Riders (to filter wash-enabled ones)
      const ridersRes = await parcelApi.adminGetRiders();
      if (ridersRes.data && ridersRes.data.success) {
        setRiders(ridersRes.data.results || ridersRes.data.result || []);
      }

      // Fetch Reports
      const reportsRes = await carWashApi.adminGetReports();
      if (reportsRes.data && reportsRes.data.success) {
        setReports(reportsRes.data.result || {
          totalBookings: 0,
          completed: 0,
          cancelled: 0,
          active: 0,
          totalRevenue: 0,
          platformCommission: 0
        });
      }
    } catch (error) {
      console.error("Failed to load car wash panel data:", error);
      if (!isSilent) toast.error("Failed to load dashboard metrics");
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);

    const pollInterval = setInterval(() => {
      fetchData(true);
    }, 15000);

    return () => clearInterval(pollInterval);
  }, [fetchData]);

  // Keep modal scroll lock
  useEffect(() => {
    if (selectedBooking || showPackageModal) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [selectedBooking, showPackageModal]);

  // Handle pricing config update
  const handleUpdateConfig = async (e) => {
    e.preventDefault();
    setConfigSaving(true);
    try {
      const res = await carWashApi.adminUpdateConfig(config);
      if (res.data && res.data.success) {
        toast.success("Pricing configuration saved successfully!");
        fetchData();
      } else {
        toast.error(res.data.message || "Failed to save configuration");
      }
    } catch (error) {
      toast.error("Failed to save pricing config");
    } finally {
      setConfigSaving(false);
    }
  };

  // Handle manual partner override assignment
  const handleAssignPartnerSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPartnerId) return toast.error("Please select a doorstep partner");
    try {
      const res = await carWashApi.adminAssignPartner({
        bookingId: assigningBooking,
        partnerId: selectedPartnerId
      });
      if (res.data && res.data.success) {
        toast.success("Technician assigned successfully!");
        setAssigningBooking(null);
        setSelectedPartnerId("");
        fetchData();
      } else {
        toast.error(res.data.message || "Failed to assign technician");
      }
    } catch (error) {
      toast.error("Manual allocation failed");
    }
  };

  // Open modal for package creation/edit
  const handleOpenPackageModal = (pkg = null) => {
    if (pkg) {
      setEditingPackage(pkg);
      setPackageForm({
        name: pkg.name,
        description: pkg.description,
        basePrice: pkg.basePrice,
        durationMinutes: pkg.durationMinutes || 45,
        image: null,
        imageUrl: pkg.image || "",
        isActive: pkg.isActive !== undefined ? pkg.isActive : true
      });
    } else {
      setEditingPackage(null);
      setPackageForm({
        name: "",
        description: "",
        basePrice: 0,
        durationMinutes: 45,
        image: null,
        imageUrl: "",
        isActive: true
      });
    }
    setShowPackageModal(true);
  };

  // Submit package CRUD form
  const handleSavePackage = async (e) => {
    e.preventDefault();
    setPackageSaving(true);

    try {
      // Use Form Data for multipart file uploads
      const data = new FormData();
      data.append("name", packageForm.name);
      data.append("description", packageForm.description);
      data.append("basePrice", Number(packageForm.basePrice));
      data.append("durationMinutes", Number(packageForm.durationMinutes));
      data.append("isActive", packageForm.isActive);
      
      if (packageForm.image) {
        data.append("image", packageForm.image);
      } else if (packageForm.imageUrl) {
        data.append("image", packageForm.imageUrl);
      }

      let res;
      if (editingPackage) {
        res = await carWashApi.adminUpdatePackage(editingPackage._id, data);
      } else {
        res = await carWashApi.adminCreatePackage(data);
      }

      if (res.data && res.data.success) {
        toast.success(editingPackage ? "Package updated!" : "New eco wash package created!");
        setShowPackageModal(false);
        fetchData();
      } else {
        toast.error(res.data.message || "Failed to save package");
      }
    } catch (error) {
      toast.error("Package saving request failed");
    } finally {
      setPackageSaving(false);
    }
  };

  // Delete Package (Soft delete)
  const handleDeletePackage = async (id) => {
    if (!window.confirm("Are you sure you want to deactivate/delete this package?")) return;
    try {
      const res = await carWashApi.adminDeletePackage(id);
      if (res.data && res.data.success) {
        toast.success("Package deactivated successfully!");
        fetchData();
      } else {
        toast.error(res.data.message || "Failed to delete package");
      }
    } catch (error) {
      toast.error("Delete request failed");
    }
  };

  const getActiveBookings = () => {
    const activeStatuses = ["ACCEPTED", "ARRIVED", "WASHING"];
    return bookings.filter(b => activeStatuses.includes(b.status));
  };

  // Filter riders enabled for doorstep wash
  const getCarWashTechnicians = () => {
    return riders.filter(r => r.isCarWashService);
  };

  return (
    <div className="p-6 font-outfit max-w-6xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Sparkles className="text-cyan-600 animate-pulse" size={28} /> Doorstep Car Wash Panel
          </h1>
          <p className="text-sm text-slate-400 font-medium mt-1">
            Configure packages, manage prices and vehicle multipliers, manual allocate technicians, and audit wash evidence.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto self-stretch md:self-auto scrollbar-none">
          {[
            { id: "all", label: "All Bookings", icon: ClipboardList },
            { id: "active", label: "Active Jobs", icon: Activity },
            { id: "packages", label: "Packages", icon: Sparkles },
            { id: "pricing", label: "Pricing Config", icon: Settings },
            { id: "reports", label: "Reports", icon: TrendingUp }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <span className="text-slate-400 animate-pulse font-medium">Loading panel metrics...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: ALL BOOKINGS */}
          {activeTab === "all" && (
            <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden animate-fadeIn">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-base font-black text-slate-800">All Booking Requests</h2>
                <span className="text-xs bg-slate-100 px-3 py-1 rounded-full font-bold text-slate-600">
                  {bookings.length} requests
                </span>
              </div>

              {bookings.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  No car wash bookings found in the system.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-bold text-xs uppercase tracking-wider border-b border-slate-100">
                        <th className="p-4">ID / Type</th>
                        <th className="p-4">Customer Details</th>
                        <th className="p-4">Wash Package</th>
                        <th className="p-4">Address</th>
                        <th className="p-4">Fare Paid</th>
                        <th className="p-4">Status / Technician</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bookings.map((booking) => (
                        <tr
                          key={booking._id}
                          className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                          onClick={() => setSelectedBooking(booking)}
                        >
                          <td className="p-4 align-top">
                            <span className="font-bold text-slate-800 block">#{booking.bookingId}</span>
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded mt-1 block w-fit ${
                              booking.bookingType === "IMMEDIATE" ? "bg-cyan-50 text-cyan-600" : "bg-purple-50 text-purple-600"
                            }`}>
                              {booking.bookingType}
                            </span>
                            {booking.scheduledDateTime && (
                              <div className="text-[10px] text-slate-400 mt-1">
                                {new Date(booking.scheduledDateTime).toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td className="p-4 align-top">
                            <span className="font-bold text-slate-800 block">
                              {booking.customerId?.name || "Customer"}
                            </span>
                            <span className="text-xs text-slate-400 block">
                              {booking.customerId?.phone || "N/A"}
                            </span>
                          </td>
                          <td className="p-4 align-top">
                            <span className="font-bold text-slate-800 block">
                              {booking.packageId?.name || "Deleted Package"}
                            </span>
                            <span className="text-xs text-slate-400 uppercase font-bold">
                              {booking.vehicleType}
                            </span>
                          </td>
                          <td className="p-4 align-top max-w-[200px]">
                            <span className="font-bold text-slate-700 block">
                              {booking.address?.name}
                            </span>
                            <span className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                              {booking.address?.fullAddress}
                            </span>
                          </td>
                          <td className="p-4 align-top">
                            <span className="font-black text-slate-900 block">₹{booking.fare}</span>
                            <span className="text-[10px] text-slate-400">Fee: ₹{booking.commission}</span>
                          </td>
                          <td className="p-4 align-top">
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase block w-fit ${
                              booking.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                              booking.status === "CANCELLED" ? "bg-red-100 text-red-600" :
                              "bg-cyan-100 text-cyan-700 animate-pulse"
                            }`}>
                              {booking.status}
                            </span>

                            {booking.partnerId ? (
                              <div className="text-xs text-slate-500 font-bold mt-1">
                                Washer: {booking.partnerId.name}
                              </div>
                            ) : (
                              booking.status !== "CANCELLED" && booking.status !== "COMPLETED" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAssigningBooking(booking._id);
                                  }}
                                  className="mt-2 text-[10px] bg-cyan-600 hover:bg-cyan-700 text-white font-black px-2.5 py-1 rounded-lg transition-all border-none"
                                >
                                  Assign Partner
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACTIVE JOBS */}
          {activeTab === "active" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
              {/* In-Progress list */}
              <div className="md:col-span-2 bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="text-base font-black text-slate-800">In-Progress Washes</h2>
                  <span className="text-xs bg-cyan-50 text-cyan-600 px-3 py-1 rounded-full font-bold">
                    {getActiveBookings().length} active
                  </span>
                </div>

                {getActiveBookings().length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    No active wash services currently in progress.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {getActiveBookings().map((booking) => (
                      <div
                        key={booking._id}
                        className="p-5 hover:bg-slate-50/50 flex flex-col md:flex-row justify-between gap-4 cursor-pointer transition-colors"
                        onClick={() => setSelectedBooking(booking)}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">#{booking.bookingId}</span>
                            <span className="text-xs text-slate-400">
                              {new Date(booking.createdAt).toLocaleTimeString()}
                            </span>
                            <span className="text-[10px] font-extrabold bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full uppercase">
                              {booking.status}
                            </span>
                          </div>

                          <div className="text-xs text-slate-500 font-medium space-y-1">
                            <div>
                              <strong className="text-slate-700">Package:</strong> {booking.packageId?.name} ({booking.vehicleType})
                            </div>
                            <div>
                              <strong className="text-slate-700">Address:</strong> {booking.address?.fullAddress}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col justify-between items-end shrink-0">
                          <span className="font-black text-slate-900">₹{booking.fare}</span>
                          {booking.partnerId ? (
                            <div className="text-xs bg-slate-50 px-3 py-1 rounded-lg border border-slate-200 mt-2">
                              Washer: <strong className="text-slate-700">{booking.partnerId.name}</strong>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  setAssigningBooking(booking._id);
                              }}
                              className="mt-2 text-xs bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-3 py-1 rounded-lg transition-all border-none"
                            >
                              Assign Partner
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active eco wash partners sidebar */}
              <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <User className="text-cyan-600" size={18} /> Car Wash Technicians
                </h2>
                <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto pr-1">
                  {getCarWashTechnicians().map((rider) => {
                    const statusConfig = !rider.isOnline
                      ? { text: "Offline", style: "bg-slate-100 text-slate-500" }
                      : rider.isBusy
                      ? { text: "Busy", style: "bg-amber-50 text-amber-700" }
                      : { text: "Available", style: "bg-green-55 text-green-700 bg-green-50" };

                    return (
                      <div key={rider._id} className="py-3 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-slate-800 block">{rider.name}</span>
                          <span className="text-slate-400">{rider.phone}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${statusConfig.style}`}>
                          {statusConfig.text}
                        </span>
                      </div>
                    );
                  })}
                  {getCarWashTechnicians().length === 0 && (
                    <p className="text-slate-400 text-xs py-4 text-center">No car-wash enabled partners.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PACKAGES CRUD */}
          {activeTab === "packages" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-black text-slate-800">Doorstep Wash Packages</h2>
                <button
                  onClick={() => handleOpenPackageModal()}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white font-black text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-md border-none"
                >
                  <Plus size={16} /> Add Package
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {packages.map((pkg) => (
                  <div key={pkg._id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {pkg.image ? (
                        <img src={pkg.image} alt={pkg.name} className="w-12 h-12 rounded-xl object-cover border border-slate-100 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center font-black shrink-0">
                          CW
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-sm text-slate-800 truncate">{pkg.name}</h4>
                          <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-md shrink-0 ${
                            pkg.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                          }`}>
                            {pkg.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{pkg.description}</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-[10px] text-slate-450 font-bold uppercase">Price:</span>
                          <span className="text-sm font-black text-slate-800">₹{pkg.basePrice}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 border-l border-slate-50 pl-3">
                      <button
                        onClick={() => handleOpenPackageModal(pkg)}
                        className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors border-none"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeletePackage(pkg._id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-655 transition-colors border-none"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: PRICING CONFIG */}
          {activeTab === "pricing" && (
            <div className="max-w-md mx-auto bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden animate-fadeIn">
              <div className="p-5 border-b border-slate-100">
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Settings className="text-cyan-600" size={18} /> Global Wash Rules
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Adjust default parameters, delivery fee multiplier per vehicle type, and commissions.
                </p>
              </div>

              <form onSubmit={handleUpdateConfig} className="p-5 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Base Fare (₹)</label>
                  <input
                    type="number"
                    required
                    value={config.baseFare}
                    onChange={(e) => setConfig(p => ({ ...p, baseFare: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Per KM Charge (₹)</label>
                  <input
                    type="number"
                    required
                    value={config.perKmCharge}
                    onChange={(e) => setConfig(p => ({ ...p, perKmCharge: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Platform Commission (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={config.commissionRate}
                    onChange={(e) => setConfig(p => ({ ...p, commissionRate: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
                    <Car size={14} className="text-cyan-600" /> Vehicle Fare Multipliers
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {["Bike", "Hatchback", "Sedan", "SUV"].map((vType) => (
                      <div key={vType} className="space-y-1">
                        <label className="text-slate-550 block font-bold">{vType}</label>
                        <input
                          type="number"
                          step="0.05"
                          required
                          value={config.vehicleMultipliers[vType] || 1.0}
                          onChange={(e) => setConfig(p => ({
                            ...p,
                            vehicleMultipliers: {
                              ...p.vehicleMultipliers,
                              [vType]: Number(e.target.value)
                            }
                          }))}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-cyan-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={configSaving}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all mt-2 border-none"
                >
                  <Save size={16} />
                  {configSaving ? "Saving Config..." : "Save Config Rules"}
                </button>
              </form>
            </div>
          )}

          {/* TAB 5: REPORTS */}
          {activeTab === "reports" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 bg-cyan-50 rounded-2xl flex items-center justify-center text-cyan-600 shrink-0">
                    <ClipboardList size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Washes</span>
                    <span className="text-2xl font-black text-slate-800 mt-1 block">{reports.totalBookings}</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 shrink-0">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Completed</span>
                    <span className="text-2xl font-black text-slate-800 mt-1 block">{reports.completed}</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 shrink-0">
                    <XCircle size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cancelled</span>
                    <span className="text-2xl font-black text-slate-800 mt-1 block">{reports.cancelled}</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                    <DollarSign size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Revenue</span>
                    <span className="text-2xl font-black text-slate-800 mt-1 block">₹{reports.totalRevenue}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm max-w-2xl mx-auto space-y-4">
                <h3 className="text-base font-black text-slate-800">Car Wash Earnings Summary</h3>
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-xs">
                  <div className="bg-slate-50 p-4 rounded-2xl">
                    <span className="text-slate-400 font-bold block uppercase">Platform share ({config.commissionRate}%)</span>
                    <span className="text-lg font-black text-slate-800 mt-1 block">₹{reports.platformCommission}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl">
                    <span className="text-slate-400 font-bold block uppercase">Partner share ({100 - config.commissionRate}%)</span>
                    <span className="text-lg font-black text-slate-800 mt-1 block">
                      ₹{reports.totalRevenue - reports.platformCommission}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Manual Allocation Modal */}
      {assigningBooking && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleAssignPartnerSubmit} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl max-w-sm w-full space-y-4">
            <h3 className="text-lg font-black text-slate-800">Assign Doorstep Washer</h3>
            <p className="text-xs text-slate-400">
              Select a verified technician enabled for Doorstep Car Wash services.
            </p>

            <select
              required
              value={selectedPartnerId}
              onChange={(e) => setSelectedPartnerId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-sm outline-none focus:border-cyan-500"
            >
              <option value="">-- Select Technician --</option>
              {getCarWashTechnicians().map((r) => {
                const statusStr = !r.isOnline
                  ? "Offline"
                  : r.isBusy
                  ? "Busy"
                  : "Available";
                return (
                  <option key={r._id} value={r._id}>
                    {r.name} ({r.phone}) — [{statusStr}]
                  </option>
                );
              })}
            </select>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setAssigningBooking(null); setSelectedPartnerId(""); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-xs text-slate-600 transition-all border-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-705 text-white font-bold text-xs rounded-xl transition-all border-none"
              >
                Assign Partner
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Package Form Modal */}
      {showPackageModal && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSavePackage} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl max-w-md w-full space-y-4">
            <h3 className="text-lg font-black text-slate-800">
              {editingPackage ? "Edit Wash Package" : "Create Wash Package"}
            </h3>
            
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Package Name</label>
              <input
                type="text"
                required
                placeholder="E.g. Premium Foam Bath & Wax"
                value={packageForm.name}
                onChange={(e) => setPackageForm(p => ({ ...p, name: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
              <textarea
                required
                rows={2}
                placeholder="Details of what is included (shampoo, interior vacuuming...)"
                value={packageForm.description}
                onChange={(e) => setPackageForm(p => ({ ...p, description: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Base Price (₹)</label>
                <input
                  type="number"
                  required
                  value={packageForm.basePrice}
                  onChange={(e) => setPackageForm(p => ({ ...p, basePrice: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Duration (Mins)</label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    value={packageForm.durationMinutes}
                    onChange={(e) => setPackageForm(p => ({ ...p, durationMinutes: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Min</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-2xl border border-slate-100/50">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Package Status</span>
                <span className="text-[10px] text-slate-400 font-bold">Show this package to customers</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={packageForm.isActive}
                  onChange={(e) => setPackageForm(p => ({ ...p, isActive: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Package Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPackageForm(p => ({ ...p, image: e.target.files[0] }))}
                className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-cyan-50 file:text-cyan-600 hover:file:bg-cyan-100"
              />
              <p className="text-[10px] text-slate-400 mt-1">Or enter image URL below:</p>
              <input
                type="text"
                placeholder="https://example.com/image.jpg"
                value={packageForm.imageUrl}
                onChange={(e) => setPackageForm(p => ({ ...p, imageUrl: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-cyan-500 mt-1"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPackageModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-xs text-slate-600 transition-all border-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={packageSaving}
                className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl transition-all border-none"
              >
                {packageSaving ? "Saving..." : "Save Package"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Selected Booking Details Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <style>{`
            .modal-scroll-pad::-webkit-scrollbar {
              width: 10px;
              height: 10px;
            }
            .modal-scroll-pad::-webkit-scrollbar-track {
              background: #f1f5f9 !important;
              border-radius: 8px;
            }
            .modal-scroll-pad::-webkit-scrollbar-thumb {
              background: #cbd5e1 !important;
              border-radius: 8px;
              border: 2px solid #f1f5f9;
            }
            .modal-scroll-pad::-webkit-scrollbar-thumb:hover {
              background: #94a3b8 !important;
            }
          `}</style>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col relative overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Sparkles className="text-cyan-600" size={20} />
                  Doorstep Wash Details
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Wash verification photos, OTP validation, and billing for booking ID: #{selectedBooking.bookingId}
                </p>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors border-none"
              >
                <XCircle size={22} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto overscroll-contain space-y-6 flex-1 modal-scroll-pad">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</span>
                  <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase block w-fit mt-1.5 ${
                    selectedBooking.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                    selectedBooking.status === "CANCELLED" ? "bg-red-100 text-red-600" :
                    "bg-cyan-100 text-cyan-700"
                  }`}>
                    {selectedBooking.status}
                  </span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fare & Commission</span>
                  <span className="text-sm font-black text-slate-800 mt-1 block">
                    ₹{selectedBooking.fare} (Commission: ₹{selectedBooking.commission})
                  </span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Verification OTP</span>
                  <span className="text-sm font-black text-slate-800 mt-1 block tracking-wider">{selectedBooking.otp || "N/A"}</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vehicle Type</span>
                  <span className="text-sm font-black text-slate-800 mt-1 block uppercase">{selectedBooking.vehicleType}</span>
                </div>
              </div>

              {/* Addresses */}
              <div className="space-y-4 text-xs">
                <div className="border-t border-slate-100 pt-4">
                  <strong className="text-slate-800 block text-xs mb-1 uppercase tracking-wider">Customer Details</strong>
                  <p className="font-bold text-slate-700">{selectedBooking.customerId?.name} ({selectedBooking.customerId?.phone})</p>
                  <p className="text-slate-500 mt-0.5">{selectedBooking.customerId?.email}</p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <strong className="text-slate-800 block text-xs mb-1 uppercase tracking-wider">Wash Address</strong>
                  <p className="font-bold text-slate-700">{selectedBooking.address?.name} ({selectedBooking.address?.phone})</p>
                  <p className="text-slate-500 mt-0.5 leading-relaxed">{selectedBooking.address?.fullAddress}</p>
                </div>

                {selectedBooking.partnerId && (
                  <div className="border-t border-slate-100 pt-4">
                    <strong className="text-slate-800 block text-xs mb-1 uppercase tracking-wider">Assigned Professional</strong>
                    <p className="font-bold text-slate-700">
                      {selectedBooking.partnerId.name} ({selectedBooking.partnerId.phone})
                    </p>
                    {selectedBooking.partnerId.vehicleNumber && (
                      <p className="text-slate-500 mt-0.5">
                        Vehicle: {selectedBooking.partnerId.vehicleNumber}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Evidence Photos */}
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Service Verification Photos</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Before Wash</span>
                    {selectedBooking.beforeWashImage ? (
                      <div className="h-40 w-full rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
                        <img
                          src={selectedBooking.beforeWashImage}
                          alt="Before Wash"
                          className="h-full w-full object-cover cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => window.open(selectedBooking.beforeWashImage, "_blank")}
                        />
                      </div>
                    ) : (
                      <div className="h-40 w-full rounded-2xl border border-dashed border-slate-200 flex items-center justify-center text-center p-3 text-[10px] text-slate-400 bg-slate-50/50">
                        No before photo uploaded
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">After Wash</span>
                    {selectedBooking.afterWashImage ? (
                      <div className="h-40 w-full rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
                        <img
                          src={selectedBooking.afterWashImage}
                          alt="After Wash"
                          className="h-full w-full object-cover cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => window.open(selectedBooking.afterWashImage, "_blank")}
                        />
                      </div>
                    ) : (
                      <div className="h-40 w-full rounded-2xl border border-dashed border-slate-200 flex items-center justify-center text-center p-3 text-[10px] text-slate-400 bg-slate-50/50">
                        No after photo uploaded
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Review */}
              {selectedBooking.rating && (
                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Customer Rating & Review</h4>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star} className="text-xs">
                        {star <= selectedBooking.rating ? "★" : "☆"}
                      </span>
                    ))}
                  </div>
                  {selectedBooking.comment && (
                    <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl italic border border-slate-100">
                      "{selectedBooking.comment}"
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="w-full py-2.5 bg-white border border-slate-200 hover:bg-slate-50 font-bold text-xs text-slate-700 rounded-xl transition-all uppercase tracking-wider border-none"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCarWashDashboard;
