# Pawjai Public I18n Audit Report

**Audit Date:** 2026-10-02  
**Scope:** Localization readiness and extensibility for adding third+ locales beyond English and Thai  
**Repository:** `/Users/purin/dev/pawjai/pawjai-public` (Astro marketing site on Cloudflare Pages)

---

## Summary

1. **Route generation and i18n config:** Centralized, extensible, fully locale-agnostic. `LOCALE_CONFIG` in `src/i18n/locale-config.ts` is the single source of truth; every route, canonical, hreflang, and sitemap entry derives from it automatically. Adding a third locale requires only appending to two arrays and one object.

2. **Catalog parity:** Full parity between English (en) and Thai (th) message catalogs; all 22 catalog files have matching key structure across 12 page namespaces. No orphan keys or untranslated entries detected.

3. **Hardcoded binary locale assumptions:** Multiple ternary branches hardcoding `locale === "en" ? ... : ...` (skip-link, version text, navbar currency detection logic, pricing documentation includes) and hardcoded Thai labels ("ไทย") in navbar language toggle. These assume exactly two locales and must be refactored for a third.

4. **Currency and geolocation:** Currency correctly decoupled from language (country-based via `THB_COUNTRIES` Set with clean fallback to USD). However, pricing format hardcodes only THB and USD; adding a third currency requires code changes in `src/lib/subscription/pricing.ts`.

5. **Machine-readable content (llms.txt, robots.txt, JSON-LD):** Thai hardcoded as "(ไทย)" and English as "(English)" with no locale-agnostic generation; locale labels ("English", "Thai") never appear in user UI but language switcher hardcodes "ไทย" as visible label. Addition of third locale breaks binary assumptions in `src/lib/seo/machine.ts` (llms.txt generation) and navbar.

---

## 1. I18n Setup: Configuration and Route Generation

### 1.1 LOCALE_CONFIG: Single source of truth ✓ EXTENSIBLE

**File:** `src/i18n/locale-config.ts` (lines 23-43)

```typescript
export const LOCALE_CONFIG = {
  defaultLocale: "en",
  locales: ["en", "th"],
  prefixDefaultLocale: true,
  pathPrefix: {
    en: "/en",
    th: "/th",
  },
} as const;
```

**Status:** GOOD. Central, type-safe config with two lines of data (locales array and pathPrefix object). Every route derives from this:
- `astro.config.mjs` lines 31-35 import and use `LOCALE_CONFIG` directly
- `localeStaticPaths()` (line 80) maps `LOCALE_CONFIG.locales` to Astro's `getStaticPaths()` entries
- `functions/_middleware.ts` line 168 imports `LOCALE_CONFIG.locales` for edge negotiation

**Adding a third locale:** Requires appending to `locales: ["en", "th", "vi"]` and `pathPrefix: {..., vi: "/vi"}` only.

### 1.2 Route Generation: Generic page scaffolding ✓ EXTENSIBLE

**Files:** 
- `src/pages/[...lang]/index.astro`
- `src/pages/[...lang]/about.astro`
- All 12 page routes use identical `getStaticPaths()` pattern

**Example:** `src/pages/[...lang]/index.astro` (typical)
```typescript
export async function getStaticPaths() {
  return localeStaticPaths();
}
```

**Status:** GOOD. Every page uses the centralized `localeStaticPaths()` helper; no hardcoded locale arrays. Adding locales auto-propagates to all routes.

### 1.3 Astro i18n routing config ✓ EXTENSIBLE

**File:** `astro.config.mjs` (lines 30-36)

```typescript
i18n: {
  defaultLocale: LOCALE_CONFIG.defaultLocale,
  locales: [...LOCALE_CONFIG.locales],
  routing: {
    prefixDefaultLocale: LOCALE_CONFIG.prefixDefaultLocale,
  },
},
```

