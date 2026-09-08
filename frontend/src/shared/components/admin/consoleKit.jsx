import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { ALERT, LIFT, MONO, RULE, RULE_LIGHT, SPRING, STILL, dashedRule } from '@shared/design/tokens';

/**
 * Operations-desk vocabulary — the admin half of the consignment language.
 *
 * The customer files a note; the depot works the carrier's copies of every note
 * at once. So this kit is the same printed stationery at a different density:
 * mono captions, hairline rules, tabular figures, stamps for state. It adds the
 * pieces `consignmentKit` has no reason to carry — figures, manifests, filter
 * rails — and borrows everything else.
 *
 * See design.md §2 and §6. Structural devices must encode something true: a
 * stamp only appears on a settled state, a delta only when there is a prior
 * period to compare against.
 */

/* ── Captions ────────────────────────────────────────────────────────────────
   The 10px uppercase mono caption at 0.18em is the system's signature
   (design.md §4). Everything that labels rather than speaks wears it.        */

export const ConsoleCaption = ({ children, tone = 'muted', className }) => (
    <span
        className={cn(
            'block text-[10px] font-medium uppercase leading-none',
            tone === 'ink' && 'text-slate-900',
            tone === 'muted' && 'text-slate-500',
            tone === 'paper' && 'text-white/55',
            tone === 'brand' && 'text-[color:var(--primary)]',
            tone === 'alert' && 'text-[#B45309]',
            className,
        )}
        style={{ fontFamily: MONO, letterSpacing: '0.18em' }}
    >
        {children}
    </span>
);

/** A dashed rule — the perforation, used to separate filed sections. */
export const Rule = ({ onInk = false, className }) => (
    <div
        className={cn('h-px w-full', className)}
        style={{ backgroundImage: dashedRule(onInk ? RULE_LIGHT : RULE) }}
        aria-hidden
    />
);

/* ── Page heading ────────────────────────────────────────────────────────────
   A filed document opens with what it is, then who filed it. The eyebrow names
   the section; the rule under it is the fold.                                */

export const ConsoleHeading = ({ eyebrow, title, hint, actions }) => (
    <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                {eyebrow ? <ConsoleCaption className="mb-2">{eyebrow}</ConsoleCaption> : null}
                <h1 className="truncate text-[22px] font-extrabold tracking-[-0.02em] text-slate-900">
                    {title}
                </h1>
                {hint ? (
                    <p className="mt-1 text-[13px] font-medium text-slate-500">{hint}</p>
                ) : null}
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
        <Rule className="mt-4" />
    </header>
);

/* ── Panel ───────────────────────────────────────────────────────────────────
   Paper on the counter. A hairline plus a soft contact shadow, never a glow
   (design.md §3). `stub` prints a dark carrier's-copy header on top.         */

export const Panel = ({ stub, stubMeta, children, className, bodyClassName }) => (
    <section
        className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white', className)}
        style={{ boxShadow: LIFT }}
    >
        {stub ? (
            <div className="flex items-center justify-between gap-3 bg-slate-900 px-5 py-3.5">
                <ConsoleCaption tone="paper">{stub}</ConsoleCaption>
                {stubMeta ? (
                    <span
                        className="shrink-0 text-[11px] font-bold tabular-nums text-white/70"
                        style={{ fontFamily: MONO }}
                    >
                        {stubMeta}
                    </span>
                ) : null}
            </div>
        ) : null}
        <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
);

/* ── Figure ──────────────────────────────────────────────────────────────────
   A printed number: caption above, tabular numeral below. The delta is only
   rendered when a prior period actually exists — an arrow with nothing behind
   it is decoration, and decoration is what this system cuts.                 */

