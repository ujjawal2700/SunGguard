import mongoose from "mongoose";

/**
 * Porter Banner Model
 * 
 * Supports scheduled banners with start/end dates,
 * default ("always show") banners, click/impression analytics,
 * and service filtering (all, local, outstation).
 */
const porterBannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: "",
    },
    subtitle: {
      type: String,
      trim: true,
      default: "",
    },
    imageUrl: {
      type: String,
      required: [true, "Banner image URL is required"],
      trim: true,
    },
    linkUrl: {
      type: String,
      trim: true,
      default: "",
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    serviceType: {
      type: String,
      enum: ["all", "local", "outstation"],
      default: "all",
    },
    clicks: {
      type: Number,
      default: 0,
    },
    impressions: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// High performance compound indexes for fast querying and caching
porterBannerSchema.index({
  isActive: 1,
  isDefault: 1,
  startDate: 1,
  endDate: 1,
  displayOrder: 1,
});
porterBannerSchema.index({ displayOrder: 1, createdAt: -1 });

/**
 * Calculate dynamic runtime status for a banner based on current date
 * @param {Object} banner 
 * @param {Date} [now] 
 * @returns {"active" | "scheduled" | "expired" | "default" | "inactive"}
 */
porterBannerSchema.statics.computeStatus = function (banner, now = new Date()) {
  if (!banner.isActive) {
    return "inactive";
  }

  const currentDate = now instanceof Date ? now : new Date(now);

  if (banner.isDefault) {
    // If a default banner has explicit dates, honor them; otherwise it's always default
    if (banner.startDate && currentDate < new Date(banner.startDate)) {
      return "scheduled";
    }
    if (banner.endDate && currentDate > new Date(banner.endDate)) {
      return "expired";
    }
    return "default";
  }

  if (banner.startDate && currentDate < new Date(banner.startDate)) {
    return "scheduled";
  }

  if (banner.endDate && currentDate > new Date(banner.endDate)) {
    return "expired";
  }

  return "active";
};

export default mongoose.model("PorterBanner", porterBannerSchema);
