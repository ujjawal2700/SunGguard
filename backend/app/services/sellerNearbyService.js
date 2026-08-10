import Seller from "../models/seller.js";
import { distanceMeters } from "../utils/geoUtils.js";

function isApprovedParcelSeller(seller) {
  return (
    seller?.isParcelService === true &&
    seller?.isVerified === true &&
    seller?.isActive === true &&
    (seller?.applicationStatus === "approved" || seller?.applicationStatus == null)
  );
}

/**
 * All approved parcel sellers whose service radius covers the pickup point.
 */
export async function getParcelSellerIdsNearPickup(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const sellers = await Seller.find({
    isParcelService: true,
    isVerified: true,
    isActive: true,
    applicationStatus: "approved",
    "location.coordinates.0": { $exists: true },
  })
    .select("_id location serviceRadius isParcelService isVerified isActive applicationStatus")
    .lean();

  const ids = [];
  for (const seller of sellers) {
    if (!isApprovedParcelSeller(seller)) continue;
    const coords = seller.location?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const [sellerLng, sellerLat] = coords;
    if (!Number.isFinite(sellerLat) || !Number.isFinite(sellerLng)) continue;

    const radiusKm = Math.min(Math.max(Number(seller.serviceRadius) || 5, 1), 100);
    const distM = distanceMeters(lat, lng, sellerLat, sellerLng);
    if (distM <= radiusKm * 1000) {
      ids.push(String(seller._id));
    }
  }
  return ids;
}

/**
 * Nearest approved parcel seller whose service radius covers the pickup point.
 * @returns {{ seller: object, distanceM: number, distanceKm: number } | null}
 */
export async function findNearestParcelSellerWithDistance(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const sellers = await Seller.find({
    isParcelService: true,
    isVerified: true,
    isActive: true,
    applicationStatus: "approved",
    "location.coordinates.0": { $exists: true },
  })
    .select(
      "location serviceRadius name shopName phone address isParcelService isVerified isActive applicationStatus",
    )
    .lean();

  let best = null;
  let bestDistanceM = Infinity;

  for (const seller of sellers) {
    if (!isApprovedParcelSeller(seller)) continue;
    const coords = seller.location?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const [sellerLng, sellerLat] = coords;
    if (!Number.isFinite(sellerLat) || !Number.isFinite(sellerLng)) continue;

    const radiusKm = Math.min(Math.max(Number(seller.serviceRadius) || 5, 1), 100);
    const distM = distanceMeters(lat, lng, sellerLat, sellerLng);
    if (distM <= radiusKm * 1000 && distM < bestDistanceM) {
      best = seller;
      bestDistanceM = distM;
    }
  }

  if (!best) return null;

  return {
    seller: best,
    distanceM: bestDistanceM,
    distanceKm: Math.round((bestDistanceM / 1000 + Number.EPSILON) * 100) / 100,
  };
}

/**
 * Nearest approved parcel seller whose service radius covers the pickup point.
 */
export async function findNearestParcelSellerNearPickup(lat, lng) {
  const hit = await findNearestParcelSellerWithDistance(lat, lng);
  return hit?.seller || null;
}

export async function getApprovedParcelSeller(sellerId) {
  if (!sellerId) return null;
  const seller = await Seller.findById(sellerId)
    .select(
      "location serviceRadius isParcelService isVerified isActive applicationStatus name shopName",
    )
    .lean();
  return isApprovedParcelSeller(seller) ? seller : null;
}
