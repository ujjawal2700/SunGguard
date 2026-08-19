import CityParcel from "../models/cityParcel.js";
import CityParcelConfig from "../models/cityParcelConfig.js";
import { transition, recordEvent } from "./cityParcelStateMachine.js";
import { computeReturnLegAmounts } from "./cityParcelFareService.js";
import { issueOtp } from "./cityParcelVerificationService.js";
import { emitToCustomer, emitToDelivery, emitToAdmins } from "./orderSocketEmitter.js";
import {
  CITY_PARCEL_STATUS as S,
  CITY_PARCEL_RETURN_STATUS as R,
  CITY_PARCEL_CUSTOMER_CHOICE as C,
  CITY_PARCEL_RETURN_CHOICES,
  CITY_PARCEL_RETRY_CHOICES,
  CITY_PARCEL_EVENT_ACTOR,
  CITY_PARCEL_OTP_TYPE,
} from "../constants/cityParcelWorkflow.js";
import {
  notifyCustomerDecisionNeeded,
  notifyCustomerOfStatus,
} from "./cityParcelNotifyService.js";
import logger from "./logger.js";

/**
 * What happens when the handover at point B does not happen.
 *
 * Five causes — refused, no answer, wrong address, OTP failed, name mismatch
 * — and exactly one destination: back to the customer who booked it. The
 * cause is recorded for reporting and disputes; it never changes where the
 * parcel goes.
 *
 * The customer is asked what they want, but the rider cannot be held
 * hostage to an unanswered phone, so silence resolves to a return.
 */

/**
 * Log a failed attempt and decide what happens next.
 *
 * The rider has to have actually tried: a call, a wait, and a photo of the
 * door are all recorded on the attempt. "I called and nobody answered" needs
 * to be evidence, not a claim, because the customer is about to be charged
 * for a return on the strength of it.
 */
export async function recordFailedAttempt({
  cityParcelId,
  deliveryId,
  outcome,
  note = "",
  photoUrl,
  calledAt = null,
  waitedMinutes = 0,
  location = null,
}) {
  const parcel = await CityParcel.findById(cityParcelId);
  if (!parcel) {
    const err = new Error("Parcel not found");
    err.statusCode = 404;
    throw err;
  }

  if (String(parcel.deliveryPartnerId) !== String(deliveryId)) {
    const err = new Error("This is not your job");
    err.statusCode = 403;
    throw err;
  }

  const config = await CityParcelConfig.getVerificationSettings();

  const minWait = Number(config.minWaitAtDropMinutes) || 0;
  if (outcome === "NO_ANSWER" && Number(waitedMinutes) < minWait) {
    const err = new Error(
      `Wait at least ${minWait} minutes and try calling before marking this unreachable.`,
    );
    err.statusCode = 400;
    throw err;
  }

  const attemptNo = (parcel.attemptHistory?.length || 0) + 1;
  const maxAttempts = Number(config.maxDeliveryAttempts) || 2;
  const isLastAttempt = attemptNo >= maxAttempts;

  const responseWindowMs =
    (Number(config.customerResponseWindowMinutes) || 30) * 60_000;
  const responseDeadlineAt = new Date(Date.now() + responseWindowMs);

  const updated = await transition({
    cityParcelId,
    to: S.DELIVERY_FAILED,
    expectedFrom: [S.DROP_REACHED, S.OUT_FOR_DELIVERY],
    set: {
      "returnLeg.status": R.PENDING_CUSTOMER,
      "returnLeg.customerNotifiedAt": new Date(),
      "returnLeg.responseDeadlineAt": responseDeadlineAt,
      // Past the attempt cap there is nothing left to decide but where to
      // bring it back to.
      "returnLeg.required": isLastAttempt,
    },
    push: {
      attemptHistory: {
        attemptNo,
        at: new Date(),
        outcome,
        note,
        photoUrl,
        calledAt,
        waitedMinutes: Number(waitedMinutes) || 0,
        riderLat: location?.lat ?? null,
        riderLng: location?.lng ?? null,
      },
    },
    actor: CITY_PARCEL_EVENT_ACTOR.RIDER,
    actorId: deliveryId,
    location,
    note: `Attempt ${attemptNo} failed: ${outcome}`,
    meta: { outcome, attemptNo, isLastAttempt },
  });

  const choices = isLastAttempt
    ? CITY_PARCEL_RETURN_CHOICES
    : [...CITY_PARCEL_RETRY_CHOICES, ...CITY_PARCEL_RETURN_CHOICES];

  emitToCustomer(updated.customerId, {
    event: "cityparcel:decision-needed",
    payload: {
      cityParcelId: String(updated._id),
      referenceId: updated.referenceId,
      outcome,
      attemptNo,
      attemptsLeft: Math.max(0, maxAttempts - attemptNo),
      choices,
      responseDeadlineAt,
      receiverName: updated.receiver?.name,
      message: `We could not hand your parcel to ${updated.receiver?.name || "the receiver"}.`,
    },
  });

  emitToAdmins("cityparcel:status:update", updated);

  // The clock is already running on this one, so it cannot wait for the
  // customer to happen to open the app.
  notifyCustomerDecisionNeeded(updated, { outcome, deadlineAt: responseDeadlineAt });

  logger.info("City parcel delivery attempt failed", {
    referenceId: updated.referenceId,
    outcome,
    attemptNo,
    isLastAttempt,
  });

  return { parcel: updated, attemptNo, isLastAttempt, choices, responseDeadlineAt };
}

