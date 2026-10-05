---
status: current (owner approved coordinator amendments 2026-10-02; open questions in section 8)
updated: 2026-10-02
scope: Work packets and migration detail for pawjai-be, pawjai-fe, pawjai-admin, pawjai-public, pawjai-react-native
rules: docs/LOCALIZATION_RULES.md (normative; this plan implements it and does not restate it)
evidence: AUDIT.md (same folder). Finding IDs T1-T8, L1-L3 refer to it.
supersedes: output/archive/pawjai-be-docs/technical/LOCALIZATION_REFACTOR.md (archived 2026-08-28; verdict in section 9)
---

# Pawjai localization plan

Goal: adding a locale = catalog file(s) + translation rows + one registry entry per repo, then flip its status `beta` -> `live` when coverage is 100%. No schema migration and no per-feature code edits per locale. Defer RTL, fonts, AI prompts and ICU until locale #3 is named.

## 1. Rules

All rules are in **[docs/LOCALIZATION_RULES.md](../../docs/LOCALIZATION_RULES.md)** (R1 language precedence, R2 web routing, R3 currency and purchases, R4 formatting, R5 translations and locale status, R6 lookup storage and API, R7 change process and legacy content). Packets below cite rule IDs; when a packet and a rule disagree, the rule wins and the packet is wrong.

Owner decisions recorded only here because they are migration choices, not rules:
- Existing `preferred_language` rows become `legacy` and are never rewritten (R1.3). No query can prove a row was defaulted, so zero rows are flipped.
- Users with **no** `user_config` row are treated as never chose (R1.3a): when P3 sets the server default to `en`, their reminders and broadcasts switch to English on deploy. No seeding migration, no prod count needed.
- Admin may save drafts with missing locales (R5.3); the completeness gate ships warn-only and becomes failing only after the gap fill (G1) merges.
- The keep/switch prompt for `legacy` rows (former N1) is **deferred**: no new UI approved.

## 2. Technical contract (implementation shape for R1, R5, R6)

Registry, one copy per repo (fe and public already have this shape; be and RN adopt it), plus the same golden vector file `locale-vectors.json` in each repo so drift fails a test:

```ts
interface LocaleDefinition {
  code: string;                 // 'th', 'en'; future BCP-47
  intlLocale: string;           // 'th-TH', 'en-US'
  fallbackLocale: string | null;// th -> 'en', en -> null (R5.4, logged)
  nativeLabel: string;          // 'ไทย', 'English'
  shortLabel: string;           // 'TH', 'EN'
  direction: 'ltr' | 'rtl';
  calendar: 'gregory' | 'buddhist';  // R4.3
  hourCycle: 'h23' | 'h12';
  status: 'beta' | 'live';      // R5.1: only live is negotiated and offered
  capabilities: { ui: boolean; notifications: boolean; aiChat: boolean; aiInsights: boolean; legal: boolean };
}
export const DEFAULT_LOCALE = 'en';
export const LANGUAGE_COOKIE = { name: 'pawjai_lang', domain: '.pawjai.co', path: '/', maxAgeDays: 365, sameSite: 'Lax', secure: true }; // R1.1 web carrier
```

Where R1 is evaluated:

| Surface | Evaluation (R1 order) |
|---|---|
| be API request | explicit query param (`lang`; legacy aliases `language`, `locale` accepted forever; invalid explicit -> 400) -> `Accept-Language` (clients send their UI language, which follows the account) -> account preference -> `en`. Responds with `Content-Language`. |
| be background (push, cron) | account preference -> `en` (no row = never chose = `en`). |
| fe (signed in) | account preference (synced by `LanguageSync`, written into `pawjai_lang`) |
| fe / public (anonymous) | `pawjai_lang` cookie (if `live`) -> `Accept-Language` list (whole list, q-ordered, first live wins) -> `en`. Only bare `/` redirects (R2). IP country only sets the pricing country cookie (R3). |
| RN | signed in: account preference. Signed out / unseeded: stored picker choice -> device language list (whole list) -> device region `TH` -> `th` -> `en`. |
| Signup seeding | server seeds an `unseeded` account from the first authenticated request's negotiated locale; clients send their R1-derived UI language in `Accept-Language`, so old clients seed correctly too. |

Wire contract: every request sends `Accept-Language: <code>`; any in-app change sends `PATCH /api/user/language`; `GET /api/user/language` returns `{ preferredLanguage, source: 'user'|'signup_seed'|'admin'|'legacy'|'unseeded' }`; lookup responses add `name` + `nameLocale` (R6.3); translation rows carry `review_status: 'approved'|'needs_review'` (R5.3).

## 3. Lookup storage decision (ADR-lite L-001)

| | A. Per-entity translation table | B. JSONB map per row | C. Per-language columns (status quo) | D. One generic translations table |
|---|---|---|---|---|
| Add a locale | rows | data | **DDL per locale** | rows |
| Integrity | FK, `lower(locale)` unique, non-blank CHECK (built twice already) | none per locale | NOT NULL per column | polymorphic, no FK |
| Completeness / review flags per locale | row-level (`review_status`) | awkward (nested) | no | row-level, stringly typed |
| Per-locale index | `(locale)` | expression index per locale = DDL | per column | huge mixed table |
| Fits existing code | **yes** (concepts, notification settings) | new pattern | being left | new pattern |