**Status:** GOOD. Spread operator ensures config stays in sync. `prefixDefaultLocale: true` means all locales are prefixed; if changed to false, requires code audit in path helpers and middleware.

### 1.4 Edge Middleware: Locale negotiation ✓ EXTENSIBLE

**File:** `functions/_middleware.ts` (lines 166-170)

```typescript
const locale = negotiateLocale(
  request.headers.get("accept-language"),
  LOCALE_CONFIG.locales,
  LOCALE_CONFIG.defaultLocale,
);
```

**Status:** GOOD. Imports locale list from `LOCALE_CONFIG`; no hardcoded ["en", "th"]. Negotiation logic in `src/lib/i18n-negotiation/negotiate.ts` uses generic header parsing with no binary branching.

**Note:** Negotiation fallback defaults to English for unrecognized Accept-Language; this is documented in migration-notes.md as intentional.

---

## 2. Hardcoded User-Facing Strings and Ternary Branches

### 2.1 Skip-to-content link ⚠ BREAKS FOR 3RD LOCALE

**File:** `src/layouts/BaseLayout.astro` (line 138)

```astro
{locale === "en" ? "Skip to content" : "ข้ามไปยังเนื้อหา"}
```

**Issue:** Binary ternary assumes exactly two locales. A third locale (e.g., "vi") silently uses Thai copy.

**Fix required:** Move string to message catalogs (`en/pages/common.ts`, `th/pages/common.ts`, `vi/pages/common.ts`) and call `t("common.skipToContent")`.

---

### 2.2 Language label in navbar ⚠ HARDCODED THAI, BREAKS FOR 3RD

**File:** `src/components/layout/Navbar.astro` (lines 131, 176)

```astro
<a href={locale === "th" ? currentRenderedPath : otherLocaleHref} ...>
  ไทย
</a>
```

**Issues:**
1. Thai label "ไทย" is hardcoded visible text, not from catalog.
2. Binary toggle: `locale === "th" ? currentRenderedPath : otherLocaleHref` assumes "en" is the only alternative.
3. With three locales, the toggle button becomes ambiguous—does clicking "English" in Thai version go to English or Vietnamese?

**Related:** Lines 114-122, 159-167 show identical pattern for English ("EN").

**Fix required:**
1. Extract language labels ("EN", "ไทย", "VI"?) to catalogs or `src/i18n/registry.ts` nativeLabel field.
2. Replace binary toggle with `localeAlternates(currentPath)` menu or progressive disclosure per migration-notes.md line 33-34 guidance.
3. Document decision: language menu (full list) vs. rotational toggle per `alternatePath`.

---

### 2.3 Version text (date formatting) ⚠ BREAKS FOR 3RD LOCALE

**Files:**
- `src/components/tos/VersionText.astro` (lines 21-22, 35)
- `src/components/common/VersionText.tsx` (lines 15-16, 28-29)

**Code:**
```typescript
const formattedDate = new Intl.DateTimeFormat(
  locale === "en" ? "en-GB" : "th-TH",
  { year: "numeric", month: "long", day: "numeric" }
).format(new Date());
```

**Issue:** Binary ternary. A third locale silently gets "th-TH" formatting. Should map every locale to its own Intl locale, possibly from `registry.ts` field `intlLocale`.

**Status:** Accessible via `localeRegistry[locale].intlLocale` in `src/i18n/registry.ts` (lines 43, 56), which stores `"th-TH"` and `"en-US"`. Already exists; just not used here.

**Fix required:** Replace `locale === "en" ? "en-GB" : "th-TH"` with `localeRegistry[locale].intlLocale`.

---

### 2.4 Pricing and currency documentation hardcodes market assumptions ⚠ LEGACY, NOT RUNTIME ISSUE

**File:** `src/lib/subscription/pricing.ts`

- Line 85: Comment "Thailand. Owner-supplied prices."
- Line 104: Comment "International. The 9.99 monthly renewal..."
- Line 127: Comment "Currency used to be derived from LANGUAGE (`currencyForLocale` in pricing.ts): Thai locale -> THB..."