/**
 * The customer's answer.
 *
 * Retry options put the parcel back out for delivery with a fresh code — the
 * old one is dead, which matters, because a code read aloud at the wrong
 * address must not still work at the right one.
 */
export async function applyCustomerChoice({
  cityParcelId,
  customerId,
  choice,
  newAddress = null,
}) {
  const parcel = await CityParcel.findById(cityParcelId);
  if (!parcel) {
    const err = new Error("Parcel not found");
    err.statusCode = 404;
    throw err;
  }
  if (String(parcel.customerId) !== String(customerId)) {
    const err = new Error("This is not your parcel");
    err.statusCode = 403;
    throw err;
  }
  if (parcel.status !== S.DELIVERY_FAILED) {
    const err = new Error("There is nothing waiting on you for this parcel");
    err.statusCode = 409;
    throw err;
  }

  const config = await CityParcelConfig.getVerificationSettings();
  const maxAttempts = Number(config.maxDeliveryAttempts) || 2;
  const attemptsUsed = parcel.attemptHistory?.length || 0;

  const isRetry = CITY_PARCEL_RETRY_CHOICES.includes(choice);

  if (isRetry && attemptsUsed >= maxAttempts) {
    const err = new Error(
      "We have tried as many times as we can. Choose where to send it back.",
    );
    err.statusCode = 409;
    throw err;
  }

  if (isRetry) {
    return retryDelivery({ parcel, choice, newAddress, config });
  }

  if (CITY_PARCEL_RETURN_CHOICES.includes(choice)) {
    return startReturnLeg({ parcel, choice, newAddress });
  }

  const err = new Error("That is not one of the options");
  err.statusCode = 400;
  throw err;
}

/** Send the rider back out to the receiver, with a fresh code. */
async function retryDelivery({ parcel, choice, newAddress, config }) {
  const set = {
    "returnLeg.customerChoice": choice,
    "returnLeg.customerRespondedAt": new Date(),
    "returnLeg.status": R.NONE,
    "returnLeg.responseDeadlineAt": null,
  };

  if (choice === C.RETRY_NEW_ADDRESS) {
    if (!newAddress) {
      const err = new Error("Tell us which address to try instead");
      err.statusCode = 400;
      throw err;
    }
    set.dropAddress = newAddress;
  }

  // The customer relaxing the rule mid-flight is a legitimate answer to
  // "nobody by that name was there".
  if (choice === C.RELEASE_TO_ANYONE) {
    set["receiver.allowAlternate"] = true;
  }

  const updated = await transition({
    cityParcelId: parcel._id,
    to: S.OUT_FOR_DELIVERY,
    expectedFrom: [S.DELIVERY_FAILED],
    set,
    actor: CITY_PARCEL_EVENT_ACTOR.CUSTOMER,
    actorId: parcel.customerId,
    note:
      choice === C.RETRY_NEW_ADDRESS
        ? "Customer gave a new delivery address"
        : choice === C.RELEASE_TO_ANYONE
          ? "Customer allowed anyone at the address to collect"
          : "Customer asked us to try again",
    meta: { choice },
  });

  const attemptNo = (updated.attemptHistory?.length || 0) + 1;
  const otp = await issueOtp({
    cityParcelId: updated._id,
    type: CITY_PARCEL_OTP_TYPE.DELIVERY,
    phone: updated.receiver?.phone,
    referenceId: updated.referenceId,
    attemptNo,
  });

  emitToDelivery(updated.deliveryPartnerId, {
    event: "cityparcel:retry",
    payload: {
      cityParcelId: String(updated._id),
      dropAddress: updated.dropAddress,
      allowAlternate: updated.receiver?.allowAlternate,
      message: "The customer asked you to try again.",
    },
  });

  emitToAdmins("cityparcel:status:update", updated);

  return { parcel: updated, action: "RETRY", otpIssued: Boolean(otp.otpId) };
}

