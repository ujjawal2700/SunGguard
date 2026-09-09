import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, User, Phone, Package,
  Loader2, IndianRupee, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { cityParcelApi } from "../services/cityParcelApi";
import { openCityParcelCheckout } from "../utils/cityParcelRazorpay";
import LocationPicker from "../components/sunguard/LocationPicker";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import {
  Card, Label, Data, Barcode, StepTracker, Field, inputClass,
  PrimaryButton, GhostButton,
} from "../components/sunguard/kit";
import { unwrap } from "@core/api/unwrap";
import {
  checkPersonName,
  checkPhone,
  sanitizeNameInput,
  sanitizePhoneInput,
  firstProblem,
  NAME_MAX,
  PHONE_MAX,
  DESCRIPTION_MAX,
  LANDMARK_MAX,
} from "../utils/bookingValidation";

/**
 * Local delivery booking: FROM → TO → WHAT → PAY.
 *
 * One question per screen, in the order a person actually thinks about it:
 * where we collect, where it goes and who receives it, what it is, then what
 * it costs. The draft waybill at the top fills in as they go, so the estimate
 * never appears out of nowhere at the end.
 */

const STEPS = ["From", "To", "What", "Pay"];

const emptyAddress = {
  lat: null, lng: null,
  // Filled by the reverse lookup — this is where the street, area, city and
  // state come from. None of it is typed.
  formattedAddress: "",
  // The two things a map pin cannot tell us.
  line: "", landmark: "",
};

/** The API wants one address string; the form collects it in readable parts. */
/**
 * Build the address a rider will actually read.
 *
 * City and state are never asked for: this is a same-city delivery, so both
 * are already implied, and the map pin plus its reverse lookup supplies the
 * street, area and city more accurately than anyone types them.
 *
 * What the pin cannot know is the door — the flat, the floor, the landmark —
 * so those are typed and lead the string, followed by the geocoded location.
 */
const composeAddress = (addr) => {
  const door = [addr.line, addr.landmark]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  const located = String(addr.formattedAddress || "").trim();

  return [...door, located].filter(Boolean).join(", ");
};

const AddressStep = ({
  heading, nameLabel, value, onChange, person, onPerson,
  onDetect, detecting, detectError,
}) => (
  <div className="space-y-5">
    <h1 className="sg-display text-[26px] text-sg-ink">{heading}</h1>

    {/* Map first: most people will detect or search rather than type. */}
    <Card className="p-4">
      <LocationPicker
        value={value}
        onChange={onChange}
        onDetect={onDetect}
        detecting={detecting}
        detectError={detectError}
      />
    </Card>

    <Card className="space-y-4 p-4">
      <Field label={nameLabel}>
        <div className="relative">
          <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sg-ink-3" />
          <input
            value={person.name}
            // Digits are stripped as they are typed rather than rejected on
            // submit — a phone number in the name box is the commonest slip.
            onChange={(e) => onPerson({ ...person, name: sanitizeNameInput(e.target.value) })}
            maxLength={NAME_MAX}
            autoComplete="name"
            placeholder="Full name"
            className={cn(inputClass, "pl-10")}
          />
        </div>
      </Field>

      <Field label="Phone">
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sg-ink-3" />
          <input
            value={person.phone}
            onChange={(e) =>
              onPerson({ ...person, phone: sanitizePhoneInput(e.target.value) })
            }
            maxLength={PHONE_MAX}
            autoComplete="tel"
            inputMode="tel"
            placeholder="+91 00000 00000"
            className={cn(inputClass, "pl-10")}
          />
        </div>
      </Field>

      <Field
        label="House / Flat / Floor"
        hint="The map gets us to the building; this gets us to the door."
      >
        <textarea
          rows={2}
          value={value.line}
          onChange={(e) => onChange({ ...value, line: e.target.value })}
          maxLength={LANDMARK_MAX}
          placeholder="Flat no, building, floor"
          className={cn(inputClass, "resize-none")}
        />
      </Field>

      <Field label="Landmark" hint="Optional, but riders find you faster with one.">
        <input
          value={value.landmark}
          onChange={(e) => onChange({ ...value, landmark: e.target.value })}
          maxLength={LANDMARK_MAX}
          placeholder="Near City Mall"
          className={inputClass}
        />
      </Field>
    </Card>
  </div>
);

/* -------------------------------------------------------------------------- */

/**
 * Keeps `setZone` in step with which delivery zone an address's pin falls in.
 *
 * Re-runs only when the coordinates move, so typing a flat number or a
 * landmark does not re-ask. In-flight answers for a pin the customer has
 * already dragged away from are discarded rather than applied late.
 */
