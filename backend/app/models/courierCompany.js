import mongoose from "mongoose";

export const DEFAULT_COURIER_COMPANIES = [
  { name: "Blue Dart", platformCharge: 0, companyCharge: 0, sortOrder: 1 },
  { name: "DTDC", platformCharge: 0, companyCharge: 0, sortOrder: 2 },
  { name: "Delhivery", platformCharge: 0, companyCharge: 0, sortOrder: 3 },
  { name: "India Post", platformCharge: 0, companyCharge: 0, sortOrder: 4 },
  { name: "Ekart", platformCharge: 0, companyCharge: 0, sortOrder: 5 },
  { name: "Ecom Express", platformCharge: 0, companyCharge: 0, sortOrder: 6 },
  { name: "XpressBees", platformCharge: 0, companyCharge: 0, sortOrder: 7 },
  { name: "FedEx", platformCharge: 0, companyCharge: 0, sortOrder: 8 },
  { name: "DHL", platformCharge: 0, companyCharge: 0, sortOrder: 9 },
  { name: "Shadowfax", platformCharge: 0, companyCharge: 0, sortOrder: 10 },
];

const courierCompanySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    /** Extra platform fee charged to the customer when this courier is selected. */
    platformCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Amount this courier company itself charges for the parcel service. */
    companyCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    /**
     * Marks the special "Other" catch-all option. Customers pick this and type
     * their own courier company name; the admin only controls its platform rate.
     * There should be exactly one such document.
     */
    isOther: {
      type: Boolean,
      default: false,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    /** Branch / drop-off office address for riders and parcel booking. */
    location: {
      flatNo: { type: String, trim: true, default: "" },
      address: { type: String, trim: true, default: "" },
      landmark: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      pincode: { type: String, trim: true, default: "" },
      fullAddress: { type: String, trim: true, default: "" },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      phone: { type: String, trim: true, default: "" },
    },
  },
  { timestamps: true },
);

courierCompanySchema.statics.ensureDefaults = async function () {
  const count = await this.countDocuments();
  if (count > 0) return;
  await this.insertMany(
    DEFAULT_COURIER_COMPANIES.map((c) => ({
      name: c.name,
      platformCharge: c.platformCharge,
      companyCharge: c.companyCharge,
      sortOrder: c.sortOrder,
      isActive: true,
    })),
  );
};

/**
 * Ensure the single "Other" catch-all courier option exists. Customers can pick
 * it to type a custom company name while the admin sets its platform rate.
 */
courierCompanySchema.statics.ensureOtherOption = async function () {
  const existing = await this.findOne({ isOther: true });
  if (existing) return existing;
  return this.create({
    name: "Other",
    platformCharge: 0,
    companyCharge: 0,
    sortOrder: 9999,
    isActive: true,
    isOther: true,
  });
};

courierCompanySchema.statics.listActiveForBooking = async function () {
  await this.ensureDefaults();
  await this.ensureOtherOption();
  return this.find({ isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .select("_id name platformCharge companyCharge location isOther")
    .lean();
};

courierCompanySchema.statics.findActiveByNameOrId = async function (nameOrId) {
  await this.ensureDefaults();
  const raw = String(nameOrId || "").trim();
  if (!raw) return null;

  if (mongoose.Types.ObjectId.isValid(raw) && String(new mongoose.Types.ObjectId(raw)) === raw) {
    const byId = await this.findOne({ _id: raw, isActive: true }).lean();
    if (byId) return byId;
  }

  return this.findOne({
    name: new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    isActive: true,
  }).lean();
};

export default mongoose.model("CourierCompany", courierCompanySchema);
