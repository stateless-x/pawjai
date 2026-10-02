---
type: rules (normative)
status: current
updated: 2026-10-02
owner: Pawjai owner (approved 2026-10-02)
applies_to: pawjai-be, pawjai-fe, pawjai-admin, pawjai-public, pawjai-react-native
authority: For new code these rules win. Where shipped code disagrees, the gap is tracked as a packet in output/i18n-audit/PLAN.md, not an exception.
evidence: output/i18n-audit/AUDIT.md (findings), output/i18n-audit/PLAN.md (packets and migration detail)
---

# Pawjai localization rules

MUST / MUST NOT are binding. Each rule has a one-line reason and one example. Packets that implement these rules live in `output/i18n-audit/PLAN.md`; this file holds only the rules.

Terms: **locale** = a registry code (`th`, `en`, later BCP-47 like `ja`). **live** / **beta** = registry status. **lookup row** = admin-managed reference data (breeds, record concepts, notification templates).

## R1. Language precedence

- R1.1 The display language MUST be chosen in this order, first hit wins:
  1. the **account preference** (signed in). On `*.pawjai.co` web, the account preference is carried by a shared cookie on `.pawjai.co` that the app sets;
  2. the device/browser **language list**, matched over the WHOLE ordered list, first `live` locale wins;
  3. device **region** `TH` -> `th`;
  4. `en`.
- R1.2 Signup MUST seed the account from R1.1 steps 2-4. Any language change inside any app MUST write the account.
- R1.3 Account rows that existed before seeding was introduced MUST be kept as `legacy` and MUST NOT be rewritten by any migration or job.
- R1.3a A user with NO account-preference row is treated as "never chose": server-side sends (reminders, broadcasts) use the default `en`. No migration seeds rows for them.
- R1.4 IP country MUST NOT pick a language, anywhere.
- R1.5 Code MUST NOT compare to a literal locale (`=== 'th'`); behavior reads the registry (`capabilities`, `calendar`, `status`).
- Why: one truth across devices; a defaulted `th` is indistinguishable from a chosen one; country is not language.
- Example: browser list `fr-FR, en-GB, th` with no account -> `en` (first live match is `en-GB`), even from a Thai IP. Device list `fr` only, region `TH` -> `th`.

## R2. Web routing

- R2.1 Only the bare `/` MAY redirect based on detection (R1 order).
- R2.2 `/en/...`, `/th/...` and any locale-prefixed URL MUST NOT redirect by detection, cookie or account.
- R2.3 Legacy unprefixed non-root paths (`/about`, `/blog/x`) MUST 301 to `/en` plus the same path, with no detection: pawjai-fe served English there to non-Thai IPs (Googlebot crawls from the US), so the indexed content is English.
- Why: crawlers and shared links must get the URL they asked for; hreflang depends on it.
- Example: a Thai-account user opening `/en/about` sees English; opening `/` lands on `/th/`.

## R3. Currency and purchases

- R3.1 Web (Stripe) only: a signed-in user MUST be priced in the account billing currency (the existing Stripe customer currency, else the account country: `TH` -> THB, else USD). An anonymous visitor MUST be priced by IP country (`TH` -> THB, else USD).
- R3.2 Currency MUST NOT be derived from language.
- R3.3 Mobile apps MUST use the store's own product price and currency for any in-app purchase.
- R3.4 Mobile apps MUST NOT show Stripe/web prices, and MUST NOT link, name or otherwise steer users to web checkout, `/tier`, or "visit pawjai.co" to buy or unlock features. The THB/USD rule never applies in-app.
- Why: billing must not change when a user switches language; App Store and Google Play reject external purchase steering.
- Example: an English-speaking visitor in Bangkok on `/en/tier` sees `฿1,790`; the iOS app shows the App Store's localized price and no web link.

## R4. Formatting

