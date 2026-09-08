import CourierCompany from "../models/courierCompany.js";
import handleResponse from "../utils/helper.js";
import {
  parseCourierLocation,
  validateCourierLocation,
} from "../utils/courierLocation.js";
import { backfillAddressLabels } from "../services/locationBackfillService.js";

export const adminListCourierCompanies = async (req, res) => {
  try {
    // Do not auto-reseed here — otherwise deleting the last company
    // (or emptying the list) would immediately recreate defaults.
    // The "Other" catch-all option is always ensured so the admin can set its rate.
    await CourierCompany.ensureOtherOption();
    const companies = await CourierCompany.find()
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    return handleResponse(res, 200, "Courier companies retrieved", companies);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminCreateCourierCompany = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const platformCharge = Math.max(0, Number(req.body?.platformCharge) || 0);
    const companyCharge = Math.max(0, Number(req.body?.companyCharge) || 0);
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder))
      ? Number(req.body.sortOrder)
      : 0;
    const isActive = req.body?.isActive !== false && req.body?.isActive !== "false";
    const location = parseCourierLocation(req.body);

    if (!name) {
      return handleResponse(res, 400, "Courier company name is required");
    }

    const locationError = validateCourierLocation(location);
    if (locationError) {
      return handleResponse(res, 400, locationError);
    }

    const existing = await CourierCompany.findOne({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    }).lean();
    if (existing) {
      return handleResponse(res, 400, "A courier company with this name already exists");
    }

    // Same safety net the warehouses get: blank place names are read back off
    // the picked coordinates rather than saved empty.
    const filled = await backfillAddressLabels(location);
    const company = await CourierCompany.create({
      name,
      platformCharge,
      companyCharge,
      sortOrder,
      isActive,
      location: { ...location, ...filled },
    });

    return handleResponse(res, 201, "Courier company created", company);
  } catch (error) {
    if (error?.code === 11000) {
      return handleResponse(res, 400, "A courier company with this name already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

export const adminUpdateCourierCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await CourierCompany.findById(id);
    if (!company) {
      return handleResponse(res, 404, "Courier company not found");
    }

    // The "Other" catch-all option keeps its fixed name — customers type their own.
    if (req.body?.name !== undefined && !company.isOther) {
      const name = String(req.body.name || "").trim();
      if (!name) {
        return handleResponse(res, 400, "Courier company name is required");
      }
      const duplicate = await CourierCompany.findOne({
        _id: { $ne: company._id },
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      }).lean();
      if (duplicate) {
        return handleResponse(res, 400, "A courier company with this name already exists");
      }
      company.name = name;
    }

    if (req.body?.platformCharge !== undefined) {
      company.platformCharge = Math.max(0, Number(req.body.platformCharge) || 0);
    }
    if (req.body?.companyCharge !== undefined) {
      company.companyCharge = Math.max(0, Number(req.body.companyCharge) || 0);
    }
    if (req.body?.sortOrder !== undefined) {
      company.sortOrder = Number(req.body.sortOrder) || 0;
    }
    if (req.body?.isActive !== undefined) {
      company.isActive = req.body.isActive === true || req.body.isActive === "true";
    }

    const hasLocationUpdate =
      req.body?.location !== undefined ||
      [
        "flatNo",
        "address",
        "landmark",
        "city",
        "state",
        "pincode",
        "fullAddress",
        "lat",
        "lng",
        "phone",
      ].some((field) => req.body?.[field] !== undefined);

    if (hasLocationUpdate) {
      const nextLocation = parseCourierLocation({
        ...(company.location?.toObject?.() || company.location || {}),
        ...(req.body?.location || {}),
        ...req.body,
      });
      const locationError = validateCourierLocation(nextLocation);
      if (locationError) {
        return handleResponse(res, 400, locationError);
      }
      company.location = nextLocation;
    }

    await company.save();
    return handleResponse(res, 200, "Courier company updated", company);
  } catch (error) {
    if (error?.code === 11000) {
      return handleResponse(res, 400, "A courier company with this name already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

export const adminDeleteCourierCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await CourierCompany.findById(id);
    if (!existing) {
      return handleResponse(res, 404, "Courier company not found");
    }
    if (existing.isOther) {
      return handleResponse(
        res,
        400,
        "The 'Other' option cannot be deleted. Deactivate it instead if you want to hide it.",
      );
    }
    const company = await CourierCompany.findByIdAndDelete(id);
    return handleResponse(res, 200, "Courier company deleted", { id: company._id });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
