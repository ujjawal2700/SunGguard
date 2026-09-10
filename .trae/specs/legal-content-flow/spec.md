# Legal Content Management Flow (Privacy / Terms / About)

## Problem

Abhi platform par:
1. Customer ke Privacy Policy, Terms & Conditions aur About Us pages **hardcoded static content** se chalte hain (`shared/components/legal/legalContent.jsx`). Inko admin se edit nahi kiya ja sakta.
2. **Delivery Boy (rider) ke liye koi hi Privacy/Terms/About pages exist nahi karte** — rider app in screens kabhi access nahi kar sakta.
3. Admin `/admin/settings` se legal content manage nahi kar sakta.

Business requirement: Admin settings screen se 3 legal pages ka content dal sake — aur **Customer ke liye alag** aur **Delivery Boy ke liye alag** content ho.

## Users

| Role | Use case |
| --- | --- |
| Admin | `/admin/settings` → Legal Content tab → Privacy/Terms/About har page ke liye Customer aur Delivery ke liye alag-alag content edit/save karna. |
| Customer (end user) | `/privacy`, `/terms`, `/about` — Customer-wale content dekhenge. Agar admin ne abhi tak content nahi dala to fallback static content continue dikhe. |
| Delivery Boy (rider) | `/delivery/profile` → Help section ya naye links se `/delivery/privacy`, `/delivery/terms`, `/delivery/about` — apne hisse ka content dekhenge. |

## Goals

1. 100% admin-editable legal pages via `/admin/settings`.
2. Customer aur Delivery ke liye **independent** content stores — ek change dusre ko affect na kare.
3. Existing customer pages (`/privacy`, `/terms`, `/about`) ko break nahi karna — agar DB mein content nahi hai to purana static fallback dikhna chahiye.
4. Koi naya authentication/role mechanism nahi — existing admin-only `PUT /api/settings` guard ka use karna.
5. Cache invalidation — settings save hone par settings cache toot jaye (existing `invalidate()` pattern follow).

## Non-Goals

- WYSIWYG / Rich Text Editor nahi. Plain textarea with basic newlines + HTML allow (dangerouslySetInnerHTML level tak optional).
- Version history / drafts nahi — direct last-saved content.
- Multi-language / i18n nahi.
- Seller ya super-admin ke liye alag pages nahi — sirf 2 audiences: `customer` aur `delivery`.
- Social, SEO, Branding existing settings ko touch nahi karna.

## Functional Requirements

### FR1: Backend — Settings model mein new fields

`Setting` collection ke single document mein nested object `legalPages` add:

```
legalPages:
  customer:
    privacy:       { title, content, updatedAt }
    terms:         { title, content, updatedAt }
    about:         { title, content, updatedAt }
  delivery:
    privacy:       { title, content, updatedAt }
    terms:         { title, content, updatedAt }
    about:         { title, content, updatedAt }
```

Defaults: har page ka `title` default English name (e.g. "Privacy Policy") aur `content = ""` (empty).

### FR2: Backend — Settings controller update

- `ALLOWED_KEYS` mein `"legalPages"` add.
- Joi `updateSettingsSchema` mein `legalPages.customer.*.*` aur `legalPages.delivery.*.*` ka validation add (title: max 200, content: max 50,000 chars, updatedAt ko client-sent ignore kar ke server-side Date.now() set).
- `getPublicSettings` ke select mein `legalPages` include — public route se sabhi user ko customer + delivery content padhna allowed hai.
- Save ke baad `invalidate(settings cache key)` ho.

### FR3: Backend — Public endpoint for page-level read (optional optimisation)

Nahi banana — `GET /api/settings` hi kaafi hai, kyunki SettingsContext already sabko fetch kar leta hai aur har page `useSettings()` se use karta hai.

### FR4: Admin frontend — `/admin/settings` mein new tab "Legal Content"

Pichhle change mein Legal, Social, SEO tabs remove kar diye the. Ab **sirf 1 naya tab** wapas aayega naam **"Legal Content"** (icon: FileText / Building2).

Is tab ke andar 3 top-level sections (Privacy Policy / Terms & Conditions / About Us). Har section ke andar **2 sub-tabs**:
- 🧑 Customer
- 🛵 Delivery Partner

Har sub-tab mein:
- Title input (text, pre-filled default eg. "Privacy Policy for Customers")
- Large textarea content (5 rows minimum, monospace-friendly, resizeable)
- "Last updated: DD MMM YYYY" display
- Section-level Save button OR single Save All Changes (master save button header mein already hai — use same)

### FR5: Admin frontend — AdminSettings.jsx updates

- `tabs` array mein `{ id: 'legal', label: 'Legal Content', icon: FileText }` add.
- New state fields: `settings.legalPages` ko handle karne ke liye `handleLegalPageChange(audience, pageKey, field, value)` helper.
- `activeTab === 'legal'` render block — 3 sections × 2 audiences = 6 cards with audience sub-tabs (use state like `legalActiveAudience[pageKey] = 'customer' | 'delivery'`).
- Existing master `handleSave` button se submit — settings object mein `legalPages` already aa jayega kyunki state mein include hai.

### FR6: Customer frontend — existing pages ko dynamic bana dena

- `PrivacyPage.jsx`: Agar `settings.legalPages?.customer?.privacy?.content` non-empty hai → woh render (whitespace preserved ya simple HTML render). Empty hai → fallback existing `<PrivacyBody />`. `last updated` = `legalPages.customer.privacy.updatedAt` else old `LEGAL_UPDATED`.
- `TermsPage.jsx`: Same pattern for `customer.terms`.
- `AboutPage.jsx`: Same pattern for `customer.about`. Isme abhi koi shared body component nahi — static JSX hai. Fallback mein existing AboutPage JSX hi rehna chahiye.
- `Footer.jsx`: Privacy Policy aur Terms ke links `#` → `/privacy` aur `/terms` kar do (About already `/about` hai Quick Links mein).