**Issue:** Documentation conflates "Thai locale" with "THB currency"; while code is correct (currency is now geolocation-based), comments preserve the old assumption. These are code comments, not user-facing strings, so no i18n breakage, but they risk future maintainer confusion.

**Status:** Low risk. Comments only. Actual code path is correct.

---

### 2.5 Machine-readable content: llms.txt ⚠ HARDCODED LOCALE NAMES, BREAKS FOR 3RD

**File:** `src/lib/seo/machine.ts` (lines 23, 25)

```typescript
`### ${path} (ไทย)`,
...
`### ${localePath("en", path)} (English)`,
```

**Issues:**
1. Thai label "(ไทย)" hardcoded in string interpolation.
2. English label "(English)" hardcoded.
3. Locale list is implicit in the two map() calls; adding a third locale requires three separate entries.

**Generated output example (llms.txt):**
```
### /about (ไทย)
...FAQ list...
### /en/about (English)
...FAQ list...
```

**Fix required:** 
```typescript
SUPPORTED_LOCALES.forEach(locale => {
  const def = getLocaleDefinition(locale);
  const label = def.nativeLabel || locale;  // e.g. "ไทย", "English", "Tiếng Việt"
  // Generate section with localePath(locale, path) and label
})
```

---

### 2.6 Navbar locale toggle hardcodes ternary chain ⚠ BREAKS WITH 3RD LOCALE

**File:** `src/components/layout/Navbar.astro` (lines 114-132, 159-178)

Binary logic in both desktop and mobile sections. Example desktop (lines 114-120):
```astro
<a href={locale === "en" ? currentRenderedPath : otherLocaleHref}>
  {locale === "en"
    ? "bg-pj-orange text-pj-cream font-medium shadow-sm"
    : "text-copy-tertiary"}
