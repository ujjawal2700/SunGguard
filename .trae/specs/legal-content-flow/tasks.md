# Implementation Tasks — Legal Content Flow

Derived from `spec.md`. Every task maps → ≥1 Acceptance Criterion (AC) + ≥1 local Test Requirement (TR, rule/rubric).

Dependency order: 1 → 2 → 3a / 3b (parallel OK) → 4.

---

## Task 1: Backend — Setting model + settingsController mein legalPages support

**Status**: pending
**Priority**: high
**Maps to ACs**: AC-1, AC-2, AC-3, AC-6, AC-7
**Scope files**:
- `backend/app/models/setting.js`
- `backend/app/controller/settingsController.js` (ALLOWED_KEYS, Joi schema, getPublicSettings select, updatedAt server-set)
- `backend/app/routes/settingsRoutes.js` (unchanged — reuse existing PUT /api/settings)

### Work
1. **setting.js** mein new nested field add (before tenantId ya Legal section ke baad):
   ```js
   legalPages: {
     customer: {
       privacy: { title: { type: String, default: "Privacy Policy" }, content: { type: String, default: "" }, updatedAt: Date },
       terms:   { title: { type: String, default: "Terms & Conditions" }, content: { type: String, default: "" }, updatedAt: Date },
       about:   { title: { type: String, default: "About Us" }, content: { type: String, default: "" }, updatedAt: Date },
     },
     delivery: {
       privacy: { title: { type: String, default: "Privacy Policy for Delivery Partners" }, content: { type: String, default: "" }, updatedAt: Date },
       terms:   { title: { type: String, default: "Terms & Conditions for Delivery Partners" }, content: { type: String, default: "" }, updatedAt: Date },
       about:   { title: { type: String, default: "About Us" }, content: { type: String, default: "" }, updatedAt: Date },
     },
   }
   ```
2. **settingsController.js** ALLOWED_KEYS → `"legalPages"` add.
3. Joi schema mein nested Joi object:
   - legalPages.customer.privacy/terms/about: `.object({ title: Joi.string().max(200).allow(''), content: Joi.string().max(50000).allow('') }).unknown(true)` — updatedAt ko allow bhi kar do lekin save time overwrite.
   - Same for legalPages.delivery.*
4. `getPublicSettings` select string mein `legalPages` include kar do (existing long `.select(...)` mein).
5. `updateSettings` save karne se pehle, agar payload mein `legalPages` hai to har audience+page ke `updatedAt = new Date()` server-side set kar do (flattenForMongoSet ya top-level patch).
6. Cache invalidation pehle se hai, verify karo.

### Test Requirements
- **rule TR-1a**: `node` shell mein new Setting doc banao without legalPages → defaults initialize ho jayein (title default strings, content "").
- **rule TR-1b**: PUT `/api/settings { legalPages: { customer: { privacy: { content: "test" } } } }` → save ke baad GET /settings mein legalPages.customer.privacy.content = "test" + updatedAt set ho + delivery.privacy.content unchanged rahe.
- **rule TR-1c**: Existing non-legal PUT settings save (e.g. appName update) → legalPages untouched rahe.
- **rule TR-1d**: 50,000+ character content reject kare (Joi 400).

---

## Task 2: Admin frontend — AdminSettings.jsx mein Legal Content tab + sub-tabs

**Status**: pending
**Priority**: high
**Maps to ACs**: AC-1, AC-2, AC-3, AC-6, AC-8
**Scope files**:
- `frontend/src/modules/admin/pages/AdminSettings.jsx`

