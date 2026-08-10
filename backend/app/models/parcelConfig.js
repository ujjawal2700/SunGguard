import mongoose from "mongoose";

export const DEFAULT_PACKAGE_TYPES = [
  { value: "document", label: "Document / Paper", isActive: true },
  { value: "food", label: "Food Items", isActive: true },
  { value: "clothes", label: "Clothes / Fabric", isActive: true },
  { value: "electronics", label: "Electronics", isActive: true },
  { value: "other", label: "Other Packets", isActive: true },
];

const packageTypeSchema = new mongoose.Schema(
  {
    value: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

/** Segments a package category can belong to. */
export const PACKAGE_SEGMENTS = ["personal", "business"];

/** Default customer package categories grouped by Personal / Business segment. */
export const DEFAULT_PACKAGE_CATEGORIES = [
  { value: "personal_gift", label: "Gift", segment: "personal", isActive: true },
  { value: "personal_documents", label: "Personal Documents", segment: "personal", isActive: true },
  { value: "personal_clothing", label: "Clothing", segment: "personal", isActive: true },
  { value: "business_invoice", label: "Invoice / Bills", segment: "business", isActive: true },
  { value: "business_samples", label: "Product Samples", segment: "business", isActive: true },
  { value: "business_documents", label: "Business Documents", segment: "business", isActive: true },
];

const packageCategorySchema = new mongoose.Schema(
  {
    value: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    segment: { type: String, enum: PACKAGE_SEGMENTS, default: "personal" },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const parcelConfigSchema = new mongoose.Schema(
  {
    baseFare: {
      type: Number,
      default: 40,
      min: 0,
    },
    perKmCharge: {
      type: Number,
      default: 10,
      min: 0,
    },
    weightCharge: {
      type: Number,
      default: 15, // Charge per KG (so if package is 0.5 KG, weight charge = 0.5 * 15 = 7.5)
      min: 0,
    },
    /** Initial search radius (km) used to notify nearby parcel delivery partners. */
    baseSearchRadiusKm: {
      type: Number,
      default: 5,
      min: 1,
      max: 100,
    },
    /** Multiplier applied when search expands after a timeout with no accept. */
    radiusMultiplier: {
      type: Number,
      default: 1.6,
      min: 1,
      max: 5,
    },
    /**
     * @deprecated Prefer riderBaseFareSharePercent + riderDistanceFareSharePercent.
     * Kept as fallback default for both when new fields are unset.
     */
    riderSharePercent: {
      type: Number,
      default: 80,
      min: 0,
      max: 100,
    },
    /** % of base fare paid to the delivery partner. */
    riderBaseFareSharePercent: {
      type: Number,
      default: 80,
      min: 0,
      max: 100,
    },
    /** % of distance fare paid to the delivery partner. */
    riderDistanceFareSharePercent: {
      type: Number,
      default: 80,
      min: 0,
      max: 100,
    },
    /** Customer "Package Details" options (admin-managed). */
    packageTypes: {
      type: [packageTypeSchema],
      default: () => DEFAULT_PACKAGE_TYPES.map((t) => ({ ...t })),
    },
    /** Customer package categories, each tied to a Personal/Business segment. */
    packageCategories: {
      type: [packageCategorySchema],
      default: () => DEFAULT_PACKAGE_CATEGORIES.map((c) => ({ ...c })),
    },
    maxWeightKg: {
      type: Number,
      default: 1,
      min: 0.1,
      max: 50,
    },
    /** Extra charge when customer selects Express delivery speed. */
    expressCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    packageDescriptionPlaceholder: {
      type: String,
      default: "E.g. keys, critical document papers...",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

function clampPercent(value, fallback = 80) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function normalizePackageTypes(list) {
  if (!Array.isArray(list) || !list.length) {
    return DEFAULT_PACKAGE_TYPES.map((t) => ({ ...t }));
  }
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const label = String(item?.label || "").trim();
    let value = String(item?.value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!label) continue;
    if (!value) {
      value = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    }
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({
      value,
      label,
      isActive: item?.isActive !== false,
    });
  }
  return out.length ? out : DEFAULT_PACKAGE_TYPES.map((t) => ({ ...t }));
}

function normalizePackageCategories(list) {
  if (!Array.isArray(list)) {
    return DEFAULT_PACKAGE_CATEGORIES.map((c) => ({ ...c }));
  }
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const label = String(item?.label || "").trim();
    const segment = item?.segment === "business" ? "business" : "personal";
    let value = String(item?.value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!label) continue;
    if (!value) {
      value = `${segment}_${label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")}`;
    }
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label, segment, isActive: item?.isActive !== false });
  }
  // Empty list is allowed (admin may disable categories entirely).
  return out;
}

// Helper static method to get the singleton config or create default
parcelConfigSchema.statics.getOrCreate = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({
      baseFare: 40,
      perKmCharge: 10,
      weightCharge: 15,
      baseSearchRadiusKm: 5,
      radiusMultiplier: 1.6,
      riderSharePercent: 80,
      riderBaseFareSharePercent: 80,
      riderDistanceFareSharePercent: 80,
      packageTypes: DEFAULT_PACKAGE_TYPES.map((t) => ({ ...t })),
      packageCategories: DEFAULT_PACKAGE_CATEGORIES.map((c) => ({ ...c })),
      maxWeightKg: 1,
      expressCharge: 0,
      packageDescriptionPlaceholder: "E.g. keys, critical document papers...",
    });
    return config;
  }

  let dirty = false;
  if (!Array.isArray(config.packageTypes) || config.packageTypes.length === 0) {
    config.packageTypes = DEFAULT_PACKAGE_TYPES.map((t) => ({ ...t }));
    dirty = true;
  }
  // Seed defaults for docs created before categories existed.
  if (!Array.isArray(config.packageCategories)) {
    config.packageCategories = DEFAULT_PACKAGE_CATEGORIES.map((c) => ({ ...c }));
    dirty = true;
  }
  if (config.maxWeightKg == null || config.maxWeightKg <= 0 || Number(config.maxWeightKg) === 5) {
    config.maxWeightKg = 1;
    dirty = true;
  }
  if (!config.packageDescriptionPlaceholder) {
    config.packageDescriptionPlaceholder = "E.g. keys, critical document papers...";
    dirty = true;
  }
  if (dirty) await config.save();
  return config;
};

parcelConfigSchema.statics.normalizePackageTypes = normalizePackageTypes;
parcelConfigSchema.statics.normalizePackageCategories = normalizePackageCategories;

parcelConfigSchema.statics.getPublicBookingConfig = async function () {
  const config = await this.getOrCreate();
  const packageTypes = (config.packageTypes || [])
    .filter((t) => t?.isActive !== false)
    .map((t) => ({ value: t.value, label: t.label }));
  const packageCategories = (config.packageCategories || [])
    .filter((c) => c?.isActive !== false)
    .map((c) => ({
      value: c.value,
      label: c.label,
      segment: c.segment === "business" ? "business" : "personal",
    }));
  return {
    packageTypes: packageTypes.length
      ? packageTypes
      : DEFAULT_PACKAGE_TYPES.map(({ value, label }) => ({ value, label })),
    packageCategories,
    maxWeightKg: Math.min(50, Math.max(0.1, Number(config.maxWeightKg) || 1)),
    expressCharge: Math.round((Math.max(0, Number(config.expressCharge) || 0) + Number.EPSILON) * 100) / 100,
    packageDescriptionPlaceholder:
      config.packageDescriptionPlaceholder ||
      "E.g. keys, critical document papers...",
  };
};

parcelConfigSchema.statics.getSearchSettings = async function () {
  const config = await this.getOrCreate();
  const envRadius = parseFloat(process.env.PARCEL_SEARCH_RADIUS_KM || "5", 10);
  const envMultiplier = parseFloat(process.env.PARCEL_RADIUS_MULTIPLIER || "1.6", 10);

  const baseSearchRadiusKm = Math.min(
    100,
    Math.max(1, Number(config.baseSearchRadiusKm) || envRadius || 5),
  );
  const radiusMultiplier = Math.min(
    5,
    Math.max(1, Number(config.radiusMultiplier) || envMultiplier || 1.6),
  );

  const legacyShare = clampPercent(config.riderSharePercent, 80);
  const riderBaseFareSharePercent = clampPercent(
    config.riderBaseFareSharePercent ?? legacyShare,
    legacyShare,
  );
  const riderDistanceFareSharePercent = clampPercent(
    config.riderDistanceFareSharePercent ?? legacyShare,
    legacyShare,
  );

  return {
    baseSearchRadiusKm,
    radiusMultiplier,
    riderSharePercent: legacyShare,
    riderBaseFareSharePercent,
    riderDistanceFareSharePercent,
    riderShareRatio: legacyShare / 100,
  };
};

export default mongoose.model("ParcelConfig", parcelConfigSchema);
