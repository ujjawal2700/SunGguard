import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, User, Phone, Package,
  Loader2, IndianRupee, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@core/context/AuthContext";
import { cityParcelApi } from "../services/cityParcelApi";
import { openCityParcelCheckout } from "../utils/cityParcelRazorpay";
import LocationPicker from "../components/sunguard/LocationPicker";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import {
  Card, Label, Data, Barcode, StepTracker, Field, inputClass,
  PrimaryButton, GhostButton,
} from "../components/sunguard/kit";

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
  // Filled by the reverse lookup; kept beside the typed parts, not instead.
  formattedAddress: "",
  line: "", landmark: "", city: "", state: "",
};

/** The API wants one address string; the form collects it in readable parts. */
const composeAddress = (addr) => {
  const typed = [addr.line, addr.landmark, addr.city, addr.state]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
  // What the customer wrote wins; the geocoded string is the safety net so a
  // parcel is never sent with an address the rider cannot read.
  return typed || String(addr.formattedAddress || "").trim();
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
            onChange={(e) => onPerson({ ...person, name: e.target.value })}
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
              onPerson({ ...person, phone: e.target.value.replace(/[^\d+ ]/g, "") })
            }
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
          placeholder="Flat no, building, floor"
          className={cn(inputClass, "resize-none")}
        />
      </Field>

      <Field label="Landmark" hint="Optional, but riders find you faster with one.">
        <input
          value={value.landmark}
          onChange={(e) => onChange({ ...value, landmark: e.target.value })}
          placeholder="Near City Mall"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <input
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
            placeholder="City"
            className={inputClass}
          />
        </Field>
        <Field label="State">
          <input
            value={value.state}
            onChange={(e) => onChange({ ...value, state: e.target.value })}
            placeholder="State"
            className={inputClass}
          />
        </Field>
      </div>
    </Card>
  </div>
);

/* -------------------------------------------------------------------------- */

const CityParcelBooking = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [config, setConfig] = useState(null);
  const { detect, locating, error: detectError } = useCurrentLocation();
  const autoDetectedRef = useRef(false);
  const [pickup, setPickup] = useState(emptyAddress);
  const [drop, setDrop] = useState(emptyAddress);
  const [sender, setSender] = useState({ name: "", phone: "" });
  const [receiver, setReceiver] = useState({ name: "", phone: "", allowAlternate: false });
  const [pkg, setPkg] = useState({ packageType: "", weightKg: "", description: "" });
  const [payment, setPayment] = useState("UPI");
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    cityParcelApi
      .getBookingConfig()
      .then((res) => {
        const d = res?.data?.data || res?.data;
        setConfig(d);
        if (d?.packageTypes?.length) {
          setPkg((p) => ({ ...p, packageType: p.packageType || d.packageTypes[0].value }));
        }
      })
      .catch(() => toast.error("Couldn't load booking options"));
  }, []);

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
   * The reverse lookup fills city and state, but never overwrites what the
   * customer has already typed — someone who corrected the city should not
   * see it revert because the pin nudged.
   */
  const applyLocation = useCallback((current, found) => ({
    ...current,
    lat: found.lat,
    lng: found.lng,
    formattedAddress: found.formattedAddress || current.formattedAddress || "",
    line: current.line || found.components?.line || "",
    landmark: current.landmark || found.components?.locality || "",
    city: current.city || found.components?.city || "",
    state: current.state || found.components?.state || "",
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

  const canContinue = useMemo(() => {
    if (step === 0) return addressReady(pickup) && sender.name.trim() && sender.phone.trim();
    if (step === 1) return addressReady(drop) && receiver.name.trim() && receiver.phone.trim();
    if (step === 2) return pkg.packageType && Number(pkg.weightKg) > 0;
    return Boolean(quote);
  }, [step, pickup, drop, sender, receiver, pkg, quote]);

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
      setQuote(data?.data || data);
    } catch (err) {
      setQuote(null);
      toast.error(err?.response?.data?.message || "Couldn't price this trip");
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
        receiver: {
          name: receiver.name,
          phone: receiver.phone.replace(/\s/g, ""),
          allowAlternate: receiver.allowAlternate,
        },
        paymentMethod: payment,
      });
      const payload = data?.data || data;
      const parcel = payload?.parcel;

      if (payload?.requiresPayment) {
        // The gateway hands back a signed receipt; the server checks that
        // signature before any rider is dispatched. Nothing is confirmed
        // client-side.
        const receipt = await openCityParcelCheckout({
          razorpay: payload.razorpay,
          parcel,
          customer: { name: sender.name, phone: sender.phone, email: user?.email },
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
    <div className="min-h-screen bg-sg-bg pb-32">
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
                </Field>

                <Field
                  label="Weight (kg)"
                  hint={config ? `Up to ${config.maxWeightKg} kg on this service.` : undefined}
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
                  <p className="py-4 text-center text-[13px] text-sg-ink-2">
                    We couldn't price this trip. Check the addresses and try again.
                  </p>
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
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-sg-line bg-sg-surface px-5 pb-6 pt-4">
        <div className="mx-auto w-full max-w-lg">
          {step < 3 ? (
            <PrimaryButton
              icon={ArrowRight}
              disabled={!canContinue}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </PrimaryButton>
          ) : (
            <PrimaryButton disabled={!quote || placing} onClick={place}>
              {placing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IndianRupee className="h-4 w-4" />
              )}
              {placing ? "Booking…" : `Pay ₹${quote ? Number(quote.fare).toFixed(0) : "0"}`}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default CityParcelBooking;