- R4.1 Dates, numbers and currency MUST be formatted with `Intl` (or the RN in-house formatter driven by the same per-locale profile) using the **display locale**.
- R4.2 A THB price in non-Thai copy MUST be `Intl.NumberFormat(locale, { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 })`. The literal `บาท` MUST NOT appear outside `th` copy.
- R4.3 Calendars MUST be a per-locale registry setting (`calendar: 'buddhist' | 'gregory'`), never a `th` special case.
- R4.4 Plurals MUST use `Intl.PluralRules` categories (ICU message keys); MUST NOT hand-roll `n === 1 ? ... : ...`.
- Why: locale #3 must work by adding data, not branches.
- Example: `th`: `1,790 บาท`, `29 ก.ย. 2569`; `en`: `฿1,790`, `Sep 29, 2026`.

## R5. Translations and locale status

- R5.1 Every locale in the registry MUST have `status: 'beta' | 'live'`. Only a locale with 100% coverage MAY be `live`; only `live` locales are offered in pickers and negotiated.
- R5.2 Every UI string and every active lookup row MUST exist in every `live` locale. A completeness check MUST report gaps per entity x locale.
- R5.3 Admin MAY save a lookup row with missing locales (draft). Such a row MUST be flagged and counted as missing until complete. Machine-translated text MUST be stored with `needs_review` until a human approves it.
- R5.4 Runtime fallback is a last resort: missing text falls back to `en` and MUST be logged (entity/key + locale). It MUST NOT be silent and MUST NOT show a raw key.
- R5.5 Exempt from R5.2: user content (pet names, notes, reminder titles), LLM output (generated in the user's language), notifications stored as sent, and single-language blog/SEO content (omitted from hreflang instead of translated).
- Why: users see complete languages; admins see exactly what is missing.
- Example: a new concept saved with only `en` shows a "missing th" badge in admin and counts in the dashboard; until filled, a `th` user sees the `en` name and the server logs `translation_fallback {entity: concept, locale: th}`.

## R6. Lookup storage and API

- R6.1 Translatable lookup text MUST live in one translation table per entity, `<entity>_translations(entity_id, locale, ...)`, with FK, case-insensitive locale uniqueness and non-blank checks (pattern: `pet_record_type_concept_translations`).
- R6.2 New per-language columns (`name_xx`) MUST NOT be added.
- R6.3 API changes MUST be additive: return the resolved `name` plus `nameLocale` (the locale the text is actually in); keep legacy `nameTh`/`nameEn` until no supported app version reads them.
- R6.4 History rows MUST store codes + params (or ids) and resolve text at read time; rendered text is stored only for delivered artifacts (pushes), always with its `resolved_locale`.
- Why: adding a locale is rows, not DDL; old app versions keep working.
- Example: `GET /api/breeds/selector` returns `{ "nameEn": "Labrador", "nameTh": "ลาบราดอร์", "name": "ลาบราดอร์", "nameLocale": "th" }` for a Thai request.

## R7. Change process and legacy content

- R7.1 Every localization data/schema change MUST go expand -> dual read/write -> backfill -> cutover -> observe -> contract. Each pawjai-be migration or data change MUST ship as its own stop point (merge, deploy to staging, verify, then continue).
- R7.2 The legacy blog (`blog_posts`) MUST keep its IDs, `th`/`en` values, slugs, publication state and links. No new multilingual blog model is built inside Pawjai; the public site owns new content localization.
- R7.3 If blog content moves to a new domain, that domain MUST be added to `external_domains` (be `routes/external-domains.ts`) and every published slug MUST keep resolving via a redirect map.
- Why: old app versions stay in the wild; published URLs and in-app link handling must not break.
- Example: breed names move to `breed_translations` while `name_en/name_th` stay dual-written until no supported app reads them.

---
FRESH (new doc, current only): F 2 (descriptive path and headings; no docs index exists in the parent repo yet) · R 2 (status/updated metadata and authority rule present; rules are approved decisions, but several are not yet implemented, so "matches implementation" is not true) · E 3 (one page, one rule block per topic) · S 3 (rules only; packets and evidence referenced, not duplicated) · H 2 (MUST/MUST NOT with examples; enforcement lives in PLAN packets). Total 12/15 (B).