- **Context.** Breeds and record-type variants use `name_en/name_th`; concepts and notification templates use translation tables. Record names have two sources of truth and two fallback chains.
- **Decision.** A (R6.1). Concept translations are canonical for record names; `pet_record_types.name_*` become read-fallback, then contracted (D1). Breeds get `breed_translations`. One resolver `src/lib/locale/resolveTranslation.ts`.
- **Alternatives.** B: no per-row integrity or review flag; C: DDL per locale; D: no FKs.
- **Consequences.** +1 table per entity; batched join (exists in `petRecordDisplay/loader.ts`); admin editors become per-locale (A1-A3).

## 4. Activity log / history

| Store | Verdict |
|---|---|
| `pet_records` (Timeline) | No baked label (typeId + concept snapshot). No backfill (R6.4 already met). |
| Chat receipts / log cards | Re-resolved by `recordId` at read (`historical-receipt-resolver.service.ts`); name-based backfill was already rejected as lossy. No backfill. |
| `notifications` | Stored as sent (R5.5, R6.4). Backfill only `resolved_locale` from `metadata->>'language'` (exact copy). Never rewrite title/body. Rows without the key stay `NULL` = unknown. New reminder sends write `resolved_locale` when tokens were rendered. |
| `admin_audit_log` | Already code + jsonb. |

## 5. Formatting implementation