export const Figure = ({ caption, value, unit, delta, icon: Icon, onClick }) => {
    const reduce = useReducedMotion();
    const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
    const up = hasDelta && delta > 0;
    const flat = hasDelta && delta === 0;

    const body = (
        <>
            <div className="flex items-start justify-between gap-3">
                <ConsoleCaption>{caption}</ConsoleCaption>
                {Icon ? <Icon size={15} className="shrink-0 text-slate-300" aria-hidden /> : null}
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
                <span
                    className="text-[26px] font-bold leading-none tracking-[0.01em] tabular-nums text-slate-900"
                    style={{ fontFamily: MONO }}
                >
                    {value}
                </span>
                {unit ? (
                    <span className="text-[13px] font-semibold text-slate-400">{unit}</span>
                ) : null}
            </div>
            {hasDelta ? (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold">
                    <span
                        aria-hidden
                        className={cn(
                            'inline-block',
                            flat ? 'text-slate-400' : up ? 'text-[color:var(--primary)]' : 'text-[#B45309]',
                        )}
                    >
                        {flat ? '±' : up ? '▲' : '▼'}
                    </span>
                    <span
                        className={cn(
                            'tabular-nums',
                            flat ? 'text-slate-400' : up ? 'text-[color:var(--primary)]' : 'text-[#B45309]',
                        )}
                        style={{ fontFamily: MONO }}
                    >
                        {Math.abs(delta)}%
                    </span>
                    <span className="font-medium text-slate-400">vs last period</span>
                </p>
            ) : null}
        </>
    );

    const shell = cn(
        'rounded-2xl border border-slate-200 bg-white p-5 text-left transition-colors',
        onClick &&
            'cursor-pointer outline-none hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]',
    );

    if (!onClick) {
        return (
            <motion.div
                variants={reduce ? undefined : figureItem}
                className={shell}
                style={{ boxShadow: LIFT }}
            >
                {body}
            </motion.div>
        );
    }

    return (
        <motion.button
            type="button"
            onClick={onClick}
            variants={reduce ? undefined : figureItem}
            className={shell}
            style={{ boxShadow: LIFT }}
        >
            {body}
        </motion.button>
    );
};

/** Figures arrive like cards landing on a desk, not all at once. */
export const figureGroup = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05 } },
};

const figureItem = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: SPRING.note },
};

/* ── Stamp ───────────────────────────────────────────────────────────────────
   State, in the carrier's voice. Amber is for the correctable, red for genuine
   failure (design.md §3) — and every stamp carries its word, so colour is
   never the only signal (§8).                                                */

const STAMP_TONES = {
    settled: 'border-[color:var(--primary)]/35 bg-[color-mix(in_srgb,var(--primary)_8%,white)] text-[color:var(--primary)]',
    moving: 'border-slate-300 bg-slate-50 text-slate-600',
    holding: 'border-[#B45309]/35 bg-[#FFFBEB] text-[#B45309]',
    refused: 'border-red-300 bg-red-50 text-red-600',
};

export const Stamp = ({ tone = 'moving', children, className }) => (
    <span
        className={cn(
            'inline-flex items-center rounded-lg border px-2 py-1 text-[10px] font-bold uppercase leading-none',
            STAMP_TONES[tone] || STAMP_TONES.moving,
            className,
        )}
        style={{ fontFamily: MONO, letterSpacing: '0.14em' }}
    >
        {children}
    </span>
);

/* ── Leader row ──────────────────────────────────────────────────────────────
   Receipt line items: label ···· value. The dots do the aligning so the eye
   can run across a long gap without losing the line.                         */

export const LeaderRow = ({ label, value, mono = true }) => (
    <div className="flex items-baseline gap-2 py-1.5">
        <span className="shrink-0 text-[12px] font-medium text-slate-500">{label}</span>
        <span
            className="min-w-4 flex-1 translate-y-[-3px] self-center"
            style={{ backgroundImage: dashedRule(RULE, 2, 4), height: 1 }}
            aria-hidden
        />
        <span
            className={cn(
                'shrink-0 text-[13px] font-bold text-slate-900',
                mono && 'tabular-nums',
            )}
            style={mono ? { fontFamily: MONO } : undefined}
        >
            {value}
        </span>
    </div>
);

/* ── Manifest ────────────────────────────────────────────────────────────────
   The filed list. Mono headers, hairline rules, no zebra striping — a manifest
   is ruled paper, and stripes are chrome that encodes nothing.               */

