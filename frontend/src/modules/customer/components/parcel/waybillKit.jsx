import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
    motion,
    AnimatePresence,
    useMotionValue,
    useMotionTemplate,
    useSpring,
    useTransform,
    useVelocity,
    useReducedMotion,
} from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared vocabulary for the parcel booking waybill.
 *
 * Shipping data is monospaced everywhere it exists in the physical world —
 * tracking numbers, weights, waybill captions — so numerals and field captions
 * use a mono stack while prose stays on the app's Outfit.
 */
export const MONO =
    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

const springy = (reduce) =>
    reduce
        ? { stiffness: 1400, damping: 90, mass: 1 }
        : { stiffness: 260, damping: 30, mass: 0.9 };

/* ── Captions ────────────────────────────────────────────────────────────── */

export const Caption = ({ children, className }) => (
    <span
        className={cn(
            'block text-[10px] uppercase tracking-[0.18em] text-slate-500',
            className,
        )}
        style={{ fontFamily: MONO }}
    >
        {children}
    </span>
);

/* ── Money ───────────────────────────────────────────────────────────────────
   Writes straight to the DOM node rather than through state, so a fare that
   settles over ~600ms doesn't re-render the page on every frame.            */

export const Money = ({ value, decimals = 2, prefix = '₹', className }) => {
    const ref = useRef(null);
    const reduce = useReducedMotion();
    const target = Number(value) || 0;

    const raw = useMotionValue(target);
    const spring = useSpring(
        raw,
        reduce ? { stiffness: 2000, damping: 100 } : { stiffness: 150, damping: 24, mass: 0.7 },
    );

    useEffect(() => {
        raw.set(target);
    }, [raw, target]);

    useLayoutEffect(() => {
        const write = (v) => {
            if (ref.current) ref.current.textContent = prefix + Number(v).toFixed(decimals);
        };
        write(spring.get());
        return spring.on('change', write);
    }, [spring, prefix, decimals]);

    return <span ref={ref} className={className} style={{ fontFamily: MONO }} />;
};

/* ── Route rail ──────────────────────────────────────────────────────────────
   The signature element. Nodes are the waybill's field groups, and the line
   between them is the shipment's own route: dashed where it hasn't happened
   yet, drawn solid as far as you've filled in. The parcel glyph rides it and
   leans into its direction of travel — the same velocity-driven motion the
   bottom nav's lens uses, so the two read as one system.                    */

