import mongoose from "mongoose";
import { OWNER_TYPE } from "../constants/finance.js";

import Parcel from "../models/parcel.js";
import CityParcel from "../models/cityParcel.js";
import Customer from "../models/customer.js";
import Delivery from "../models/delivery.js";
import Seller from "../models/seller.js";
import Wallet from "../models/wallet.js";
import Transaction from "../models/transaction.js";
import LedgerEntry from "../models/ledgerEntry.js";
import Notification from "../models/notification.js";
import Payout from "../models/payout.js";

import Product from "../models/product.js";
import Category from "../models/category.js";
import Cart from "../models/cart.js";
import Wishlist from "../models/wishlist.js";
import Order from "../models/order.js";
import OrderOtp from "../models/orderOtp.js";
import Review from "../models/review.js";
import SellerMetrics from "../models/sellerMetrics.js";
import Coupon from "../models/coupon.js";
import CheckoutGroup from "../models/checkoutGroup.js";
import Offer from "../models/offer.js";
import OfferSection from "../models/offerSection.js";
import ExperienceSection from "../models/experienceSection.js";
import HeroConfig from "../models/heroConfig.js";
import StockHistory from "../models/stockHistory.js";
import SearchIndexFailure from "../models/searchIndexFailure.js";
import DeliveryAssignment from "../models/deliveryAssignment.js";
import DashboardStats from "../models/dashboardStats.js";

/**
 * Removes quick-commerce data from the database while keeping every
 * porter-related account intact — this is a one-off operational cleanup,
 * not something the app calls at runtime.
 *
 * What "porter-related" means, precisely:
 *   - Customer (User docs, role:"user"): kept only if they appear as
 *     `customerId` on a Parcel or CityParcel. Every other customer is
 *     deleted outright, per explicit instruction.
 *   - Delivery (riders): kept if `isParcelService:true` OR they appear as
 *     `deliveryPartnerId` on a Parcel/CityParcel. Kept riders that also do
 *     quick-commerce work have `isQuickCommerceService` cleared to false,
 *     not deleted — a rider who has done porter jobs stays, in full, with
 *     their porter earning history untouched.
 *   - Seller: same treatment as Delivery. Sellers can act as a local-parcel
 *     hub (`Parcel.sellerId`) even though the model lives in the
 *     "quick-commerce" world — a seller referenced that way, or flagged
 *     `isParcelService:true`, is kept and only has the quick-commerce flag
 *     cleared.
 *
 * Collections dropped entirely below were checked against parcel/cityParcel
 * for cross-references before being added to this list — none exist.
 *
 * Left untouched by design (explicit instruction): ticket, faq,
 * carWashBooking/Config/Package, payment, paymentWebhookEvent,
 * financeAuditLog, financeReports, admin, setting, geocodeCache,
 * mediaMetadata, otpVerification, and every porter-only collection
 * (parcel*, cityParcel*, courierCompany, warehouse, deliveryZone,
 * porterBanner).
 */

const PURE_QUICK_COMMERCE_MODELS = [
  Product,
  Category,
  Cart,
  Wishlist,
  Order,
  OrderOtp,
  Review,
  SellerMetrics,
  Coupon,
  CheckoutGroup,
  Offer,
  OfferSection,
  ExperienceSection,
  HeroConfig,
  StockHistory,
  SearchIndexFailure,
  DeliveryAssignment,
  DashboardStats,
];

async function dropCollection(Model) {
  const name = Model.collection.name;
  let documentsRemoved = 0;
  try {
    documentsRemoved = await Model.estimatedDocumentCount();
  } catch {
    /* collection may not exist yet — count stays 0 */
  }

  try {
    await Model.collection.drop();
    return { collection: name, dropped: true, documentsRemoved };
  } catch (error) {
    // Mongo error 26 = NamespaceNotFound — collection was never created.
    if (error?.code === 26 || error?.codeName === "NamespaceNotFound") {
      return { collection: name, dropped: false, documentsRemoved: 0, note: "did not exist" };
    }
    throw error;
  }
}

const toObjectIdArray = (ids) => ids.filter(Boolean).map((id) => new mongoose.Types.ObjectId(String(id)));