export const Manifest = ({ columns, children, empty, className }) => (
    <div className={cn('w-full overflow-x-auto', className)}>
        <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
                <tr className="border-b border-slate-200">
                    {columns.map((col) => (
                        <th
                            key={col.key || col.label}
                            scope="col"
                            className={cn(
                                'whitespace-nowrap px-4 pb-3 pt-1 text-[10px] font-medium uppercase text-slate-500',
                                col.align === 'right' && 'text-right',
                            )}
                            style={{ fontFamily: MONO, letterSpacing: '0.18em' }}
                        >
                            {col.label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
        {empty}
    </div>
);

export const ManifestRow = ({ children, onClick, className }) => (
    <tr
        onClick={onClick}
        className={cn(
            'border-b border-slate-100 last:border-0',
            onClick && 'cursor-pointer transition-colors hover:bg-slate-50/80',
            className,
        )}
    >
        {children}
    </tr>
);

export const ManifestCell = ({ children, mono = false, align = 'left', className }) => (
    <td
        className={cn(
            'px-4 py-3.5 text-[13px] text-slate-700',
            align === 'right' && 'text-right',
            mono && 'tabular-nums font-semibold text-slate-900',
            className,
        )}
        style={mono ? { fontFamily: MONO } : undefined}
    >
        {children}
    </td>
);

/* ── Action ──────────────────────────────────────────────────────────────────
   Mono uppercase label at 0.22em (design.md §4). Named for what it does.     */

export const ConsoleAction = ({
    children,
    variant = 'primary',
    size = 'md',
    className,
    ...props
}) => (
    <button
        className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl font-bold uppercase outline-none transition-colors',
            'focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            size === 'sm' ? 'px-3 py-2 text-[10px]' : 'px-4 py-2.5 text-[11px]',
            variant === 'primary' && 'bg-[color:var(--primary)] text-white hover:opacity-95',
            variant === 'quiet' && 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900',
            variant === 'ink' && 'bg-slate-900 text-white hover:bg-slate-800',
            className,
        )}
        style={{ fontFamily: MONO, letterSpacing: '0.22em' }}
        {...props}
    >
        {children}
    </button>
);

/* ── Empty state ─────────────────────────────────────────────────────────────
   Says what is not here and what would put something here. Never an apology
   and never a shrug (design.md §7).                                          */

export const NothingFiled = ({ title, hint, action }) => (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <div
            className="mb-4 h-12 w-12 rounded-xl border border-dashed border-slate-300"
            aria-hidden
        />
        <p className="text-[14px] font-bold text-slate-800">{title}</p>
        {hint ? <p className="mt-1 max-w-sm text-[12px] font-medium text-slate-500">{hint}</p> : null}
        {action ? <div className="mt-5">{action}</div> : null}
    </div>
);

/* ── Chart palette ───────────────────────────────────────────────────────────
   Validated with the dataviz validator (six checks, light and dark surfaces):
   lightness band, chroma floor, CVD separation, normal-vision floor, contrast.
   Assigned in fixed order and never cycled — a ninth series folds into Other
   rather than inventing a hue.
                                                                              
   Both sets sit in the 6–8 tritan band, which is legal only alongside a
   secondary encoding, so every chart drawn with them ships a legend, direct
   labels, and a surface gap between adjacent fills.                          */

export const SERIES_LIGHT = ['#0C831F', '#1D4ED8', '#B45309', '#7E22CE', '#0891B2'];
export const SERIES_DARK = ['#16A34A', '#3B82F6', '#D97706', '#A855F7', '#0E9BB8'];

/** Recessive axis/grid ink, so the data stays the loudest thing on the panel. */
export const CHART_INK = {
    grid: '#E2E8F0',
    axis: '#94A3B8',
    label: '#64748B',
    surface: '#FFFFFF',
};

/** Shared tooltip chrome — paper, hairline, mono figures. */
export const chartTooltip = {
    contentStyle: {
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        boxShadow: LIFT,
        fontSize: 12,
        fontFamily: MONO,
        padding: '10px 12px',
    },
    labelStyle: {
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: '#64748B',
        marginBottom: 6,
    },
    cursor: { stroke: RULE, strokeWidth: 1 },
};

export { ALERT, MONO, STILL };
