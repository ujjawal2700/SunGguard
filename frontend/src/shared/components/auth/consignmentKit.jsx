import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useSpring, useTransform, useMotionTemplate } from 'motion/react';
import { animate, createTimeline, stagger, utils } from 'animejs';
import { cn } from '@/lib/utils';
import {
    ALERT,
    COUNTER,
    DUR,
    EASE,
    INK,
    LIFT_HIGH,
    MONO,
    RULE_LIGHT,
    SPRING,
    STILL,
    dashedRule,
} from '@shared/design/tokens';

/**
 * Consignment-note vocabulary for every sign-in surface in the app.
 *
 * The booking flow already treats a parcel as a waybill you fill in
 * (modules/customer/components/parcel/waybillKit). Authentication is the same
 * artifact one step earlier: the note you fill in to open an account, where the
 * consignee is you. Everything here is the auth-side half of that language.
 *
 * Motion is split by job, deliberately:
 *   - anime.js drives imperative, event-fired moments — a digit landing in the
 *     consignment number, a code box taking ink, a stamp hitting paper.
 *   - motion.dev drives declarative state — panes, layout, presence.
 *
 * Both respect prefers-reduced-motion. See design.md for the full rationale.
 */

/* ── Glyph ───────────────────────────────────────────────────────────────────
   The same carton the waybill kit uses, so the two surfaces read as one hand. */

export const ParcelGlyph = ({ size = 17, className }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        aria-hidden
    >
        <path
            d="M3.5 7.6 12 3l8.5 4.6v8.8L12 21l-8.5-4.6V7.6Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
        />
        <path d="M3.7 7.7 12 12l8.3-4.3M12 12v8.7" stroke="#fff" strokeWidth="1.4" strokeOpacity=".55" />
    </svg>
);

/* ── Captions ────────────────────────────────────────────────────────────── */

/** Field caption. Mono, uppercase, wide-tracked — the printed-form voice. */
export const Caption = ({ children, tone = 'ink', className }) => (
    <span
        className={cn(
            'block text-[10px] uppercase tracking-[0.18em] leading-none',
            tone === 'ink' && 'text-slate-500',
            tone === 'paper' && 'text-white/45',
            tone === 'brand' && 'text-[color:var(--primary)]',
            tone === 'alert' && 'text-[#B45309]',
            className,
        )}
        style={{ fontFamily: MONO }}
    >
        {children}
    </span>
);

/* ── Ground ──────────────────────────────────────────────────────────────────
   The counter the note is filled out on. Deliberately quiet: a dot grid at low
   contrast and nothing else, so the note is the only thing with presence.    */

