import CityParcelConfig from "../models/cityParcelConfig.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { getCachedRoute } from "./mapsRouteService.js";
import { roundCurrency, multiplyMoney } from "../utils/money.js";
import { resolveTripZone } from "./deliveryZoneService.js";
import { applyGst, gstBreakdownFields } from "../utils/gst.js";

/**
 * Turns a zone refusal into something the customer can act on.
 *
 * Which end is at fault matters: "move the pickup" and "move the drop" are
 * different corrections, and a trip that straddles two zones is a third case
 * again — both addresses are fine on their own, they just are not one local
 * delivery.
 */
function zoneRefusal(trip) {
  if (trip.code === "DROP_OUT_OF_ZONE") {
    return {
      code: "DROP_OUT_OF_ZONE",
      reason:
        "We do not deliver to this drop location yet. Pick a spot inside a serviceable area.",
    };
  }

  if (trip.code === "ZONE_MISMATCH") {
    const from = trip.pickupZone?.name;
    const to = trip.dropZone?.name;
    return {
      code: "ZONE_MISMATCH",
      reason:
        from && to
          ? `Local delivery runs inside one area. Your pickup is in ${from} and the drop is in ${to}, so pick both within the same area.`
          : "Local delivery runs inside one area. Pick the pickup and the drop within the same area.",
      pickupZone: from || null,
      dropZone: to || null,
    };
  }

  return {
    code: "OUT_OF_ZONE",
    reason:
      "We do not deliver from this pickup location yet. Pick a spot inside a serviceable area.",
  };
}

/**
 * Pricing and ETAs for the City Parcel module.
 *
 * Prices a complete A-to-B trip. This is deliberately not shared with
 * `utils/parcelFare.js`, which prices a first mile to a courier hub and
 * hard-codes its base fare to zero.
 */

/**
 * Straight-line distance under-reports what a rider actually rides. Roads
 * bend around rivers, one-ways and flyovers. 1.35 is a conventional urban
 * detour factor and is only used when the routing API is unavailable — a
 * real route is always preferred.
 */
const ROAD_DETOUR_FACTOR = 1.35;

/**
 * Road distance between two points, in km.
 *
 * Falls back to haversine × a detour factor when the routing API is down or
 * unconfigured, so a booking is never blocked by a maps outage. The caller
 * is told which one it got, because a fare quoted on an estimate should not
 * silently look as authoritative as one quoted on a real route.
 */
export async function resolveTripDistanceKm(pickup, drop) {
  const straightKm =
    distanceMeters(
      Number(pickup.lat),
      Number(pickup.lng),
      Number(drop.lat),
      Number(drop.lng),
    ) / 1000;

  try {
    const route = await getCachedRoute(
      { lat: Number(pickup.lat), lng: Number(pickup.lng) },
      { lat: Number(drop.lat), lng: Number(drop.lng) },
      "driving",
    );

    if (route && !route.degraded && Number.isFinite(Number(route.distanceMeters))) {
      const routedKm = Number(route.distanceMeters) / 1000;
      if (routedKm > 0) {
        return {
          distanceKm: Math.round(routedKm * 100) / 100,
          straightKm: Math.round(straightKm * 100) / 100,
          source: "route",
          durationSeconds: Number(route.duration) || null,
        };
      }
    }
  } catch {
    /* fall through to the estimate below */
  }

  return {
    distanceKm: Math.round(straightKm * ROAD_DETOUR_FACTOR * 100) / 100,
    straightKm: Math.round(straightKm * 100) / 100,
    source: "estimate",
    durationSeconds: null,
  };
}

/**
 * Is this trip something we will accept as a single city delivery?
 * Returns a reason rather than throwing, so the booking screen can explain
 * itself instead of showing a generic failure.
 */