const ParcelGlyph = ({ size = 17 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
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

export const RouteRail = ({ steps, current, furthest = 0, onJump }) => {
    const reduce = useReducedMotion();
    const n = steps.length;
    const startPct = 100 / (n * 2);
    const spanPct = 100 - startPct * 2;
    const target = n > 1 ? current / (n - 1) : 0;

    const raw = useMotionValue(target);
    const t = useSpring(raw, springy(reduce));
    useEffect(() => {
        raw.set(target);
    }, [raw, target]);

    const fillPct = useTransform(t, (v) => spanPct * v);
    const riderPct = useTransform(t, (v) => startPct + spanPct * v);
    const fillWidth = useMotionTemplate`${fillPct}%`;
    const riderLeft = useMotionTemplate`${riderPct}%`;

    const velocity = useVelocity(t);
    const smoothVelocity = useSpring(velocity, { stiffness: 300, damping: 40, mass: 0.3 });
    const tilt = useTransform(smoothVelocity, [-3, 0, 3], [14, 0, -14], { clamp: true });

    return (
        <div className="relative pt-1">
            {/* Route not yet travelled */}
            <div
                className="absolute top-[15px] h-px"
                style={{
                    left: `${startPct}%`,
                    right: `${startPct}%`,
                    backgroundImage:
                        'repeating-linear-gradient(to right, rgba(15,23,42,0.24) 0 4px, transparent 4px 9px)',
                }}
                aria-hidden
            />
            {/* Route completed */}
            <motion.div
                className="absolute top-[14px] h-[2px] rounded-full"
                style={{ left: `${startPct}%`, width: fillWidth, background: 'var(--primary)' }}
                aria-hidden
            />
            {/* The parcel itself */}
            <motion.div
                className="absolute top-[15px] z-[2] grid place-items-center text-[color:var(--primary)]"
                style={{ left: riderLeft, x: '-50%', y: '-50%', rotate: tilt }}
                aria-hidden
            >
                <span className="grid place-items-center h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_10px_rgba(15,23,42,0.18)]">
                    <ParcelGlyph />
                </span>
            </motion.div>

            <div className="relative flex">
                {steps.map((step, index) => {
                    const done = index < current;
                    const reachable = index <= furthest;
                    const isCurrent = index === current;

                    return (
                        <button
                            key={step.key}
                            type="button"
                            onClick={() => onJump(index)}
                            aria-current={isCurrent ? 'step' : undefined}
                            className="relative flex-1 flex flex-col items-center gap-2 pt-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2 rounded-xl"
                        >
                            <span
                                className={cn(
                                    'relative grid place-items-center h-[26px] w-[26px] rounded-full border-2 transition-colors duration-300',
                                    done && 'border-[color:var(--primary)] bg-[color:var(--primary)]',
                                    isCurrent && 'border-[color:var(--primary)] bg-white',
                                    !done && !isCurrent && 'border-slate-300 bg-white',
                                )}
                            >
                                <AnimatePresence initial={false}>
                                    {done && (
                                        <motion.span
                                            key="done"
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0, opacity: 0 }}
                                            transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                                            className="text-white"
                                        >
                                            <Check size={13} strokeWidth={3.5} />
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                                {isCurrent && !reduce && (
                                    <motion.span
                                        className="absolute inset-[-6px] rounded-full border border-[color:var(--primary)]"
                                        initial={{ opacity: 0.5, scale: 0.85 }}
                                        animate={{ opacity: 0, scale: 1.35 }}
                                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                                    />
                                )}
                            </span>
                            <span
                                className={cn(
                                    'text-[10px] uppercase tracking-[0.18em] transition-colors duration-300',
                                    isCurrent
                                        ? 'text-[color:var(--primary)] font-bold'
                                        : reachable
                                          ? 'text-slate-600'
                                          : 'text-slate-400',
                                )}
                                style={{ fontFamily: MONO }}
                            >
                                {step.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

/* ── Barcode ─────────────────────────────────────────────────────────────────
   Not decoration: the bars ink in as the waybill's fields are answered, so the
   code is only complete when the booking is.                                */

const barWidths = (seed, count) => {
    let h = 0;
    for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return Array.from({ length: count }, (_, i) => {
        h = (h * 1103515245 + 12345) & 0x7fffffff;
        return ((h >> (i % 5)) % 3) + 1;
    });
};

export const Barcode = ({ ratio = 0, seed = 'SG', bars = 44, className }) => {
    const widths = useMemo(() => barWidths(seed, bars), [seed, bars]);
    const inked = Math.round(ratio * bars);

    return (
        <div className={cn('flex items-end gap-[2px] h-6', className)} aria-hidden>
            {widths.map((w, i) => (
                <motion.span
                    key={i}
                    className="rounded-[1px] origin-bottom"
                    style={{ width: w, height: '100%' }}
                    initial={false}
                    animate={{
                        backgroundColor: i < inked ? 'rgba(15,23,42,0.88)' : 'rgba(15,23,42,0.10)',
                        scaleY: i < inked ? 1 : 0.55,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28, delay: i * 0.006 }}
                />
            ))}
        </div>
    );
};

/* ── Paper ───────────────────────────────────────────────────────────────── */

/** The tear-off edge between the waybill's header stub and its body. */
export const TearLine = ({ tone = '#F1F5F9' }) => (
    <div className="relative h-4" aria-hidden>
        <div
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full"
            style={{ background: tone }}
        />
        <div
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-4 w-4 rounded-full"
            style={{ background: tone }}
        />
        <div
            className="absolute inset-x-3 top-1/2 h-px"
            style={{
                backgroundImage:
                    'repeating-linear-gradient(to right, rgba(15,23,42,0.18) 0 5px, transparent 5px 11px)',
            }}
        />
    </div>
);

export const Sheet = ({ children, className }) => (
    <section
        className={cn(
            'rounded-[26px] bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-18px_rgba(15,23,42,0.28)]',
            className,
        )}
    >
        {children}
    </section>
);

/** Boxed waybill field: mono caption, and a quiet brand wash once answered. */
export const Field = ({ label, hint, filled = false, adornment, children, className }) => (
    <div className={cn('space-y-1.5', className)}>
        <div className="flex items-baseline justify-between gap-3">
            <Caption className={filled ? 'text-[color:var(--primary)]' : undefined}>{label}</Caption>
            {adornment}
        </div>
        {children}
        {hint && <p className="text-[11px] text-slate-400 font-medium leading-snug">{hint}</p>}
    </div>
);

/** Shared input chrome so every control on the waybill reads as one stock. */
export const inputClass = (filled) =>
    cn(
        'w-full rounded-2xl border px-3.5 py-3 text-[15px] text-slate-900 outline-none transition-colors duration-200 placeholder:text-slate-400 placeholder:font-normal',
        'focus:border-[color:var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/15',
        filled ? 'border-slate-200 bg-[color-mix(in_srgb,var(--primary)_5%,white)]' : 'border-slate-200 bg-white',
    );

/* ── Segmented control ───────────────────────────────────────────────────────
   The selected pill travels with layoutId, matching the bottom nav's lens.  */

export const Segmented = ({ name, options, value, onChange, columns = 2, className }) => {
    const reduce = useReducedMotion();

    return (
        <div
            className={cn('grid gap-2', className)}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            role="radiogroup"
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
                            'relative rounded-2xl px-3.5 py-3 text-left transition-colors duration-200',
                            'outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2',
                            selected ? 'text-[color:var(--primary)]' : 'text-slate-700 hover:bg-slate-50',
                        )}
                    >
                        {selected && (
                            <motion.span
                                layoutId={`seg-${name}`}
                                className="absolute inset-0 rounded-2xl border-2 border-[color:var(--primary)]"
                                style={{ background: 'color-mix(in srgb, var(--primary) 7%, transparent)' }}
                                transition={
                                    reduce
                                        ? { duration: 0 }
                                        : { type: 'spring', stiffness: 480, damping: 34, mass: 0.7 }
                                }
                            />
                        )}
                        {!selected && (
                            <span className="absolute inset-0 rounded-2xl border border-slate-200" />
                        )}
                        <span className="relative block text-[13px] font-bold leading-tight">
                            {option.label}
                        </span>
                        {option.helper && (
                            <span
                                className={cn(
                                    'relative block text-[10px] mt-1 leading-tight',
                                    selected ? 'text-[color:var(--primary)]/75' : 'text-slate-400',
                                )}
                                style={{ fontFamily: MONO }}
                            >
                                {option.helper}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

/* ── Weight box ──────────────────────────────────────────────────────────────
   Turns an abstract number into something physical: the carton grows with the
   parcel and goes amber the moment it exceeds what a rider will carry.      */

export const WeightBox = ({ kg, maxKg }) => {
    const reduce = useReducedMotion();
    const ratio = maxKg > 0 ? Math.min(kg / maxKg, 1.25) : 0;
    const over = kg > maxKg;
    const scale = 0.42 + Math.min(ratio, 1) * 0.58;
    const tone = over ? '#B45309' : 'var(--primary)';

    return (
        <div className="relative grid place-items-center h-[92px] w-[92px] shrink-0">
            <motion.span
                className="absolute rounded-full"
                animate={{ scale: 0.5 + Math.min(ratio, 1) * 0.5, opacity: over ? 0.18 : 0.12 }}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                style={{ height: 76, width: 76, background: tone }}
            />
            <motion.svg
                width="60"
                height="60"
                viewBox="0 0 24 24"
                fill="none"
                initial={false}
                animate={{ scale, rotate: over && !reduce ? [0, -5, 5, -3, 0] : 0 }}
                transition={{
                    scale: { type: 'spring', stiffness: 300, damping: 18, mass: 0.8 },
                    rotate: { duration: 0.45 },
                }}
                style={{ color: tone }}
                aria-hidden
            >
                <path
                    d="M3.5 7.6 12 3l8.5 4.6v8.8L12 21l-8.5-4.6V7.6Z"
                    fill="currentColor"
                    fillOpacity="0.14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                />
                <path d="M3.7 7.7 12 12l8.3-4.3M12 12v8.9" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7.7 5.3 16.3 9.9" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".5" />
            </motion.svg>
        </div>
    );
};

/* ── Receipt row ─────────────────────────────────────────────────────────────
   Leader dots, the way a printed consignment receipt sets its line items.   */

export const LeaderRow = ({ label, value, strong = false }) => (
    <div className="flex items-baseline gap-2 text-[12px]">
        <span className={cn('shrink-0', strong ? 'text-white font-semibold' : 'text-slate-400')}>
            {label}
        </span>
        <span
            className="flex-1 translate-y-[-3px] h-px"
            style={{
                backgroundImage:
                    'repeating-linear-gradient(to right, rgba(255,255,255,0.22) 0 2px, transparent 2px 6px)',
            }}
            aria-hidden
        />
        <span
            className={cn('shrink-0 tabular-nums', strong ? 'text-white font-semibold' : 'text-slate-200')}
            style={{ fontFamily: MONO }}
        >
            {value}
        </span>
    </div>
);

/* ── Stamp ───────────────────────────────────────────────────────────────── */

export const Stamp = ({ children, tone = 'var(--primary)' }) => {
    const reduce = useReducedMotion();
    return (
        <motion.span
            initial={reduce ? false : { scale: 2.6, opacity: 0, rotate: -26 }}
            animate={{ scale: 1, opacity: 1, rotate: -7 }}
            transition={{ type: 'spring', stiffness: 420, damping: 17, mass: 0.9 }}
            className="inline-block rounded-md border-2 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] font-bold"
            style={{ fontFamily: MONO, color: tone, borderColor: tone, opacity: 0.9 }}
        >
            {children}
        </motion.span>
    );
};

/* ── Step pane ───────────────────────────────────────────────────────────── */

export const StepPane = ({ paneKey, direction, children }) => {
    const reduce = useReducedMotion();
    const shift = reduce ? 0 : 26 * direction;

    return (
        <motion.div
            key={paneKey}
            initial={{ opacity: 0, x: shift }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -shift, position: 'absolute' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
            className="w-full"
        >
            {children}
        </motion.div>
    );
};

/** Staggers a step's fields in, so a pane assembles rather than appearing. */
export const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
};

export const stackItem = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } },
};