/** Send the parcel home. */
async function startReturnLeg({ parcel, choice, newAddress }) {
  const config = await CityParcelConfig.getConfig();
  const amounts = computeReturnLegAmounts(
    { ...parcel.fareBreakdown, fare: parcel.fare },
    config,
  );

  // Default is point A. The customer may be at work rather than at home,
  // so they can nominate somewhere else.
  const returnAddress =
    choice === C.RETURN_TO_NEW_ADDRESS ? newAddress : parcel.pickupAddress;

  if (choice === C.RETURN_TO_NEW_ADDRESS && !newAddress) {
    const err = new Error("Tell us where to bring it back to");
    err.statusCode = 400;
    throw err;
  }

  const updated = await transition({
    cityParcelId: parcel._id,
    to: S.RETURN_IN_TRANSIT,
    expectedFrom: [S.DELIVERY_FAILED],
    set: {
      "returnLeg.required": true,
      "returnLeg.status": R.IN_TRANSIT,
      "returnLeg.customerChoice": choice,
      "returnLeg.customerRespondedAt": new Date(),
      "returnLeg.responseDeadlineAt": null,
      "returnLeg.returnAddress": returnAddress,
      "returnLeg.startedAt": new Date(),
      "returnLeg.riderPayout": amounts.riderPayout,
      "returnLeg.customerCharge": amounts.customerCharge,
      "fareBreakdown.returnCharge": amounts.customerCharge,
    },
    actor: CITY_PARCEL_EVENT_ACTOR.CUSTOMER,
    actorId: parcel.customerId,
    note: "Coming back to you",
    meta: { choice, ...amounts },
  });

  // The customer verifies the parcel coming back with the same rigour as
  // handing it over in the first place. This code goes to the CUSTOMER, not
  // the receiver — the receiver is out of the picture from here on.
  const customer = await CityParcel.findById(updated._id)
    .populate("customerId", "phone name")
    .select("customerId")
    .lean();

  const customerPhone = customer?.customerId?.phone;
  if (customerPhone) {
    await issueOtp({
      cityParcelId: updated._id,
      type: CITY_PARCEL_OTP_TYPE.RETURN_DROP,
      phone: customerPhone,
      referenceId: updated.referenceId,
    });
  } else {
    logger.warn("City parcel return: no customer phone for return OTP", {
      referenceId: updated.referenceId,
    });
  }

  emitToDelivery(updated.deliveryPartnerId, {
    event: "cityparcel:return-started",
    payload: {
      cityParcelId: String(updated._id),
      returnAddress,
      riderPayout: amounts.riderPayout,
      message: "Bring this back to the customer.",
    },
  });

  emitToAdmins("cityparcel:status:update", updated);

  notifyCustomerOfStatus(updated);

  return { parcel: updated, action: "RETURN", ...amounts };
}

/**
 * The customer never answered.
 *
 * Default to a return to point A. The alternative is a rider carrying
 * somebody else's parcel around indefinitely, which is not a real option.
 */
export async function resolveExpiredDecisions({ limit = 50 } = {}) {
  const due = await CityParcel.find({
    status: S.DELIVERY_FAILED,
    "returnLeg.status": R.PENDING_CUSTOMER,
    "returnLeg.responseDeadlineAt": { $lte: new Date() },
  })
    .limit(limit)
    .lean();

  let returned = 0;

  for (const row of due) {
    try {
      const parcel = await CityParcel.findById(row._id);
      if (!parcel) continue;
      await startReturnLeg({ parcel, choice: C.RETURN_TO_PICKUP, newAddress: null });
      returned += 1;

      emitToCustomer(parcel.customerId, {
        event: "cityparcel:status:update",
        payload: {
          cityParcelId: String(parcel._id),
          status: S.RETURN_IN_TRANSIT,
          message: "We did not hear back, so your parcel is coming back to you.",
        },
      });
    } catch (err) {
      logger.error("City parcel auto-return failed", {
        cityParcelId: String(row._id),
        error: err?.message,
      });
    }
  }

  return { examined: due.length, returned };
}

/**
 * The customer will not take it back either. The rider has to be able to put
 * the parcel down, so this hands it to an admin.
 *
 * What physically happens next — where it is stored, for how long, who is
 * liable, and what happens to the money already paid — is an operations
 * policy, not a code decision. This state exists so the flow cannot
 * dead-end while that policy is settled.
 */
export async function flagCustomerUnreachable({ cityParcelId, deliveryId, note = "" }) {
  const updated = await CityParcel.findOneAndUpdate(
    {
      _id: cityParcelId,
      deliveryPartnerId: deliveryId,
      status: S.RETURN_IN_TRANSIT,
    },
    { $set: { "returnLeg.status": R.CUSTOMER_UNREACHABLE } },
    { new: true },
  );

  if (!updated) {
    const err = new Error("This parcel is not on a return leg");
    err.statusCode = 409;
    throw err;
  }

  await recordEvent({
    cityParcelId: updated._id,
    status: S.RETURN_IN_TRANSIT,
    previousStatus: S.RETURN_IN_TRANSIT,
    actor: CITY_PARCEL_EVENT_ACTOR.RIDER,
    actorId: deliveryId,
    note: note || "Customer would not take the parcel back",
    meta: { returnStatus: R.CUSTOMER_UNREACHABLE },
  });

  emitToAdmins("cityparcel:stuck", {
    cityParcelId: String(updated._id),
    referenceId: updated.referenceId,
    note,
  });

  return updated;
}
