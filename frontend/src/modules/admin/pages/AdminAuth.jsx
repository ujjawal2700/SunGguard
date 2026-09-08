import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@core/context/AuthContext';
import { useSettings } from '@core/context/SettingsContext';
import { adminApi } from '../services/adminApi';
import {
    Caption,
    ConsignmentNote,
    DepotGround,
    NoteAction,
    NoteField,
    NotePane,
    NoteStub,
    NoteSwitch,
    RouteLeader,
    TearEdge,
    noteInput,
    stackIn,
    stackItem,
} from '@shared/components/auth/consignmentKit';
import { MONO } from '@shared/design/tokens';

/**
 * Admin sign-in, filed as a consignment note.
 *
 * design.md §9 listed this surface as unconverted; this is that conversion,
 * following the recipe there. The depot desk is reached through the same door
 * as everything else — the operator is filing a note too, and the note happens
 * to be their own credentials.
 */

const MODES = [
    { value: 'login', label: 'Sign in' },
    { value: 'signup', label: 'First admin' },
];

/** Mirrors the server's Joi passwordSchema in adminAuthValidation.js. */
const PASSWORD_RULES = [
    { test: (v) => v.length >= 10, label: 'At least 10 characters' },
    { test: (v) => /[a-z]/.test(v), label: 'One lowercase letter' },
    { test: (v) => /[A-Z]/.test(v), label: 'One uppercase letter' },
    { test: (v) => /[0-9]/.test(v), label: 'One number' },
];

const AdminAuth = () => {
    const navigate = useNavigate();
    const reduce = useReducedMotion();
    const { login } = useAuth();
    const { settings } = useSettings();

    const carrier = settings?.appName || 'SunGguard';
    const logoUrl = settings?.logoUrl || '';

    const [mode, setMode] = useState('login');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({ email: '', password: '', name: '' });

    const isLogin = mode === 'login';
    const password = formData.password || '';
    const unmetRules = PASSWORD_RULES.filter((rule) => !rule.test(password));

    const emailReady = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.email.trim());
    const nameReady = isLogin || formData.name.trim().length > 1;
    const passwordReady = isLogin ? password.length > 0 : unmetRules.length === 0;
    const ready = emailReady && nameReady && passwordReady;

    /* Progress is the note's completion, not a guess: each answered field is a
       real step towards a filed credential. */
    const progress = (() => {
        const parts = isLogin
            ? [emailReady, passwordReady]
            : [nameReady, emailReady, passwordReady];
        return parts.filter(Boolean).length / parts.length;
    })();

    const handleChange = (event) => {
        const { name, value } = event.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const switchMode = (next) => {
        if (next === mode) return;
        setMode(next);
        setShowPassword(false);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!ready) {
            if (!emailReady) toast.error('Enter the email on the admin account.');
            else if (!nameReady) toast.error('Enter the administrator name.');
            else toast.error(unmetRules[0]?.label || 'Check the password.');
            return;
        }

        setIsLoading(true);
        try {
            const response = isLogin
                ? await adminApi.login({ email: formData.email.trim(), password })
                : await adminApi.signup({
                      name: formData.name.trim(),
                      email: formData.email.trim(),
                      password,
                  });

            const { token, admin } = response.data.result;
            login({ ...admin, token, role: 'admin' });

            toast.success(isLogin ? 'Signed in' : 'Admin account created');
            navigate('/admin');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Authentication failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <DepotGround>
            <ConsignmentNote>
                <NoteStub carrier={carrier} logoUrl={logoUrl}>
                    <div className="mt-5">
                        <Caption tone="paper">Operations desk</Caption>
                    </div>
                    <RouteLeader progress={progress} from="Credentials" to="Admitted" />
                </NoteStub>

                <TearEdge />

                <div className="relative px-6 pb-7 pt-5">
                    <NotePane key="admin" paneKey="admin" direction={1}>
                        <motion.div
                            variants={reduce ? undefined : stackIn}
                            initial="hidden"
                            animate="show"
                            className="space-y-5"
                        >
                            <motion.div variants={reduce ? undefined : stackItem}>
                                <NoteSwitch
                                    name="admin-auth"
                                    options={MODES}
                                    value={mode}
                                    onChange={switchMode}
                                />
                            </motion.div>

                            <motion.div variants={reduce ? undefined : stackItem}>
                                <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">
                                    {isLogin ? 'Sign in' : 'First admin'}
                                </h1>
                                <p className="mt-1 text-[13px] leading-snug text-slate-500">
                                    {isLogin
                                        ? 'This desk manages parcels, partners and payouts.'
                                        : 'Only available until the first admin exists.'}
                                </p>
                            </motion.div>

                            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                                {!isLogin && (
                                    <motion.div variants={reduce ? undefined : stackItem}>
                                        <NoteField label="Administrator name" filled={nameReady}>
                                            <input
                                                type="text"
                                                name="name"
                                                autoComplete="name"
                                                placeholder="As it should appear on the desk"
                                                value={formData.name}
                                                onChange={handleChange}
                                                className={noteInput(nameReady)}
                                            />
                                        </NoteField>
                                    </motion.div>
                                )}

                                <motion.div variants={reduce ? undefined : stackItem}>
                                    <NoteField label="Email" filled={emailReady}>
                                        <input
                                            type="email"
                                            name="email"
                                            autoComplete="username"
                                            inputMode="email"
                                            placeholder="you@company.com"
                                            value={formData.email}
                                            onChange={handleChange}
                                            className={noteInput(emailReady)}
                                        />
                                    </NoteField>
                                </motion.div>

                                <motion.div variants={reduce ? undefined : stackItem}>
                                    <NoteField label="Password" filled={passwordReady}>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                name="password"
                                                autoComplete={isLogin ? 'current-password' : 'new-password'}
                                                placeholder="••••••••••"
                                                value={password}
                                                onChange={handleChange}
                                                className={`${noteInput(passwordReady)} pr-12`}
                                                style={{ fontFamily: MONO }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword((v) => !v)}
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 outline-none transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]"
                                            >
                                                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                            </button>
                                        </div>
                                    </NoteField>

                                    {/* The rules are the server's, shown while they still
                                        matter rather than as a toast after a rejection. */}
                                    {!isLogin && password.length > 0 && unmetRules.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {unmetRules.map((rule) => (
                                                <li
                                                    key={rule.label}
                                                    className="flex items-center gap-2 text-[11px] font-medium text-slate-400"
                                                >
                                                    <span
                                                        aria-hidden
                                                        className="h-1 w-1 rounded-full bg-slate-300"
                                                    />
                                                    {rule.label}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </motion.div>

                                <motion.div variants={reduce ? undefined : stackItem} className="pt-1">
                                    <NoteAction type="submit" busy={isLoading} disabled={!ready}>
                                        <span className="inline-flex items-center gap-2.5">
                                            {isLogin ? 'Sign in' : 'Create admin'}
                                            <ArrowRight size={15} strokeWidth={2.6} />
                                        </span>
                                    </NoteAction>
                                </motion.div>
                            </form>
                        </motion.div>
                    </NotePane>
                </div>
            </ConsignmentNote>
        </DepotGround>
    );
};

export default AdminAuth;