export async function checkServiceability({ pickup, drop, weightKg = 0 }) {
  const config = await CityParcelConfig.getConfig();

  if (!config.isEnabled) {
    return {
      serviceable: false,
      reason: "City delivery is not available right now",
      code: "MODULE_DISABLED",
    };
  }

  /**
   * Both ends have to sit in the same delivery zone. Checked before the
   * distance lookup on purpose: a trip we will never run should not cost a
   * routing API call to refuse.
   *
   * The zone travels back with a serviceable result so the booking can be
   * filed under it — resolving it a second time at create would risk a
   * different answer if an admin edited a boundary in between.
   */
  const trip = await resolveTripZone(pickup, drop);
  if (!trip.ok) {
    return { serviceable: false, ...zoneRefusal(trip) };
  }
  const zone = trip.zone;

  const { distanceKm, straightKm, source, durationSeconds } =
    await resolveTripDistanceKm(pickup, drop);

  if (distanceKm <= 0) {
    return {
      serviceable: false,
      reason: "Pickup and drop look like the same place",
      code: "ZERO_DISTANCE",
      distanceKm,
    };
  }

  if (distanceKm > config.maxTripDistanceKm) {
    return {
      serviceable: false,
      reason: `That is ${distanceKm} km apart. We deliver up to ${config.maxTripDistanceKm} km within the city.`,
      code: "TOO_FAR",
      distanceKm,
      maxTripDistanceKm: config.maxTripDistanceKm,
    };
  }

  const weight = Number(weightKg) || 0;
  if (weight > config.maxWeightKg) {
    return {
      serviceable: false,
      reason: `We can carry up to ${config.maxWeightKg} kg on this service`,
      code: "TOO_HEAVY",
      distanceKm,
      maxWeightKg: config.maxWeightKg,
    };
  }

  return {
    serviceable: true,
    distanceKm,
    straightKm,
    distanceSource: source,
    durationSeconds,
    zone,
  };
}

/**
 * Quote a trip.
 *
 * Unlike the pickup-service rate card, the base fare here is real and is
 * charged. It is what makes a 1 km job worth a rider's time; without it,
 * short trips pay almost nothing and riders decline them.
 */
export function computeCityParcelFare({
  config,
  distanceKm = 0,
  weightKg = 0,
  deliverySpeed = "normal",
  surgeMultiplier = 1,
}) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  const weight = Math.max(0, Number(weightKg) || 0);
  const surge = Math.max(1, Number(surgeMultiplier) || 1);

  const baseFare = roundCurrency(Math.max(0, Number(config.baseFare) || 0));
  const distanceFare = roundCurrency(distance * (Number(config.perKmCharge) || 0));
  const weightFare = roundCurrency(weight * (Number(config.weightCharge) || 0));
  const platformCharge = roundCurrency(Math.max(0, Number(config.platformCharge) || 0));
  const expressCharge =
    String(deliverySpeed).toLowerCase() === "express"
      ? roundCurrency(Math.max(0, Number(config.expressCharge) || 0))
      : 0;

  const subtotal = roundCurrency(
    baseFare + distanceFare + weightFare + platformCharge + expressCharge,
  );
  const surged = surge > 1 ? multiplyMoney(subtotal, surge) : subtotal;

  const minFare = roundCurrency(Math.max(0, Number(config.minFare) || 0));
  const minFareApplied = surged < minFare;
  const preTaxFare = minFareApplied ? minFare : surged;

  /**
   * Tax goes on top of the minimum-fare floor, not inside it.
   *
   * A minimum fare is a commercial floor on the SERVICE — the least the
   * platform will run a trip for. Netting tax out of it would quietly cut the
   * operation's revenue on exactly the trips that were already marginal.
   */
  const gst = applyGst(preTaxFare, config.gst);

  return {
    baseFare,
    distanceFare,
    weightFare,
    platformCharge,
    expressCharge,
    waitingCharge: 0,
    returnCharge: 0,
    surgeMultiplier: surge,
    minFareApplied,
    ...gstBreakdownFields(gst),
    // The grand total. Rider share is computed from `baseFare` and
    // `distanceFare` above, which are pre-tax, so adding GST here cannot
    // leak into anybody's payout.
    fare: roundCurrency(gst.totalAmount),
  };
}

/**
 * The rider's cut, paid on delivery.
 *
 * Base and distance are shared separately so the platform can, for example,
 * hand the rider the whole base fare on short trips while keeping a margin
 * on long ones.
 */
