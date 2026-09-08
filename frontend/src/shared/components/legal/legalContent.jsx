import React from 'react';

/**
 * The legal copy itself, with no page or sheet chrome around it.
 *
 * Both the standalone /terms and /privacy routes and the acceptance sheet on
 * the sign-in screen render these, so the wording cannot drift between the
 * page someone reads from the menu and the one they accept at signup.
 */

export const LEGAL_UPDATED = 'Oct 2025';

const Section = ({ title, children }) => (
    <>
        <h3 className="text-slate-800 font-bold text-base mt-6">{title}</h3>
        <p>{children}</p>
    </>
);

export const TermsBody = ({ appName = 'App', companyName = appName }) => (
    <div className="prose prose-slate prose-sm max-w-none text-slate-600 space-y-4">
        <p>
            Welcome to {appName}. By accessing or using our mobile application and
            services, you agree to be bound by these Terms and Conditions.
        </p>

        <Section title="1. Acceptance of Terms">
            By creating an account or using our services, you agree to comply with
            these terms. If you do not agree, you may not use our services.
        </Section>

        <Section title="2. Use of Service">
            You must be at least 18 years old to use our services. You agree to
            provide accurate information during registration and to keep your
            account secure.
        </Section>

        <Section title="3. Orders and Payments">
            All orders are subject to availability. Prices are subject to change
            without notice. We reserve the right to cancel orders at our discretion.
        </Section>

        <Section title="4. Intellectual Property">
            All content, trademarks, and data on this app are the property of{' '}
            {companyName} and are protected by law.
        </Section>

        <Section title="5. Termination">
            We reserve the right to end or suspend your account at any time for
            violation of these terms.
        </Section>
    </div>
);

export const PrivacyBody = ({ appName = 'App' }) => (
    <div className="prose prose-slate prose-sm max-w-none text-slate-600 space-y-4">
        <p>
            At {appName}, we take your privacy seriously. This Privacy Policy
            explains how we collect, use, and protect your personal information.
        </p>

        <Section title="1. Information We Collect">
            We collect information you provide directly, such as your name, address,
            phone number, and payment details. We also collect usage data
            automatically.
        </Section>

        <Section title="2. How We Use Information">
            We use your data to process orders, improve our services, and
            communicate with you about promotions and updates.
        </Section>

        <Section title="3. Data Security">
            We implement industry-standard security measures to protect your data.
            However, no method of transmission is 100% secure.
        </Section>

        <Section title="4. Sharing of Information">
            We do not sell your personal data. We may share data with service
            providers (e.g., delivery partners) as necessary to fulfill your orders.
        </Section>

        <Section title="5. Your Rights">
            You have the right to access, correct, or delete your personal data.
            Contact our support team for assistance.
        </Section>
    </div>
);