### Work
1. `tabs` array mein push: `{ id: 'legal', label: 'Legal Content', icon: FileText }` — FileText icon import karo.
2. State → `settings.legalPages` ko seedha spread karo through existing `handleInputChange` ya better: helper `setLegalPage(audience:'customer'|'delivery', page:'privacy'|'terms'|'about', field:'title'|'content', value)` jo `setSettings(prev => ({ ...prev, legalPages: { ...prev.legalPages, [audience]: { ...prev.legalPages?.[audience], [page]: { ...prev.legalPages?.[audience]?.[page], [field]: value } } }))` yehi approach.
3. Section state: `const [legalActiveAudience, setLegalActiveAudience] = useState({ privacy:'customer', terms:'customer', about:'customer' })` — har section ke liye independent sub-tab.
4. `{activeTab === 'legal' && (...)}` Card render. 3 sections — Privacy, Terms, About — loop ya 3 separate divs, har section mein:
   - Section header Card top-bar (existing style).
   - 2 pill-style buttons Customer / Delivery Partner, active = bg-brand-50 text-brand-700 ring-brand-200 (same as sidebar tab active look).
   - Body mein `Title` input (1 line, existing `text-[10px] font-black uppercase tracking-widest` label pattern) + `Content` textarea (rows=12, resizable, w-full, bg-slate-50, rounded-2xl, monospace-friendly but normal font).
   - Last updated: `settings.legalPages?.[audience]?.[page]?.updatedAt` → date format "DD MMM YYYY, hh:mm A" using `toLocaleString` ya Date fn. Agar undefined → "Not saved yet".
5. Existing header ka `Save All Changes` button → already `handleSave(settings)` send karta hai → payload `legalPages` included ho jayega automatically.

### Test Requirements
- **rule TR-2a**: Tab switch karne par Legal Content render ho, Customer/Delivery sub-tab switch karne par input fields alag-alag values dikhayein.
- **rule TR-2b**: Privacy section edit karo → Terms aur Delivery sections untouched rahe.
- **rule TR-2c**: Save karne ke baad page reload → values wapas aa jayein (API roundtrip verified via SettingsContext refetch).
- **rubric TR-2d (UI consistency, scale 0-2, ≥1)**: Card/input/label styling existing General section se match kare.

---

## Task 3a: Customer frontend — PrivacyPage / TermsPage / AboutPage dynamic + Footer links

**Status**: pending
**Priority**: high
**Maps to ACs**: AC-4, AC-7, AC-9
**Scope files**:
- `frontend/src/modules/customer/pages/PrivacyPage.jsx`
- `frontend/src/modules/customer/pages/TermsPage.jsx`
- `frontend/src/modules/customer/pages/AboutPage.jsx`
- `frontend/src/modules/customer/components/layout/Footer.jsx`

### Work
1. **PrivacyPage.jsx**:
   - `const customerPrivacy = settings?.legalPages?.customer?.privacy;`
   - `const hasContent = Boolean(customerPrivacy?.content?.trim());`
   - Title: `customerPrivacy?.title || "Privacy Policy"`
   - Updated at: `customerPrivacy?.updatedAt ? new Date(customerPrivacy.updatedAt).toLocaleDateString("en-IN", {...}) : LEGAL_UPDATED`
   - Body: `hasContent ? <div className="prose prose-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{customerPrivacy.content}</div> : <PrivacyBody appName={appName} />`
2. **TermsPage.jsx** — same pattern for `customer.terms` + TermsBody fallback.
3. **AboutPage.jsx** — unique because isme koi shared body component nahi hai. Iska pattern:
   - `const customerAbout = settings?.legalPages?.customer?.about;`
   - `hasContent` → render content div, else **existing AboutPage ka poora JSX (Hero + Mission + Values + Copyright)** return kar do (as fallback).
4. **Footer.jsx** lines 98-99: `<a href="#" ...>Privacy Policy</a>` → `href="/privacy"`; Terms → `href="/terms"`.
5. Routes already registered hain kya? Verify karo existing `customer/routes/index.jsx` mein `<Route path="/privacy">` etc present.

### Test Requirements
- **rule TR-3a-1**: Empty DB (no content) → Privacy/Terms/About pages existing static fallback dikhayein.
- **rule TR-3a-2**: Admin ne `customer.privacy.content = "Hello customer"` save kiya → `/privacy` par "Hello customer" + new updatedAt date dikhe.
- **rule TR-3a-3**: Footer Privacy click karke `/privacy` route open ho.

---

## Task 3b: Delivery frontend — 3 new pages + Profile menu links + routes