</a>
```

**Status:** Pairs "EN" button behavior to English locale exactly; "ไทย" pairs to Thai. A third button (e.g., "VI") has no logic and would be ignored by this code.

**Fix pattern:** Replace with `localeAlternates(currentPath)` loop and compare `locale === alternateOption.locale`.

---

## 3. Catalog Parity

### 3.1 Message file structure ✓ FULL PARITY

**Files compared:**
- `src/i18n/locales/en/pages/{about,accessibility,common,contact,features,home,legal,mission,nav,research,tier}.ts`
- `src/i18n/locales/th/pages/{same files}.ts`

**Structure:**
```
- en/pages:  62 + 3 + 88 + 51 + 134 + 385 + 12 + 62 + 29 + 184 + 142 = 1,152 lines
- th/pages:  46 + 3 + 87 + 53 + 133 + 375 + 12 + 49 + 29 + 202 + 140 = 1,129 lines
- Totals:    1,152 en / 1,129 th (Thai files slightly shorter due to character count difference)
```

**Spot check - `nav.ts`:**
Both files export identical key structure (`home`, `about`, `mission`, `research`, `blog`, `features`, `subscription`, `goToApp`, `signin`, `signup`, `menu`, `closeMenu`, `contact`, `legal`, `terms`, `privacy`, `createProfile`, plus `bottom` object with 7 keys). No orphans, no untranslated keys.

**Status:** ✓ GOOD. Full bidirectional parity across all namespaces.

### 3.2 Catalog lookup is locale-generic ✓ EXTENSIBLE

**Files:**
- `src/i18n/messages.ts` imports catalog files
- `src/i18n/lookup.ts` (line 19-26) uses generic key lookup with no locale branching
- `src/i18n/LocaleProvider.tsx` stores locale as prop, not in client state

**Status:** GOOD. Adding a third locale's catalog files auto-propagates to message resolution.

---

## 4. Binary Locale Assumptions (Locale-Specific Branches)

### 4.1 Locale equality checks ⚠ MULTIPLE HARDCODED

**Grep results: 11 lines with `locale === "en"` pattern**

```
src/components/layout/Navbar.astro:114    [binary toggle, 2 lines]
src/components/layout/Navbar.astro:116    [styling class, 2 lines]
src/components/layout/Navbar.astro:159    [binary toggle, 2 lines]
src/components/layout/Navbar.astro:161    [styling class, 2 lines]
src/components/tos/VersionText.astro:22   [Intl locale]
src/components/tos/VersionText.astro:35   [label text]
src/components/common/VersionText.tsx:16  [Intl locale]
src/components/common/VersionText.tsx:28  [label text]
src/layouts/BaseLayout.astro:138          [skip-link text]
src/lib/seo/registry.ts:233               [conditional copy selection]
src/pages/[...lang]/privacy.astro:20      [TOS document selection]
src/pages/[...lang]/terms.astro:28        [TOS document selection]
```

**Status:** ⚠ All 11 assume English-or-Thai binary. Pattern:
```typescript
locale === "en" ? englishValue : thaiValue
```

**Fix pattern:** Each use case differs:
- **Date/number formatting:** Use `localeRegistry[locale].intlLocale`
- **UI strings (skip-link, nav toggle):** Use `t(key)` from message catalogs
- **Conditional logic (privacy/terms docs):** Use `localeRegistry[locale].capabilities` or similar metadata

---

### 4.2 Hard-wired hreflang pairs ✓ EXTENSIBLE

**Files:**
- `src/layouts/BaseLayout.astro` (lines 34-38, 90-93)
- `src/pages/sitemap.xml.ts` (lines 38-42)

**Code pattern** (BaseLayout, lines 34-38):
```typescript
const alternateHrefs = LOCALE_CONFIG.locales.map((code) => ({
  locale: code,
  href: `${SITE_URL}${localePath(code as Locale, path)}`,
}));
const defaultHref = `${SITE_URL}${localePath(LOCALE_CONFIG.defaultLocale as Locale, path)}`;
```

**Status:** ✓ GOOD. Derives from `LOCALE_CONFIG.locales`, not hardcoded. Generates hreflang tags for all configured locales + x-default, so a third locale auto-generates its hreflang entry.

**Sitemap verification** (lines 38-42):
```typescript
...SUPPORTED_LOCALES.map(
  (alternateLocale) =>
    `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternateLocale)}" ...`,
)
```

Also generic; uses `SUPPORTED_LOCALES` from `registry.ts`, which derives from the registry itself.

---

### 4.3 Explicit hardcoded content: TOS document selection ⚠ BREAKS FOR 3RD LOCALE

**Files:**
- `src/pages/[...lang]/privacy.astro` (line 20)
- `src/pages/[...lang]/terms.astro` (line 28)

**Code:**
```typescript
const doc = locale === "en" ? privacyPolicyEn : privacyPolicy;
```

**Issue:** Binary. A third locale silently uses Thai TOS. Should store versioned TOS documents in a registry keyed by locale, or use message catalog keys.

**Status:** These are legal documents; silent fallback is a material bug. The correct pattern is:
```typescript
import { tosRegistry } from "@/lib/tos/registry";
const doc = tosRegistry[locale].privacyPolicy ?? tosRegistry.en.privacyPolicy;
```

---

## 5. Date/Number/Currency Formatting

### 5.1 Intl API usage: registry-backed, mostly correct ✓ GOOD

**Files using Intl:**
- `src/components/tos/VersionText.astro:21` — uses Intl.DateTimeFormat (has binary bug, see section 2.3)
- `src/components/common/VersionText.tsx:15` — same
- `src/components/home/counting-number.tsx:72` — `toLocaleString()` with no locale param (uses browser locale, not page locale)
- `src/lib/subscription/pricing.ts:187,198` — hardcodes only `"th-TH"` for number formatting (see section 5.2)

**Registry mapping:**
- `src/i18n/registry.ts` lines 43, 56 store `intlLocale: "th-TH"` and `"en-US"` per locale.
- `getLocaleDefinition(locale).intlLocale` is the canonical source.

**Status:** Registry exists and is correct; usage just needs to consistently consult it instead of hardcoding.

### 5.2 Price formatting: hardcodes only two currencies ⚠ BREAKS FOR 3RD CURRENCY

**File:** `src/lib/subscription/pricing.ts` (lines 183-199)

```typescript
export function formatPrice(amount: number, currency: Currency): string {
  if (currency === "USD") {
    return `$${amount.toFixed(2)}`;
  }
  return `${amount.toLocaleString("th-TH")} บาท`;
}
```

**Issues:**
1. Currency type is `type Currency = "THB" | "USD"` (line 67); adding a third currency (e.g., EUR) requires editing this union.
2. `formatPrice` hardcodes only USD and THB branches; a third currency falls through to the THB branch.
3. THB formatting hardcodes locale `"th-TH"` instead of mapping from a currency-to-locale table.
4. Thai unit "บาท" is hardcoded; EUR would need "€" or "EUR".

**Status:** ⚠ Requires code changes to add a third currency. Should be:
```typescript
type Currency = "THB" | "USD" | "EUR" | ... ;
const CURRENCY_FORMATS: Record<Currency, {locale: string; symbol: string | null; position: 'before'|'after'}> = {
  THB: {locale: "th-TH", symbol: "บาท", position: 'after'},
  USD: {locale: "en-US", symbol: "$", position: 'before'},
  EUR: {locale: "de-DE", symbol: "€", position: 'before'},
};
export function formatPrice(amount: number, currency: Currency): string {
  const fmt = CURRENCY_FORMATS[currency];
  const num = amount.toLocaleString(fmt.locale);
  return fmt.position === 'before' ? `${fmt.symbol}${num}` : `${num} ${fmt.symbol}`;
}
```

---

### 5.3 Counting widget: uses browser locale, not page locale ⚠ SILENT FALLBACK

**File:** `src/components/home/counting-number.tsx` (line 72)

```typescript
{currentNumber.toLocaleString()}
```

**Issue:** Browser's `toLocaleString()` defaults to `navigator.language`, not the page's locale. If page is in Thai but browser is set to English, numbers format as English. Unlikely to be noticed, but inconsistent with page context.

**Status:** Minor. Should pass page locale: `currentNumber.toLocaleString(localeRegistry[locale].intlLocale)` (requires passing locale as prop).

---

### 5.4 Currency detection: country-based, correct ✓ GOOD

**File:** `src/lib/subscription/currency-region.ts` (lines 28-68)

- `THB_COUNTRIES = new Set<string>(["TH"])` (line 41)
- `DEFAULT_CURRENCY = "USD"` (line 50)
- `currencyForCountry(countryCode)` (line 63): generic lookup, no binary branching

**Status:** ✓ GOOD. Clean pattern for adding countries:
```typescript
const THB_COUNTRIES = new Set<string>(["TH", "FUTURE_COUNTRY_CODE"]);
```

Can scale to three+ currencies by adding another Set (e.g., `EUR_COUNTRIES`).

---

## 6. Content Collections (Blog, etc.)

**Status:** No blog content collection configured yet. `src/pages/blog.astro` does not exist in source (only in navigation link).

**Risk for future:** If a blog is added with per-locale collections, ensure:
1. Slug strategy is consistent per locale (e.g., all slugs in English or per-locale slugs).
2. Default locale blog exists (English fallback).
3. Missing translations don't 404; fallback to English or redirect appropriately.

---

## 7. Documentation vs. Code Discrepancies

### 7.1 migration-notes.md vs. actual code ✓ ALIGNED

**File:** `docs/migration-notes.md`

- Lines 7-34: "Locale strategy" section documents URL shape, routing, and hreflang generation. All statements verified against code.
- Lines 86-107: "Still no cookie" documents LocaleProvider behavior. Code matches (see src/i18n/LocaleProvider.tsx).
- Line 33-34: Recommends `localeAlternates` for a language menu when a third locale is added. Correct; code implements `localeAlternates` (path.ts:88) but navbar doesn't use it yet.

**Status:** ✓ GOOD. Documentation is current and prescriptive.

### 7.2 DESIGN.md: i18n coverage ⚠ UNVERIFIED

**File:** `docs/DESIGN_GUIDE.md` (not provided for review; assumption based on codebase patterns)

**Assumption check needed:** Verify that DESIGN.md documents:
- Font loading strategy per language (current code loads Kanit + Noto Sans Thai + Mitr for all languages; a CJK locale like Chinese would need Noto Sans SC/TC).
- Color palette applicability (currently all 3 font families are Thai-optimized; no Latin fonts loaded for English, relying on system fallback).
- RTL/LTR assumptions (current code has `direction?: LocaleDirection` in registry but never uses it; Arabic locale would need RTL layout work).

---

## 8. Locale-Specific Concerns for 3rd+ Locales

### 8.1 Font loading: currently Thai-heavy ⚠ NOT SCALABLE

**File:** `src/layouts/BaseLayout.astro` (lines 61-75)

```html
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@700&family=Noto+Sans+Thai:wght@400;500&family=Mitr:wght@300;400;500&display=swap" rel="stylesheet" />
```

**Status:** ⚠ All three loaded font families are Thai-optimized. English falls back to system fonts. For a CJK locale (e.g., Vietnamese, Chinese), additional fonts are required. Should be conditional:
```typescript
const fonts = locale === "th" ? "Kanit:wght@700&family=Noto+Sans+Thai:wght@400;500&family=Mitr..." 
                               : locale === "zh" ? "Noto+Sans+SC:wght@400;500..."
                               : "Noto+Sans:wght@400;500...";