function useZonePin(address, setZone) {
  const { lat, lng } = address;

  useEffect(() => {
    if (!lat || !lng) {
      setZone(null);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await cityParcelApi.zoneCheck({ lat, lng });
        if (!cancelled) setZone(unwrap(res));
      } catch {
        // A failed check must not block the booking: the price step and the
        // create call both enforce the same rule server-side.
        if (!cancelled) setZone(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng, setZone]);
}

const CityParcelBooking = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";

  const [step, setStep] = useState(0);
  const [config, setConfig] = useState(null);
  const { detect, locating, error: detectError } = useCurrentLocation();
  const autoDetectedRef = useRef(false);
  const [pickup, setPickup] = useState(emptyAddress);
  const [drop, setDrop] = useState(emptyAddress);
  const [sender, setSender] = useState({ name: "", phone: "" });
  const [receiver, setReceiver] = useState({ name: "", phone: "", allowAlternate: false });
  const [pkg, setPkg] = useState({ packageType: "", weightKg: "", description: "" });
  // No default — UPI silently pre-selected meant "Pay ₹X" could be tapped
  // without the customer ever consciously choosing how to pay. Left blank
  // until they pick one on the Pay step.
  const [payment, setPayment] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [pickupZone, setPickupZone] = useState(null);
  const [dropZone, setDropZone] = useState(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await cityParcelApi.getBookingConfig({ forceRefresh: true });
      const d = unwrap(res);
      setConfig(d);
      // Preselect the first type so the customer only has to change it if the
      // guess is wrong, rather than pick from cold.
      if (d?.packageTypes?.length) {
        setPkg((p) => ({ ...p, packageType: p.packageType || d.packageTypes[0].value }));
      }
    } catch {
      setConfig({ packageTypes: [] });
      toast.error("Couldn't load booking options");
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (user) {
      setSender((s) => ({
        name: s.name || user.name || "",
        phone: s.phone || user.phone || "",
      }));
    }
  }, [user]);

  /**
   * Fold a detected or searched location into the address being edited.
   *
   * Suggestions never overwrite what the customer has already typed — a door
   * detail they corrected should not revert because the pin nudged.
   */
  const applyLocation = useCallback((current, found) => ({
    ...current,
    lat: found.lat,
    lng: found.lng,
    // The geocoded string carries street, area, city and state, so none of
    // those are ever asked for.
    formattedAddress: found.formattedAddress || current.formattedAddress || "",
    // Only suggested — never overwrites a door detail already typed.
    line: current.line || found.components?.line || "",
    landmark: current.landmark || found.components?.locality || "",
  }), []);

  const detectInto = useCallback(
    async (setter, { silent = false } = {}) => {
      const found = await detect({ silent }).catch(() => null);
      if (found) setter((current) => applyLocation(current, found));
      return found;
    },
    [detect, applyLocation],
  );

  // Offer the customer's own location for pickup, once, without being asked.
  // Silent because a refused permission prompt should not surface an error
  // the customer never triggered.
  useEffect(() => {
    if (autoDetectedRef.current) return;
    autoDetectedRef.current = true;
    detectInto(setPickup, { silent: true });
  }, [detectInto]);

  // A pin plus either a typed line or a resolved address is enough to send
  // a rider; demanding both blocks anyone whose building has no street name.
  const addressReady = (a) =>
    Boolean(a.lat && a.lng && (a.line?.trim() || a.formattedAddress?.trim()));

  /**
   * Ask whether a dropped pin is inside a delivery zone, on the step where it
   * is dropped. The same rule is enforced when the trip is priced and again
   * when it is booked — this is only so the customer hears it while they are
   * still looking at the map, instead of on the payment screen.
   */
  useZonePin(pickup, setPickupZone);
  useZonePin(drop, setDropZone);

  /** The zone problem, if any, that the customer must fix on this step. */
  const zoneIssue = useMemo(() => {
    if (step === 0) {
      if (pickupZone?.gated && pickupZone.covered === false) {
        return "We don't deliver from here yet. Move the pin into an area we cover.";
      }
      return null;
    }

    if (step === 1) {
      if (dropZone?.gated && dropZone.covered === false) {
        return "We don't deliver to here yet. Move the pin into an area we cover.";
      }
      const from = pickupZone?.zone;
      const to = dropZone?.zone;
      if (from && to && from._id !== to._id) {
        return `A local delivery stays inside one area. Your pickup is in ${from.name} and this drop is in ${to.name}.`;
      }
      return null;
    }

    return null;
  }, [step, pickupZone, dropZone]);

  /**
   * The problem with the current step, or null. A trim()-only gate used to
   * let "12345" through as a name and "abc" as a phone number, which the
   * customer only discovered when a rider could not reach them.
   */
  const stepProblem = useMemo(() => {
    if (zoneIssue) return zoneIssue;

    if (step === 0) {
      if (!addressReady(pickup)) return "Set the pickup point on the map.";
      return firstProblem(
        checkPersonName(sender.name, "Sender name"),
        checkPhone(sender.phone, "Sender phone"),
      );
    }
    if (step === 1) {
      if (!addressReady(drop)) return "Set the drop point on the map.";
      return firstProblem(
        checkPersonName(receiver.name, "Receiver name"),
        checkPhone(receiver.phone, "Receiver phone"),
      );
    }
    if (step === 2) {
      if (!pkg.packageType) return "Pick what you are sending.";
      const weight = Number(pkg.weightKg);
      if (!Number.isFinite(weight) || weight <= 0) return "Enter the package weight.";
      const maxKg = Number(config?.maxWeightKg) || 20;
      if (weight > maxKg) return `We can carry up to ${maxKg} kg on this service.`;
      return null;
    }
    return quote ? null : "Waiting for the price.";
  }, [step, pickup, drop, sender, receiver, pkg, quote, zoneIssue, config]);

  const canContinue = stepProblem === null;

  const buildPayload = useCallback(
    () => ({
      pickupAddress: {
        fullAddress: composeAddress(pickup),
        lat: pickup.lat, lng: pickup.lng,
        addressNote: pickup.landmark || "",
      },
      dropAddress: {
        fullAddress: composeAddress(drop),
        lat: drop.lat, lng: drop.lng,
        addressNote: drop.landmark || "",
      },
      package: {
        packageType: pkg.packageType,
        weightKg: Number(pkg.weightKg),
        description: pkg.description || "",
      },
    }),
    [pickup, drop, pkg],
  );

  // Price as soon as the package is described — the customer should never
  // reach the pay step without knowing the number.
  const fetchQuote = useCallback(async () => {
    setQuoting(true);
    try {
      const { data } = await cityParcelApi.calculateFare(buildPayload());
      setQuote(unwrap({ data }));
      setQuoteError(null);
    } catch (err) {
      const body = err?.response?.data;
      setQuote(null);
      // Kept on screen rather than only toasted: "we don't deliver from
      // there" is something the customer has to act on, and a toast is gone
      // before they have worked out which address to change.
      setQuoteError({
        message: body?.message || "Couldn't price this trip",
        code: body?.result?.code || null,
      });
    } finally {
      setQuoting(false);
    }
  }, [buildPayload]);

  useEffect(() => {
    if (step === 3) fetchQuote();
  }, [step, fetchQuote]);

  const place = async () => {
    setPlacing(true);
    try {
      const { data } = await cityParcelApi.create({
        ...buildPayload(),
        // Collected on step 0 and, until now, used only to prefill the
        // Razorpay sheet — the rider and admin never saw who handed it over.
        sender: {
          name: sender.name.trim(),
          phone: sender.phone.replace(/[\s-]/g, ""),
        },
        receiver: {
          name: receiver.name.trim(),
          phone: receiver.phone.replace(/[\s-]/g, ""),
          allowAlternate: receiver.allowAlternate,
        },
        paymentMethod: payment,
      });
      const payload = unwrap({ data });
      const parcel = payload?.parcel;

      if (payload?.requiresPayment) {
        // The gateway hands back a signed receipt; the server checks that
        // signature before any rider is dispatched. Nothing is confirmed
        // client-side.
        const receipt = await openCityParcelCheckout({
          razorpay: payload.razorpay,
          parcel,
          customer: { name: sender.name, phone: sender.phone, email: user?.email },
          appName,
        });
        await cityParcelApi.verifyPayment(parcel._id, receipt);
      }
      toast.success("Booked — finding you a rider");
      navigate(`/parcel/local/track/${parcel._id}`, { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't place the booking");
    } finally {
      setPlacing(false);
    }
  };

  const back = () => (step === 0 ? navigate("/") : setStep((s) => s - 1));

  return (
    <div
      className="min-h-screen bg-sg-bg"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8.5rem)" }}
    >
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-sg-line bg-sg-surface px-5 py-4">
        <button type="button" onClick={back} aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-sg-ink" />
        </button>
        <h2 className="sg-heading text-[17px] text-sg-ink">Local Delivery</h2>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="sg-label text-sg-ink-3"
        >
          Cancel
        </button>
      </header>

      <div className="mx-auto w-full max-w-lg px-5 pt-5">
        {/* ---- draft waybill ---- */}
        <Card className="p-5">
          <StepTracker
            steps={STEPS}
            current={step}
            onStepClick={(i) => setStep(i)}
          />
          <div className="my-4 sg-perforation" />
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <Label>Draft Waybill</Label>
              <Barcode
                value={`${pickup.city}${drop.city}${pkg.weightKg}`}
                height={26}
                className="mt-1.5 text-sg-ink"
              />
            </div>
            <div className="text-right">
              <Label>Estimate</Label>
              <Data
                className={cn(
                  "mt-0.5 block text-[22px] font-bold",
                  quote ? "text-sg-ink" : "text-sg-ink-3",
                )}
              >
                ₹{quote ? Number(quote.fare).toFixed(2) : "0.00"}
              </Data>
            </div>
          </div>
        </Card>

        {zoneIssue && (
          <div
            role="alert"
            className="mt-6 rounded-[var(--sg-r)] border border-amber-300 bg-amber-50 px-4 py-3"
          >
            <p className="text-[13px] font-semibold text-amber-900">{zoneIssue}</p>
          </div>
        )}

        <div className="mt-6">
          {step === 0 ? (
            <AddressStep
              heading="Where do we collect it?"
              nameLabel="Sender"
              value={pickup}
              onChange={setPickup}
              person={sender}
              onPerson={setSender}
              onDetect={() => detectInto(setPickup)}
              detecting={locating}
              detectError={detectError}
            />
          ) : step === 1 ? (
            <AddressStep
              heading="Where is it going?"
              nameLabel="Receiver"
              value={drop}
              onChange={setDrop}
              person={receiver}
              onPerson={setReceiver}
              onDetect={() => detectInto(setDrop)}
              detecting={locating}
              detectError={detectError}
            />
          ) : step === 2 ? (
            <div className="space-y-5">
              <h1 className="sg-display text-[26px] text-sg-ink">What are we carrying?</h1>
              <Card className="space-y-4 p-4">
                <Field label="Package type">
                  {/* An empty grid here is a dead end: no type can be picked,
                      so Continue never enables and nothing says why. */}
                  {!config ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className="h-[46px] animate-pulse rounded-[var(--sg-r)] bg-sg-surface-2"
                        />
                      ))}
                    </div>
                  ) : !(config.packageTypes || []).length ? (
                    <div className="rounded-[var(--sg-r)] border border-dashed border-sg-line px-4 py-4 text-center">
                      <p className="text-[13px] text-sg-ink-2">
                        We couldn't load the package options.
                      </p>
                      <button
                        type="button"
                        onClick={loadConfig}
                        className="sg-label mt-2 text-sg-accent underline underline-offset-4"
                      >
                        Try again
                      </button>
                    </div>
                  ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {(config?.packageTypes || []).map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setPkg({ ...pkg, packageType: type.value })}
                        className={cn(
                          "rounded-[var(--sg-r)] border px-2 py-3 text-[12px] font-semibold transition",
                          pkg.packageType === type.value
                            ? "border-sg-accent bg-sg-accent-soft text-sg-ink"
                            : "border-sg-line bg-sg-surface-2 text-sg-ink-2",
                        )}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                  )}
                </Field>

                <Field
                  label="Weight (kg)"
                  hint={
                    Number.isFinite(config?.maxWeightKg)
                      ? `Up to ${config.maxWeightKg} kg on this service.`
                      : undefined
                  }
                >
                  <input
                    inputMode="decimal"
                    value={pkg.weightKg}
                    onChange={(e) =>
                      setPkg({ ...pkg, weightKg: e.target.value.replace(/[^\d.]/g, "") })
                    }
                    placeholder="0.5"
                    className={inputClass}
                  />
                </Field>

                <Field label="Description">
                  <input
                    value={pkg.description}
                    onChange={(e) => setPkg({ ...pkg, description: e.target.value })}
                    maxLength={DESCRIPTION_MAX}
                    placeholder={config?.packageDescriptionPlaceholder || "What's inside?"}
                    className={inputClass}
                  />
                </Field>
              </Card>

              <Card className="flex items-start gap-3 p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sg-accent" />
                <div>
                  <p className="text-[13px] font-semibold text-sg-ink">
                    Verified at the doorstep
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-sg-ink-2">
                    We text {receiver.name || "your receiver"} a code. The rider checks
                    their name and number too before handing it over.
                  </p>
                </div>
              </Card>

              <label className="flex cursor-pointer items-start gap-3 px-1">
                <input
                  type="checkbox"
                  checked={receiver.allowAlternate}
                  onChange={(e) =>
                    setReceiver({ ...receiver, allowAlternate: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 rounded accent-[var(--sg-accent)]"
                />
                <span className="text-[13px] leading-snug text-sg-ink-2">
                  Anyone at the address can collect it
                </span>
              </label>
            </div>
          ) : (
            <div className="space-y-5">
              <h1 className="sg-display text-[26px] text-sg-ink">How would you like to pay?</h1>

              <Card className="p-4">
                {quoting ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-sg-ink-3" />
                  </div>
                ) : quote ? (
                  <div className="space-y-2.5">
                    {[
                      ["Base fare", quote.fareBreakdown?.baseFare],
                      [`Distance · ${quote.distanceKm} km`, quote.fareBreakdown?.distanceFare],
                      ["Weight", quote.fareBreakdown?.weightFare],
                      ["Express", quote.fareBreakdown?.expressCharge],
                    ]
                      .filter(([, v]) => Number(v) > 0)
                      .map(([label, value]) => (
                        <div key={label} className="flex justify-between text-[13px]">
                          <span className="text-sg-ink-2">{label}</span>
                          <Data className="text-sg-ink">₹{Number(value).toFixed(2)}</Data>
                        </div>
                      ))}
                    <div className="sg-perforation my-2" />
                    <div className="flex items-baseline justify-between">
                      <span className="sg-label text-sg-ink">Total</span>
                      <Data className="text-[22px] font-bold text-sg-ink">
                        ₹{Number(quote.fare).toFixed(2)}
                      </Data>
                    </div>
                    <p className="text-[12px] text-sg-ink-3">
                      Arriving in about {quote.etaMinutes} minutes
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 py-3 text-center">
                    <p className="text-[13px] text-sg-ink-2">
                      {quoteError?.message ||
                        "We couldn't price this trip. Check the addresses and try again."}
                    </p>
                    {quoteError?.code === "OUT_OF_ZONE" && (
                      <button
                        type="button"
                        onClick={() => setStep(0)}
                        className="rounded-[var(--sg-r)] border border-sg-line bg-sg-surface px-4 py-2 text-[12px] font-semibold text-sg-ink"
                      >
                        Change pickup location
                      </button>
                    )}
                  </div>
                )}
              </Card>

              <div className="grid grid-cols-3 gap-2">
                {["UPI", "CARD", "COD"].map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPayment(method)}
                    className={cn(
                      "rounded-[var(--sg-r)] border px-2 py-3.5 text-[12px] font-semibold transition",
                      payment === method
                        ? "border-sg-accent bg-sg-accent-soft text-sg-ink"
                        : "border-sg-line bg-sg-surface text-sg-ink-2",
                    )}
                  >
                    {method === "COD" ? "Cash" : method}
                  </button>
                ))}
              </div>
              {payment === "COD" ? (
                <p className="px-1 text-[12px] text-sg-ink-2">
                  The rider collects the fare from you at pickup.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ---- sticky action ---- */}
      {/* Sits above everything on the page and clears the home indicator on
          phones that have one. The floating nav is hidden for this flow, so
          nothing competes for the bottom edge. */}
      <div
        className="fixed inset-x-0 bottom-0 z-[600] border-t border-sg-line bg-sg-surface px-5 pt-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
      >
        <div className="mx-auto w-full max-w-lg">
          {step < 3 ? (
            <>
              {/* A disabled Continue with no explanation is a dead end;
                  name and phone rules are the usual reason it is off. */}
              {stepProblem && (pickup.lat || step > 0) ? (
                <p className="mb-2 text-center text-[12px] font-semibold text-amber-700">
                  {stepProblem}
                </p>
              ) : null}
            <PrimaryButton
              icon={ArrowRight}
              disabled={!canContinue}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </PrimaryButton>
            </>
          ) : (
            <PrimaryButton disabled={!quote || !payment || placing} onClick={place}>
              {placing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IndianRupee className="h-4 w-4" />
              )}
              {placing
                ? "Booking…"
                : !payment
                  ? "Select a payment method"
                  : `Pay ₹${quote ? Number(quote.fare).toFixed(0) : "0"}`}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default CityParcelBooking;
