import {
  sweepExpiredSearches,
} from "../services/cityParcelWorkflowService.js";
import { resolveExpiredDecisions } from "../services/cityParcelReturnService.js";
import logger from "../services/logger.js";

/**
 * Moves City Parcel deadlines forward.
 *
 * Two things time out and neither may be left to an in-process timer:
 *
 *   1. A rider search that nobody accepted — widen the radius, or hand it
 *      to an admin.
 *   2. A customer who never answered "we could not deliver, what now?" —
 *      default to sending the parcel back.
 *
 * Both are idempotent, so a duplicate run is harmless. That is what makes
 * this safe to run on every instance behind the distributed scheduler's
 * lock, and what makes it survive a restart — unlike the pickup-service
 * flow, which loses every pending timer when the process dies.
 */

const DEFAULT_INTERVAL_MS = 15_000;

const CITY_PARCEL_SWEEP_INTERVAL_MS = parseInt(
  process.env.CITY_PARCEL_SWEEP_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`,
  10,
);

const sweep = async () => {
  const startedAt = Date.now();

  try {
    const [searches, decisions] = await Promise.all([
      sweepExpiredSearches({ limit: 50 }),
      resolveExpiredDecisions({ limit: 50 }),
    ]);

    const didSomething =
      searches.widened || searches.parked || decisions.returned;

    if (didSomething) {
      logger.info("City parcel sweep", {
        jobName: "cityParcelSweeperJob",
        searchesWidened: searches.widened,
        searchesParked: searches.parked,
        autoReturned: decisions.returned,
        durationMs: Date.now() - startedAt,
      });
    }
  } catch (err) {
    logger.error("City parcel sweep failed", {
      jobName: "cityParcelSweeperJob",
      error: err?.message,
      stack: err?.stack,
    });
  }
};

export const getCityParcelSweeperJobHandler = () => sweep;
export const getCityParcelSweeperJobInterval = () => CITY_PARCEL_SWEEP_INTERVAL_MS;
export const isCityParcelSweeperEnabled = () =>
  process.env.CITY_PARCEL_SWEEPER_ENABLED !== "false";

export default sweep;
