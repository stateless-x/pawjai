---
status: draft
updated: 2026-10-02
scope: Localization audit across pawjai-be, pawjai-react-native, pawjai-public (fe/admin noted briefly)
inputs: scout-rn.md, scout-be.md, scout-public.md (Haiku), verified against code on the branches below
companion: PLAN.md (packets); rules: docs/LOCALIZATION_RULES.md
---

# Pawjai localization audit (verified)

Read-only audit. Every claim below was checked against code. "Today" means reachable with `th`/`en` right now. A `locale === 'th' ? a : b` that is correct for th/en is a **third-locale blocker**, not a today bug.

| Repo | Branch / ref read | Verify command (real, from package.json / CI) |
|---|---|---|
| pawjai-be | `feat/reminder-detail` (9b7edc1); `origin/staging` (f4aed06) for log-cards | `bun tsc --noEmit && bun run db:validate && bun run test` (CI: `.github/workflows/ci.yml`; `test` needs Docker) |
| pawjai-react-native | `codex/aesthetic-improvement` (6 uncommitted auth files from another agent, untouched) | `npm run typecheck && npm run lint && npm test` |
| pawjai-public | `main` | `bun run check && bun test && bun run build` |
| pawjai-fe | `staging` | `bun tsc --noEmit && bun run lint && bun test && bun run i18n:check` |

Prior art: `output/archive/pawjai-be-docs/technical/LOCALIZATION_REFACTOR.md` (archived, 1597 lines). It recorded defects D-1..D-10, 19 decisions and notification Phases 1-5. Several of its defects are still live (marked below). Its decisions were re-verified and folded into PLAN.md section 1; verdict in PLAN.md section 8.

Owner decisions that resolve findings here (normative text in docs/LOCALIZATION_RULES.md): account wins, else device/browser language list, else region TH, else English; existing rows never flipped (R1); only bare `/` redirects (R2); currency by billing account or IP country, never language, and no web steering in apps (R3); THB shown as `฿1,790` in non-Thai copy (R4.2); live locales must be complete, fallback logged (R5); IP country never picks language (R1.4).

## 1. Language inconsistencies users can hit today