export const DepotGround = ({ children }) => (
    <div
        className="relative min-h-[100dvh] w-full overflow-hidden flex items-center justify-center px-4 py-8"
        style={{ background: COUNTER }}
    >
        <div
            className="pointer-events-none absolute inset-0"
            style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, rgba(15,23,42,0.055) 1px, transparent 0)`,
                backgroundSize: '22px 22px',
            }}
            aria-hidden
        />
        {/* A single dashed route across the counter, well below the note. */}
        <div
            className="pointer-events-none absolute left-0 right-0 top-[18%] h-px opacity-60"
            style={{ backgroundImage: dashedRule('rgba(15,23,42,0.10)', 6, 8) }}
            aria-hidden
        />
        <div
            className="pointer-events-none absolute left-0 right-0 bottom-[16%] h-px opacity-60"
            style={{ backgroundImage: dashedRule('rgba(15,23,42,0.10)', 6, 8) }}
            aria-hidden
        />
        {children}
    </div>
);

/* ── The note ────────────────────────────────────────────────────────────── */

/** The docket itself: arrives on the counter, then holds still. */
export const ConsignmentNote = ({ children, className }) => {
    const reduce = useReducedMotion();

    return (
        <motion.div
            initial={reduce ? false : { opacity: 0, y: 22, rotate: -0.6 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={reduce ? STILL : SPRING.note}
            className={cn(
                'relative z-10 w-full max-w-[400px] overflow-hidden rounded-[28px] bg-white',
                className,
            )}
            style={{ boxShadow: LIFT_HIGH }}
        >
            {children}
        </motion.div>
    );
};

/* ── Stub ────────────────────────────────────────────────────────────────────
   The carrier's copy: dark stock, carrier mark, and the consignment number
   that assembles itself as the form is answered.                            */

export const NoteStub = ({ carrier, logoUrl, children }) => {
    // A configured logo can still fail to load — a dead CDN, a rotated URL, an
    // offline device. The carrier mark falls back to the carton rather than
    // leaving the browser's broken-image glyph in the stub. Recording *which*
    // URL failed, rather than a flag, means a new logoUrl retries on its own.
    const [brokenUrl, setBrokenUrl] = useState(null);
    const showLogo = Boolean(logoUrl) && brokenUrl !== logoUrl;

    return (
    <div className="relative px-6 pt-6 pb-1" style={{ background: INK }}>
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid place-items-center h-9 w-9 shrink-0 rounded-xl bg-white/10 border border-white/15 text-white overflow-hidden">
                    {showLogo ? (
                        <img
                            src={logoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={() => setBrokenUrl(logoUrl)}
                        />
                    ) : (
                        <ParcelGlyph size={19} />
                    )}
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-[15px] font-extrabold tracking-tight text-white leading-none">
                        {carrier}
                    </span>
                    <Caption tone="paper" className="mt-1.5">
                        Consignment note
                    </Caption>
                </span>
            </div>
        </div>
        {children}
    </div>
    );
};

/* ── Consignment number ──────────────────────────────────────────────────────
   The signature element. Not decoration: it is the account's docket number,
   derived from the number being typed, so the field you are filling in shows
   up immediately in the carrier's own format. Each digit rolls into its slot
   as you type it (anime.js — the animation is fired by a keystroke, not by a
   state transition, which is exactly what an imperative timeline is for).   */

const SLOT_COUNT = 10;

export const ConsignmentNumber = ({ digits = '', settled = false }) => {
    const reduce = useReducedMotion();
    const slots = useRef([]);
    const previous = useRef('');

    useEffect(() => {
        const next = digits.slice(0, SLOT_COUNT).padEnd(SLOT_COUNT, '·');
        const before = previous.current.slice(0, SLOT_COUNT).padEnd(SLOT_COUNT, '·');
        previous.current = digits;

        next.split('').forEach((char, index) => {
            const node = slots.current[index];
            if (!node || char === before[index]) return;

            if (reduce || char === '·') {
                node.textContent = char;
                utils.set(node, { opacity: char === '·' ? 0.35 : 1, scale: 1 });
                return;
            }

            // Roll through digits, then land on the real one.
            const roller = { t: 0 };
            animate(roller, {
                t: 1,
                duration: DUR.quick,
                ease: EASE.out,
                onUpdate: () => {
                    node.textContent =
                        roller.t < 0.7 ? String(Math.floor(Math.random() * 10)) : char;
                },
                onComplete: () => {
                    node.textContent = char;
                },
            });
            animate(node, {
                scale: [1.45, 1],
                opacity: [0.4, 1],
                duration: DUR.base,
                ease: EASE.back,
            });
        });
    }, [digits, reduce]);

    // The whole number gets a quiet confirmation pass once the code verifies.
    useEffect(() => {
        if (!settled || reduce) return;
        animate(slots.current.filter(Boolean), {
            color: ['#FFFFFF', 'var(--primary)'],
            duration: DUR.base,
            delay: stagger(18),
            ease: EASE.out,
        });
    }, [settled, reduce]);

    return (
        <div className="mt-5 flex items-baseline gap-[3px]" aria-hidden>
            <span className="text-[13px] font-bold text-white/35 tracking-[0.1em]" style={{ fontFamily: MONO }}>
                SG
            </span>
            <span className="mx-1 text-[13px] text-white/20" style={{ fontFamily: MONO }}>
                ·
            </span>
            {Array.from({ length: SLOT_COUNT }).map((_, index) => (
                <span
                    key={index}
                    ref={(node) => {
                        slots.current[index] = node;
                    }}
                    className="inline-block text-[13px] font-bold text-white tabular-nums"
                    style={{ fontFamily: MONO, opacity: 0.35, willChange: 'transform' }}
                >
                    ·
                </span>
            ))}
        </div>
    );
};

/* ── Route leader ────────────────────────────────────────────────────────────
   A scaled-down cousin of the booking flow's RouteRail: the parcel advances
   along the dashed route as the note is completed, so progress is expressed in
   the product's own terms rather than as a progress bar.                    */

export const RouteLeader = ({ progress = 0, from = 'Your number', to = 'Verified' }) => {
    const reduce = useReducedMotion();
    const t = useSpring(
        progress,
        reduce
            ? { stiffness: 1000, damping: 100, mass: 0.1 }
            : { stiffness: 260, damping: 30, mass: 0.9 },
    );

    useEffect(() => {
        t.set(progress);
    }, [t, progress]);

    const leftPct = useTransform(t, (v) => 4 + 92 * v);
    const left = useMotionTemplate`${leftPct}%`;
    const fillPct = useTransform(t, (v) => 92 * v);
    const width = useMotionTemplate`${fillPct}%`;

    return (
        <div className="mt-4 pb-5">
            <div className="relative h-[26px]">
                <div
                    className="absolute top-1/2 left-[4%] right-[4%] h-px -translate-y-1/2"
                    style={{ backgroundImage: dashedRule(RULE_LIGHT, 4, 5) }}
                    aria-hidden
                />
                <motion.div
                    className="absolute top-1/2 left-[4%] h-[2px] -translate-y-1/2 rounded-full"
                    style={{ width, background: 'var(--primary)' }}
                    aria-hidden
                />
                <motion.span
                    className="absolute top-1/2 z-[2] grid place-items-center h-[22px] w-[22px] rounded-full text-[color:var(--primary)]"
                    style={{ left, x: '-50%', y: '-50%', background: INK }}
                    aria-hidden
                >
                    <ParcelGlyph size={15} />
                </motion.span>
            </div>
            <div className="mt-1 flex items-center justify-between">
                <Caption tone="paper">{from}</Caption>
                <Caption tone="paper">{to}</Caption>
            </div>
        </div>
    );
};

/* ── Tear edge ───────────────────────────────────────────────────────────────
   Where the carrier's copy separates from the sender's. The punches show the
   counter through the paper.                                                */

export const TearEdge = ({ above = INK, below = '#FFFFFF', ground = COUNTER }) => (
    <div className="relative h-4" aria-hidden>
        <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: above }} />
        <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: below }} />
        <div
            className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2"
            style={{ backgroundImage: dashedRule('rgba(148,163,184,0.55)', 5, 6) }}
        />
        <div
            className="absolute left-0 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: ground }}
        />
        <div
            className="absolute right-0 top-1/2 h-4 w-4 translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: ground }}
        />
    </div>
);

/* ── Switch ──────────────────────────────────────────────────────────────────
   Two ways to file the note. The selected pill travels with motion.dev's
   layoutId, matching the segmented control in the booking flow.             */

export const NoteSwitch = ({ options, value, onChange, name = 'note-switch' }) => {
    const reduce = useReducedMotion();

    return (
        <div
            role="radiogroup"
            className="relative grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1"
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            'relative rounded-xl py-2.5 text-[11px] uppercase tracking-[0.16em] font-bold transition-colors duration-200',
                            'outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2',
                            selected ? 'text-[color:var(--primary)]' : 'text-slate-400 hover:text-slate-600',
                        )}
                        style={{ fontFamily: MONO }}
                    >
                        {selected && (
                            <motion.span
                                layoutId={`${name}-pill`}
                                className="absolute inset-0 rounded-xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_12px_-6px_rgba(15,23,42,0.25)]"
                                transition={reduce ? STILL : SPRING.pill}
                            />
                        )}
                        <span className="relative">{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
};

/* ── Fields ──────────────────────────────────────────────────────────────── */

export const NoteField = ({ label, hint, filled, error, children, className }) => (
    <div className={cn('space-y-2', className)}>
        <Caption tone={error ? 'alert' : filled ? 'brand' : 'ink'}>{label}</Caption>
        {children}
        {hint && !error && (
            <p className="text-[11px] leading-snug text-slate-400 font-medium">{hint}</p>
        )}
        {error && (
            <p className="text-[11px] leading-snug font-semibold" style={{ color: ALERT }}>
                {error}
            </p>
        )}
    </div>
);

/** Shared input chrome, so every control on the note reads as one stock. */
export const noteInput = (filled, error) =>
    cn(
        'w-full rounded-2xl border px-3.5 py-3 text-[15px] text-slate-900 outline-none',
        'transition-colors duration-200 placeholder:text-slate-400 placeholder:font-normal',
        'focus:border-[color:var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/15',
        error
            ? 'border-[#B45309] bg-[#FFFBEB]'
            : filled
              ? 'border-slate-200 bg-[color-mix(in_srgb,var(--primary)_5%,white)]'
              : 'border-slate-200 bg-white',
    );

/* ── Delivery code ───────────────────────────────────────────────────────────
   The four digits a rider asks for at the door. Each box takes ink the moment
   it is answered, and a rejected code shakes the row and goes amber — the same
   amber the booking flow uses for an over-weight parcel.                    */

export const DeliveryCode = ({
    value,
    onChange,
    length = 4,
    error = false,
    disabled = false,
    autoFocus = true,
}) => {
    const reduce = useReducedMotion();
    const boxes = useRef([]);
    const row = useRef(null);
    const field = useRef(null);
    const previous = useRef('');
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (autoFocus) field.current?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Ink press on the box that just took a digit. */
    useEffect(() => {
        const before = previous.current;
        previous.current = value;
        if (reduce) return;

        for (let i = 0; i < length; i += 1) {
            const filledNow = Boolean(value[i]);
            const filledBefore = Boolean(before[i]);
            const node = boxes.current[i];
            if (!node || !filledNow || filledBefore) continue;

            createTimeline({ defaults: { ease: EASE.out } })
                .add(node, { scale: [1, 1.12], duration: DUR.tap })
                .add(node, { scale: 1, duration: DUR.base, ease: EASE.back }, `-=${DUR.tap / 2}`);
        }
    }, [value, length, reduce]);

    /* A rejected code is refused, not apologised for. */
    useEffect(() => {
        if (!error || reduce || !row.current) return;
        animate(row.current, {
            x: [{ to: -9 }, { to: 8 }, { to: -6 }, { to: 4 }, { to: 0 }],
            duration: 440,
            ease: EASE.inOut,
        });
    }, [error, reduce]);

    /* One real input holds the whole code; the boxes are presentation. A code
       is a contiguous string, so modelling it as four independent fields only
       invents gaps that have to be collapsed again — and costs native paste,
       one-time-code autofill, and the caret. */

    const active = Math.min(value.length, length - 1);

    const handleChange = (event) => {
        onChange(event.target.value.replace(/\D/g, '').slice(0, length));
    };

    return (
        <div ref={row} className="relative" style={{ willChange: 'transform' }}>
            <input
                ref={field}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label={`Delivery code, ${length} digits`}
                aria-invalid={error || undefined}
                maxLength={length}
                disabled={disabled}
                value={value}
                onChange={handleChange}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                className="absolute inset-0 z-10 h-full w-full cursor-pointer bg-transparent text-transparent caret-transparent outline-none disabled:cursor-not-allowed"
                style={{ fontFamily: MONO }}
            />
            <div className="flex gap-2" aria-hidden>
                {Array.from({ length }).map((_, index) => {
                    const char = value[index] || '';
                    const isActive = focused && index === active && !disabled;
                    return (
                        <span
                            key={index}
                            ref={(node) => {
                                boxes.current[index] = node;
                            }}
                            className={cn(
                                'grid h-12 flex-1 place-items-center rounded-xl border-2 text-[20px] font-bold tabular-nums',
                                'transition-colors duration-200',
                                disabled && 'opacity-60',
                                error
                                    ? 'border-[#B45309] bg-[#FFFBEB] text-[#B45309]'
                                    : char
                                      ? 'border-[color:var(--primary)] bg-[color-mix(in_srgb,var(--primary)_6%,white)] text-slate-900'
                                      : 'border-slate-200 bg-white text-slate-900',
                                isActive &&
                                    !error &&
                                    'border-[color:var(--primary)] ring-2 ring-[color:var(--primary)]/15',
                            )}
                            style={{ fontFamily: MONO, willChange: 'transform' }}
                        >
                            {char || (isActive ? <CaretTick /> : null)}
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

/** Stands in for the caret in the box that is next to be answered. */
const CaretTick = () => (
    <span className="h-7 w-px animate-pulse bg-[color:var(--primary)]" aria-hidden />
);

/* ── Action ──────────────────────────────────────────────────────────────────
   One button, one job, named for what it does. While it is working the label
   is replaced by a travelling dash — the note is in transit.                */

export const NoteAction = ({ children, busy = false, disabled = false, ...props }) => {
    const reduce = useReducedMotion();
    const ref = useRef(null);

    const press = () => {
        if (reduce || !ref.current || busy || disabled) return;
        createTimeline({ defaults: { ease: EASE.out } })
            .add(ref.current, { scale: 0.975, duration: DUR.tap })
            .add(ref.current, { scale: 1, duration: DUR.base, ease: EASE.back });
    };

    return (
        <button
            ref={ref}
            onPointerDown={press}
            disabled={busy || disabled}
            className={cn(
                'relative w-full overflow-hidden rounded-2xl py-4 text-[12px] uppercase tracking-[0.22em] font-bold text-white',
                'outline-none transition-opacity duration-200',
                'focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2',
                'disabled:opacity-60',
            )}
            style={{ background: 'var(--primary)', fontFamily: MONO, willChange: 'transform' }}
            {...props}
        >
            <span className={cn('relative transition-opacity', busy && 'opacity-0')}>{children}</span>
            {busy && (
                <span className="absolute inset-0 grid place-items-center" aria-live="polite">
                    <span className="sr-only">Working</span>
                    <span
                        className="h-px w-16 animate-pulse"
                        style={{ backgroundImage: dashedRule('rgba(255,255,255,0.9)', 5, 5) }}
                        aria-hidden
                    />
                </span>
            )}
        </button>
    );
};

/* ── Stamp ───────────────────────────────────────────────────────────────────
   Lands once, rotated, with an ink ring spreading from the impact.          */

export const AcceptedStamp = ({ children = 'Accepted', tone = 'var(--primary)' }) => {
    const reduce = useReducedMotion();
    const ring = useRef(null);

    useEffect(() => {
        if (reduce || !ring.current) return;
        animate(ring.current, {
            scale: [0.6, 2.1],
            opacity: [{ to: 0.45, duration: 60 }, { to: 0, duration: DUR.stamp }],
            ease: EASE.out,
        });
    }, [reduce]);

    return (
        <span className="relative inline-grid place-items-center">
            <span
                ref={ring}
                className="pointer-events-none absolute h-10 w-24 rounded-full"
                style={{ border: `2px solid ${tone}`, opacity: 0, willChange: 'transform' }}
                aria-hidden
            />
            <motion.span
                initial={reduce ? false : { scale: 2.4, opacity: 0, rotate: -24 }}
                animate={{ scale: 1, opacity: 0.92, rotate: -7 }}
                transition={reduce ? STILL : SPRING.stamp}
                className="inline-block rounded-md border-2 px-3 py-1 text-[11px] uppercase tracking-[0.2em] font-bold"
                style={{ fontFamily: MONO, color: tone, borderColor: tone }}
            >
                {children}
            </motion.span>
        </span>
    );
};

/* ── Panes ───────────────────────────────────────────────────────────────────
   Steps slide along the direction of travel, so going back visibly reverses. */

export const NotePane = ({ paneKey, direction = 1, children }) => {
    const reduce = useReducedMotion();
    const shift = reduce ? 0 : 28 * direction;

    return (
        <motion.div
            key={paneKey}
            initial={{ opacity: 0, x: shift }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -shift, position: 'absolute' }}
            transition={reduce ? STILL : SPRING.pane}
            className="w-full"
        >
            {children}
        </motion.div>
    );
};

/** Staggers a pane's fields in, so it assembles rather than appears. */
export const stackIn = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export const stackItem = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } },
};

/* ── Legal ───────────────────────────────────────────────────────────────── */

export const NoteFooter = ({ onTerms, onPrivacy }) => (
    <div className="flex flex-col items-center gap-2 pt-1">
        <Caption>Filing this note accepts</Caption>
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={onTerms}
                className="text-[10px] uppercase tracking-[0.16em] font-bold text-[color:var(--primary)] underline underline-offset-4 decoration-slate-200 rounded outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]"
                style={{ fontFamily: MONO }}
            >
                Terms
            </button>
            <span className="text-[9px] text-slate-300">·</span>
            <button
                type="button"
                onClick={onPrivacy}
                className="text-[10px] uppercase tracking-[0.16em] font-bold text-[color:var(--primary)] underline underline-offset-4 decoration-slate-200 rounded outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]"
                style={{ fontFamily: MONO }}
            >
                Privacy
            </button>
        </div>
    </div>
);
