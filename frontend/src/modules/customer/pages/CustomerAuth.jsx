import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@core/context/AuthContext';
import { useSettings } from '@core/context/SettingsContext';
import { customerApi } from '../services/customerApi';
import {
    AcceptedStamp,
    Caption,
    ConsignmentNote,
    ConsignmentNumber,
    DeliveryCode,
    DepotGround,
    InkBarcode,
    NoteAction,
    NoteField,
    NoteFooter,
    NotePane,
    NoteStub,
    NoteSwitch,
    RouteLeader,
    TearEdge,
    noteInput,
    stackIn,
    stackItem,
} from '@shared/components/auth/consignmentKit';
import { MONO, STILL } from '@shared/design/tokens';

/**
 * Customer sign-in, filed as a consignment note.
 *
 * The booking flow treats a parcel as a waybill you fill in; this is the same
 * artifact one step earlier — the note that opens the account, where the
 * consignee is you. The docket number in the stub is built from the number
 * being typed, so the field being answered is visible in the carrier's own
 * format before anything is submitted.
 */

const PHONE_LENGTH = 10;
const CODE_LENGTH = 4;
const RESEND_SECONDS = 30;

const MODES = [
    { value: 'login', label: 'Sign in' },
    { value: 'signup', label: 'Open account' },
];

const formatPhone = (digits) =>
    digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;