export function computeRiderEarning(fareBreakdown, config) {
  const basePct = Math.min(100, Math.max(0, Number(config.riderBaseFareSharePercent) || 0)) / 100;
  const distPct =
    Math.min(100, Math.max(0, Number(config.riderDistanceFareSharePercent) || 0)) / 100;

  const base = Number(fareBreakdown?.baseFare) || 0;
  const distance = Number(fareBreakdown?.distanceFare) || 0;

  return roundCurrency(base * basePct + distance * distPct);
}

/**
 * What the rider is paid for carrying a failed parcel back, and what the
 * customer is charged for it.
 *
 * Two independent numbers on purpose. A platform may well absorb the return
 * to stay competitive while still paying the rider in full — one shared
 * figure makes that impossible to express.
 */
export function computeReturnLegAmounts(fareBreakdown, config) {
  const distanceFare = Number(fareBreakdown?.distanceFare) || 0;
  /**
   * The percentage is applied to the PRE-TAX fare.
   *
   * `fare` is now tax-inclusive, so charging a percentage of it would bill
   * the customer a slice of their own GST as a return fee — and then, if GST
   * is ever applied to the return charge itself, tax that slice again.
   * `taxableAmount` is absent on bookings made before GST existed, where the
   * fare was pre-tax by definition, so falling back to it is exact.
   */
  const originalFare =
    Number(fareBreakdown?.taxableAmount) || Number(fareBreakdown?.fare) || 0;

  return {
    riderPayout: roundCurrency(
      distanceFare * (Math.max(0, Number(config.returnRiderPayoutPercent) || 0) / 100),
    ),
    customerCharge: roundCurrency(
      originalFare * (Math.max(0, Number(config.returnCustomerChargePercent) || 0) / 100),
    ),
  };
}

/**
 * Waiting charge for time spent at a door beyond the free allowance.
 * Rounded down to whole minutes so a rider is never billed for a partial one.
 */
export function computeWaitingCharge(waitedMinutes, config) {
  const waited = Math.max(0, Math.floor(Number(waitedMinutes) || 0));
  const free = Math.max(0, Number(config.freeWaitMinutes) || 0);
  const billable = Math.max(0, waited - free);
  return roundCurrency(billable * (Number(config.perMinuteWaiting) || 0));
}

/**
 * When we promise the parcel will arrive.
 *
 * The floor matters: a 400 m trip still needs someone to reach the pickup,
 * find the flat, and get back on the road. Scaling purely by distance would
 * promise three minutes and miss every time.
 */
export function computeDeliverySla({ distanceKm, config, from = new Date() }) {
  const perKm = Math.max(1, Number(config.deliverySlaMinutesPerKm) || 1);
  const floor = Math.max(1, Number(config.deliverySlaFloorMinutes) || 1);
  const minutes = Math.max(floor, Math.ceil((Number(distanceKm) || 0) * perKm) + floor);

  return {
    etaMinutes: minutes,
    deliveryEta: new Date(from.getTime() + minutes * 60_000),
    // A little headroom past the promise before it counts as late.
    deliveryDeadline: new Date(from.getTime() + Math.ceil(minutes * 1.25) * 60_000),
  };
}

/** One call that produces everything a quote screen needs. */
export async function quoteTrip({ pickup, drop, weightKg, deliverySpeed }) {
  const config = await CityParcelConfig.getConfig();
  const serviceability = await checkServiceability({ pickup, drop, weightKg });

  if (!serviceability.serviceable) {
    return { ...serviceability, config };
  }

  const breakdown = computeCityParcelFare({
    config,
    distanceKm: serviceability.distanceKm,
    weightKg,
    deliverySpeed,
  });

  const sla = computeDeliverySla({
    distanceKm: serviceability.distanceKm,
    config,
  });

  return {
    serviceable: true,
    distanceKm: serviceability.distanceKm,
    distanceSource: serviceability.distanceSource,
    fare: breakdown.fare,
    fareBreakdown: breakdown,
    riderEarning: computeRiderEarning(breakdown, config),
    etaMinutes: sla.etaMinutes,
    deliveryEta: sla.deliveryEta,
    // Null when no zone is configured; the booking is then filed unzoned.
    zone: serviceability.zone || null,
    config,
  };
}