export async function cleanupQuickCommerceData() {
  const report = {
    startedAt: new Date().toISOString(),
    droppedCollections: [],
    customers: {},
    riders: {},
    sellers: {},
    orphanCleanup: {},
  };

  // ---- 1. Drop collections that are quick-commerce only, no exceptions ----
  for (const Model of PURE_QUICK_COMMERCE_MODELS) {
    report.droppedCollections.push(await dropCollection(Model));
  }

  // ---- 2. Work out who is porter-related, before touching anyone ----
  const [
    parcelCustomerIds,
    cityCustomerIds,
    parcelRiderIds,
    cityRiderIds,
    parcelServiceRiderIds,
    parcelSellerIds,
    parcelServiceSellerIds,
  ] = await Promise.all([
    Parcel.distinct("customerId"),
    CityParcel.distinct("customerId"),
    Parcel.distinct("deliveryPartnerId"),
    CityParcel.distinct("deliveryPartnerId"),
    Delivery.distinct("_id", { isParcelService: true }),
    Parcel.distinct("sellerId"),
    Seller.distinct("_id", { isParcelService: true }),
  ]);

  const keepCustomerIds = new Set(
    [...parcelCustomerIds, ...cityCustomerIds].filter(Boolean).map(String),
  );
  const keepRiderIds = new Set(
    [...parcelRiderIds, ...cityRiderIds, ...parcelServiceRiderIds].filter(Boolean).map(String),
  );
  const keepSellerIds = new Set(
    [...parcelSellerIds, ...parcelServiceSellerIds].filter(Boolean).map(String),
  );

  // ---- 3. Customers: delete every role:"user" doc that never booked porter ----
  const allCustomerIds = (await Customer.find({ role: "user" }).distinct("_id")).map(String);
  const customerIdsToDelete = allCustomerIds.filter((id) => !keepCustomerIds.has(id));
  const customerDeleteResult = await Customer.deleteMany({
    _id: { $in: toObjectIdArray(customerIdsToDelete) },
  });
  report.customers = {
    totalBefore: allCustomerIds.length,
    kept: allCustomerIds.length - customerIdsToDelete.length,
    deleted: customerDeleteResult.deletedCount,
  };

  // ---- 4. Riders: delete non-porter riders; clear the flag on kept ones ----
  const allRiderIds = (await Delivery.find({}).distinct("_id")).map(String);
  const riderIdsToDelete = allRiderIds.filter((id) => !keepRiderIds.has(id));
  const riderDeleteResult = await Delivery.deleteMany({
    _id: { $in: toObjectIdArray(riderIdsToDelete) },
  });
  const riderFlagResult = await Delivery.updateMany(
    { _id: { $in: toObjectIdArray([...keepRiderIds]) }, isQuickCommerceService: true },
    { $set: { isQuickCommerceService: false } },
  );
  report.riders = {
    totalBefore: allRiderIds.length,
    kept: allRiderIds.length - riderIdsToDelete.length,
    deleted: riderDeleteResult.deletedCount,
    quickCommerceFlagCleared: riderFlagResult.modifiedCount,
  };

  // ---- 5. Sellers: same treatment as riders ----
  const allSellerIds = (await Seller.find({}).distinct("_id")).map(String);
  const sellerIdsToDelete = allSellerIds.filter((id) => !keepSellerIds.has(id));
  const sellerDeleteResult = await Seller.deleteMany({
    _id: { $in: toObjectIdArray(sellerIdsToDelete) },
  });
  const sellerFlagResult = await Seller.updateMany(
    { _id: { $in: toObjectIdArray([...keepSellerIds]) }, isQuickCommerceService: true },
    { $set: { isQuickCommerceService: false } },
  );
  report.sellers = {
    totalBefore: allSellerIds.length,
    kept: allSellerIds.length - sellerIdsToDelete.length,
    deleted: sellerDeleteResult.deletedCount,
    quickCommerceFlagCleared: sellerFlagResult.modifiedCount,
  };

  // ---- 6. Orphan cleanup — only rows belonging to the accounts just deleted ----
  // Never touches a row belonging to a kept customer/rider/seller.
  const deletedCustomerObjIds = toObjectIdArray(customerIdsToDelete);
  const deletedRiderObjIds = toObjectIdArray(riderIdsToDelete);
  const deletedSellerObjIds = toObjectIdArray(sellerIdsToDelete);

  const [walletCust, walletRider, walletSeller] = await Promise.all([
    Wallet.deleteMany({ ownerType: OWNER_TYPE.CUSTOMER, ownerId: { $in: deletedCustomerObjIds } }),
    Wallet.deleteMany({ ownerType: OWNER_TYPE.DELIVERY_PARTNER, ownerId: { $in: deletedRiderObjIds } }),
    Wallet.deleteMany({ ownerType: OWNER_TYPE.SELLER, ownerId: { $in: deletedSellerObjIds } }),
  ]);

  const [ledgerCust, ledgerRider, ledgerSeller] = await Promise.all([
    LedgerEntry.deleteMany({ actorType: OWNER_TYPE.CUSTOMER, actorId: { $in: deletedCustomerObjIds } }),
    LedgerEntry.deleteMany({ actorType: OWNER_TYPE.DELIVERY_PARTNER, actorId: { $in: deletedRiderObjIds } }),
    LedgerEntry.deleteMany({ actorType: OWNER_TYPE.SELLER, actorId: { $in: deletedSellerObjIds } }),
  ]);

  const [txnCust, txnRider, txnSeller] = await Promise.all([
    Transaction.deleteMany({ userModel: "User", user: { $in: deletedCustomerObjIds } }),
    Transaction.deleteMany({ userModel: "Delivery", user: { $in: deletedRiderObjIds } }),
    Transaction.deleteMany({ userModel: "Seller", user: { $in: deletedSellerObjIds } }),
  ]);

  const [notifCust, notifRider, notifSeller] = await Promise.all([
    Notification.deleteMany({ recipientModel: "User", recipient: { $in: deletedCustomerObjIds } }),
    Notification.deleteMany({ recipientModel: "Delivery", recipient: { $in: deletedRiderObjIds } }),
    Notification.deleteMany({ recipientModel: "Seller", recipient: { $in: deletedSellerObjIds } }),
  ]);

  const payoutCleanup = await Payout.deleteMany({
    $or: [
      { beneficiaryModel: "Delivery", beneficiaryId: { $in: deletedRiderObjIds } },
      { beneficiaryModel: "Seller", beneficiaryId: { $in: deletedSellerObjIds } },
    ],
  });

  report.orphanCleanup = {
    wallets: walletCust.deletedCount + walletRider.deletedCount + walletSeller.deletedCount,
    ledgerEntries: ledgerCust.deletedCount + ledgerRider.deletedCount + ledgerSeller.deletedCount,
    transactions: txnCust.deletedCount + txnRider.deletedCount + txnSeller.deletedCount,
    notifications: notifCust.deletedCount + notifRider.deletedCount + notifSeller.deletedCount,
    payouts: payoutCleanup.deletedCount,
  };

  report.finishedAt = new Date().toISOString();
  return report;
}

export default cleanupQuickCommerceData;