Ordered by reach x severity. Release status matters: **pawjai-react-native is not released** (dev builds against prod with the owner's token, `docs/STATUS.md`), and **pawjai-public is not deployed** (`output/ADR-pawjai-public-cutover.md`: "not yet deployed"; pawjai.co is still pawjai-fe). So "today" items cite the shipped surface (fe, be); RN/public rows marked **first release** will be hit the day those ship.

| # | What the user sees | Root cause (evidence) | Who / status |
|---|---|---|---|
| T1 | **An English user is pushed into Thai.** Web (live): after sign-in, `LanguageSync` flips an English UI to Thai because the server always holds `'th'`. Pushes (live): reminder token fallbacks ("น้อง" vs "your pet"), scheduled templates and the vet-share/helper default are Thai for anyone who never explicitly chose English. | `user_config.preferred_language` is written as `'th'` at creation (`be src/services/userConfigService.ts:54`, from `src/routes/auth.ts:82`; DB trigger also `'th'`), so "never chose" equals "chose Thai". fe `components/providers/LanguageSync.tsx` adopts any backend value that differs from the UI locale (its "push local when backend empty" branch is unreachable because the backend is never empty; errors are swallowed by `catch {}`). RN (first release): only `SettingsLanguageScreen.tsx:54` calls `setLanguage`; Auth toggle (`AuthScreen.tsx:240`) and the device default (`state/language.ts:50-57`) stay local. Consumers: `unifiedNotificationJob.ts:405`, `routes/share.ts:31`, `routes/helper.ts:28`, `insights/context-resolver.service.ts:177`. | **Today** on web + push; RN on first release. Fix: P2 + F1 + R3 for new and unseeded accounts; existing rows stay as stored (R1.3); keep/switch prompt deferred |
| T2 | **Thai user sees English error text** ("Not found.", "Your session expired...", raw server messages such as "Please add a pet before logging"): Thai chrome with an English banner. | `RN src/services/http/apiError.ts:29-47` `describe()` returns hardcoded English (ported from Swift `APIError.swift:60-72`, so any shipped iOS build carries the same); `src/features/shared/errorMessage.ts:19` shows `error.message` verbatim; be `ApiResponses.*` messages are English-only. | RN **first release** (iOS if shipped) |
| T3 | **Timeline / Home record labels and pet breed names stay in the old language after switching language**, until the next refetch (staleTime 60 s, then a remount/focus/pull). | Server-localized reads whose query key lacks the language: `queryKeys.timeline.records` (`RN src/services/queryKeys.ts:45`, `useTimeline.ts:39`) and `home.recentRecords` (`:18`, `useHomeData.ts:44`), both calling `timelineRecords` with `lang: language()` (`live.ts:336-343`); `me` (`:79`) decodes `breedName` at fetch time with the then-current language (`decoders.ts:163`). `SettingsLanguageScreen.tsx:10-12` claims all such keys carry the language; these three do not. | RN **first release** |
| T4 | **"บาท" inside English pricing copy** for visitors in Thailand ("1,790 บาท" on an English page). | Live: `pawjai-fe lib/subscription/planPricing.ts:160-164` `formatPrice` and `lib/subscription/formatters.ts:71,110` print `บาท` for THB regardless of UI locale. Same code ported to `public src/lib/subscription/pricing.ts:183-199`. Currency is (correctly) by country, so a TH visitor reading English gets Thai unit text. | **Today** on fe `/tier`; public on first deploy. Fix: F2, U1 (R4.2) |
| T5 | **Users with no `user_config` row get English broadcasts but Thai reminders.** | Broadcast fan-out defaults `'en'` (`be src/services/notificationBroadcastService.ts:357`), reminder job defaults `'th'` (`src/jobs/unifiedNotificationJob.ts:405`). Archived D-1, still live. Reach unknown (auth creates the row; legacy users may lack it). | Users without a config row |
| T6 | **Raw concept key shown as a label** (e.g. `activity.feeding`) in the Quick Log catalog when a concept has neither a requested-locale nor an English translation, while the response claims `resolvedLocale: <requested>`. | `be src/services/petRecordConceptCatalog/resolution.ts:139-144`. Data-dependent; measure with SQL in section 5. | Quick Log users, if data gaps exist |
| T7 | **Web: English-preferring user located in Thailand gets Thai on first load.** | `pawjai-fe middleware.ts` (~L72-84): `country === 'TH'` wins over Accept-Language. Archived D-10, still live. Public site negotiates by Accept-Language only, so the two sites disagree for the same person. | fe visitors in TH with English browsers. Fix: F1, U3 (R1.4) |
| T8 | Product default differs by surface: public `en` (`public src/i18n/locale-config.ts`), fe config `th` but middleware `en`, be `th` (7 explicit `?? 'th'` + DB defaults), broadcast `en`, RN device-derived. | No single registry/default across repos. | Cross-surface users. Fix: P3, F1, R3 converge on R1 |

| T9 | **RN pet-limit banner says "Visit pawjai.co to manage more pets"**: steering to the website for a premium capability (store-review risk, rules R3.4). No price rendering or `/tier`/checkout link exists in RN. | `RN src/features/pets/AddPetScreen.tsx:161`, `src/i18n/en.ts:579`, `src/i18n/th.ts:575` | RN **first release**. Fix: R8 |

Latent (not reachable by current first-party clients, but wrong):

| # | Issue | Evidence |
|---|---|---|
| L1 | be `Accept-Language` parsing ignores q-values and tests `en` before `th`, so `th-TH,th;q=0.9,en;q=0.8` resolves to `en` (archived D-2). RN sends a single token (`apiClient.ts:140`), fe's client sets a single token, so first-party traffic is unaffected; any third-party/raw browser call is. | `be src/utils/locale.ts:15-26`; duplicate resolver `src/routes/admin/pets.ts:7-16` |
| L2 | RN `t()` defaults its `language` parameter to `'th'`. All 3 raw call sites pass a language today, but a new caller that forgets silently shows Thai. | `RN src/i18n/index.ts:31` |
| L3 | Five spellings of "the locale" on the wire: `?lang` (records, catalog, chat history), `?language` (breeds selector `routes/breeds.ts:75`, notification settings), `locale` (chat body/query, suggestions), `Accept-Language`, body `preferredLanguage`. Each route validates its own `z.enum(['th','en'])`. | RN `live.ts:208,249,528,546,600,637`; be `constants/schemas.ts:153,161,206,315`, `routes/chat.ts:50`, `routes/chat-suggestions.ts:16,35` |

## 2. Third-locale blockers (correct for th/en today, break or silently mis-render for locale #3)

Counts are `grep -E "=== ?'(th|en)'|!== ?'(th|en)'"` excluding tests (RN/be single quotes; public double quotes).

| Repo | Count | Where (top files) | Kind |
|---|---|---|---|
| RN | **24** in 15 files | `lib/dates.ts` (4), `lib/petAge.ts` (3), `features/legal/SettingsLegalScreen.tsx:34-44` (3), `features/auth/TermsConsentView.tsx:77-79` (3, uncommitted file owned by another agent), `services/mock.ts` (2), `services/decoders.ts:163,859`, `features/health/chartGeometry.ts:100`, `features/share/VetShareSheet.tsx:65`, `features/timeline/recordLabel.ts:22`, `design-system/components/DatePicker.tsx:53`, `features/auth/AuthScreen.tsx:289`, `features/settings/SettingsLanguageScreen.tsx:36`, `state/language.ts:28` | Silent: ternaries pick English for any non-th locale |
| RN | 4 tables | `dates.ts` `calendarTemplates`, `templates`, `shortWeekdays`, `shortMonths` are `Record<AppLanguage, ...>` | Compile-enforced: widening `AppLanguage` surfaces them. Not silent. |
| be | **58** in 27 files | `chat/orchestrator.service.ts` (7), `pets/suggestion-context.service.ts` (6), `insights/prompt-builder.service.ts` (6), `insights/dummy-card-generator.service.ts` (4), `chat/context-builder.service.ts` (4), `petRecordDisplay/resolution.ts` (3), `prompts/health-summary-prompt.ts` (3) | Mix of user-facing strings (chat errors `orchestrator.service.ts:238,245,262,553,1051`, `routes/chat.ts:299,377`, `chat/validation.service.ts:53`), AI prompt language, `น้อง` prefix (`prompts/config/naming-config.ts:29`), blog author (`blogService.ts:72`) |
| be | 2-locale type gates | `LANGUAGE_ENUM = ['th','en']` (`constants/enums/user.ts:7`) feeds every `z.enum`; `SupportedNotificationLocale`, `TemplateLang`; `OTHER_LOCALE = {en:'th', th:'en'}` (`petRecordDisplay/resolution.ts:90`); `GENERIC_LABELS` en/th only (`:75-80`); broadcast/job filters `lang === 'th' \|\| lang === 'en'` (`notificationBroadcastService.ts:697`, `unifiedNotificationJob.ts:358`) | Validation rejects a 3rd locale (loud, good); filters drop it to defaults (silent) |
| be | per-language columns | `breeds.name_en/name_th` (`db/schema/pets.ts:35-36`), `pet_record_types.name_en/name_th` (`:236-237`), `notification_settings.title_th/body_th/title_en/body_en` (legacy, dual-written), `notification_broadcasts` same four (snapshot) | DDL per locale |
| public | **26** branches in 11 files (scout said 11) | `Navbar.astro:114-171` (8, plus hardcoded `EN`/`ไทย` labels), `seo/PublicReference.astro:28,38,44`, `seo/PageFacts.astro:33,39`, `seo/PageFaq.astro:23`, `lib/seo/schema.ts:37,109,135`, `lib/seo/registry.ts:233`, `tos/VersionText.astro:22,35`, `common/VersionText.tsx:16,28`, `BaseLayout.astro:138`, `[...lang]/privacy.astro:20`, `[...lang]/terms.astro:28`; plus `lib/seo/machine.ts:23,25` hardcoded `(ไทย)`/`(English)` | Hardcoded UI strings outside catalogs; legal doc selection silently serves Thai to locale #3 |
| fe / admin | 160 ternaries (fe), 62 `nameTh/nameEn` refs (fe), 71 bilingual refs (admin) | not audited deeply | fe already has a registry (`lib/i18n/registry.ts`) with capabilities; admin `BilingualFields` is 2-locale |

Hardcoded user-facing strings outside catalogs (RN; scout said "~0"):

| File:line | String | Today impact |
|---|---|---|
| `src/services/http/apiError.ts:32-46` | 6 English error descriptions | **Today (T2)** |
| `src/features/share/VetShareSheet.tsx:64-67` | share message th/en inline | blocker |
| `src/lib/petAge.ts:29-49` | `วัน/เดือน/ปี`, `Day(s)/Month(s)/Year(s)` with hand-rolled plurals | blocker |
| `src/features/legal/SettingsLegalScreen.tsx:42-44` | `Version ... • Effective ...` / `ฉบับที่ ... • มีผลวันที่` | blocker |
| `src/features/auth/AuthScreen.tsx:289` | `'TH'`/`'EN'` segment labels | blocker |
| `src/features/settings/SettingsAdvancedScreen.tsx:35` | `'DELETE'` confirmation token | intentional, keep |

## 3. Data that bakes human text at write time (activity log question)

| Table | Baked text? | Identity for re-render | Verdict |
|---|---|---|---|
| `pet_records` (Timeline) | **No** label stored. `type_id` + immutable concept snapshot (`concept_id`, `db/schema/pets.ts:276-312`); `note` and `helper_label` are user/owner-entered text (`routes/pets.ts:317`). | Label resolved at read via `petRecordDisplay` with `requestedLocale/resolvedLocale/usedFallback` (`services/petRecordDisplay/resolution.ts:17-28`). | Nothing to backfill. |
| `pet_chat_messages` receipts / log cards | `metadata.payload.display` (snapshot at commit locale), deprecated `subtypeName`, `summary` (= user note or LLM summary), `content` (English model-facing note, `origin/staging log-card-history.ts formatLogCardNote`). `locale` column per row. | Every receipt carries `recordId`; `historical-receipt-resolver.service.ts` re-resolves `display` at the **current request locale** on every read and never writes back. A name-to-typeId backfill was explicitly rejected there (lossy). | Already key-based at read. Nothing to backfill. `summary`/LLM text is user/AI content, never translated. |
| `notifications` (in-app history) | **Yes**: `title`/`body` rendered at send (`db/schema/notifications.ts:328-345`). `resolved_locale` column exists, nullable, "never backfilled or inferred". Broadcast rows also write `metadata.language` = resolved locale and `metadata.requestedLanguage` (`notificationBroadcastService.ts:641-664`). Reminder rows write neither (`unifiedNotificationJob.ts:417-441`). | Broadcast rows: `source_id` = broadcast id; `notification_broadcasts` holds th+en snapshots, but template tokens (pet name etc.) were resolved with send-time context, so a re-render is not byte-reliable. Reminder rows: user-typed title. | Snapshot by design. Backfill only `resolved_locale` from `metadata->>'language'` on broadcast rows (exact copy, reliable). Reminder/legacy rows stay `NULL` = unknown and render as stored. |
| `notification_broadcasts` | Yes, th+en snapshot | n/a | Audit snapshot, keep. |
| `admin_audit_log` | `action` is a code (e.g. `AUDIT_LOG_PURGED`, `adminAnalyticsService.ts:389`) + `metadata jsonb` (`db/schema/admin.ts:44-56`). | Code + params already. | Scout claim "plain English text" is wrong. Admin-only. |
| `user_reminders` | User-typed `title`/`description`, may contain template tokens resolved at send | n/a | User content. |

## 4. Lookup data storage today

| Entity | Storage | Locale-extensible without DDL? | Notes |
|---|---|---|---|
| Record concepts | `pet_record_type_concepts` + `pet_record_type_concept_translations(concept_id, locale text, name, description)`, unique `(concept_id, lower(locale))`, non-blank checks, FK cascade, audit cols (`pets.ts:163-229`) | Yes | Fallback chain: requested -> `en` -> **raw key** (`petRecordConceptCatalog/resolution.ts:105-145`) |
| Record types (species variants) | `pet_record_types.name_en/name_th` + nullable `concept_id` (`pets.ts:232-273`) | No | **Dual source of truth** with concept translations. Display chain: concept requested -> concept `en` -> legacy requested -> legacy other (`OTHER_LOCALE`) -> `GENERIC_LABELS` (`petRecordDisplay/resolution.ts:149-215`). Two different chains for the same names. |
| Breeds | `breeds.name_en/name_th` + `aliases jsonb` (`pets.ts:32-45`); Redis cache `breeds:names:{species}:{locale}` (`lib/redis.ts:205`); API returns both names, client picks | No | `/api/me` returns `breedNameTh/En` (`services/petService.ts:39,182`) |
| Notification templates | legacy 4 columns + `notification_setting_translations` (same pattern as concepts), dual-written; read cutover flag `NOTIFICATION_TRANSLATION_READS_ENABLED` exists on both branches, default off (`config/env.ts:115,218`) | Yes (once cut over) | Default fallback `'th'` (`notificationContentResolver.ts:37`) |
| Server-generated strings | inline ternaries (section 2) | No | No server message catalog exists |
| Locale-valued columns | `user_config.preferred_language`, `pet_insights.locale`, `pet_chat_messages.locale`, `blog_posts.locale`, `health_summary_generations.locale`, `chat_suggestion_events.locale`: **already `text`** since migration `db/drizzle/0118_cooing_maelstrom.sql:14-26`, typed `$type<Language>()` in TS | Yes at DB level | PG enum type `language` (`0007`) is now orphaned |

## 5. Data checks the owner can run (read-only, not run here: no DB access)

```sql
-- T6 reach: active concepts missing both a th and an en translation
SELECT c.key FROM pet_record_type_concepts c
WHERE c.is_active AND NOT EXISTS (SELECT 1 FROM pet_record_type_concept_translations t
  WHERE t.concept_id = c.id AND lower(t.locale) IN ('th','en'));
-- Dual source of truth: active lookup rows not linked to a concept
SELECT count(*) FROM pet_record_types WHERE is_active AND concept_id IS NULL;
-- T5 reach: users with no config row
SELECT count(*) FROM user_profiles p LEFT JOIN user_config c ON c.user_id = p.id WHERE c.user_id IS NULL;
-- T1 reach (approximate): language distribution; 'th' includes never-chosen
SELECT preferred_language, count(*) FROM user_config GROUP BY 1;
-- Notification backfill feasibility
SELECT source_type_enum, count(*) FILTER (WHERE metadata ? 'language') AS has_lang, count(*) FROM notifications GROUP BY 1;
-- R1.3 check: rows that can PROVE a default (expected 0; there is no language-change audit trail)
-- (No query can distinguish defaulted 'th' from chosen 'th'; this is why no existing row is flipped.)
-- Orphaned enum check before any DROP TYPE (pg_depend is never empty: the _language array type depends on it)
SELECT table_name, column_name FROM information_schema.columns WHERE udt_name = 'language';
```

## 6. Scout corrections

| Scout claim | Verified | Evidence |
|---|---|---|
| RN: "~50 ternary locale checks" | **24** | grep above |
| RN: line numbers `AuthScreen.tsx:164`, `DatePicker.tsx:107` | `:289`, `:53` | files on `codex/aesthetic-improvement` |
| RN: "all strings checked via t()", 0 unintentional hardcoded strings | 5 sites incl. today-visible English errors | section 2 table |
| RN: missed legal-doc selection | `SettingsLegalScreen.tsx:34-44`, `TermsConsentView.tsx:77-79` | |
| RN: "templates ... never invoked" / "would throw for a third locale" | Invoked by `relative()` (`dates.ts:130-156`); tables are `Record<AppLanguage,...>` so a 3rd locale is a compile error, not a runtime throw | |
| RN: `breedSort` `localeCompare(..., 'th')` "undefined behaviour" | `'th'`/`'en'` are valid BCP-47 tags; fine | `lib/breedSort.ts:20` |
| RN: `recordLabel.ts` fallback chain "risk" | The `nameTh/nameEn` branch is dead: the backend always sends `display.label` | `decoders.ts:363-374`, be `PetRecordDisplay.label: string` |
| RN: "~33k lines of catalog" | `th.ts` 716 lines, `en.ts` 720 | `wc -l` |
| RN: "No mixed-language screens" | T2 (English errors in Thai UI) and T3 (stale labels after switch) | |
| be: `preferred_language` is a Postgres ENUM needing `ALTER TYPE` | Widened to `text` in 0118 (all six enum columns); enum type orphaned | `db/drizzle/0118_cooing_maelstrom.sql:14-26`, `db/schema/users.ts:76` |
| be: "`?? 'th'` in 40+ routes" | **7** explicit `?? 'th'` + default params (`orchestrator.service.ts:255,684`, `breedService.ts:443`, `routes/breeds.ts:75`) + `\|\| 'th'` in `adminUserService.ts:218,282`, `helper.ts:174`, `context-resolver.service.ts:177`, `userConfigService.ts:116` | grep |
| be: "60+ ternaries" | **58** | grep |
| be: `admin_audit_log.action` is English prose | It is an action code + jsonb metadata | `db/schema/admin.ts:44-56` |
| be: broadcast "silently drops" a 3rd locale | It defaults that user to `'en'` | `notificationBroadcastService.ts:357,697` |
| be: missed | T1 (preferred_language default + no RN sync), T5 (`en` vs `th` defaults), L1 (Accept-Language), T6 (raw key), dual source of truth for record names | |
| public: "11 binary branches" | **26** in 11 files; scout missed `PageFaq`, `PageFacts`, `PublicReference`, `schema.ts` hardcoded strings | grep |
| public: "English falls back to system fonts" | Kanit and Mitr ship Latin glyphs; English renders in brand fonts. Only `Noto Sans Thai` is Thai-centric. A CJK/Arabic locale would still need new families. | `BaseLayout.astro:73` |
| public: price formatting only a 3rd-currency issue | Also **today** (T4) | `pricing.ts:183-199` |

## 7. Cosmetic

- public `VersionText` formats English dates with `en-GB` ("2 October 2026") while the registry says `en-US` and the app shows "Oct 2, 2026" (`tos/VersionText.astro:22`, `common/VersionText.tsx:16`).
- public `counting-number.tsx:72` `toLocaleString()` uses the browser locale, not the page locale.
- public `registry.getLocaleDirection()` is defined but `<html>` has no `dir` (`BaseLayout.astro:42`).
- be notification analytics label every broadcast by its English title (`analyticsNotificationsService.ts:195`; archived D-9, still live, admin-only).
- RN `petAge` English capitalizes units ("3 Days"), unlike other English copy.
- be `breedService.getBreedNamesForSelector` ignores `sortBy` from cache; RN re-sorts locally (`live.ts:536-551`). Fine, but sort collation is client-side per locale.

---
FRESH (new doc, current only): F 2 (descriptive name + headings; not yet in an index) · R 2 (status/updated metadata, claims spot-checked, but no DB data so T5/T6 reach unmeasured) · E 2 (tables, but long) · S 3 (audit only; plan lives in PLAN.md) · H 2 (paths and SQL given; fixes live in PLAN.md). Total 11/15 (B).
