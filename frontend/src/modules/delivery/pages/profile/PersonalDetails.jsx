import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Mail, Phone, MapPin } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import { useAuth } from "@core/context/AuthContext";
import { deliveryApi } from "../../services/deliveryApi";

const buildFormFromUser = (user) => ({
  fullName: user?.name || "",
  email: user?.email || "",
  address: user?.address || "",
});

const PersonalDetails = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState(() => buildFormFromUser(user));

  // Re-sync whenever the real profile loads/refreshes — but not while the
  // rider has unsaved edits open, or a background refresh would wipe them.
  useEffect(() => {
    if (isEditing) return;
    setFormData(buildFormFromUser(user));
  }, [user, isEditing]);

  const profileImage = useMemo(() => {
    if (user?.profileImage) return user.profileImage;
    const seed = encodeURIComponent(user?.name || user?.phone || "delivery");
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
  }, [user?.profileImage, user?.name, user?.phone]);

  const partnerIdShort = useMemo(
    () => String(user?._id || user?.id || "").slice(-6).toUpperCase() || "N/A",
    [user?._id, user?.id],
  );

  const handleCancel = () => {
    setFormData(buildFormFromUser(user));
    setIsEditing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await deliveryApi.updateProfile({
        name: formData.fullName.trim(),
        email: formData.email.trim(),
        address: formData.address.trim(),
      });
      if (response.data?.success) {
        // Pulls the saved copy back into the shared AuthContext user, so
        // every other screen reading `user` (dashboard, wallet, etc.)
        // reflects the change immediately without a manual reload.
        await refreshUser();
        setIsEditing(false);
        toast.success("Personal details updated successfully!");
      } else {
        toast.error(response.data?.message || "Failed to update details");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update details");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button
            onClick={() => (isEditing ? handleCancel() : navigate(-1))}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Personal Details</h1>
          <div className="ml-auto">
            {isEditing ? (
              <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-8 px-3">
                {isSaving ? "Saving..." : "Save"}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="text-primary hover:bg-primary/5"
              >
                Edit
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Profile Photo */}
        <div className="flex flex-col items-center justify-center py-6">
          <div className="w-24 h-24 rounded-full p-1 bg-white shadow-md">
            <img
              src={profileImage}
              alt="Profile"
              className="w-full h-full rounded-full object-cover bg-gray-100"
            />
          </div>
          <p className="mt-3 text-sm text-gray-500">Delivery Partner ID: {partnerIdShort}</p>
        </div>

        {/* Form Fields */}
        <div className="space-y-4 bg-white p-4 rounded-xl shadow-sm">
          <Input
            label="Full Name"
            value={formData.fullName}
            readOnly={!isEditing}
            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            icon={User}
            className={!isEditing ? "bg-gray-50 border-transparent" : ""}
          />

          <Input
            label="Phone Number"
            value={user?.phone || ""}
            readOnly={true} // Phone is the login identity — locked everywhere, not just here
            icon={Phone}
            className="bg-gray-50 border-transparent text-gray-500"
            helperText="Contact support to change phone number"
          />

          <Input
            label="Email Address"
            value={formData.email}
            readOnly={!isEditing}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            icon={Mail}
            type="email"
            className={!isEditing ? "bg-gray-50 border-transparent" : ""}
          />

          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1 ml-1">Current Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <MapPin size={18} />
              </div>
              <textarea
                value={formData.address}
                readOnly={!isEditing}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className={`w-full pl-10 pr-4 py-2 rounded-xl text-sm border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none ${
                  !isEditing ? "bg-gray-50 border-transparent text-gray-600" : "bg-white border-gray-200"
                }`}
                rows={3}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonalDetails;