const CustomerAuth = () => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const { settings } = useSettings();
    const reduce = useReducedMotion();

    const carrier = settings?.appName || 'SunGguard';
    const logoUrl = settings?.logoUrl || '';

    const [mode, setMode] = useState('login');
    const [step, setStep] = useState('identity'); // 'identity' | 'code'
    const [busy, setBusy] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [timer, setTimer] = useState(0);
    const [codeError, setCodeError] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');

    const isLogin = mode === 'login';
    const phoneReady = phone.length === PHONE_LENGTH;
    const nameReady = isLogin || name.trim().length > 1;
    const identityReady = phoneReady && nameReady;

    /* Resend countdown. */
    useEffect(() => {
        if (timer <= 0) return undefined;
        const id = setInterval(() => setTimer((t) => Math.max(0, t - 1)), 1000);
        return () => clearInterval(id);
    }, [timer]);

    /* How far along the route this note is — drives the rail and the barcode. */
    const progress = useMemo(() => {
        if (accepted) return 1;
        const phoneRatio = Math.min(phone.length / PHONE_LENGTH, 1);
        const identity = isLogin
            ? phoneRatio
            : (name.trim() ? 0.35 : 0) + phoneRatio * 0.65;
        if (step === 'code') return 0.62 + 0.38 * (code.length / CODE_LENGTH);
        return 0.62 * identity;
    }, [accepted, phone, name, isLogin, step, code]);

    const switchMode = (next) => {
        if (next === mode) return;
        setMode(next);
        setCodeError('');
    };

    const sendCode = async (event) => {
        event?.preventDefault();
        if (!phoneReady) {
            toast.error(`Enter all ${PHONE_LENGTH} digits of your mobile number`);
            return;
        }
        if (!nameReady) {
            toast.error('Enter the sender name');
            return;
        }

        setBusy(true);
        try {
            if (isLogin) {
                await customerApi.sendLoginOtp({ phone });
            } else {
                await customerApi.sendSignupOtp({ name: name.trim(), phone });
            }
            setCode('');
            setCodeError('');
            setStep('code');
            setTimer(RESEND_SECONDS);
            toast.success(`Code sent to +91 ${formatPhone(phone)}`);
        } catch (error) {
            toast.error(error?.response?.data?.message || "Couldn't send the code. Try again.");
        } finally {
            setBusy(false);
        }
    };

    const verifyCode = async (event) => {
        event?.preventDefault();
        if (code.length !== CODE_LENGTH) {
            setCodeError(`Enter all ${CODE_LENGTH} digits.`);
            return;
        }

        setBusy(true);
        setCodeError('');
        try {
            const response = await customerApi.verifyOtp({ phone, otp: code });
            const { token, customer } = response.data.result;
            setAccepted(true);
            login({ ...customer, token, role: 'customer' });
            toast.success(isLogin ? 'Signed in' : 'Account opened');
            // Let the stamp land before the route changes.
            setTimeout(() => navigate('/'), reduce ? 0 : 620);
        } catch (error) {
            setCode('');
            setCodeError(
                error?.response?.data?.message ||
                    "That code didn't match. Check the 4 digits and try again.",
            );
            setBusy(false);
        }
    };

    const goBack = () => {
        setStep('identity');
        setCode('');
        setCodeError('');
    };

    return (
        <DepotGround>
            <ConsignmentNote>
                {/* ── Carrier's copy ───────────────────────────────────────── */}
                <NoteStub carrier={carrier} logoUrl={logoUrl}>
                    <ConsignmentNumber digits={phone} settled={accepted} />
                    <RouteLeader
                        progress={progress}
                        from={isLogin ? 'Your number' : 'New sender'}
                        to={accepted ? 'Accepted' : 'Verified'}
                    />
                </NoteStub>

                <TearEdge />

                {/* ── Sender's copy ────────────────────────────────────────── */}
                <div className="relative px-6 pb-7 pt-5">
                    <AnimatePresence mode="wait" initial={false}>
                        {step === 'identity' ? (
                            <NotePane key="identity" paneKey="identity" direction={1}>
                                <motion.div
                                    variants={reduce ? undefined : stackIn}
                                    initial="hidden"
                                    animate="show"
                                    className="space-y-5"
                                >
                                    <motion.div variants={reduce ? undefined : stackItem}>
                                        <NoteSwitch
                                            name="customer-auth"
                                            options={MODES}
                                            value={mode}
                                            onChange={switchMode}
                                        />
                                    </motion.div>

                                    <motion.div variants={reduce ? undefined : stackItem}>
                                        <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900 leading-tight">
                                            {isLogin ? 'Sign in' : 'Open an account'}
                                        </h1>
                                        <p className="mt-1 text-[13px] leading-snug text-slate-500">
                                            {isLogin
                                                ? "We'll text a 4-digit code to the number on file."
                                                : "We'll text a 4-digit code to confirm your number."}
                                        </p>
                                    </motion.div>

                                    <form onSubmit={sendCode} className="space-y-4">
                                        <AnimatePresence initial={false}>
                                            {!isLogin && (
                                                <motion.div
                                                    key="sender-name"
                                                    initial={reduce ? false : { opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                                                    transition={reduce ? STILL : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                                                    className="overflow-hidden"
                                                >
                                                    <NoteField label="Sender name" filled={Boolean(name.trim())}>
                                                        <input
                                                            type="text"
                                                            name="name"
                                                            autoComplete="name"
                                                            placeholder="As it should appear on the label"
                                                            value={name}
                                                            onChange={(event) => setName(event.target.value)}
                                                            className={noteInput(Boolean(name.trim()))}
                                                        />
                                                    </NoteField>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        <motion.div variants={reduce ? undefined : stackItem}>
                                            <NoteField
                                                label="Contact number"
                                                filled={phoneReady}
                                                hint="Riders call this number for pickup and drop."
                                            >
                                                <div className="relative">
                                                    <span
                                                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 border-r border-slate-200 pr-2.5 text-[15px] font-bold text-slate-400"
                                                        style={{ fontFamily: MONO }}
                                                    >
                                                        +91
                                                    </span>
                                                    <input
                                                        type="tel"
                                                        name="phone"
                                                        inputMode="numeric"
                                                        autoComplete="tel-national"
                                                        maxLength={PHONE_LENGTH + 1}
                                                        placeholder="98765 43210"
                                                        value={formatPhone(phone)}
                                                        onChange={(event) =>
                                                            setPhone(
                                                                event.target.value
                                                                    .replace(/\D/g, '')
                                                                    .slice(0, PHONE_LENGTH),
                                                            )
                                                        }
                                                        className={`${noteInput(phoneReady)} pl-[68px] tabular-nums`}
                                                        style={{ fontFamily: MONO }}
                                                    />
                                                </div>
                                            </NoteField>
                                        </motion.div>

                                        <motion.div variants={reduce ? undefined : stackItem} className="pt-1">
                                            <NoteAction type="submit" busy={busy} disabled={!identityReady}>
                                                <span className="inline-flex items-center gap-2.5">
                                                    Send code
                                                    <ArrowRight size={15} strokeWidth={2.6} />
                                                </span>
                                            </NoteAction>
                                        </motion.div>
                                    </form>

                                    <motion.div variants={reduce ? undefined : stackItem}>
                                        <NoteFooter
                                            onTerms={() => navigate('/terms')}
                                            onPrivacy={() => navigate('/privacy')}
                                        />
                                    </motion.div>
                                </motion.div>
                            </NotePane>
                        ) : (
                            <NotePane key="code" paneKey="code" direction={-1}>
                                <div className="space-y-5">
                                    <div className="flex items-start gap-3">
                                        <button
                                            type="button"
                                            onClick={goBack}
                                            aria-label="Back to your number"
                                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 outline-none transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]"
                                        >
                                            <ArrowLeft size={17} />
                                        </button>
                                        <div className="min-w-0">
                                            <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900 leading-tight">
                                                Enter the code
                                            </h1>
                                            <Caption className="mt-1.5">
                                                Sent to +91 {formatPhone(phone)}
                                            </Caption>
                                        </div>
                                    </div>

                                    <form onSubmit={verifyCode} className="space-y-5">
                                        <NoteField
                                            label="Delivery code"
                                            filled={code.length === CODE_LENGTH}
                                            error={codeError}
                                        >
                                            <DeliveryCode
                                                value={code}
                                                onChange={(next) => {
                                                    setCode(next);
                                                    if (codeError) setCodeError('');
                                                }}
                                                length={CODE_LENGTH}
                                                error={Boolean(codeError)}
                                                disabled={busy || accepted}
                                            />
                                        </NoteField>

                                        <div className="min-h-[44px]">
                                            {accepted ? (
                                                <div className="grid place-items-center py-1">
                                                    <AcceptedStamp>Accepted</AcceptedStamp>
                                                </div>
                                            ) : (
                                                <NoteAction
                                                    type="submit"
                                                    busy={busy}
                                                    disabled={code.length !== CODE_LENGTH}
                                                >
                                                    <span className="inline-flex items-center gap-2.5">
                                                        Verify code
                                                        <ArrowRight size={15} strokeWidth={2.6} />
                                                    </span>
                                                </NoteAction>
                                            )}
                                        </div>

                                        {!accepted && (
                                            <div className="flex justify-center">
                                                <button
                                                    type="button"
                                                    onClick={sendCode}
                                                    disabled={timer > 0 || busy}
                                                    className="rounded text-[10px] uppercase tracking-[0.16em] font-bold text-[color:var(--primary)] outline-none underline underline-offset-4 decoration-slate-200 disabled:text-slate-300 disabled:no-underline focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]"
                                                    style={{ fontFamily: MONO }}
                                                >
                                                    {timer > 0 ? `Resend in ${timer}s` : 'Resend code'}
                                                </button>
                                            </div>
                                        )}
                                    </form>
                                </div>
                            </NotePane>
                        )}
                    </AnimatePresence>

                    {/* ── Machine-readable footer ──────────────────────────── */}
                    <div className="mt-7 border-t border-dashed border-slate-200 pt-4">
                        <InkBarcode ratio={progress} seed={phone || 'SG'} />
                        <div className="mt-2 flex items-center justify-between">
                            <Caption>{isLogin ? 'Returning sender' : 'New sender'}</Caption>
                            <Caption>{accepted ? 'Accepted' : 'Awaiting verification'}</Caption>
                        </div>
                    </div>
                </div>
            </ConsignmentNote>
        </DepotGround>
    );
};

export default CustomerAuth;
