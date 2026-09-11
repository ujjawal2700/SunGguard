/**
 * Regression cover for the LOCAL failed-delivery report being unusable.
 *
 * The rider app's failure form has no "when did you call" input, so it sends
 * `calledAt: null` on every report. `Joi.date().optional()` permits the key to
 * be ABSENT but still rejects an explicit null, so every attempt came back
 * 400 `"calledAt" must be a valid date` — and the failed-delivery report is
 * the first step of the whole return flow, so the flow could not be started
 * at all from the app.
 *
 * Null is the real domain value: `recordFailedAttempt` defaults the parameter
 * to null and `attemptHistory.calledAt` is a nullable Date on the model.
 */

const { riderFailedAttemptSchema } = await import(
  "../app/validation/cityParcelValidation.js"
);

const base = {
  outcome: "REFUSED",
  note: "",
  photoUrl: "https://example.test/door.png",
  waitedMinutes: 0,
  location: { lat: 12.9352, lng: 77.6245, accuracyM: 0 },
};

describe("rider failed-attempt payload", () => {
  it("accepts the null calledAt the rider app actually sends", () => {
    const { error } = riderFailedAttemptSchema.validate({ ...base, calledAt: null });
    expect(error).toBeUndefined();
  });

  it("still accepts the key being absent", () => {
    const { error } = riderFailedAttemptSchema.validate(base);
    expect(error).toBeUndefined();
  });

  it("still accepts a real timestamp when a call was logged", () => {
    const { error } = riderFailedAttemptSchema.validate({
      ...base,
      calledAt: new Date().toISOString(),
    });
    expect(error).toBeUndefined();
  });

  it("still rejects a value that is not a date", () => {
    const { error } = riderFailedAttemptSchema.validate({ ...base, calledAt: "yesterday" });
    expect(error).toBeDefined();
  });

  it("still requires the door photograph", () => {
    const { photoUrl, ...noPhoto } = base;
    const { error } = riderFailedAttemptSchema.validate({ ...noPhoto, calledAt: null });
    expect(error).toBeDefined();
  });

  it("still rejects an outcome outside the documented set", () => {
    const { error } = riderFailedAttemptSchema.validate({
      ...base,
      outcome: "BECAUSE_I_SAID_SO",
      calledAt: null,
    });
    expect(error).toBeDefined();
  });
});