| Topic | Now | Later (locale #3) |
|---|---|---|
| Dates | be/fe/public `Intl.DateTimeFormat(intlLocale, { calendar, hourCycle })`. RN keeps its in-house formatter (`dates.ts` header distrusts Hermes `Intl`) driven by a per-locale profile; existing tests pin output. | Hermes `Intl` spike (D3) |
| Currency | R4.2 in fe (F2) and public (U1); country logic per R3 | data only |
| Plurals | RN registry `plural(n)` + `x.one`/`x.other` keys + `tp()`; others `Intl.PluralRules` | ICU if needed (D3) |
| RTL / fonts / AI | `direction` stored, `<html dir>` emitted | D2, D4, D5 |

## 6. Compatibility per direction

| Change | New server + old app | Old server + new app | Rollback |
|---|---|---|---|
| Additive `name`/`nameLocale`, `breedName`, `resolvedLocale`, `source`, `review_status`, `Content-Language` | Ignored | New app treats as optional, logged fallback to legacy fields | Revert be |
| q-aware `Accept-Language` | Single-token headers identical | n/a | Revert |
| `DEFAULT_LOCALE = 'en'` (P3) | Users with no config row and requests with no locale signal become `en` (owner-approved); existing rows untouched | n/a | Revert constant |
| Account `source` + seeding (P2) | Old apps seed through `Accept-Language`; old fe already adopts the account value | New app without `source` adopts the account value | Columns nullable; restore trigger from git |
| `pawjai_lang` cookie (F3, U3) | Old public build ignores it | Edge without cookie support falls back to `Accept-Language` | Stop setting it; cookie expires |
| Completeness gate | Warn-only first (P8b), failing later (P8c) | n/a | Revert flip |

## 7. Work packets

### Execution order

1. **P1** be locale core (no deps)
2. **P2** be account language source + seeding (DB stop point)
3. **P3** be `DEFAULT_LOCALE = 'en'`
4. In parallel, no deps: **F2** fe THB display, **U1** public THB display, **R1** RN query keys, **R2** RN error text, **R8** RN store-review fix
5. **F1** fe account-wins sync, then **F3** fe `.pawjai.co` cookie, then **U3** public edge reads cookie + bare-`/`-only redirects
6. **R3** RN account sync
7. **P4** be server messages, then **P5** be resolver
8. **P6** be breed translations (DB stop point), then **R7** RN server names
9. **P7** be notification locale backfill (data stop point)
10. **P8a** be `review_status` columns (DB stop point), **P8b** be coverage API + warn-only gate
11. **A1** admin coverage dashboard, **A2** admin inline edit + review queue, **A3** admin list badges
12. **G1** machine-translated gap fill as reviewed-later seed data (data stop point)
13. **P8c** be gate flips to failing
14. **R4** -> **R5** -> **R6** RN registry and formatting; **U2** public ternaries
15. Deferred D1-D7

Count: 28 now-packets (P1-P7, P8a-c, G1, A1-A3, F1-F3, R1-R8, U1-U3) + 7 deferred. Branch bases: be `origin/staging`; fe `origin/staging`; admin `origin/staging`; public `origin/main`; RN from `codex/aesthetic-improvement` HEAD (`4e5cbb3` at audit time). **Every be packet that ships a migration or data change is its own stop point**: merge, deploy to staging, owner verifies, then the next packet starts.

| ID | Repo | Title | Deps | Rules / fixes |
|---|---|---|---|---|
| P1 | be | Locale core lib, q-aware negotiation, `Content-Language` | - | R1, L1 |
| P2 | be | Account language `source` + signup seeding **[STOP]** | P1 | R1.2, R1.3, T1 |
| P3 | be | `DEFAULT_LOCALE = 'en'` | P1 | R1.1, R1.3a, T5, T8 |
| P4 | be | Server message catalog | P1 | R5.2 |
| P5 | be | Unified translation resolver, logged fallback | P1, P4 | R5.4, T6 |
| P6 | be | `breed_translations` + `name` fields **[STOP]** | P1, P5 | R6 |
| P7 | be | Notification `resolved_locale` backfill **[STOP]** | - | R6.4 |
| P8a | be | `review_status` on translation tables **[STOP]** | P6 | R5.3 |
| P8b | be | Coverage API + warn-only completeness gate | P8a | R5.2 |
| P8c | be | Completeness gate fails CI | G1 merged | R5.2 |
| G1 | be | Gap fill seed data, `needs_review` **[STOP]** | P8b | R5.2, R5.3 |
| A1 | admin | Coverage dashboard + "missing <locale>" filter | P8b | R5.2 |
| A2 | admin | Inline edit + `needs_review` queue | A1 | R5.3 |
| A3 | admin | Missing/needs-review badges on lookup lists | P8b | R5.3 |
| F1 | fe | Account wins in `LanguageSync`; no IP language | P2 | R1, T1, T7 |
| F2 | fe | THB in non-Thai copy; signed-in billing currency check | - | R3.1, R4.2, T4 |
| F3 | fe | Set shared `.pawjai.co` language cookie | F1 | R1.1 |
| R1 | RN | Query keys carry the language | - | T3 |
| R2 | RN | Localized error text | - | R5.2, T2 |
| R3 | RN | Account-wins sync | P2 (degrades) | R1 |
| R4 | RN | Registry, `t()` without default, lint ban, completeness test | - | R1.5, R5 |
| R5 | RN | Formatting profile, plurals, inline strings | R4 | R4 |
| R6 | RN | Legal docs by registry | R4, other agent's commit | R5 |
| R7 | RN | Prefer server-resolved names | P6 (works without) | R6.3 |
| R8 | RN | Remove web purchase steering | - | R3.4 |
| U1 | public | THB in non-Thai copy | - | R4.2 |
| U2 | public | Ternaries out, registry switcher, catalog parity test | - | R1.5, R5.2 |
| U3 | public | Edge reads `pawjai_lang`; only bare `/` negotiates | F3 (works without) | R1.1, R2 |
| D1-D7 | all | Deferred (7.6) | | |

### 7.1 Backend (`pawjai-be`, from `origin/staging`)

**P1. Locale core lib.** Branch `feat/i18n-locale-core`.
- Files: new `src/lib/locale/{registry.ts,negotiate.ts,resolveRequestLocale.ts,fallbackChain.ts,index.ts}`, `src/lib/locale/__tests__/locale-vectors.json` + test; `src/utils/locale.ts` (keep `resolveLang` signature, delegate); `src/routes/admin/pets.ts:7-16`; Fastify `onSend` hook for `Content-Language`; repoint comments citing the archived doc (`src/db/schema/content.ts:27`, `src/services/notificationContentResolver.ts:33`) to `docs/LOCALIZATION_RULES.md` in the parent repo.
- Change: registry per section 2 (`th`, `en` both `live`); `negotiate.ts` ported from `pawjai-public/src/lib/i18n-negotiation/negotiate.ts` (whole list, q-ordered, first live wins); `resolveRequestLocale(request, { accountLocale? })` returns `{ requested, resolved, source }`.
- Accept: vectors pass (`th-TH,th;q=0.9,en;q=0.8 -> th`, `fr-FR,en-GB -> en`, `fr -> no match`); `LANGUAGE_ENUM` equals registry codes; existing tests unchanged.
- Verify: `bun tsc --noEmit && ./scripts/test.sh src/lib/locale src/utils && bun run test`.
- Compat/rollback: single-token headers identical; code-only revert.

**P2. Account language source + seeding. STOP POINT (migration + trigger).** Branch `feat/i18n-account-language`. Deps P1.
- Files: `src/db/schema/users.ts` (+ `preferredLanguageSource text NULL`, `preferredLanguageSetAt timestamptz NULL`), migration via `bun run db:generate`; `scripts/database/migrations/create-user-initialization-trigger.sql` (new rows: `preferred_language = 'en'`, `source = 'unseeded'`; owner applies with `bun run db:apply-trigger`, Railway env pinned); `src/services/userConfigService.ts:46-70` (`getOrCreate` inserts `unseeded`; `seedPreferredLanguageIfUnseeded`; `setPreferredLanguage` stamps `user`); `src/routes/auth.ts:82` and the auth guard (seed while `unseeded`); `src/services/adminUserService.ts:411-420` (`admin`); `src/routes/user/language-preferences.ts` (`source` in GET/PATCH).
- Rule enforced in a test: rows existing before the migration keep `source = NULL` (reported `legacy`) and an unchanged value.
- Accept: signup with `Accept-Language: en` -> `en`/`signup_seed`; `th` -> `th`; `fr` -> `en`; PATCH -> `user`; legacy fixture unchanged; zero rows with changed `preferred_language` after migrate.
- Verify: `bun run db:validate && bun tsc --noEmit && bun run test`.
- Compat/rollback: nullable columns; revert code and restore the previous trigger body from git.

**P3. `DEFAULT_LOCALE = 'en'`.** Branch `feat/i18n-default-locale`. Deps P1. Not gated on any prod count (owner decision).
- Files: `src/services/notificationBroadcastService.ts:357,697`, `src/jobs/unifiedNotificationJob.ts:358,405`, `src/services/userConfigService.ts:116`, `src/services/adminUserService.ts:218,282`, `src/routes/helper.ts:28,174`, `src/routes/share.ts:31`, `src/routes/petRecord.ts:31`, `src/routes/petRecordConcepts.ts:43`, `src/routes/chat.ts:502`, `src/routes/pet-chat.ts:159`, `src/services/insights/context-resolver.service.ts:177`, `src/services/notificationContentResolver.ts:37`, `src/services/breedService.ts:443`, `src/routes/breeds.ts:75`, `src/services/chat/orchestrator.service.ts:255,684`.
- Change: every literal default becomes `DEFAULT_LOCALE`; `lang === 'th' || lang === 'en'` becomes `isLiveLocale`; default use is logged `source: 'default'`.
- Accept: no `?? 'th'`, `|| 'th'`, `?? 'en'`, `= 'th'` defaults outside `src/lib/locale`; a user with no config row gets `en` reminders and broadcasts (test); release note states that users without a config row move from Thai reminders / English broadcasts to English for both.
- Verify: `bun tsc --noEmit && bun run test`.
- Compat/rollback: revert constant.

**P4. Server message catalog.** Branch `feat/i18n-server-messages`. Deps P1.
- Files: new `src/lib/locale/messages/{th.ts,en.ts,index.ts}` (`msg(key, locale, params)`); migrate `services/chat/orchestrator.service.ts:238,245,262,553,693,1051,1138`, `routes/chat.ts:299,377`, `services/chat/validation.service.ts:53`, `petRecordDisplay/resolution.ts:75-80`, `prompts/config/naming-config.ts:29`, `services/blogService.ts:72,91`; stable `code` on user-facing `ApiResponses` errors (input to R2).
- Accept: byte-identical th/en strings; key-parity test across all registry locales; zero ternaries in touched files.
- Verify: `bun tsc --noEmit && bun run test`.
- Compat/rollback: no output change; revert.

**P5. Unified translation resolver.** Branch `feat/i18n-translation-resolver`. Deps P1, P4.
- Files: new `src/lib/locale/resolveTranslation.ts`; `src/services/petRecordConceptCatalog/resolution.ts:105-145`; `src/services/petRecordDisplay/resolution.ts:90,149-215` (delete `OTHER_LOCALE`).
- Change: requested -> `en` (log `translation_fallback {entity, id, locale}`) -> generic label (log error); never a raw key; `resolvedLocale` is the text's real locale.
- Accept: th/en tests unchanged except the raw-key case; `ja` fixture -> `en` + one warn log.
- Verify: `bun tsc --noEmit && ./scripts/test.sh src/services/petRecordDisplay src/services/petRecordConceptCatalog && bun run test`.
- Compat/rollback: output changes only where a raw key showed; revert.

**P6. Breed translations. STOP POINT (migration + backfill).** Branch `feat/i18n-breed-translations`. Deps P1, P5.
- Files: `src/db/schema/pets.ts` (+ `breedTranslations`, constraints cloned from concept translations), migration; `scripts/database/backfill-breed-translations.ts` (`--dry-run`, idempotent upsert from `name_en`/`name_th`); dual-write in `src/services/breedService.ts`, `src/routes/breeds.ts`, `src/seed/`; reads in `getBreedNamesForSelector` and `src/services/petService.ts:39,182` add `name`/`nameLocale`, `breedName`/`breedNameLocale`; `src/lib/redis.ts:205` -> `breeds:names:v2:`.
- Accept: dry-run count = breeds x 2; `name` equals today's client-picked name for th/en; legacy fields unchanged; `?language=` still accepted.
- Verify: `bun run db:validate && bun tsc --noEmit && bun run test`; owner runs the dry-run on staging (env pinned).
- Compat/rollback: additive; reads fall back to columns.

**P7. Notification locale history. STOP POINT (data backfill).** Branch `feat/i18n-notification-locale`.
- Files: `scripts/database/backfill-notification-resolved-locale.ts` (`--dry-run`); `src/routes/notifications.ts` (+ `resolvedLocale`); `src/jobs/unifiedNotificationJob.ts:417-441` (pass `resolvedLocale` when tokens were rendered).
- Change: `UPDATE notifications SET resolved_locale = metadata->>'language' WHERE resolved_locale IS NULL AND metadata->>'language' IN (<live codes>)`, batched, reported per `source_type_enum`. Title/body never touched.
- Accept: zero rows where `resolved_locale <> metadata->>'language'`; title/body checksum unchanged; `bun run scripts/notification-locale-audit.ts` exits 0 on a fresh window.
- Verify: `bun tsc --noEmit && bun run test`.
- Compat/rollback: `SET resolved_locale = NULL` for the logged batch ids.

**P8a. Review status on translation rows. STOP POINT (migration).** Branch `feat/i18n-review-status`. Deps P6.
- Files: `src/db/schema/pets.ts` (`pet_record_type_concept_translations`, `breed_translations`), `src/db/schema/notifications.ts` (`notification_setting_translations`): + `reviewStatus text NOT NULL DEFAULT 'approved' CHECK IN ('approved','needs_review')`, `source text NULL` (`'human'|'machine'`); migration.
- Accept: existing rows `approved`; check constraint rejects other values.
- Verify: `bun run db:validate && bun tsc --noEmit && bun run test`.
- Compat/rollback: additive with default; drop columns in a follow-up migration if reverted.

**P8b. Coverage API + warn-only gate.** Branch `feat/i18n-coverage`. Deps P8a.
- Files: new `src/services/i18n/coverageService.ts` (per entity x locale: total active, missing, needs_review; list endpoint with `missingLocale`, `reviewStatus`, `entity`, paging); routes `GET /api/admin/i18n/coverage`, `GET /api/admin/i18n/missing`, `PATCH /api/admin/i18n/translations/:entity/:id/:locale` (upsert text, set `approved`), behind admin auth; `scripts/i18n/translation-completeness.ts` + `package.json` `i18n:completeness` (prints the same matrix; **exit 0 with warnings** in this packet); unit test over `src/seed/` data that logs (not fails) gaps; admin writes for concepts (`services/conceptEditorService.ts`), breeds and notification settings allow missing locales (R5.3 draft) and return a `missingLocales` array.
- Accept: coverage numbers match fixture; filter `missingLocale=th` returns only rows lacking `th`; PATCH flips `needs_review` -> `approved`; script exits 0 and prints gaps.
- Verify: `bun tsc --noEmit && bun run test`.
- Compat/rollback: new admin routes only; revert.

> **As built (2026-10-02):** G1 shipped as a runtime gap-fill script (`bun run i18n:gap-fill`, dry-run default, LLM drafts inserted as `needs_review`/`machine`, rollback log), not committed seed data, because the translation tables do not exist in staging/prod until migrations 0130-0131 deploy. Runbook: pawjai-be `docs/api/I18N_COVERAGE_API.md`. Coverage script is `i18n:coverage` (not `i18n:completeness`). Build status per packet: `PROGRESS.md`.

**G1. Gap fill. STOP POINT (data migration).** Branch `feat/i18n-gap-fill-<date>`. Deps P8b.
- Steps: owner runs `bun run i18n:completeness` read-only against staging and prod (env pinned) and shares the output; translations (machine-drafted) are committed as an idempotent seed/data migration `scripts/database/seed-translation-gaps-<date>.ts` (or a drizzle data migration) that inserts rows with `review_status = 'needs_review'`, `source = 'machine'`; it never overwrites existing rows and never writes prod directly from a laptop; it applies through the normal deploy migration step.
- Accept: re-run of the gate shows zero missing for live locales; all inserted rows appear in the A2 review queue.
- Verify: `bun run db:validate && bun tsc --noEmit && bun run test`.
- Compat/rollback: delete rows where `source = 'machine' AND review_status = 'needs_review'` inserted by this seed (ids logged).
- Code-side gaps are filled by R2 (RN `apiError.ts`) and P4 (server strings), not here.

**P8c. Gate fails CI.** Branch `feat/i18n-gate-strict`. Deps G1 merged and deployed.
- Files: `scripts/i18n/translation-completeness.ts` (exit 1 on any missing row for a `live` locale; `needs_review` counts as present but is reported), seed test switches from log to fail; add `bun run i18n:completeness` to the release checklist (owner runs against prod before release).
- Verify: `bun tsc --noEmit && bun run test`.
- Compat/rollback: revert the flip.

### 7.2 Admin (`pawjai-admin`, from `origin/staging`; verify `bun run build`)

**A1. Coverage dashboard.** Branch `feat/i18n-coverage-dashboard`. Deps P8b.
- Files: new `app/admin/settings/translations/page.tsx`, `lib/api/services/i18nService.ts`, `hooks/useTranslationCoverage.ts`, entry in `components/admin/AdminSidebar.tsx`.
- Change: matrix entity (concepts, breeds, notification templates) x locale with missing and needs-review counts; click a cell -> list filtered by "missing <locale>"; locales and statuses come from the API, not hardcoded.
- Accept: counts equal the API; filter works for each locale.
- Verify: `bun run build`.
- Compat/rollback: new page; revert.

**A2. Inline edit + review queue.** Branch `feat/i18n-review-queue`. Deps A1.
- Files: `app/admin/settings/translations/` (list row inline editor per locale, "Approve" action), reuse patterns from `app/admin/settings/notifications/components/BilingualFields.tsx`.
- Change: edit a missing/draft translation in place (PATCH from P8b); a "Needs review" tab lists `needs_review` rows (G1 output) with source text beside the draft; approve or edit-and-approve.
- Accept: editing a missing `th` cell removes it from the missing count; approving moves a row out of the queue.
- Verify: `bun run build`.

**A3. Badges on lookup lists.** Branch `feat/i18n-lookup-badges`. Deps P8b.
- Files: `app/admin/settings/concepts/page.tsx`, `app/admin/breeds/page.tsx`, `app/admin/settings/lookup-types/page.tsx`, `app/admin/settings/notifications/` list, `hooks/useConcepts.ts`, `hooks/useLookupTypes.ts`.
- Change: per-row badges "missing th", "missing en", "needs review" from `missingLocales` / review status; saving with gaps shows a non-blocking warning (R5.3).
- Accept: a row missing `th` shows the badge; saving it still succeeds and the badge stays.
- Verify: `bun run build`.

### 7.3 Web app (`pawjai-fe`, from `origin/staging`; verify `bun tsc --noEmit && bun run lint && bun test && bun run i18n:check`)

**F1. Account wins, no IP language.** Branch `fix/i18n-account-language`. Deps P2.
- Files: `components/providers/LanguageSync.tsx` (account value wins; `unseeded` -> PATCH current locale; replace empty `catch {}` with telemetry logging); every fe language picker PATCHes the account (settings page, `app/auth/native-handoff/page.tsx:160-179`); `middleware.ts` (~L66-95: remove `x-vercel-ip-country` from language detection; anonymous: cookie -> whole `Accept-Language` list -> `en`); `lib/i18n/config.ts` `DEFAULT_LOCALE = 'en'`.
- Accept: anonymous English browser on a Thai IP -> `en`; signed-in `th` account with English browser -> `th`; unseeded + English UI -> PATCH `en`.
- Compat/rollback: without P2 `source` is absent and the account value is adopted (today's behavior); revert.

**F2. THB display + billing currency check.** Branch `fix/i18n-thb-display`.
- Files: `lib/subscription/planPricing.ts:160-170`, `lib/subscription/formatters.ts:63-110`, `lib/utils/currency.ts:138`, `components/tier/TierPageView.tsx:61,66,267`.
- Change: R4.2 formatting by display locale. Also verify R3.1: signed-in pricing uses the Stripe customer currency, else account country; if fe uses IP country for signed-in users, fix it here and cite the line in the PR.
- Accept: `th` UI `1,790 บาท`; `en` UI THB `฿1,790`; USD `$9.99`; signed-in user with a THB Stripe customer on a US IP sees THB.
- Compat/rollback: display only; revert.

**F3. Shared language cookie.** Branch `feat/i18n-shared-lang-cookie`. Deps F1.
- Files: `lib/i18n/cookie.ts` (write `pawjai_lang` with `Domain=.pawjai.co; Path=/; Max-Age=31536000; SameSite=Lax; Secure`, value = account locale; keep the existing host cookie in sync), `components/providers/LanguageSync.tsx` and language pickers (write on sync and on every change); sign-out keeps the cookie (a preference, not a credential).
- Accept: after sign-in, `document.cookie` on `pawjai.co` and `www.pawjai.co` shows `pawjai_lang=<account locale>`; changing language updates it.
- Compat/rollback: stop writing; cookie expires.

### 7.4 React Native (`pawjai-react-native`, branches from `codex/aesthetic-improvement` HEAD; verify `npm run typecheck && npm run lint && npm test`)

Six auth files are uncommitted by another agent (`AccountDisabledScreen`, `EmailConfirmationScreen`, `ForgotPasswordSheet`, `OnboardingScreen`, `ResetPasswordScreen`, `TermsConsentView`). Only R6 touches one, after that commit.

**R1. Query keys carry the language (T3).**
- Files: `src/services/queryKeys.ts:18,45,79`; `src/services/decoders.ts:150-170` (keep both names, resolve at render); new `src/i18n/pickName.ts`; `src/features/home/useHomeData.ts:44,84`, `src/features/timeline/useTimeline.ts:39`, `src/features/quickLog/recordWrites.ts:15`, `src/features/timeline/useRecordDetail.ts:39`, pet screens reading `breedName`.
- Accept: language switch changes the active key and refetches with the new `lang`; breed name re-renders without refetch.
- Compat/rollback: client-only; revert.

**R2. Localized error text (T2).**
- Files: `src/services/http/apiError.ts:29-47` (`describe` stays English for logs; add `errorKey(kind, code)`); `src/features/shared/errorMessage.ts`; `src/i18n/{th,en}.ts` `error.*` keys.
- Accept: no English sentence shown under `th` for any `ApiErrorKind`; unknown server code -> localized generic text and the server message logged.
- Compat/rollback: client-only; works before P4; revert.

**R3. Account-wins sync.** Deps P2 (degrades).
- Files: `src/state/language.ts` (device default: whole `AppleLanguages` list matched to live locales, then region `TH` -> `th`, then `en`; replaces `:50-57`); new `src/features/settings/useLanguageAccountSync.ts`; `src/services/live.ts:635-640`, `src/services/types.ts:157`, `src/services/decoders.ts:707-711`.
- Rules: signed in -> adopt account; `unseeded` -> PATCH app language; every change PATCHes; old be without `source` -> adopt account.
- Accept: tests for adopt, seed, old payload, PATCH failure (banner, no retry loop).
- Compat/rollback: client-only; revert.

**R4. Registry and guardrails.**
- Files: new `src/i18n/registry.ts`; `src/state/language.ts`; `src/i18n/index.ts:15-39` (`language` required; key parity over all registry locales; test: no empty values, no identical th/en values unless allow-listed); `src/design-system/components/DatePicker.tsx:53` (`localeIdentifier` from `intlLocale`, `-` -> `_`, today's `th_TH`/`en_US`); `src/features/auth/AuthScreen.tsx:289`, `src/features/settings/SettingsLanguageScreen.tsx:24-37` (live locales only); `.eslintrc.js` `no-restricted-syntax` on literal-locale comparisons outside `src/i18n/**` (`warn`, `error` after R5/R6).
- Accept: pickers and DatePicker unchanged for th/en; completeness test passes.
- Compat/rollback: client-only; revert.

**R5. Formatting profile, plurals, inline strings.** Deps R4.
- Files: new `src/i18n/format/{profiles.ts,plural.ts}`; `src/lib/dates.ts`, `src/lib/petAge.ts`, `src/features/health/chartGeometry.ts:100`, `src/features/share/VetShareSheet.tsx:64-67`, `src/features/legal/SettingsLegalScreen.tsx:42-44`, `src/features/timeline/recordLabel.ts` (dead branch), `src/services/mock.ts:596,611`.
- Accept: `__tests__/lib/dates.test.ts`, `__tests__/lib/petAge.test.ts` unchanged and passing (add characterization cases first where uncovered).
- Compat/rollback: client-only; revert.

**R6. Legal docs by registry.** Deps R4 + the other agent's commit.
- Files: `src/features/legal/legalDocuments.ts`, `SettingsLegalScreen.tsx:34-35`, `TermsConsentView.tsx:77-79`. A locale without legal docs has `capabilities.legal = false` and cannot be `live`.
- Accept: th/en unchanged; lint at `error`, zero hits.
- Compat/rollback: client-only; rebase on the other agent's commit.

**R7. Prefer server-resolved names.** Deps P6 (works without).
- Files: `src/services/decoders.ts:150-170,846-865`, `src/i18n/pickName.ts`.
- Accept: decoder tests for new and old payloads; old payload logs the fallback.
- Compat/rollback: revert.

**R8. Remove web purchase steering (store-review fix, R3.4).**
- Audit result (2026-10-02, `codex/aesthetic-improvement` @ `4e5cbb3`): **no price rendering and no link to `/tier` or web checkout found** (grep for `/tier`, `checkout`, `stripe`, currency symbols, `THB`/`USD`, `Linking.openURL`; the only `openURL` is `mailto:support` in `settingsActions.ts:86`). **One steering string found:** the pet-limit banner `src/features/pets/AddPetScreen.tsx:161` shows `subscription.hidden.visitWebMorePets` = "Visit pawjai.co to manage more pets" (`src/i18n/en.ts:579`, `src/i18n/th.ts:575`; described in the header at `AddPetScreen.tsx:11-12`). More pets is a premium capability, so pointing to the website to get it is steering under App Store guideline 3.1.1 / Play payments policy.
- Change: replace with a neutral limit message that names no website or purchase path (proposed: en "You've reached the pet limit for your plan." / th equivalent; final copy needs owner OK in the PR); rename the key to `subscription.petLimitReached`; update the header comment. The Settings "Pawjai Premium" row (`SettingsScreen.tsx:156`) opens a no-op paywall (`settingsActions.ts:91`) and shows no price: leave it, and when IAP is built it must use store prices (R3.3).
- Accept: grep for `pawjai.co` in user-visible catalog strings returns only support/legal contact text; banner test renders the new key.
- Compat/rollback: client-only copy change; revert.

### 7.5 Public site (`pawjai-public`, from `origin/main`; verify `bun run check && bun test && bun run build`)

**U1. THB display.** Branch `fix/i18n-thb-display`.
- Files: `src/lib/subscription/pricing.ts:183-199` and `/tier` callers.
- Accept: `/th` unchanged; `/en` THB `฿1,790`; USD unchanged; JSON-LD unchanged.
- Compat/rollback: revert and redeploy.

**U2. Ternaries out + catalog parity.** Branch `feat/i18n-registry-driven`.
- Files: `Navbar.astro:111-176` (loop `LOCALE_CONFIG.locales`, en-first like today; switcher links go to the same path in the other prefix, never via a redirect), `BaseLayout.astro:42,138`, `seo/PageFaq.astro:23`, `seo/PageFacts.astro:33,39`, `seo/PublicReference.astro:28-44`, `lib/seo/schema.ts:37,109,135`, `lib/seo/registry.ts:233`, `tos/VersionText.astro:22,35`, `common/VersionText.tsx:16,28`, `[...lang]/privacy.astro:20`, `terms.astro:28`, `lib/seo/machine.ts:23,25`, `components/home/counting-number.tsx:72`; registry gains `status`; tests `src/__tests__/no-locale-literals.test.ts`, `src/__tests__/catalog-completeness.test.ts`; hreflang/sitemap emit only `live` locales and omit pages that exist in one language (R5.5).
- Accept: built HTML for `/en` and `/th` identical except VersionText style (if accepted) and `dir="ltr"`; tests pass.
- Compat/rollback: revert and redeploy.

**U3. Edge cookie + bare-`/`-only negotiation.** Branch `feat/i18n-edge-cookie`. Works before F3 (no cookie = today's header path).
- Files: `functions/_middleware.ts`, `src/lib/i18n-negotiation/redirect-target.ts` (+ tests).
- Change: for bare `/` only: `pawjai_lang` (if `live`) -> whole `Accept-Language` list -> `en`, 307 with `Vary: Cookie, Accept-Language`. Locale-prefixed paths: never redirected (already true; add a test). Legacy unprefixed paths (`/about`, `/tier`): stop negotiating; permanent 301 to a fixed locale per Q-A (proposed `/th/...`, since they were the published Thai URLs). IP country continues to set only the pricing country cookie.
- Accept: tests: `/` with cookie `th` and English header -> `/th/`; `/en/about` with cookie `th` -> no redirect; `/about` -> 301 fixed target regardless of headers; `/robots.txt` untouched.
- Compat/rollback: revert and redeploy; cached 301s on legacy paths persist, which is why Q-A must be answered first.

### 7.6 Deferred until locale #3 is chosen

| ID | Work | Trigger |
|---|---|---|
| D1 | Contract: drop `breeds.name_*`, `pet_record_types.name_*`, legacy notification columns, orphan PG enum `language` (check `information_schema.columns WHERE udt_name = 'language'` returns 0); remove `nameTh/nameEn` | App min-version gate shows no client older than R7 |
| D2 | AI prompts per locale via `capabilities.aiChat/aiInsights` | Locale named |
| D3 | Hermes `Intl` spike; ICU if needed | Complex plurals |
| D4 | RTL in RN and public | RTL locale |
| D5 | Per-locale font stacks (DESIGN.md, owner approval) | Non-Thai/Latin script |
| D6 | fe consumes `name`, drops its 160 ternaries; keep/switch prompt for `legacy` rows (owner did not approve new UI) | Locale #3 or owner request |
| D7 | Notification read cutover: deploy with `NOTIFICATION_TRANSLATION_READS_ENABLED=false`; `bun run scripts/notification-translation-readiness.ts` exits 0 on real data; review `notification_locale_resolution_summary` logs; enable only by an explicit authorized deploy; test sends + `bun run scripts/notification-locale-audit.ts` exit 0; soak; roll back by flag; contract afterwards | Readiness + soak |

## 8. Open questions for the owner

| # | Question | Changes |
|---|---|---|
| Q-A | R2 says only bare `/` may redirect by detection, but today the edge also negotiates legacy unprefixed paths (`/about`, `/tier`, `functions/_middleware.ts:23-32`). Proposed: permanent 301 to `/th/...` (their historical Thai content). OK, or `/en/...`? | U3 |
| Q-B | R8 replacement copy for the pet-limit banner (proposed: "You've reached the pet limit for your plan.") | R8 copy |

## 9. Archived LOCALIZATION_REFACTOR.md: verdict

| # | Decision | Verdict | Now in |
|---|---|---|---|
| 1, 3 | th/en valid, no renames | keep | rules header terms, R1.5 registry |
| 2 | BCP-47 codes | keep | rules terms |
| 4 | Locale, region, currency, timezone separate | keep | R1.4, R3.2 |
| 5 | New locale = config + translations | keep | R6.1-R6.2 |
| 6 | `nativeLabel` optional | superseded | required in section 2 |
| 7 | No `englishName` | keep | section 2 (absent) |
| 8 | `direction` optional | superseded | required in section 2 |
| 9 | No RTL now | keep | D4 |
| 10-12, 14 | Stable ids + translation rows; codes + params; snapshot only for delivered artifacts with resolved locale | keep | R6.1, R6.4 |
| 13 | Notification templates -> translation rows | keep | D7 |
| 15 | expand -> dual -> backfill -> cutover -> observe -> contract | keep | R7.1 |
| 16-19 | Legacy blog boundary; external site owns new blog localization; `external_domains` on domain move | keep | R7.2-R7.3 |

None is contradicted by code; its factual sections are stale. Unique content (D7 procedure, blog boundary, snapshot rationale) now lives in the rules doc and D7. **Safe to delete** after P1 repoints the two code comments (already dangling).

---
FRESH (before -> after this revision): F 2 -> 2 (linked from the rules doc, no docs index) · R 2 -> 2 (current metadata; RN audit re-run; admin file targets taken from `origin/staging` file list, not opened) · E 2 -> 2 (shorter section 1, still long) · S 3 -> 3 (rules moved out; plan is packets + migration only) · H 3 -> 3 (execution order, stop points, per-packet verify). Total 12/15 (B) -> 12/15 (B).