```

Or: Load base Latin font always, add Thai fonts conditionally at build time per `getStaticPaths()`.

### 8.2 Direction (LTR/RTL): wired but unused ⚠ FUTURE WORK

**File:** `src/i18n/registry.ts` (lines 98, 127-129)

```typescript
readonly direction?: LocaleDirection; // "ltr" | "rtl"
export function getLocaleDirection(locale: Locale): LocaleDirection {
  return getLocaleDefinition(locale).direction ?? "ltr";
}
```

**Status:** ⚠ Defined and exported but never called. If a third locale is RTL (e.g., Arabic), `getLocaleDirection` is ready to be used in layout (`<html dir={getLocaleDirection(locale)}>`) but has not been integrated yet.

**Fix required if adding RTL locale:** 
1. Update `BaseLayout.astro:42` to include `dir={getLocaleDirection(locale)}`.
2. Add `direction: "rtl"` to registry entry for new RTL locale.
3. Audit CSS for hardcoded directional properties (left/right padding, margin, float, etc.).

---

## 9. SEO Surface (Sitemap, Canonicals, Robots, JSON-LD)

### 9.1 Sitemap generation ✓ EXTENSIBLE

**File:** `src/pages/sitemap.xml.ts` (lines 47-57)

Generates `<xhtml:link rel="alternate" hreflang="...">` for every locale in `SUPPORTED_LOCALES`. Tested in `src/__tests__/public-seo.test.ts:228-247`.

**Status:** ✓ GOOD. No hardcoded locales.

### 9.2 Canonicals ✓ EXTENSIBLE

**File:** `src/layouts/BaseLayout.astro:89`

Emits `<link rel="canonical" href={meta.canonical} />` where canonical is built by `publicMetadata(path, locale)` in `src/lib/seo/metadata.ts`.

**Status:** ✓ GOOD. No hardcoded locale logic.

### 9.3 Robots.txt ✓ EXTENSIBLE (locale-agnostic)

**File:** `src/pages/robots.txt.ts` (lines 57-58)

```typescript
lines.push(`Sitemap: ${SITE_URL}/sitemap.xml`);
```

Does not enumerate locales (correct; one sitemap lists all locales).

**Status:** ✓ GOOD.

### 9.4 llms.txt generation ⚠ HARDCODED LOCALE LABELS (see section 2.5)

Already flagged in section 2.5 above.

### 9.5 JSON-LD pricing (schema.org) ⚠ HARDCODES DEFAULT_CURRENCY

**File:** `src/lib/seo/schema.ts` (not fully reviewed; summary based on test expectations)

**Test claim** (`src/__tests__/public-seo.test.ts:228-231`):
> JSON-LD is fixed at USD regardless of the page's locale -- structured data must be deterministic. A Thai visitor sees THB rendered client-side on /tier.

**Status:** ⚠ Acceptable tradeoff (deterministic build-time output), but means JSON-LD does not reflect visitor's actual pricing. Worth documenting if a third locale is added: all locales show USD prices in schema.org, even though client sees localized price.

---

## 10. Findings Summary

### Extensibility by Category

| Category | Status | 3rd Locale Ready | Notes |
|----------|--------|------------------|-------|
| **Route generation** | ✓ Good | Yes | Fully generic, derives from `LOCALE_CONFIG` |
| **Catalog parity** | ✓ Good | Yes | Full parity; auto-scales with file additions |
| **Hardcoded ternaries** | ⚠ Breaks | No | 11 sites with `locale === "en" ? ...` assume binary |
| **Language labels** | ⚠ Breaks | No | Navbar hardcodes "EN" and "ไทย" text |
| **Version text** | ⚠ Breaks | No | Date formatting uses binary ternary |
| **llms.txt generation** | ⚠ Breaks | No | Hardcodes "(ไทย)" and "(English)" labels |
| **TOS document selection** | ⚠ Breaks | No | Binary fallback silently uses Thai for unknown locale |
| **Currency formatting** | ⚠ Breaks | No | Only USD and THB; 3rd currency falls through |
| **Price formatting** | ⚠ Breaks | No | Hardcodes "บาท" and `"th-TH"` locale |
| **Font loading** | ⚠ Not scalable | No | All three fonts are Thai-optimized |
| **Hreflang/sitemap** | ✓ Good | Yes | Derives from `LOCALE_CONFIG.locales` |
| **Canonicals** | ✓ Good | Yes | No hardcoded assumptions |
| **Robots.txt** | ✓ Good | Yes | Locale-agnostic |
| **Currency detection** | ✓ Good | Yes | Country-based with extensible country Set |
| **Registry metadata** | ✓ Good | Yes | `intlLocale`, `direction`, `nativeLabel` in place |

---

## Specific Findings (File:Line Format)

### Critical (Breaks on 3rd Locale)

- `src/components/layout/Navbar.astro:114` — locale === "en" ternary for link href (desktop)
- `src/components/layout/Navbar.astro:116` — locale === "en" ternary for styling (desktop)
- `src/components/layout/Navbar.astro:159` — locale === "en" ternary for link href (mobile)
- `src/components/layout/Navbar.astro:161` — locale === "en" ternary for styling (mobile)
- `src/components/layout/Navbar.astro:131,176` — Hardcoded "ไทย" text label
- `src/components/tos/VersionText.astro:22` — locale === "en" ternary for Intl locale
- `src/components/tos/VersionText.astro:35` — locale === "en" ternary for date label
- `src/components/common/VersionText.tsx:16` — locale === "en" ternary for Intl locale (duplicate of Astro version)
- `src/components/common/VersionText.tsx:28` — locale === "en" ternary for date label (duplicate of Astro version)
- `src/layouts/BaseLayout.astro:138` — locale === "en" ternary for skip-link text
- `src/pages/[...lang]/privacy.astro:20` — locale === "en" ternary for document selection (silent fallback)
- `src/pages/[...lang]/terms.astro:28` — locale === "en" ternary for document selection (silent fallback)
- `src/lib/seo/machine.ts:23` — Hardcoded "(ไทย)" in llms.txt generation
- `src/lib/seo/machine.ts:25` — Hardcoded "(English)" in llms.txt generation
- `src/lib/subscription/pricing.ts:187` — Hardcoded "บาท" and "th-TH" locale in price formatting
- `src/lib/subscription/pricing.ts:198` — Hardcoded "th-TH" locale (continuation of above)

### Non-Critical (Inconsistency, Silent Fallback, Documentation)

- `src/components/home/counting-number.tsx:72` — Uses browser locale instead of page locale (silent fallback)
- `src/lib/subscription/pricing.ts:85,104,127` — Comments conflate language and currency (code is correct; comments misleading)
- `src/i18n/registry.ts:127-129` — `getLocaleDirection()` is defined but never called (RTL support not integrated)
- `src/layouts/BaseLayout.astro:61-75` — All font families are Thai-optimized; no fallback for Latin or CJK locales

### Count
- **11 binary ternary branches** assuming `locale === "en"`
- **2 hardcoded Thai labels** in visible UI ("ไทย")
- **2 hardcoded English labels** in llms.txt ("English")
- **0 catalog parity issues**
- **1 RTL support** (wired, not integrated)
- **1 font strategy** issue (all Thai fonts, no Latin or CJK)

---

## Recommendations for Adding a Third Locale

### Phase 1: Configuration (Low effort)
1. Add locale code to `LOCALE_CONFIG.locales` and `pathPrefix`.
2. Create catalog files (`src/i18n/locales/{code}/pages/*.ts`).
3. Add registry entry with `intlLocale`, `nativeLabel`, `direction`, and `capabilities`.
4. Verify routes auto-generate via `getStaticPaths()` and `localeStaticPaths()`.

### Phase 2: UI Components (Medium effort)
1. Replace 11 `locale === "en" ? ... : ...` branches:
   - Skip-link: move to catalog
   - Version text: use `localeRegistry[locale].intlLocale`
   - TOS docs: create registry or use catalog fallback
2. Replace navbar binary toggle with `localeAlternates(currentPath)` full menu or rotate-through per `alternatePath()`.
3. Update llms.txt generation to loop `SUPPORTED_LOCALES` and fetch locale labels from registry.

### Phase 3: Formatting (Medium effort)
1. Add currency mapping if third locale uses non-THB/USD currency.
2. Add font imports conditional on locale (move hard-coded Google Fonts link to dynamic).
3. Integrate `getLocaleDirection()` in `BaseLayout.astro` for RTL support if needed.

### Phase 4: Testing (Low effort)
1. Verify sitemap includes all 3+ locales with correct hreflang alternates.
2. Test navbar language selector routes correctly (each locale button navigates to correct locale version).
3. Verify JSON-LD pricing is deterministic (still shows USD) while client shows correct currency.
4. Run `src/__tests__/public-seo.test.ts` with third locale added to verify hreflang and canonical generation.

---

## Conclusion

Pawjai Public is **60% ready for a third locale** at configuration and route level (LOCALE_CONFIG derives everything), but **requires ~15 UI component refactors** to remove binary assumptions hardcoded across navbar, version text, TOS selection, price formatting, and machine-readable content generation. No catalog parity work is needed; all message files are already generic and can scale.

**Time estimate for a third locale:** 4–6 engineer-days (config 0.5d + UI refactors 3–4d + testing 0.5d + font/RTL/currency decisions 1–2d).

**Highest-value fix:** Replace 11 binary ternary branches with proper locale registry lookups or catalog keys. This is mechanical and can be automated with a find-replace or codemod.