**Status**: pending
**Priority**: high
**Maps to ACs**: AC-5, AC-9
**Scope files**:
- `frontend/src/modules/delivery/pages/DeliveryPrivacyPage.jsx` (NEW)
- `frontend/src/modules/delivery/pages/DeliveryTermsPage.jsx` (NEW)
- `frontend/src/modules/delivery/pages/DeliveryAboutPage.jsx` (NEW)
- `frontend/src/modules/delivery/pages/Profile.jsx` (menuItems mein 3 entries add)
- Delivery routing (find file — Glob in `frontend/src/modules/delivery/routes` OR where delivery routes are registered: likely `frontend/src/app/routes` OR separate deliveryAppRoutes)

### Work
1. **3 new pages** banayein — customer PrivacyPage ka exact copy-paste pattern, difference:
   - Back navigation target: `/delivery/profile`
   - `settings?.legalPages?.delivery?.privacy` (not customer).
   - Fallback content: `!hasContent && !customerFallback` → show "This page is being updated. Please check back soon." message.
   - Nice to have: delivery audience ka content empty ho + customer ka non-empty ho → optional fallback to customer content (ho sake to; nahi to simple message).
2. **Profile.jsx menuItems** → Help & Support ke immediately **pehle** 3 items add:
   - Shield icon + Privacy Policy → `/delivery/privacy`
   - ScrollText icon + Terms & Conditions → `/delivery/terms`
   - Info icon + About Us → `/delivery/about`
   - Shield/ScrollText/Info icons import karo (lucide-react).
3. **Delivery routes** registration:
   - Existing delivery route file kahan hai? Likely `frontend/src/app/routes.jsx` mein ya `frontend/src/modules/delivery/routes/index.jsx`. File dhoondo.
   - Usmein `<Route path="/delivery/privacy" element={<DeliveryPrivacyPage />} />` etc add karo. Correct import.

### Test Requirements
- **rule TR-3b-1**: Profile menu mein 3 naye items (Privacy, Terms, About) dikhna chahiye Help ke upar.
- **rule TR-3b-2**: Items click karne par respective route khulna chahiye (404 nahi).
- **rule TR-3b-3**: Admin `delivery.privacy.content = "Rider policy"` save → `/delivery/privacy` par wahi content aaye; `/privacy` (customer) unchanged rahe.
- **rubric TR-3b-4 (Fallback UX, 0-2, ≥1)**: Empty delivery pages proper message ya customer fallback show kare, blank screen na ho.

---

## Task 4: End-to-end smoke verification

**Status**: pending
**Priority**: medium
**Maps to ACs**: AC-3, AC-4, AC-5, AC-6, AC-7
**Scope**: Manual verify + diagnostics

### Work
1. `GetDiagnostics` → 0 errors.
2. Backend jest tests jo existing unmodified pass rahen (parcel-resume-booking etc) — run & confirm.
3. (Optional) Frontend dev server start nahi karna agar nahi chalta, lekin compile-time check: `npm run build` ya `npm run lint` if available (README dekh kar, agar hai to run).
4. Code walkthrough checklist:
   - `ALLOWED_KEYS` has legalPages ✅
   - Joi schema legalPages allow ✅
   - getPublicSettings select includes legalPages ✅
   - Legal tab render block exists ✅
   - 3 customer pages fallback pattern applied ✅
   - 3 delivery pages exist + routes added ✅
   - Profile menuItems have 3 new entries ✅
   - Footer # links fixed ✅

### Test Requirements
- **rule TR-4a**: All `existing Jest tests` (parcel + cityParcel + state-machine) pass.
- **rule TR-4b**: `GetDiagnostics` returns empty array.
- **rule TR-4c**: Legal pages (customer + delivery) ke liye audience isolation: customer.privacy save karne par delivery.privacy === previous state (code review — flattened write paths check).
- **rubric TR-4d (overall quality 0-2, ≥1)**: Code matches naming/coding conventions of nearby files — no stray console.log, proper imports, consistent useMemo/useState patterns.
