import React, { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X, ScrollText, Shield } from 'lucide-react';
import { useSettings } from '@core/context/SettingsContext';
import {
    LEGAL_UPDATED,
    PrivacyBody,
    TermsBody,
} from '@shared/components/legal/legalContent';

/**
 * Terms and Privacy, read and accepted without leaving the sign-in screen.
 *
 * Navigating away to /terms mid-signup loses whatever has been typed, so the
 * copy comes to the note instead: a sheet over it, dismissed with the cross or
 * closed by accepting.
 *
 * @param {'terms'|'privacy'|null} kind  which document to show; null closes it
 * @param {'customer'|'delivery'} audience  which audience's CMS content to use
 */
const LegalSheet = ({ kind, onClose, onAccept, audience = 'customer' }) => {
    const reduce = useReducedMotion();
    const { settings } = useSettings();
    const appName = settings?.appName || 'App';
    const companyName = settings?.companyName || appName;

    const isTerms = kind === 'terms';
    const title = isTerms ? 'Terms & Conditions' : 'Privacy Policy';
    const Icon = isTerms ? ScrollText : Shield;

    const prefix = audience === 'delivery' ? 'delivery' : 'customer';
    const cmsContent = isTerms
        ? settings?.legalContent?.[`${prefix}Terms`] || ''
        : settings?.legalContent?.[`${prefix}PrivacyPolicy`] || '';

    /* Escape closes, and the page behind must not scroll under the sheet. */
    useEffect(() => {
        if (!kind) return undefined;
        const onKey = (event) => {
            if (event.key === 'Escape') onClose?.();
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKey);
        };
    }, [kind, onClose]);

    return (
        <AnimatePresence>
            {kind ? (
                <motion.div
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 sm:items-center sm:px-6"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="legal-sheet-title"
                    onClick={onClose}
                >
                    <motion.div
                        initial={reduce ? false : { y: 28, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={reduce ? undefined : { y: 28, opacity: 0 }}
                        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(event) => event.stopPropagation()}
                        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[80vh] sm:rounded-3xl"
                    >
                        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-primary">
                                <Icon size={20} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <h2
                                    id="legal-sheet-title"
                                    className="truncate text-[17px] font-bold text-slate-800"
                                >
                                    {title}
                                </h2>
                                <p className="text-xs font-medium text-slate-500">
                                    Last updated: {LEGAL_UPDATED}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label={`Close ${title}`}
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                            {cmsContent ? (
                                <div
                                    className="cms-content"
                                    dangerouslySetInnerHTML={{ __html: cmsContent }}
                                />
                            ) : isTerms ? (
                                <TermsBody appName={appName} companyName={companyName} />
                            ) : (
                                <PrivacyBody appName={appName} />
                            )}
                        </div>

                        <div className="border-t border-slate-100 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => onAccept?.(kind)}
                                className="w-full rounded-2xl bg-[color:var(--primary)] px-4 py-3.5 text-[14px] font-bold text-white outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2"
                            >
                                I accept
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
};

export default LegalSheet;