### FR7: Delivery frontend — new 3 pages + navigation

Naye 3 pages banao:
- `delivery/pages/DeliveryPrivacyPage.jsx`
- `delivery/pages/DeliveryTermsPage.jsx`
- `delivery/pages/DeliveryAboutPage.jsx`

Har page ka structure:
- Back arrow + Title header (same pattern as Profile page components)
- settings.legalPages?.delivery?.{page}.content → render or fallback = customer content ya min message "Content not available yet".
- Inline CSS / Card style existing customer PrivacyPage jaisa hi.

Routes: delivery routes mein 3 naye routes register karo (`/delivery/privacy`, `/delivery/terms`, `/delivery/about`).

**Delivery Profile navigation links:** existing Help & Support ke just upar in 3 pages ke liye 3 small entries add karo ya phir Help & Support ko expand karke inko sub-menu banao — simple approach: Help & Support ke upar in 3 ke liye 3 menu items as list entry, ya phir single entry "Legal & Policies" click karne par sub-nav ya 3 link ka Card.

Simplest approved approach: `menuItems` mein Help & Support se pehle 3 naye items:
- `{ label: "Privacy Policy", path: "/delivery/privacy", icon: Shield }`
- `{ label: "Terms & Conditions", path: "/delivery/terms", icon: ScrollText }`
- `{ label: "About Us", path: "/delivery/about", icon: Info }`

### FR8: Admin guard + security

- Koi new auth middleware nahi — existing `PUT /api/settings` par already `verifyToken, allowRoles("admin")` laga hai. Legal pages keys wahi route se save honge.
- Client-sent `updatedAt` ko server-side overwrite karna chahiye (trust client timestamps nahi).

## Non-Functional Requirements

1. **Bundle impact**: Admin tab lazy load nahi, existing file mein inline. < 200 lines add per tier.
2. **No breaking API**: Existing `GET /api/settings` response mein extra key `legalPages` aa jayegi — existing consumers ignore kar sakte hain (unknown key filter nahi hai old consumers mein).
3. **Cache**: settingsController already uses `cacheService.invalidate()` — save ke baad existing pattern follow.
4. **Fallback**: Customer pages static content tab dikhana chahiye jab admin ne DB mein first save nahi kiya ho (deploy ke baad empty state na dikhe).
5. **Audience separation**: Customer content edit karne se Delivery content unchanged rehna chahiye — structure nested objects mein customer/delivery separate objects.

## Assumptions

1. 1 Setting document per tenant (current codebase single-doc pattern, tenantId null default).
2. Admin HTML sanitization server-side nahi chahiye abhi (admin trusted user), frontend render ke liye textarea content ko whitespace preserved (`<pre style={{whiteSpace:"pre-wrap"}}>` ya plain paragraphs) treat karna — simple text + basic line breaks.
3. Delivery footer/sidemenu nahi hai — navigation sirf Profile page ke menuItems se.

## Open Questions (resolved with defaults)

1. Rich text karna hai ya plain textarea? → **Plain textarea with whitespace-pre-wrap** (simplest, admin ko likhana aasan).
2. Delivery profile mein 3 alag menu items ya combined card? → **3 separate menu items** (consistent with existing menu look).
3. Content empty hone par delivery pages kya dikhaye? → **"This page is being updated. Please check back later."** friendly message + appName.

## Acceptance Criteria

### rule AC-1
Admin `/admin/settings` par **"Legal Content"** naam ka tab dikhna chahiye, jisme 3 sections hon: Privacy Policy, Terms & Conditions, About Us.

### rule AC-2
Har section ke andar **Customer** aur **Delivery Partner** sub-tabs hon. Har sub-tab par Title + Content textarea + Last updated dikhna chahiye.

### rule AC-3
Admin "Save All Changes" dabaye → backend `legalPages` ko update kare, cache invalidate kare, aur next `GET /api/settings` mein updated `legalPages` aa jayein.

### rule AC-4
Customer `/privacy` page: agar `legalPages.customer.privacy.content` non-empty hai to woh content + updatedAt date render kare; warna existing `PrivacyBody` static fallback + old `LEGAL_UPDATED` dikhaye. Same pattern `/terms` aur `/about` ke liye.

### rule AC-5
3 naye delivery pages exist karen: `/delivery/privacy`, `/delivery/terms`, `/delivery/about`. Delivery profile menu mein in 3 ke links dikhna chahiye. In pages par respective `legalPages.delivery.*.content` render hoga.

### rule AC-6
`legalPages.customer.*` save karne par `legalPages.delivery.*` bilkul unchanged rahe. Vice-versa.

### rule AC-7
Existing settings save / read flow (General, Branding tabs) koi break na ho — unke old tests pass rahen.

### rubric AC-8 (UI consistency, scale 0-2, threshold ≥1)
Admin Legal Content tab ka UI existing General/Branding tabs se visually consistent ho: same card style, same label uppercase tracking-widest, same input rounded-2xl bg-slate-50, same sub-tab pill-style toggles.

### rubric AC-9 (Fallback UX, scale 0-2, threshold ≥1)
Customer pages aur delivery pages empty content state mein blank white screen na dikhaye. Reasonable placeholder/fallback content ya message ho.
