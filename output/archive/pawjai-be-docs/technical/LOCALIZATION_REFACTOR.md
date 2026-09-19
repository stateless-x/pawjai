# Localization Refactor — Architecture Inventory (Task 0A)

**Status:** Inventory only. Documentation-only artifact. No runtime, schema, catalog, API,
notification, AI, blog, dependency, test, or WebView code was changed to produce this document.

**Branch:** `refactor/localization-platform` in `pawjai-fe`, `pawjai-be`, `pawjai-admin`.

**Scope of evidence:** the three repositories present in the workspace
(`pawjai-fe`, `pawjai-be`, `pawjai-admin`). The iOS and Android native sources are **not**
present in this workspace; native behavior is recorded as unknown except where web-side code
proves it.

**How to read this document:** Section 1 is what was verified by reading code. Section 2 is
decisions handed down as confirmed. Section 3 is assumption (unverified, must be checked before
implementation depends on it). Section 4 is unanswered product questions. Sections 5–12 describe
**observed current behavior**. Sections 13–15 describe **proposed target behavior** and are not
implemented anywhere. Section 16 is reproducible measurement.

Every file reference is `path:line` at the commit this branch was created from.

---

## 1. Verified facts

Each fact below was confirmed by reading the cited file.

### 1.1 Locale value space

| # | Fact | Evidence |
|---|---|---|
| F-1 | The backend locale value space is exactly `['th','en']`, declared once as a TS const tuple. | `pawjai-be/src/constants/enums/user.ts:7` |
| F-2 | The same tuple is the source of the PostgreSQL enum type `language`. | `pawjai-be/src/db/schema/enums/user.ts:6` |
| F-3 | The frontend locale value space is a separately declared `"en" \| "th"` union with `SUPPORTED_LOCALES = ["th","en"]` and `DEFAULT_LOCALE = "th"`. | `pawjai-fe/lib/i18n/config.ts:1,3,5` |
| F-4 | FE and BE locale types are **structurally identical but independently declared**; nothing enforces they stay in sync. | `pawjai-fe/lib/i18n/config.ts:1` vs `pawjai-be/src/constants/enums/user.ts:7` |
| F-5 | Exactly **6** `languageEnum(...)` call sites exist in the backend schema. Independently counted; matches the earlier audit's figure of six. | See §6.2 |
| F-6 | One table already models locale the "target" way — free-form BCP-47 `text` locale, one translation row per (concept, locale), with a case-insensitive unique index and a non-blank check. | `pawjai-be/src/db/schema/pets.ts:190–226` |

### 1.2 Locale resolution

| # | Fact | Evidence |
|---|---|---|
| F-7 | There are **three independent implementations** of "detect locale from request" in the workspace, with different precedence and different defaults. | `pawjai-be/src/utils/locale.ts:15`, `pawjai-fe/middleware.ts:69–95`, `pawjai-fe/app/layout.tsx:38–62` |
| F-8 | A **fourth** copy of the backend resolver is duplicated inline in an admin route rather than importing the shared util. | `pawjai-be/src/routes/admin/pets.ts:7–16` (byte-equivalent to `src/utils/locale.ts:15`) |
| F-9 | The backend `Accept-Language` parser is a regex word-test that checks `en` **before** `th` and ignores q-values entirely. A header of `th-TH,th;q=0.9,en;q=0.4` resolves to `en`. | `pawjai-be/src/utils/locale.ts:21–22` |
| F-10 | The FE middleware's fallback locale when nothing is detected is `"en"`, while `DEFAULT_LOCALE` is `"th"`. | `pawjai-fe/middleware.ts:75,86` vs `pawjai-fe/lib/i18n/config.ts:5` |
| F-11 | The FE root layout independently initialises `initialLocale = "en"` before reading the cookie, and re-implements country/Accept-Language detection. | `pawjai-fe/app/layout.tsx:38,55–61` |
| F-12 | The FE middleware treats an IP-geo country of `TH` as authoritative for locale (region → locale conflation). | `pawjai-fe/middleware.ts:78–84`; same logic at `pawjai-fe/app/layout.tsx:55–58` |
| F-13 | The FE API client appends `?lang=<locale>` to **every** outbound request and also sets an `Accept-Language` header, both sourced from `getClientLocale()`. | `pawjai-fe/lib/api/client.ts:37–53,71–77` |
| F-14 | `getClientLocale()` reads `<html lang>` first, then `localStorage["pawjai.locale"]`, then `navigator.language`. It does **not** read the `NEXT_LOCALE` cookie. | `pawjai-fe/lib/i18n/getClientLocale.ts:7–22` |
| F-15 | `LanguageProvider` seeds from the server-provided `initialLocale` (cookie-derived) and does **not** read `localStorage`. It *writes* both the cookie and `localStorage` on every locale change. | `pawjai-fe/components/providers/LanguageProvider.tsx:42–69` |
| F-16 | Consequence of F-14 + F-15: `localStorage["pawjai.locale"]` is write-mostly. It is read only by `getClientLocale()`, and only when `<html lang>` is missing — which the provider always sets. | `getClientLocale.ts:10–15`, `LanguageProvider.tsx:55–57` |

### 1.3 Persistence and cross-surface sync

| # | Fact | Evidence |
|---|---|---|
| F-17 | The authenticated user preference lives in `user_config.preferred_language`, nullable, DB default `'th'`. It was migrated out of `user_profiles`. | `pawjai-be/src/db/schema/users.ts:73`, note at `:19` |
| F-18 | `LanguageSync` pulls the backend preference after sign-in and overrides the client locale; if the backend has none, it pushes the local locale up once. It skips `/auth/*` and `/blog/*`. | `pawjai-fe/components/providers/LanguageSync.tsx:19–50` |
| F-19 | The language settings page writes the preference fire-and-forget; a failed write is silently swallowed and the UI still shows the new language. | `pawjai-fe/app/settings/language/page.tsx:26–28` |
| F-20 | The native handoff page accepts a `?locale=` query param from the native app, and on DB-miss writes it to `localStorage` + `<html lang>` and pushes it to the backend. It does **not** write the `NEXT_LOCALE` cookie. | `pawjai-fe/app/auth/native-handoff/page.tsx:68,160–179` |
| F-21 | `pawjai.locale` is explicitly preserved across sign-out. | `pawjai-fe/lib/utils/auth.ts:45–54` |

### 1.4 Notifications

| # | Fact | Evidence |
|---|---|---|
| F-22 | Both notification-template tables carry four hard-coded language columns: `title_th`, `body_th`, `title_en`, `body_en`. | `pawjai-be/src/db/schema/notifications.ts:40–43` (`notification_settings`), `:185–188` (`notification_broadcasts`) |
| F-23 | The delivered-notification table `notifications` stores rendered `title` and `body`, and has **no schema-typed locale column**. | `pawjai-be/src/db/schema/notifications.ts:239–240`; no locale field anywhere in the table body (`:232–286`) |
| F-24 | The resolved locale **is persisted** for broadcast-delivered notifications: `sendOne` passes `metadata: { kind, targetTier, category, language }`, and `pushService.sendToUser` inserts that object verbatim as `metadata: options.metadata` on the `notifications` row. So `notifications.metadata.language` holds the resolved locale for every broadcast-sourced row. | `notificationBroadcastService.ts:537–552` (language at `:551`); `pushService.ts:157–171` (insert; `metadata` at `:168`); column `notifications.ts:275` |
| F-24a | There are exactly **two** callers of `pushService.sendToUser`. The broadcast path includes `language` in metadata; the **user-reminder path does not** — its metadata is `{ reminderType, repeatInterval, petIds }`. | `notificationBroadcastService.ts:537`; `unifiedNotificationJob.ts:301,317–321` |
| F-24b | Consequence: resolved locale is recoverable from history for broadcast-sourced notifications (via untyped JSONB) and **not** recoverable for user-reminder notifications. Reminder rows record neither an authored nor a resolved locale. | F-24, F-24a, F-28 |
| F-24c | The hard-coded `'th'` on the reminder path is **not** a render language for the reminder text. `title`/`description` are user-authored strings in an unknown language. When they contain no template tokens they are delivered **unchanged** (`needsResolve` is false and the raw strings are passed through). When they do contain tokens, `'th'` selects only the *token fallback phrases* — `{{petName}}`/`{{petNames}}` → `น้อง`, `{{ownerName}}` → `คุณ` — used when the context value is missing. The surrounding user text is never translated or rewritten. | `unifiedNotificationJob.ts:283–300` (`needsResolve` at `:285`, `language` at `:289`, pass-through at `:298–299`); fallback table `notificationTemplateService.ts:23–27` |
| F-25 | **Broadcast fan-out defaults to English** for any recipient with no `user_config` row or a NULL `preferred_language`: `languages.get(userId) ?? 'en'`. The app default everywhere else is `'th'`. | `pawjai-be/src/services/notificationBroadcastService.ts:324`, map built at `:562–574` |
| F-26 | Language selection is a binary ternary — `language === 'th' ? titleTh : titleEn` — so any non-`'th'` value silently yields English. Adding a third locale would deliver English, not fail. | `pawjai-be/src/services/notificationBroadcastService.ts:531–532`, `pawjai-be/src/routes/notifications.ts:75–76` |
| F-27 | Template token fallbacks (`{{petName}}`, `{{petNames}}`, `{{ownerName}}`) are a hard-coded `{th, en}` record; a new locale would need a code change, not config. | `pawjai-be/src/services/notificationTemplateService.ts:23–27` |
| F-28 | User-created reminders have **no** per-reminder language column. The job hard-codes `'th'` as the *token-fallback* language when a reminder contains template tokens, documented as a deliberate choice. It does not translate or re-render the user's own text (see F-24c). | `pawjai-be/src/jobs/unifiedNotificationJob.ts:286–289` |
| F-29 | Notification analytics read `notificationBroadcasts.titleEn` as *the* title, so Thai-only broadcasts are labelled by their English column in analytics. | `pawjai-be/src/services/analyticsNotificationsService.ts:195` |
| F-30 | Settings-service validation requires all four language fields to be non-empty — an admin cannot ship a single-language notification. | `pawjai-be/src/services/notificationSettingsService.ts:220–221` |
| F-31 | `notification_broadcasts` is explicitly a **send-time snapshot** of the message ("settings may change after broadcast"). | `pawjai-be/src/db/schema/notifications.ts:183–188` (comment) |

### 1.5 AI

| # | Fact | Evidence |
|---|---|---|
| F-32 | The broad locale-branch scan over `src/services`, `src/prompts`, and `src/config` matches **15** files. **14** of them are AI-related; the 15th is `services/blogService.ts`, which is blog presentation, not AI. | Enumerated in §8; commands in §16 (B12a broad, B12b AI-only) |
| F-32a | `services/insights/post-processor.service.ts` is a **localized-persistence dependency**, not a locale branch: it takes `locale` as a parameter and writes it to `pet_insights`, but contains no `locale === '…'` / `isThai` branch and does **not** match the scan. | `post-processor.service.ts:123,132,139,141,153,170`; scan returns no match for this file |
| F-33 | Locale affects **stored** AI output, not just presentation: `pet_insights.locale`, `pets.health_summary_locale`, `pet_chat_messages.locale`, and `user_profiles.suggestion_context.locale` all record the locale the generated text was produced in. | `pets.ts:120`, `pets.ts:80`, `chat.ts:47`, `users.ts:45–53` |
| F-34 | Suggestion context is regenerated when the locale changes, and validated with a **Thai-script regex** — a locale-specific post-check that has no generalization. | `pawjai-be/src/services/pets/suggestion-context.service.ts:218,444–446` |
| F-35 | The Gemini provider appends a locale-specific continuation suffix when the model's output lacks a Thai or English sentence terminator. | `pawjai-be/src/services/llm/gemini.provider.ts:254–258,404–408` |
| F-36 | Chat rejection messages, image-failure messages, and dummy upsell cards are all locale-branched string literals inside services (not catalogs). | `validation.service.ts:51,79–91`; `orchestrator.service.ts:194–202`; `dummy-card-generator.service.ts:67–191` |
| F-37 | Pet-name formatting is a Thai-specific typographic rule (`น้อง` prefix) applied in prompt construction. | `pawjai-be/src/prompts/config/naming-config.ts:28` |

### 1.6 Frontend

| # | Fact | Evidence |
|---|---|---|
| F-38 | Translation catalogs are TypeScript modules, statically imported — 38 page modules per locale, aggregated into `th.ts` / `en.ts`. Both locales are bundled unconditionally; there is no lazy per-locale load. | `pawjai-fe/lib/i18n/loader.ts:1–13`, `lib/i18n/locales/index.ts` |
| F-39 | The catalogs are **not key-identical**: 14 key paths exist only in `en`, 2 only in `th`. | Measured, §16 (B15); listed in §9.4 |
| F-40 | A missing key returns the key string itself. There is no dev warning, no fallback-locale lookup, and no telemetry. | `pawjai-fe/components/providers/LanguageProvider.tsx:81,92` |
| F-41 | Interpolation is `{{var}}` string replacement with no pluralization, no gender, and no number/date formatting inside the catalog layer. Unmatched placeholders are left literal. | `LanguageProvider.tsx:86–88`, `pawjai-fe/lib/utils/i18n.ts:19–28` |
| F-42 | Date/time formatting maps the app locale to a hard-coded Intl locale: `locale === "th" ? "th-TH" : "en-US"`. Region is not separable from language. | `pawjai-fe/lib/utils/dateLocale.ts:12,24,36` |
| F-43 | Currency is derived from **country**, not locale — `countryToCurrency` returns THB for `TH` and USD otherwise, cached in `localStorage`. This is already the correct separation. | `pawjai-fe/lib/utils/currency.ts:15–19,28–60` |
| F-44 | At least 12 React Query cache keys embed the locale, so a locale switch correctly re-fetches localized data. | Enumerated in §9.7 |
| F-45 | `useNotificationSettings` defaults its `language` argument to `"th"`, unlike the middleware/layout default of `"en"`. | `pawjai-fe/hooks/useNotificationSettings.ts:13` |

### 1.7 Blog (legacy)

| # | Fact | Evidence |
|---|---|---|
| F-46 | `blog_posts.locale` uses the shared `languageEnum` with default `'th'` and participates in three indexes. | `pawjai-be/src/db/schema/content.ts:25,44–46` |
| F-47 | `blog_posts.slug` is globally unique — **not** unique per locale. Two locales cannot share a slug, and there is no translation-group column linking a Thai post to its English counterpart. | `pawjai-be/src/db/schema/content.ts:27` |
| F-48 | The public blog API defaults `locale` to `'en'`, contradicting the column default of `'th'` and the app default of `'th'`. | `pawjai-be/src/routes/blog.ts:35,85` |
| F-49 | The blog author name and the displayed date format are derived from the post's locale inside the service, i.e. presentation is baked into the API response. | `pawjai-be/src/services/blogService.ts:71–72,89–92` |
| F-50 | The FE blog index server-renders Thai first and falls back to English only when the Thai list is empty — a content-availability fallback, not a user-preference one. | `pawjai-fe/app/blog/page.tsx:45–50` |
| F-51 | Featured-post exclusivity is enforced per locale. | `pawjai-be/src/services/blogService.ts:253–255,323–325` |
| F-52 | `LanguageSync` deliberately skips `/blog/*` ("reading mode"), so browsing the blog never rewrites the user's app language. | `pawjai-fe/components/providers/LanguageSync.tsx:19–20` |

### 1.8 WebView

| # | Fact | Evidence |
|---|---|---|
| F-53 | Native platform detection is web-side and explicit: iOS via `window.webkit.messageHandlers`, Android via `window.Android` plus a `PawjaiAndroid/` UA cross-check. | `pawjai-fe/lib/utils/nativeBridge.ts:30–59` |
| F-54 | The only proven native→web locale channel is the `?locale=` query param on `/auth/native-handoff`. | `pawjai-fe/app/auth/native-handoff/page.tsx:68` |
| F-55 | There is **no** web→native locale message handler. The registered iOS handlers named in web-side code are `signOut`, `notificationSettingsChanged`, and `sessionEstablished` only. | `nativeBridge.ts:34–36`; call sites `app/settings/page.tsx:64`, `app/settings/notifications/page.tsx:112`, `lib/utils/sessionCookies.ts:85` |
| F-56 | The backend serves an admin-managed external-domain allowlist to the native app so those links open outside the WebView. Nothing in it is locale-aware. | `pawjai-be/src/routes/external-domains.ts:10–23`, `src/db/schema/content.ts:80–89` |

### 1.9 Defects found (recorded, not fixed)

Per scope restrictions these are **documented only**. None were changed.

| ID | Defect | Evidence | Impact |
|---|---|---|---|
| D-1 | Broadcast fan-out falls back to **English** for users with no `user_config` row, against a `'th'` default everywhere else. | F-25 | Thai-preferring users with no config row receive English pushes. |
| D-2 | `Accept-Language` parsing ignores q-values and tests `en` first, so `th`-preferred headers resolve to `en`. | F-9 | Wrong locale for any client that sends a real weighted header instead of the FE's synthetic single-token one. |
| D-3 | Three (four, counting the duplicate) independent locale-detection implementations with two different defaults (`'th'` vs `'en'`). | F-7, F-8, F-10, F-11 | Server-render, middleware, and API can disagree for the same request. |
| D-4 | Translation catalogs are not key-identical (14 en-only, 2 th-only paths). | F-39 | Thai users see raw key strings for those 14 paths. |
| D-5 | Missing translation keys fail silently by rendering the key. | F-40 | No signal that a locale is incomplete; blocks safe rollout of a third locale. |
| D-6 | `notifications` has no dedicated resolved-locale column. Locale survives only as a JSONB key (`metadata.language`) and **only for broadcast-sourced rows**; user-reminder rows carry no locale at all. No expression index, generated column, check constraint, or typed schema enforcement currently exists for that key. | F-23, F-24, F-24a, F-24b | Locale-partitioned queries over notification history need a JSONB extract, are not currently indexed or constrained, and silently miss every user-reminder row. Not "history has no locale" — history has *inconsistent, unenforced* locale. |
| D-7 | Public blog API defaults to `'en'` while the column and app default to `'th'`. | F-48 | A caller that omits `locale` gets the wrong language set. |
| D-8 | `localStorage["pawjai.locale"]` is effectively write-only; the native handoff writes it but the provider never reads it. | F-14, F-15, F-16, F-20 | A native-supplied locale can be silently discarded on the next SSR, since only the cookie feeds `initialLocale`. |
| D-9 | Notification analytics label every broadcast by its English column. | F-29 | Thai-only campaigns are mislabelled in analytics. |
| D-10 | Locale is inferred from IP-geo country (`TH` → `th`). | F-12 | Region and language are conflated; a English-preferring user in Thailand gets Thai on first load. |

---

## 2. Architecture decisions (confirmed)

These are handed down as settled. They are recorded here as the contract for later tasks.

1. Existing `"th"` and `"en"` locale codes remain valid.
2. Future locale codes may use BCP-47 values.
3. Do **not** rename existing `"th"` / `"en"` values for cosmetic consistency.
4. Locale, region, currency, and timezone are separate concepts.
5. Adding a locale should eventually require configuration and translations — **not** database DDL or new language-specific columns.
6. `nativeLabel` is optional presentation metadata.
7. `englishName` is **not required**.
8. `direction` is optional and defaults to `"ltr"`.
9. Do **not** implement RTL support now.
10. Runtime and domain content should use stable identities, with translation rows where database-backed translation is necessary.
11. Activity logs should use stable event codes and structured parameters.
12. Store a rendered activity snapshot only where exact historical or audit fidelity requires it.
13. Notification templates should eventually use translation rows instead of `titleTh` / `titleEn` / `bodyTh` / `bodyEn`.
14. Delivered notifications should preserve the resolved locale **and** the exact rendered content.
15. Migration strategy: **expand → dual read/write → backfill → cutover → observe → contract**.
16. The existing blog is a legacy compatibility boundary.
17. Do **not** design a new multilingual blog model inside Pawjai.
18. Preserve existing blog IDs, `"th"`/`"en"` locale values, slugs, publication state, and legacy links.
19. The future external website owns new blog localization, translated slugs, canonical URLs, hreflang, and CMS architecture.

---

## 3. Assumptions

Unverified. Each must be confirmed before any implementation task depends on it.

| # | Assumption | Why it is unverified | How to verify |
|---|---|---|---|
| A-1 | Every production user row has a `user_config` row, so D-1's English fallback rarely fires. | No production data access in this workspace. | `SELECT count(*) FROM user_profiles p LEFT JOIN user_config c ON c.user_id = p.id WHERE c.user_id IS NULL;` |
| A-2 | The `language` PG enum type is referenced only by the six columns in §6.2 and has no other dependants (views, functions, other DBs). | Drizzle schema is the only source read; DB introspection not run. | `SELECT * FROM pg_depend` against the `language` enum OID, on a live database. |
| ~~A-3~~ | **RESOLVED — no longer an assumption.** Was: "`pushService` persists `metadata.language` onto the `notifications` row." The code proves it does (`pushService.ts:168`). Promoted to verified facts **F-24 / F-24a / F-24b**. The ID slot is retained rather than renumbered so earlier review references stay resolvable. | — | — |
| A-4 | The iOS/Android apps pass `?locale=` on native handoff and otherwise never set locale. | Native sources absent. | Inspect `pawjai-ios` / `pawjai-android` when available. |
| A-5 | No production consumer depends on `blog_posts.locale` being a PG enum rather than text. | Only in-workspace consumers were read. | Grep any external consumers / BI jobs / exports outside these three repos. |
| A-6 | Thai is the dominant production locale, so an `'en'`-defaulting bug (D-1, D-7) is currently low-volume. | No analytics access. | `SELECT preferred_language, count(*) FROM user_config GROUP BY 1;` |
| A-7 | The 14 en-only translation keys (D-4) currently render as raw key strings to Thai users rather than being dead code. | Static analysis only; not exercised at runtime. | Render the affected settings/notifications screens with `locale='th'`. |

---

## 4. Open product questions

These are product decisions, not engineering ones. Implementation should not guess.

| # | Question | Blocks |
|---|---|---|
| Q-1 | Which locale is the true product default when nothing is known about the user — `th` or `en`? | Unifying D-3; every fallback in §5. |
| Q-2 | Should IP-geo country continue to influence *language*, or only region/currency? | D-10; middleware rewrite. |
| Q-3 | When a locale has UI translations but no AI support, what should chat do — refuse, fall back to English, or fall back to the user's fallback locale? | `capabilities.aiChat` semantics in §13. |
| Q-4 | Must a notification be sendable in a partially translated locale (fall back), or must all target locales be complete before send? | Notification translation-row model; replaces D-30/F-30's all-four-required rule. |
| Q-5 | Is per-notification locale targeting required (send only to `th` users), or is locale purely a rendering concern? | Broadcast audience model. |
| Q-6 | Should users be able to choose a UI language different from their AI-response language? | Whether one `locale` field suffices or a second preference is needed. |
| Q-7 | Do delivered-notification records need to be re-renderable in a *new* locale after the fact, or is the send-time snapshot final? | Decision 14's implementation shape; §7.5. |
| Q-8 | What is the timeline for the external website taking over blog localization? | Whether §12's contract path is short-lived or long-lived. |
| Q-9 | For a user-created reminder, whose locale renders it — the author's locale at creation time, or the reader's locale at delivery? | F-28; requires a new column either way. |
| Q-10 | Which locale is next, and does it require a non-Latin script, RTL, or plural rules beyond one/other? | Whether §13's registry needs plural/RTL fields sooner. |

---

## 5. Current locale resolution (observed)

### 5.1 Source-by-source

| Source | Where read | Where written | Authoritative? | Failure behavior |
|---|---|---|---|---|
| **Explicit query `?lang=`** | `pawjai-be/src/utils/locale.ts:16`; validated by `recordDisplayLangQuerySchema` / `petRecordQuerySchema` / `petRecordConceptCatalogQuerySchema` (`src/constants/schemas.ts:152,160,205`) | `pawjai-fe/lib/api/client.ts:45–47` (all requests); `lib/api/shareService.ts:147`, `lib/api/helperService.ts:72,154` (explicit) | **Authoritative** for a single API call | An explicit *invalid* value returns HTTP 400 by design (`schemas.ts:149–152` comment). An *absent* value falls through. |
| **`Accept-Language` header** | `pawjai-be/src/utils/locale.ts:19–23`; duplicated `src/routes/admin/pets.ts:10–14`; `pawjai-fe/middleware.ts:85`; `pawjai-fe/app/layout.tsx:60` | `pawjai-fe/lib/api/client.ts:71–77` (synthetic — the bare token `th` or `en`, never a real weighted list) | Fallback only | q-values ignored; `en` tested first (D-2). Unrecognised → `undefined` → caller default. |
| **Authenticated user preference** (`user_config.preferred_language`) | `src/routes/user/language-preferences.ts:30`; `src/services/userConfigService.ts:116`; `src/routes/helper.ts:120`, `src/routes/share.ts:118`; `src/services/notificationBroadcastService.ts:566` | `src/services/userConfigService.ts:127,134`; `src/routes/user/language-preferences.ts:61`; `src/routes/admin/users.ts:22` (admin edit) | **Authoritative** for background/server-initiated work (notifications) and for shared views with no viewer session | `userConfigService.getPreferredLanguage` coerces null → `'th'` (`:116`). Broadcast fan-out coerces missing → `'en'` (D-1). |
| **Cookie `NEXT_LOCALE`** | `pawjai-fe/middleware.ts:69`; `pawjai-fe/app/layout.tsx:48`; `lib/i18n/cookie.ts:11–25` | `pawjai-fe/middleware.ts:90–94`; `lib/i18n/cookie.ts:30–33` via `LanguageProvider.tsx:63` | **Authoritative for SSR** — it is what `initialLocale` is built from | Missing/invalid → middleware re-detects and re-sets; layout re-detects independently. 1-year max-age, `sameSite=lax`, not `httpOnly`. |
| **Local storage `pawjai.locale`** | `lib/i18n/getClientLocale.ts:14` only | `LanguageProvider.tsx:66`; `app/auth/native-handoff/page.tsx:168,171,177` | **Not authoritative** — effectively vestigial (F-16) | Silently ignored whenever `<html lang>` is set, which is always after provider mount. |
| **HTML `lang` attribute** | `lib/i18n/getClientLocale.ts:10–11` — the **primary** client-side read | `app/layout.tsx:87` (SSR); `LanguageProvider.tsx:56` (on change); `native-handoff/page.tsx:169,172,178` | **Authoritative for the client API layer** | If absent, falls to localStorage then `navigator.language`. |
| **Browser `navigator.language`** | `lib/i18n/getClientLocale.ts:16–18` | — | Last-resort fallback | Prefix match on `en` / `th`; anything else → `undefined` → no `?lang` appended → backend falls to `Accept-Language` → `'th'`. |
| **IP-geo country** (`x-vercel-ip-country`, `x-geo-country`) | `pawjai-fe/middleware.ts:78–84`; `app/layout.tsx:55–58` | — | Fallback, only when the cookie is absent | `TH` → `th`; anything else → Accept-Language → `en` (D-10, D-3). |
| **WebView / native state** | `app/auth/native-handoff/page.tsx:68` (`?locale=`) | Native app (source not in workspace) | Advisory | On DB-hit the DB wins; on DB-miss the native value is written to localStorage + `<html lang>` and pushed to the backend — but **not** to the cookie (D-8). |
| **Env override `NEXT_PUBLIC_FORCE_LANG`** | `lib/i18n/config.ts:8–15` | — | Overrides everything on the client when set | Invalid value → `null` → ignored. Documented as dev-only. |
| **Default locale** | `lib/i18n/config.ts:5` (`'th'`) | — | Terminal | Only reached when `initialLocale` is undefined (`LanguageProvider.tsx:45`) — which the layout prevents by always supplying a value. |

### 5.2 Observed precedence chains

**Frontend SSR (per request):**
```
NEXT_LOCALE cookie
  → x-vercel-ip-country / x-geo-country == "TH"  →  th
  → Accept-Language contains "th"                →  th
  → "en"                                          (layout.tsx:38 / middleware.ts:75)
```

**Frontend client (per component render):**
```
NEXT_PUBLIC_FORCE_LANG  →  initialLocale (from cookie)  →  DEFAULT_LOCALE ("th")
   …then overridden after mount by LanguageSync when the user is authenticated
```

**Frontend → API (per request):**
```
<html lang>  →  localStorage["pawjai.locale"]  →  navigator.language  →  (omit ?lang)
```

**Backend owner-facing record routes:**
```
?lang=  →  Accept-Language  →  "th"            (petRecord.ts:30)
```

**Backend chat history:**
```
?lang=  →  Accept-Language  →  undefined (= "no re-resolution"; stored metadata used as-is)
                                                (routes/chat.ts:61 and the comment at :54–57)
```

**Backend helper / vet-share (no viewer session):**
```
?lang=  →  Accept-Language  →  pet owner's preferred_language  →  "th"
                                                (helper.ts:18–21, share.ts:19–21)
```

**Backend notification fan-out (no request at all):**
```
recipient's user_config.preferred_language  →  "en"     ← D-1
```

### 5.3 Cross-surface inconsistencies (observed)

| Inconsistency | Surfaces | Evidence |
|---|---|---|
| Terminal default is `'th'` on the backend and in `DEFAULT_LOCALE`, but `'en'` in FE middleware, FE layout, and broadcast fan-out. | FE middleware, FE layout, BE broadcast | F-10, F-11, F-25 |
| Locale detection is implemented 4× with 3 different precedences. | BE util, BE admin route, FE middleware, FE layout | F-7, F-8 |
| The client sends a *synthetic* `Accept-Language` (bare `th`/`en`), so the backend's q-value blindness is masked in first-party traffic but live for any other caller. | `client.ts:71–77` vs `locale.ts:19–23` | F-13, F-9 |
| Cookie is authoritative for SSR; `<html lang>` is authoritative for API calls; localStorage is authoritative for nothing. A native handoff writes only the last two. | FE | F-14, F-15, F-20, D-8 |
| Blog API default (`'en'`) disagrees with the column default (`'th'`) and the FE index's Thai-first strategy. | BE blog route, FE blog page | F-48, F-50 |
| `useNotificationSettings` defaults to `'th'`; the surrounding app defaults to `'en'` at SSR. | FE | F-45 |

---

## 6. Database locale inventory

### 6.1 Classification legend and taxonomy

**Value classes** (what a locale value *means*):
`UP` user preference locale · `REQ` requested locale · `RES` resolved locale ·
`CON` content locale · `GEN` generated-output locale · `ANA` analytics-only locale ·
`SNAP` rendered delivery snapshot · `BLOG` legacy blog locale

**Structural categories** (how localization is *stored*). These are mutually exclusive and
non-overlapping; every item below appears in exactly one:

| Cat. | Definition | Counted as a locale-valued field? | Section |
|---|---|---|---|
| **A** | **Direct locale-valued columns** — a dedicated column whose value *is* a locale code. | **Yes** | §6.2 |
| **B** | **Language-suffixed columns** — the language is encoded in the *column name*; the value is content, not a locale code. | No — counted separately as columns | §6.4 |
| **C** | **Locale stored inside JSONB** — a locale code lives at a key inside a JSONB document; not currently schema-enforced and not exposed as a column. | No | §6.5 |
| **D** | **Localized content with no locale field** — stored text is in *some* locale, but the row records none. | No | §6.6 |
| **E** | **Stable-identity / reference patterns** — no localized text and no locale stored; display is resolved at read time. Included as **design references only**. | **No — these are not locale-bearing** | §6.7 |

Categories A and B are counted. C and D are enumerated but **not** counted as fields — C is a
document key, not a column, and D is defined by the *absence* of a locale. E is explicitly not
locale-bearing and exists here only because it is the target pattern.

### 6.2 Category A — direct locale-valued columns

All nine are in `pawjai-be/src/db/schema/`. Six use the shared `language` PG enum (marked ✅);
three are plain `text` (marked ❌).

| # | Table | Column | Schema file:line | DB type | Shared enum | Class |
|---|---|---|---|---|---|---|
| 1 | `user_config` | `preferred_language` | `users.ts:73` | `language` enum, nullable, default `'th'` | ✅ | **UP** |
| 2 | `pet_insights` | `locale` | `pets.ts:120` | `language` enum, NOT NULL, default `'th'` | ✅ | **GEN** |
| 3 | `health_summary_generations` | `locale` | `pets.ts:410` | `language` enum, NOT NULL | ✅ | **GEN / ANA** |
| 4 | `pet_chat_messages` | `locale` | `chat.ts:47` | `language` enum, NOT NULL | ✅ | **REQ → GEN** |
| 5 | `chat_suggestion_events` | `locale` | `chat.ts:179` | `language` enum, NOT NULL | ✅ | **ANA** |
| 6 | `blog_posts` | `locale` | `content.ts:25` | `language` enum, NOT NULL, default `'th'` | ✅ | **BLOG / CON** |
| 7 | `pets` | `health_summary_locale` | `pets.ts:80` | `text`, nullable | ❌ | **GEN** |
| 8 | `feedback` | `locale` | `content.ts:101` | `text`, NOT NULL | ❌ | **REQ / ANA** |
| 9 | `pet_record_type_concept_translations` | `locale` | `pets.ts:200` | `text`, NOT NULL, BCP-47, `lower()`-unique per concept, non-blank check | ❌ (deliberate) | **CON** |

**`languageEnum(...)` count: 6.** Independently verified — see §16 (B10). This **matches** the
earlier audit. The six are rows 1–6 above. Note that the *string* `languageEnum` appears 12 times
in `src/`: 6 invocations, 3 import statements (`chat.ts:18`, `content.ts:15`, `pets.ts:22`),
1 import in `users.ts:2`, 1 definition (`enums/user.ts:6`), and 1 mention inside a comment
(`pets.ts:192`). Only the 6 invocation sites are schema usages.

### 6.3 Per-column detail

**1. `user_config.preferred_language` — UP**
- Readers: `userConfigService.ts:116`; `routes/user/language-preferences.ts:30`; `routes/helper.ts:120`; `routes/share.ts:118`; `notificationBroadcastService.ts:566`; `adminUserService.ts:180–184,218,282`.
- Writers: `userConfigService.ts:127,134` (upsert, seeds `'th'` at `:54`); `routes/user/language-preferences.ts:61`; admin edit path `adminUserService.ts:411–415` validated by `routes/admin/users.ts:22`.
- Meaning: the user's chosen UI/content language. **Requested**, never resolved.
- Historical implications: none — it is current state, not history. Safe to widen.
- Proposed future representation: `text` constrained to the registry's `code` set, validated in application code, not by a PG enum.
- Migration order: **1st** (it is the write-side root; everything else derives from it).
- Compatibility/rollback risk: **Low.** Widening an enum column to text is forward-safe. Rollback requires that no out-of-enum value was written, so the contract phase must gate on `SELECT DISTINCT preferred_language`.

**2. `pet_insights.locale` — GEN**
- Readers: insights read path via `services/insights/*`; participates in `pet_insights_pet_id_locale_idx` and the unique `(pet_id, insight_key, locale)` index (`pets.ts:139,145`).
- Writers: `services/insights/post-processor.service.ts:141`.
- Meaning: the language the AI text in `content` was generated in. **Resolved**, not requested.
- Historical implications: **high** — rows are a cache of generated content keyed by locale; changing the value space changes cache identity. Never rewrite existing values.
- Proposed future representation: `text`, same value, plus reliance on the existing unique index for per-locale cache identity.
- Migration order: **3rd** (after the read-side resolver understands text).
- Risk: **Medium.** The unique index makes locale part of a natural key; a value-space change without a matching cache-invalidation story causes duplicate or missing insights.

**3. `health_summary_generations.locale` — GEN/ANA**
- Readers: `analyticsAiService.ts:240–243` (group-by for the admin AI-usage breakdown).
- Writers: `health-summary-rate-limit.service.ts:120`.
- Meaning: locale of a generation event. Append-only telemetry.
- Historical implications: **must not be rewritten** — it is an event log.
- Proposed future representation: `text`.
- Migration order: **4th.**
- Risk: **Low** for correctness, but admin analytics group-by will start showing new values; the admin filter (`ai-usage/page.tsx:341–343`) is a hard-coded two-option select and will not surface them (see §10).

**4. `pet_chat_messages.locale` — REQ→GEN**
- Readers: chat history/read paths; analytics ("Messages by Language", `pawjai-admin/app/admin/analytics/chat-health/page.tsx:124`).
- Writers: `services/chat/history.service.ts:81`.
- Meaning: the locale the message was sent/answered in — requested at write time, and thereafter the generated-output locale of the assistant reply.
- Historical implications: **high** — this is the anchor for re-localizing receipt display at read time (`routes/chat.ts:54–61`).
- Proposed future representation: `text`.
- Migration order: **3rd** (with `pet_insights`).
- Risk: **Medium.** Read-time re-localization already exists and must keep working through the change.

**5. `chat_suggestion_events.locale` — ANA**
- Readers/Writers: `chatSuggestionsAnalyticsService.ts:77,97` (insert); aggregates at `:120–132`.
- Meaning: locale of the suggestion strip at event time. Pure telemetry.
- Historical implications: append-only; never rewrite.
- Proposed future representation: `text`.
- Migration order: **5th** (lowest coupling).
- Risk: **Low.**

**6. `blog_posts.locale` — BLOG**
- Readers: `blogService.ts:108,145,193,255,300,325,348,478`; `routes/blog.ts:35,85,119`; `routes/admin/blog.ts:10,25,55–64`.
- Writers: `blogService.ts:261` (create), update path `:296–300`.
- Meaning: the language a post is written in. **Content locale.**
- Historical implications: **must be preserved verbatim** per decision 18 — IDs, values, slugs, publication state, legacy links.
- Proposed future representation: plain `text` with the *same* `'th'`/`'en'` values, **solely to decouple the blog from the shared `language` enum**. No new model. See §12.
- Migration order: **2nd** — deliberately early, because it is the only *content* dependant of the shared enum and unblocking it decouples the blog from the app's locale evolution.
- Risk: **Low-Medium.** Column type change on an indexed column (3 indexes at `content.ts:44–46`) needs an index rebuild. Rollback to enum requires all values still be in `('th','en')` — which decision 18 guarantees.

**7. `pets.health_summary_locale` — GEN**
- Readers: `insights/health-summary.service.ts:53` (cache-validity check: regenerate if `!== locale`); `insights/context-resolver.service.ts:89,149`.
- Writers: `insights/health-summary.service.ts:330`; nulled on downgrade at `subscriptionService.ts:188`.
- Meaning: locale of the cached `pets.health_summary` text. **Resolved.**
- Historical implications: it is a cache key; a mismatch triggers regeneration, which is the desired failure mode.
- Proposed future representation: already `text`. **No DDL needed** — only a value-space widening.
- Migration order: **n/a** (no DDL); validate at cutover.
- Risk: **Low.** Untyped today: nothing constrains it to `('th','en')`; an out-of-range value degrades to permanent regeneration, not corruption.

**8. `feedback.locale` — REQ/ANA**
- Readers: `adminFeedbackService.ts` / `routes/admin/feedback.ts`; admin filter select at `pawjai-admin/app/admin/feedback/page.tsx:164–165`.
- Writers: `feedbackService.ts:21` (from the validated request body).
- Meaning: the locale the user was using when submitting feedback. Requested; analytics-only downstream.
- Historical implications: append-only.
- Proposed future representation: already `text`. No DDL.
- Migration order: **n/a**; admin filter needs registry-driven options (§10).
- Risk: **Low.**

**9. `pet_record_type_concept_translations.locale` — CON**
- Readers: `services/petRecordDisplay/dataSource.ts:30` and `resolution.ts:130–216`; `services/petRecordConceptCatalog/catalogService.ts`; `conceptEditorService.ts`.
- Writers: `conceptEditorService.ts`; `db/concepts/applyCatalogContentPlan.ts`; `db/concepts/applyBackfill.ts`.
- Meaning: BCP-47 tag of one translation row. **This is already the target shape** — free-form text, deliberately *not* the enum, with case-insensitive identity and a non-blank check (`pets.ts:190–226`).
- Historical implications: none; adding a locale is adding rows.
- Proposed future representation: unchanged. **This is the reference model for decision 5 and 10.**
- Migration order: **n/a** — it is the destination, not a source.
- Risk: **None.**

### 6.4 Category B — language-suffixed columns

Twelve columns encode language in the *column name*; the stored value is content, not a locale
code. These are what decision 5 exists to eliminate.

| Table | Columns | File:line | Class | Notes |
|---|---|---|---|---|
| `notification_settings` | `title_th`, `body_th`, `title_en`, `body_en` | `notifications.ts:40–43` | CON (template) | All four required by `notificationSettingsService.ts:220–221` (F-30). |
| `notification_broadcasts` | `title_th`, `body_th`, `title_en`, `body_en` | `notifications.ts:185–188` | **SNAP** (send-time) | Explicitly a snapshot (F-31). |
| `breeds` | `name_en`, `name_th` | `pets.ts:35–36` | CON | Read by prompt builders (`insights/prompt-builder.service.ts:158`) and by chat context (`suggestion-context.service.ts:232`). |
| `pet_record_types` | `name_en`, `name_th` | `pets.ts:233–234` | CON (legacy lookup) | Already superseded by the concept-translation table for tiers 2–3 of the display fallback; survives as tiers 4–5 (`resolution.ts:186–206`). |

### 6.5 Category C — locale stored inside JSONB

A locale code is present, but as a key inside a JSONB document. **Not currently schema-enforced**:
no column type, no NOT NULL, no check constraint, no expression index, no generated column, and no
guarantee the key exists on any given row. PostgreSQL *could* support an expression index or a
check constraint over a JSONB path — none is defined here today. These are *not* counted as
locale-valued fields.

| Location | JSONB path | File:line | Class | Enforcement and coverage |
|---|---|---|---|---|
| `user_profiles.suggestion_context` | `.locale` | column `users.ts:46`; key typed at `users.ts:49` | GEN | Typed only in TypeScript via Drizzle's `$type<>` — the database sees opaque `jsonb`. Widening the value space is a TS type change, not DDL. Regeneration is already keyed on locale change (`suggestion-context.service.ts:218`), and the value is written at `:489`. Coverage: present whenever the document exists; the whole column is nullable until first refresh. |
| `notifications.metadata` | `.language` | column `notifications.ts:275`; written `notificationBroadcastService.ts:551`; inserted `pushService.ts:168` | **RES** | **Source-dependent.** Present on rows created by the broadcast path (`sendOne`, which covers admin ad-hoc, send-now, selective, test, and cron-scheduled sends). **Absent** on rows created by the user-reminder path, whose metadata is `{ reminderType, repeatInterval, petIds }` (`unifiedNotificationJob.ts:317–321`). Nothing in the schema requires the key, so its presence cannot be assumed per row. |

**Consequence for `notifications.metadata.language`:** the resolved locale *is* recoverable for
broadcast-sourced history — this is a real capability, not a gap. But it is recoverable only via a
JSONB extract; it is not currently typed, constrained, defaulted, or indexed; and it is missing
entirely for user-reminder rows. PostgreSQL could support an expression index or check constraint
over the path, so the limitation is the current schema, not the database. A dedicated
`resolved_locale` column is still the better target (decision 14) because it is typed, easier to
query, and can be *required* consistently across every notification source rather than left to
each caller. See D-6.

### 6.6 Category D — localized content with no locale field

Stored text is in *some* locale, but the row records none. Defined by absence, so these are not
counted as locale-valued fields.

| Location | Shape | File:line | Class | Gap |
|---|---|---|---|---|
| `notifications.title` / `notifications.body` | Rendered delivery text; no locale column | `notifications.ts:239–240` | **SNAP** | Locale must be inferred from `metadata.language` (Category C) where present — which excludes user-reminder rows. |
| `user_reminders.title` / `user_reminders.description` | User-authored text in an **unknown** language; no locale column, neither authored nor resolved | `notifications.ts:141–142` | CON (user-authored) | Token-free reminders are delivered byte-unchanged. Reminders containing template tokens use a hard-coded `'th'` for *token fallback phrases only* — the user's text itself is never translated (F-24c, `unifiedNotificationJob.ts:283–300`). Whose locale should govern is open question **Q-9**. |

### 6.7 Category E — stable-identity / reference patterns (not locale-bearing)

Listed as **design references for §13 only.** These store no localized text and no locale; display
is resolved at read time. They are **not** counted in any locale-bearing total.

| Location | Shape | File:line | Why it is the target pattern |
|---|---|---|---|
| `pet_records` concept snapshot | `concept_id` + resolution provenance (`concept_resolution_source`, `concept_resolution_version`, `concept_metadata_schema_version`, `concept_resolved_at`); no rendered text, no locale | `pets.ts:299–310`; all-or-nothing bundle check at `pets.ts:344–353` | Display is resolved at read time by `petRecordDisplay`, which returns `resolvedLocale` and `usedFallback` (`resolution.ts:138–216`). Matches decision 10. |
| `admin_audit_log` | `action` (stable text code) + `metadata` (structured jsonb params); no rendered string | `admin.ts:49` (action), `admin.ts:54` (metadata) | Already matches decision 11 — stable event code plus structured parameters. |

### 6.8 Counts

Counted (Categories A and B only — these are the two categories with a precise, non-overlapping
column-level definition):

- **Category A — locale-valued columns: 9** (§16 B9a)
- **Category B — language-suffixed columns: 12** (§16 B9b)

Enumerated but **not** counted, because they are not columns whose value is a locale code:

- **Category C — locale inside JSONB: 2 documented paths** (§6.5)
- **Category D — localized content with no locale field: 2 column pairs** (§6.6)
- **Category E — stable-identity patterns: 2 references** (§6.7) — explicitly not locale-bearing

**No single grand total is published.** The earlier figure of "24 total locale-bearing database
fields" summed categories with incompatible units — columns, JSONB keys, and absences — and
double-counted stable-identity patterns that carry no locale at all. Any future aggregate must
state which categories it sums.

---

## 7. Notification localization inventory

### 7.1 Schema

| Table | Fields | File:line |
|---|---|---|
| `notification_settings` | `title_th`, `body_th`, `title_en`, `body_en` | `notifications.ts:40–43` |
| `notification_broadcasts` | `title_th`, `body_th`, `title_en`, `body_en` | `notifications.ts:185–188` |
| `notifications` | `title`, `body` (rendered, no locale column); `metadata` jsonb carries `.language` for broadcast-sourced rows only | `notifications.ts:239–240`, `:275` |
| `user_reminders` | `title`, `description` (user-authored, no locale anywhere) | `notifications.ts:141–142` |

### 7.2 Backend consumers

| Consumer | Role | File:line |
|---|---|---|
| `notificationSettingsService` | Validation — requires all four fields non-empty | `notificationSettingsService.ts:220–221` |
| `unifiedNotificationJob` (cron tick) | Copies all four template fields into the broadcast input | `unifiedNotificationJob.ts:198–201` |
| `unifiedNotificationJob` (user reminders) | Hard-codes `language = 'th'` for template resolution | `unifiedNotificationJob.ts:286–288` |
| `notificationBroadcastService.create` | Snapshots all four onto `notification_broadcasts` | `notificationBroadcastService.ts:162–165` |
| `notificationBroadcastService.broadcastFromSchedule` | Reads all four from the setting | `notificationBroadcastService.ts:247–250,263–266` |
| `notificationBroadcastService.loadLanguages` | Per-recipient locale from `user_config` | `notificationBroadcastService.ts:562–574` |
| `notificationBroadcastService.fanOut` | Applies `?? 'en'` default (**D-1**) | `notificationBroadcastService.ts:324` |
| `notificationBroadcastService.sendOne` | Picks the language pair and interpolates | `notificationBroadcastService.ts:528–534` |
| `notificationBroadcastService.loadTemplateContexts` | Checks tokens across all four fields | `notificationBroadcastService.ts:583–589` |
| `notificationTemplateService` | `{{petName}} {{petNames}} {{ownerName}}` interpolation with a hard-coded `{th,en}` fallback record | `notificationTemplateService.ts:21–56` |
| `notificationSchedulingService` | Type carries all four + recipient `preferredLanguage` | `notificationSchedulingService.ts:21–24,37` |
| `routes/notifications.ts` | Per-locale projection for the user-facing settings list | `routes/notifications.ts:70–81` |
| `routes/admin/broadcasts.ts` | Admin create/send API surface (24 matching lines) | `routes/admin/broadcasts.ts` |
| `routes/admin/broadcasts-read.ts` | Renders **both** locales for admin preview | `routes/admin/broadcasts-read.ts:161–166` |
| `routes/admin/broadcasts-history.ts` | Reads the snapshot columns | `routes/admin/broadcasts-history.ts` |
| `routes/admin/settings-notifications.ts` | Admin template CRUD | `routes/admin/settings-notifications.ts` |
| `analyticsNotificationsService` | Labels every broadcast by `titleEn` (**D-9**) | `analyticsNotificationsService.ts:195` |

### 7.3 Admin consumers

**14 files**, not all of them components — they are 10 React components, 2 React Query hook
modules, 1 API-client service, and 1 shared type module. Complete list verified with the
listing command in §16 (B11b).

| # | File | Kind | Role |
|---|---|---|---|
| 1 | `app/admin/settings/notifications/components/BilingualFields.tsx` | component | The two-language editor; `lang: "th" \| "en"` with hard-coded flags 🇹🇭/🇬🇧, ring/border colors, and labels (`:25,36–41`) |
| 2 | `.../components/NotificationForm.tsx` | component | Template create/edit form state |
| 3 | `.../components/BroadcastComposer.tsx` | component | Ad-hoc broadcast composition |
| 4 | `.../components/PushPreview.tsx` | component | Side-by-side push preview |
| 5 | `.../components/SendNowButton.tsx` | component | Send-now flow carrying all four fields |
| 6 | `.../components/SelectiveSendButton.tsx` | component | Selective-send trigger |
| 7 | `.../components/SelectiveSendModal.tsx` | component | Selective-send audience + message |
| 8 | `.../components/SettingsTable.tsx` | component | Template listing |
| 9 | `.../components/BroadcastsTab.tsx` | component | Broadcast history listing |
| 10 | `.../components/ArchivedTab.tsx` | component | Archived template listing |
| 11 | **`hooks/useBroadcasts.ts`** | **hook module** | **The broadcast data layer.** Exposes `useBroadcasts`, `useCreateBroadcast`, `useResendBroadcast`, `useDeleteBroadcast`, `useSendNow`, `useTestSend`, `useSelectiveSend`, `useAudienceCount`, `useCleanupPreview`, `useRunCleanup`, and `useBroadcastPreview`. The quad appears in the preview mutation's argument type (`:213–216`), so **every admin send and preview mutation is typed on the four language fields**. |
| 12 | **`hooks/useNotificationSettings.ts`** | **hook module** | **The template CRUD data layer.** Declares the quad three times — the fetched setting shape (`:10–13`), the create payload (`:49–52`), and the partial update payload (`:70–73`) — and exposes `useNotificationSettings`, `useCreateNotificationSetting`, `useUpdateNotificationSetting`, `useDeleteNotificationSetting`, `useUpdateNotificationConfig`, `useToggleNotificationSetting`. Not to be confused with the *frontend* hook of the same name (§7.4), which consumes the already-projected `{title, body}`. |
| 13 | `lib/api/services/notificationBroadcastService.ts` | API client | Admin API client request/response types |
| 14 | `types/admin.ts` | shared types | Four separate interfaces each redeclare the quad (`:128–131`, `:146–149`, `:161–164`, `:172–175`) plus `resolvedTh` / `resolvedEn` preview shapes (`:196–197`) |

Admin occurrence count: **151 matching lines across 14 files** (§16 B11). *Correction: an earlier
revision of this document reported 12 files. The line count was right; the file count omitted the
two hook modules, which are the highest-leverage consumers because every admin mutation is typed
through them.*

### 7.4 Frontend consumers

None reference `titleTh`/`bodyTh`/`titleEn`/`bodyEn` — the FE consumes the already-projected
`{title, body}` shape from `routes/notifications.ts:73–76`. FE occurrence count: **0** (§16 B11).
The FE passes its locale as a query argument and as part of the cache key
(`hooks/useNotificationSettings.ts:5–17`).

### 7.5 Future direction (proposed; not implemented)

Per decision 13, templates move from four columns to translation rows, mirroring
`pet_record_type_concept_translations`:

```
notification_settings           (identity, schedule, targeting — language-neutral)
notification_setting_translations (setting_id, locale, title, body)
```

with the same guarantees that table already proves out: `lower(locale)` uniqueness per parent,
non-blank checks, and absence-means-untranslated.

Per decision 14, delivered notifications must preserve **both** the resolved locale and the exact
rendered text.

**Why delivered notifications still need rendered text after templates are normalized:**

1. **The push already left the building.** APNs/FCM delivered a specific string to a specific
   device. The in-app `/notifications` list must show *that* string, not a re-render.
2. **Templates are mutable.** `notification_broadcasts` exists precisely because "settings may
   change after broadcast" (`notifications.ts:183`). Re-rendering from a live template would
   rewrite history.
3. **Interpolation is time-varying.** `{{petName}}` resolves against the *most recently engaged
   pet* (`notificationTemplateService.ts:63–66`). Re-rendering a six-month-old notification would
   name a different pet — or fall back to `น้อง` / `your pet` if the pet was deleted.
4. **Fallbacks are lossy.** If a notification was delivered in a fallback locale, only the stored
   text records what the user actually saw; the resolved-locale column records *why*.
5. **Audit and support.** "What exactly did we send this user?" must be answerable from a row, not
   reconstructed.

**What already exists vs. what is missing.** The resolved locale is **not** absent today: for every
broadcast-sourced row it is persisted at `notifications.metadata.language` (F-24, §6.5). What is
missing is a *normalized* representation, and the gap is threefold:

1. **Not schema-typed today.** It is a JSONB key with no column type, no NOT NULL, no check
   constraint, no default, and no expression index. Locale-partitioned queries need a JSONB
   extract. PostgreSQL could index or constrain the path; the point is that nothing does.
2. **Not universal.** User-reminder rows carry no `language` key at all (F-24a), so any query
   over the key silently under-counts rather than failing loudly.
3. **Not contractual.** Nothing in the schema requires the key, so a future caller of
   `pushService.sendToUser` can omit it without breaking anything — the same way the reminder path
   already does.

So the snapshot text says *what was sent*; `metadata.language` says *in which locale* for most but
not all rows; and a normalized `resolved_locale` column would make that answer typed, complete, and
enforced — plus record *after which fallback* once a fallback chain exists. See D-6.

---

## 8. AI localization inventory

**Counts.** The broad locale-branch scan over `src/services`, `src/prompts`, and `src/config`
matches **15** files (§16 B12a). **14** of those are AI files and are listed in the table below
(§16 B12b). The 15th match is `src/services/blogService.ts`, which is blog presentation code, not
AI — it is inventoried in §12 instead, and is **excluded** from the AI count.

Separately, `src/services/insights/post-processor.service.ts` is a **localized-persistence
dependency**: it accepts `locale` and writes it to `pet_insights`, but contains no locale branch
and does **not** match either scan. It is listed after the table, outside the branch count
(F-32a). No AI file was modified.

**14 AI branch files:**

| File | Locale branches | Affects |
|---|---|---|
| `src/config/chat-persona.config.ts:42–48,207–208,277–278` | Persona name/self-reference (`nameTh`/`nameEn`, `selfReferenceTh`/`selfReferenceEn`); fully separate Thai and English system-prompt bodies; separate chat-write and free-tier tool sections per locale | **Prompt** |
| `src/services/chat/prompt-builder.service.ts:23–26,89–97` | Locale-branched context prompt; assembles persona + tool sections by locale | **Prompt** |
| `src/services/chat/context-builder.service.ts:144–147,299–352,361–374` | Locale-branched conversation context and subtype catalog; picks `nameTh` vs `nameEn` from lookup rows at `:366` | **Prompt** (reads locale-suffixed DB columns) |
| `src/services/chat/orchestrator.service.ts:194–202,219,494` | Locale-branched user-facing error and image-failure strings; threads `locale` (default `'th'` at `:212`) into persistence and display resolution | **Prompt + output + stored data** |
| `src/services/chat/title-generator.service.ts:23–29,71–76` | Locale-branched title-generation prompt | **Prompt + stored data** (`pet_chat_messages.conversation_title`) |
| `src/services/chat/validation.service.ts:43–91` | Locale-keyed rejection-message record; `messages[reason][locale]` with a `validation_error` fallback | **Validation + output** |
| `src/services/insights/prompt-builder.service.ts:45–56,107–113,145,158–177,215–225` | Thai vs English language guidelines; `น้อง` name prefix; `NAMING_CONFIG.thai/.english`; explicit `OUTPUT LANGUAGE:` directive; locale-specific title-length instruction | **Prompt + output** |
| `src/services/insights/knowledge-processor.service.ts:178–185,223,233,258–259` | Runs an **EN→TH translation pass** over breed knowledge when `locale === 'th'` | **Prompt + stored data** |
| `src/services/insights/dummy-card-generator.service.ts:67–304` | Fully locale-keyed dummy/upsell card copy (titles, descriptions, upgrade message, upsell hook and subtitle) | **Output** |
| `src/prompts/health-summary-prompt.ts:71–104,129,196–227,247–248` | `isThai` gate; locale-specific age formatting; hard `LANGUAGE:` directive; locale-specific trial-offer and example copy; Thai self-reference rule; locale-branched fake-summary text | **Prompt + output** |
| `src/prompts/config/naming-config.ts:23–29` | `formatPetName` → `น้อง${name}` for Thai | **Prompt** |
| `src/services/llm/gemini.provider.ts:187,254–258,286,404–408` | Post-processing: detects Thai vs English sentence terminators and appends a locale-specific continuation suffix | **Post-processing + output** |
| `src/services/pets/suggestion-context.service.ts:67,215–232,253–318,368–379,417–453,489` | Locale-branched language block, pet descriptions, pinned chip; **Thai-script regex validation** at `:444–446`; regenerates on locale change at `:218`; persists `locale` into `user_profiles.suggestion_context` at `:489` | **Prompt + validation + stored data** |
| `src/services/recent-symptoms.service.ts:225–319` | Locale-branched symptom formatting for prompt context | **Prompt** |

**Localized-persistence dependency (not a branch match, not in the count of 14):**

| File | Locale role | Affects |
|---|---|---|
| `src/services/insights/post-processor.service.ts:123,132,139,141,153,170` | Accepts `locale: Locale` as a parameter, deletes prior insights scoped by `(petId, locale)` at `:139`, and writes `pet_insights.locale` alongside generated content at `:141`. **Contains no `locale === '…'` or `isThai` branch** and matches neither B12a nor B12b. | **Stored data only** |

**Broad-scan match that is not AI (not in the count of 14):** `src/services/blogService.ts` —
content presentation, covered in §12.

### 8.1 Provider configuration

No locale-conditional provider or model selection was found. `services/llm/router.ts`,
`gemini.provider.ts`, and `deepseek.provider.ts` route on tier and task, not language. Locale
enters only as a prompt input and a post-processing branch (F-35).

### 8.2 Language-specific evaluation needed later

- **Output-language adherence.** Prompts *instruct* the language (`health-summary-prompt.ts:129`,
  `insights/prompt-builder.service.ts:164`) but only suggestion-context *verifies* it, and only for
  Thai (F-34). A generalized locale-adherence check is needed before any third locale ships.
- **Script-family assumptions.** The Thai-script regex (`suggestion-context.service.ts:445`) and
  the Thai sentence-ending detector (`gemini.provider.ts:254`) are per-script, not per-locale, and
  do not generalize.
- **Translation-pass quality.** The EN→TH knowledge translation
  (`knowledge-processor.service.ts:178–223`) is an LLM call with no verification; a third locale
  multiplies this path.
- **Persona fidelity.** The persona is authored twice in full (`chat-persona.config.ts:48,208,278`).
  A third locale requires a third authored persona, not a translation — plus drift detection
  between them.
- **Naming conventions.** `น้อง` is a Thai honorific with no analogue in most locales
  (`naming-config.ts:28`); each new locale needs an explicit naming rule.
- **Rejection/error-string coverage.** `validation.service.ts:79–91` would return `undefined` for an
  unknown locale key and fall through to `messages.validation_error[locale]` — also undefined. A
  registry-driven fallback is required.

---

## 9. Frontend localization inventory

### 9.1 Type and configuration

| Item | Value | File:line |
|---|---|---|
| Locale type | `type Locale = "en" \| "th"` | `lib/i18n/config.ts:1` |
| Supported array | `["th","en"]` | `lib/i18n/config.ts:3` |
| Default | `"th"` | `lib/i18n/config.ts:5` |
| Dev override | `NEXT_PUBLIC_FORCE_LANG` | `lib/i18n/config.ts:8–15` |
| Public surface | `useLanguage`, `DEFAULT_LOCALE`, `FORCE_LOCALE`, `SUPPORTED_LOCALES`, `Locale`, `Messages`, `getClientLocale` | `lib/i18n/index.ts:1–9` |
| Secondary type | `type ClientLocale = "en" \| "th" \| undefined` — a *second* union | `lib/i18n/getClientLocale.ts:1` |

### 9.2 Provider

`components/providers/LanguageProvider.tsx`:
- Seeds from `FORCE_LOCALE \|\| initialLocale \|\| DEFAULT_LOCALE` (`:45`).
- On change: reloads messages (`:54`), sets `document.documentElement.lang` (`:56`), writes the cookie (`:63`) and localStorage (`:66`).
- `setLocale` is state-only; persistence is the effect's job (`:71–73`).
- Exposes `{locale, messages, t, setLocale}` (`:98`).

`components/providers/LanguageSync.tsx` reconciles with the backend after sign-in (F-18).

### 9.3 Catalog loader

`lib/i18n/loader.ts:6–13` — a static `Record<Locale, Messages>` with `?? byLocale.th` as the
fallback. Both catalogs are statically imported, so **both ship in every bundle**; adding a locale
adds its full catalog to every client bundle.

### 9.4 Catalogs

- 38 page modules per locale, `lib/i18n/locales/pages/{th,en}/*.ts`, aggregated by `th.ts` / `en.ts` (39 imports each).
- Namespaces declared in `lib/i18n/types.ts:5–24`: `common`, `nav`, `settings`, `pages` required; `auth`, `lock`, `upgrade`, `share`, `accessibility`, `feedback`, `subscription`, `components`, `weight`, `healthInsights`, `tutorial`, `chat` optional. **Optional namespaces mean a locale can legally omit whole sections with no type error.**
- Key parity (measured, §16 B15): th **1768** paths, en **1780** paths.

**Only in `en` (14):**
```
settings.notifications.essential.title
settings.notifications.essential.description
settings.notifications.essential.info
settings.notifications.essential.details
settings.notifications.essential.examples.title
settings.notifications.essential.examples.items[]
settings.notifications.reminders.examples.title
settings.notifications.reminders.examples.items[]
settings.notifications.marketing.examples.title
settings.notifications.marketing.examples.items[]
settings.notifications.deviceSettings.title
settings.notifications.deviceSettings.description
pages.subscription.billing
healthInsights.generation.estimatedTime
```
**Only in `th` (2):** `pages.contact.toggle.th`, `pages.contact.toggle.en`

### 9.5 Lookup, interpolation, missing keys

- Lookup: dot-path walk over the messages object (`LanguageProvider.tsx:77–82`).
- **Missing key → returns the key string** (`:81`), as does a non-string node (`:92`). No warning, no fallback-locale retry, no telemetry (**D-5**).
- Interpolation: `{{name}}` regex replace; unmatched placeholders left literal (`:86–88`).
- A parallel helper set exists at `lib/utils/i18n.ts:19–58` (`formatT`, `createFormatter`, `useI18nFormatter`) — same semantics, second implementation.
- No pluralization, no gender, no ICU MessageFormat anywhere.

### 9.6 Formatting

- Date/time: `lib/utils/dateLocale.ts:12,24,36` — `locale === "th" ? "th-TH" : "en-US"` (F-42).
- 25 additional files hard-code `th-TH` / `en-US` inline (§16 B7/B8; file list from the same command).
- Currency: `lib/utils/currency.ts:15–19` — country-driven, **not** locale-driven (F-43). This is the correct separation and should be preserved.
- Timezone: user-level `user_config.timezone` (IANA, nullable = auto-detect) — already independent of locale (`pawjai-be/src/db/schema/users.ts:78–82`).

### 9.7 Locale in cache keys

| Key | File:line |
|---|---|
| `["pet", petId, locale]` | `app/pet/[id]/PetDetailClient.tsx:124` |
| `["petRecords", userId, petId, locale, plan]` | `app/pet/[id]/PetDetailClient.tsx:195` |
| `["pet", petId, "insights", userLocale]` | `app/pet/[id]/health-insights/page.tsx:153` |
| `["pet", petId, "insights", "summary", userLocale]` | `app/pet/[id]/health-insights/page.tsx:181` |
| `queryKeys.chat.suggestions(locale)` | `components/chat/ChatSuggestions.tsx:68`, `hooks/useSuggestionsPrefetch.ts:30` |
| `queryKeys.petRecordConceptCatalog(species, locale)` | `hooks/usePetRecordConceptCatalog.ts:32` |
| `queryKeys.chat.history("user", locale)` | `hooks/useChatHistory.ts:24` |
| `queryKeys.pets.recentIdentities(petId, locale)` | `hooks/useRecentLogShortcuts.ts:74` |
| `["pet", pet.id, "insights", locale]` | `hooks/useInsightsPrefetch.ts:63` |
| `NOTIFICATION_SETTINGS_KEY(language)` | `hooks/useNotificationSettings.ts:15` |
| `["breeds", species, lang]` | `hooks/useBreeds.ts:13` |
| `queryKeys.pets.snapshot(petId, locale)` | `hooks/usePetSnapshot.ts:51` |

### 9.8 Hardcoded conditionals

- `locale === "th"` on **125** lines, `locale === "en"` on **16** (§16 B3/B4).
- `"th" | "en"` unions declared inline **34** times, `"en" | "th"` **21** times (§16 B1/B2) — i.e. the locale union is re-declared ~55 times rather than imported from `lib/i18n/config.ts`.
- Ad-hoc pairs such as `code === "th" ? t("settings.language.th") : t("settings.language.en")` (`app/settings/language/page.tsx:29–30,61–63`) mean the language picker itself does not scale past two entries even though it maps over `SUPPORTED_LOCALES` (`:17`).

---

## 10. Admin localization inventory

The admin app has **no** end-user i18n (it is English-only by design). Its localization coupling is
that it *edits* localized data with fixed two-language controls.

| Area | Fixed assumption | File:line |
|---|---|---|
| **Notification forms** | `lang: "th" \| "en"` prop; hard-coded flag emoji, ring color, border color, and label per language | `app/admin/settings/notifications/components/BilingualFields.tsx:25,36–41` |
| **Notification forms** | Four separate required fields, no add-a-language affordance | same file, `:11–16` |
| **Broadcast forms** | Composer, preview, send-now, selective-send all carry the quad | `.../BroadcastComposer.tsx`, `PushPreview.tsx`, `SendNowButton.tsx`, `SelectiveSendButton.tsx`, `SelectiveSendModal.tsx` |
| **Admin API types** | The quad redeclared in 4 interfaces + `resolvedTh`/`resolvedEn` preview shapes | `types/admin.ts:128–131,146–149,161–164,172–175,196–197` |
| **Broadcast history** | Snapshot columns rendered as two fixed columns | `.../BroadcastsTab.tsx`, `.../ArchivedTab.tsx` |
| **Blog forms** | `locale: 'en' as 'en' \| 'th'`, defaulting to `'en'`; two-option select | `app/admin/content/blog/[id]/page.tsx:44,63,244–249`, `app/admin/content/blog/new/page.tsx:171–172` |
| **Blog list** | Two-option filter; `post.locale === 'th' ? 'Thai' : 'English'` label; per-locale featured counters `{th, en}` | `app/admin/content/blog/page.tsx:46–47,59–62,221–227,275,358–362` |
| **Concept translations** | `PRIMARY_LOCALES = ["en","th"]` drives the editable panels; **all other locales are rendered read-only** | `app/admin/settings/concepts/page.tsx:37,145,159,178–236,623–629` |
| **Concept translations** | Panel heading is `locale === "en" ? "English" : "Thai"` — a third editable locale would be mislabelled "Thai" | `app/admin/settings/concepts/page.tsx:184` |
| **Breed / lookup data** | `nameTh`/`nameEn` field pairs in breed and lookup-type editors | `app/admin/breeds/page.tsx`, `app/admin/settings/lookup-types/page.tsx`, `lib/api/services/breedService.ts`, `lookupTypesService.ts`, `conceptsService.ts`, `analyticsBreedsService.ts` |
| **Analytics filters** | AI-usage locale filter is a hard-coded `All / TH / EN` select | `app/admin/analytics/ai-usage/page.tsx:341–343` |
| **Analytics** | "Messages by Language" and "By Language" breakdowns assume two buckets | `app/admin/analytics/chat-health/page.tsx:124`, `app/admin/analytics/ai-usage/page.tsx:204–208` |
| **Feedback filter** | Hard-coded `English` / `Thai` options | `app/admin/feedback/page.tsx:164–165` |
| **User language control** | `<select>` with exactly `en` / `th` options, plus an empty "Select language" | `components/admin/EditUserProfileDialog.tsx:133–141` |
| **User list/detail** | `LANG_LABELS = {th:"TH", en:"EN"}` with an `.toUpperCase()` fallback (degrades gracefully) | `app/admin/users/page.tsx:9–12,265` |

**Notable:** the concepts page is the only admin surface that already tolerates unknown locales —
it renders them read-only under "Other locales" (`concepts/page.tsx:232–236`). It is the closest
admin analogue to the target model.

Fixed-language `<option>` controls: **12** across 6 files (§16 B13).

---

## 11. WebView locale impact

Native sources are absent. Everything below is web-side evidence only; nothing about native
behavior is asserted beyond what web code proves.

| Concern | Web-side evidence | Native status |
|---|---|---|
| **Platform detection** | iOS via `window.webkit.messageHandlers`; Android via `window.Android` + `PawjaiAndroid/` UA cross-check | `lib/utils/nativeBridge.ts:30–59` — **verified web-side** |
| **Secondary detection** | UA heuristics + `?mobile_app=true` + `pawjai://` referrer + WebKit handler presence | `lib/utils/mobileAppDetection.ts:7–60` — **verified web-side** |
| **Native → web locale** | `?locale=` on `/auth/native-handoff` is the only channel found | `app/auth/native-handoff/page.tsx:68` — **verified web-side**; whether the app always sends it is **unknown** |
| **Locale precedence at handoff** | DB preference wins; native locale used only on DB-miss, then pushed up | `native-handoff/page.tsx:160–179` — **verified** |
| **Persistence at handoff** | Writes `localStorage` + `<html lang>`; **does not** write `NEXT_LOCALE` | `native-handoff/page.tsx:168–178` — **verified**. Since SSR reads only the cookie (F-15), a native-supplied locale can be dropped on the next full page load (**D-8**) |
| **Web → native locale** | **No such handler exists.** Registered handlers are `signOut`, `notificationSettingsChanged`, `sessionEstablished` | `nativeBridge.ts:34–36`; `app/settings/page.tsx:64`; `app/settings/notifications/page.tsx:112`; `lib/utils/sessionCookies.ts:85` — **verified absent web-side**. Whether native re-reads locale another way is **unknown** |
| **Cookie behavior in WebView** | `NEXT_LOCALE` is `path=/`, `max-age` 1 year, `sameSite=lax`, not `httpOnly` | `lib/i18n/cookie.ts:33`, `middleware.ts:90–94` — **verified**. Whether WKWebView/Android WebView persists it across cold start is **unknown** |
| **Local storage in WebView** | `pawjai.locale` preserved across sign-out | `lib/utils/auth.ts:45–54` — **verified**. Whether the WebView data store is cleared by the app is **unknown** |
| **Deep links** | Push deep links must start with `/` because "iOS concats `https://pawjai.co` + deepLink"; default is `/notifications?highlight=<id>` | `pawjai-be/src/db/schema/notifications.ts:71–74` (comment) — **web-side documented**; native concat behavior is **asserted by that comment only** |
| **Foreground behavior** | `auto_open_on_foreground` gates a `visibilitychange` handler on the FE `/notifications` page | `pawjai-be/src/db/schema/notifications.ts:79–83` — **verified as a web-side contract** |
| **External domains** | Backend serves an active-domain allowlist for the app to open outside the WebView; **not locale-aware** | `pawjai-be/src/routes/external-domains.ts:10–23` — **verified** |
| **Blog links** | Blog is a public route (`middleware.ts:18`); `LanguageSync` deliberately skips `/blog/*` | `middleware.ts:18`, `LanguageSync.tsx:19–20` — **verified** |
| **Redirect flags** | `mobile_app=true` is threaded through auth redirects and post-auth landings | `lib/auth/redirects.ts:78–91`; `native-handoff/page.tsx:119,191,193,221` — **verified** |

**Unknown (do not assume):** whether the native shell caches web pages per locale; whether it
sends `Accept-Language`; whether it restarts the WebView on locale change; whether it has its own
locale UI; whether it clears cookies or local storage on sign-out.

---

## 12. Legacy blog compatibility boundary

### 12.1 Current state

**Schema** (`pawjai-be/src/db/schema/content.ts:22–47`):

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` PK, `defaultRandom()` | Must be preserved (decision 18) |
| `locale` | `languageEnum`, NOT NULL, default `'th'` | The only *content* dependant of the shared enum |
| `title`, `excerpt`, `content` | `text` | |
| `slug` | `text` **globally unique**, NOT NULL | **Not** unique-per-locale (F-47) |
| `featured_image_url`, `og_image_url` | `text` | |
| `category`, `tags` | `text`, `text[]` | |
| `status` | `blogPostStatusEnum`, default `draft` | Publication state — preserve |
| `is_featured` | `boolean` | Exclusivity enforced per locale |
| `view_count` | `integer` | |
| `published_at` | `timestamptz` | Publication state — preserve |
| `meta_title`, `meta_description` | `text` | |

Indexes: `blog_posts_status_idx`, `blog_posts_locale_idx`,
`blog_posts_status_locale_published_idx`, `blog_posts_is_featured_locale_idx`
(`content.ts:43–46`).

**Locale type in application code:** `'en' \| 'th'` declared inline in `blogService.ts:19,29,44,62`
and in `routes/blog.ts:31,84` / `routes/admin/blog.ts:10,25,55` — **not** imported from the shared
`Locale` type.

**Routes and consumers:**

| Route | File:line | Locale handling |
|---|---|---|
| `GET /api/blog` | `routes/blog.ts:26–39` | `locale` query, **defaults `'en'`** (D-7) |
| `GET /api/blog/featured` | `routes/blog.ts:79–88` | `locale` query, **defaults `'en'`** |
| `GET /api/blog/:slug` + related | `routes/blog.ts:112–119` | Related posts inherit `post.locale` |
| `GET/POST/PUT /api/admin/blog` | `routes/admin/blog.ts:10,25,42–64` | `z.enum(['en','th'])` |
| FE index (SSR) | `app/blog/page.tsx:45–50` | Thai-first, English only if the Thai list is empty |
| FE index (client) | `components/blog/BlogPageContent.tsx:20,30` | Re-fetches on `locale` change |
| FE post page | `app/blog/[slug]/page.tsx:101–102` | Maps `blog.locale` to schema.org `inLanguage` (`th-TH`/`en-US`) |
| Admin | see §10 | Two-option select, `'en'` default |

**Presentation baked into the API:** `blogService.getAuthorName` (`:71–72`) returns
`เปเป้พอใจ` / `PePe Pawjai`, and `formatDate` (`:89–92`) formats with `th-TH`/`en-US` — both
computed server-side and returned inside the post payload (`:117–118`).

### 12.2 Enum coupling and the contract path

`blog_posts.locale` is one of the six `languageEnum` users (§6.2) and the only one that is
*published content* rather than app state. It is therefore the single point where the legacy blog
constrains the app's locale evolution.

**Can the column become plain `text` solely to remove enum coupling?** Yes — and that is the
recommended contract step. Specifically:

- The values stay `'th'` / `'en'` (decision 18 — no renaming, no cosmetic change).
- No translation-group model, no per-locale slug uniqueness, no hreflang, no canonical-URL work is added (decisions 16, 17, 19).
- The change is DDL-only on type; every read (`blogService.ts:145,193,255,325,348,478`) is an equality filter that behaves identically against `text`.
- The three locale-bearing indexes must be rebuilt as part of the type change.
- Rollback to the enum is safe **only while** all values remain in `('th','en')` — which decision 18 guarantees, so the rollback window stays open indefinitely.

### 12.3 Future extraction options (documented, not chosen)

1. **Read-only export/feed** — a one-time JSON/Markdown dump keyed by `(id, locale, slug)`, consumed by the external CMS as an import source.
2. **Compatibility API** — keep `/api/blog` serving existing IDs and slugs while the external site becomes canonical; Pawjai stops accepting writes.
3. **One-time migration + redirects** — move content out, keep a redirect map from every legacy slug.

All three preserve `id`, `locale`, `slug`, `status`, and `published_at`.

### 12.4 Redirect-preservation requirements

- Every currently published slug must resolve — the slug is globally unique (F-47), so no per-locale disambiguation is needed for a redirect map.
- `middleware.ts:18` marks `/blog` public; any extraction must keep it public and unauthenticated.
- The existing `/tierview → /tier` redirect (`middleware.ts:97–102`) is the working pattern for query-preserving redirects.
- WebView taps on blog links go through the external-domain allowlist (`routes/external-domains.ts:20–23`); if blog content moves to a new domain, **that domain must be added to `external_domains` or in-app blog links will open inside the WebView instead of the browser** (or vice versa, depending on intent).

### 12.5 Explicit confirmations

- ✅ **Pawjai does not need a new translation-group model for the legacy blog.** No such column or table exists today (F-47), and none will be added.
- ✅ **The app localization refactor must not depend on the external blog architecture.** The only coupling is `blog_posts.locale`'s use of the shared enum, and §12.2 removes it without touching blog behavior.
- ✅ **The future external website owns any new multilingual content model** — translated slugs, canonical URLs, hreflang, and CMS architecture.

---

## 13. Target architecture (proposed — not implemented)

Nothing in this section exists in code. No registry, no types, and no RTL work were introduced.

### 13.1 Locale registry contract

```ts
type LocaleDefinition = {
  code: string;                    // stable identity, e.g. "th", "en", "ja", "zh-Hant"
  intlLocale: string;              // what goes to Intl.*, e.g. "th-TH", "en-US"
  fallbackLocale: string | null;   // resolution chain; null terminates it

  nativeLabel?: string;            // optional presentation metadata only
  direction?: "ltr" | "rtl";       // optional; absent means "ltr"

  capabilities: {
    ui: boolean;
    notifications: boolean;
    aiChat: boolean;
    aiInsights: boolean;
    legal: boolean;
  };
};
```

**Rules:**
- Missing `direction` means `"ltr"`.
- `nativeLabel` is optional presentation metadata.
- **`englishName` is not required** and is not part of this contract.
- Labels and `direction` must never control business behavior — only `code`, `intlLocale`, `fallbackLocale`, and `capabilities` may.
- This task introduces **no production registry code**.
- This task introduces **no RTL layout work**.

### 13.2 Target principles

| Principle | Rationale | Existing proof in-repo |
|---|---|---|
| **One resolver.** A single locale-resolution function per surface, with an explicit ordered chain and one configured default. | Removes D-2, D-3, D-10; makes precedence testable. | `petRecord.ts:30` is already the cleanest single-expression resolver. |
| **Separate requested from resolved.** Carry both; persist the resolved value with any generated or delivered artifact. | Decision 14; closes D-6. | `petRecordDisplay/resolution.ts:138–216` already returns `resolvedLocale` + `usedFallback`. |
| **Translation rows, not columns.** Database-backed translation uses `(parent_id, locale, …)` rows. | Decision 5, 10, 13. | `pet_record_type_concept_translations` (`pets.ts:190–226`) — including `lower(locale)` uniqueness and non-blank checks. |
| **Stable identity for domain content.** Store concept/event codes and structured params; render at read time. | Decision 10, 11. | `pet_records` concept snapshot; `admin_audit_log` (action code + jsonb metadata). |
| **Snapshot only for fidelity.** Store rendered text where history must be exact. | Decision 12, 14. | `notification_broadcasts` (`notifications.ts:183–188`). |
| **Locale ≠ region ≠ currency ≠ timezone.** | Decision 4; fixes D-10. | `currency.ts:15–19` (country→currency) and `user_config.timezone` are already correct. |
| **Explicit fallback chain, observable.** Every fallback emits `usedFallback` and the resolved locale. | Makes D-4/D-5 detectable instead of silent. | `resolution.ts:146–216` six-tier chain. |
| **Capability gates, not string checks.** Feature availability reads `capabilities.*`, never `locale === 'th'`. | Answers Q-3 mechanically once product decides. | — (new) |

### 13.3 Target resolution chain (proposed)

```
explicit request locale (?lang / API arg)     — requested, may 400 if unsupported
  → authenticated user preference
  → session persistence (single mechanism, one place)
  → client hint (Accept-Language, q-value aware)
  → configured default locale
  → registry fallbackLocale chain until null
```

Region signals (IP-geo country) feed **region/currency**, not locale (decision 4, resolving D-10)
— pending Q-2.

---

## 14. Migration sequence (proposed)

Per decision 15: **expand → dual read/write → backfill → cutover → observe → contract.**

| Phase | Goal | Representative work | Exit criterion |
|---|---|---|---|
| **0 — Inventory** *(this task)* | Evidence baseline | This document | Reviewed and accepted |
| **1 — Expand** | Add new structures; change no behavior | Registry module (unused); `notification_setting_translations` table; `notifications.resolved_locale` column (nullable); locale columns widened to `text` **without** widening the accepted value set | Old paths untouched; all baseline counts unchanged |
| **2 — Dual read/write** | New structures written alongside old; reads still prefer old | Notification writes go to both columns and rows; delivery writes `resolved_locale`; unified resolver added behind a flag, old resolvers still active | Both paths produce byte-identical output for `th`/`en` |
| **3 — Backfill** | Populate new structures from old | Copy `title_th/en`+`body_th/en` into translation rows; backfill `resolved_locale` from `metadata->>'language'` for broadcast-sourced rows (verified available, F-24), and mark user-reminder rows explicitly **unknown** — the `'th'` at `unifiedNotificationJob.ts:289` is a token-fallback language, not evidence of the reminder's authored language (F-24c), so it must not be backfilled as a resolved locale without a Q-9 decision | Row counts reconcile; every notification row is either backfilled or explicitly marked unknown, with the split reported per source type |
| **4 — Cutover** | Reads switch to new structures | Reads prefer translation rows; single resolver becomes authoritative on all surfaces; catalog parity enforced; admin surfaces become registry-driven | Old columns are write-only |
| **5 — Observe** | Prove equivalence under production traffic | Fallback-rate telemetry; missing-key telemetry (fixes D-5); locale-distribution dashboards; resolved-locale audits | Agreed soak period with no locale regressions |
| **6 — Contract** | Remove legacy structures | Drop the four language columns per notification table; drop the `language` PG enum (requires A-2); remove duplicate resolvers | Enum has zero dependants; duplicate resolvers deleted |

**Ordering constraints:**
1. `user_config.preferred_language` first — it is the write-side root.
2. `blog_posts.locale` early and standalone (§12.2) — decouples the legacy boundary before app churn.
3. `pet_insights.locale` and `pet_chat_messages.locale` together — both are cache/history keys.
4. Analytics-only columns (`chat_suggestion_events`, `health_summary_generations`, `feedback`) last — lowest coupling.
5. The `language` PG enum can only be dropped after **all six** dependants are text and A-2 is verified.
6. Notification translation rows must be backfilled **before** the four columns can be dropped, and delivered-notification snapshots must never be rewritten.

---

## 15. Area-of-effect monitoring matrix

| Area | Likely failure mode | Files / services affected | Evidence required from later tasks | Compatibility / rollback requirement |
|---|---|---|---|---|
| **Frontend UI** | Untranslated key renders as a raw dot-path; a new locale silently inherits `th` via `loader.ts:12` | `lib/i18n/**`, `LanguageProvider.tsx`, 38 page modules ×2 | Key-parity report per locale; missing-key telemetry from `LanguageProvider.tsx:81` | Catalogs stay additive; `loader.ts` fallback stays until parity is enforced |
| **SSR and hydration** | Server renders one locale, client mounts another → hydration mismatch and a visible flash | `app/layout.tsx:38–62,87,107`, `middleware.ts:66–95`, `LanguageProvider.tsx:42–45` | Same-locale assertion between `<html lang>` and provider state on first paint, per entry route | The cookie must remain the single SSR seed through cutover; no dual-source seeding |
| **Locale persistence** | Cookie/localStorage/DB diverge; a native-supplied locale is dropped (D-8) | `lib/i18n/cookie.ts`, `LanguageProvider.tsx:61–67`, `LanguageSync.tsx`, `native-handoff/page.tsx:160–179` | Three-way consistency trace: cookie ↔ localStorage ↔ `user_config` after sign-in, language switch, and native handoff | Existing cookie name, path, and 1-year max-age preserved; sign-out must keep preserving `pawjai.locale` |
| **API locale resolution** | Precedence differs per route; a q-value header resolves wrong (D-2); an unsupported `?lang` 400s where it used to fall through | `src/utils/locale.ts`, `routes/admin/pets.ts:7–16`, `routes/petRecord.ts:30`, `routes/chat.ts:61`, `routes/helper.ts`, `routes/share.ts`, `constants/schemas.ts:152,160,205` | Table-driven test: for each route × each of (`?lang`, `Accept-Language`, user pref, none) assert the resolved locale | `?lang` must keep 400-ing on explicit invalid values (`schemas.ts:149–151`); absent-value behavior must not change |
| **Query and cache keys** | A locale switch serves stale localized data, or a key change orphans warm caches | The 12 keys in §9.7 | Cache-key snapshot before/after; assert every localized query still keys on locale | Key *shape* changes invalidate caches — treat as a rollout event, not a silent change |
| **Database migration** | Enum→text on indexed columns rebuilds indexes; an out-of-range value blocks rollback | The 6 enum columns (§6.2), 3 blog indexes (`content.ts:44–46`), `pet_insights` unique index (`pets.ts:145`) | Pre/post row counts per locale value; `SELECT DISTINCT` per column; index existence and validity | Rollback requires all values remain in `('th','en')`; enforce in app code until the contract phase |
| **Date and time formatting** | Region assumptions ride along with language (`th`→`th-TH`); 25 files bypass the shared helper | `lib/utils/dateLocale.ts:12,24,36` + 25 files with inline `th-TH`/`en-US` | Golden-output formatting tests per locale; inventory that inline uses shrink, not grow | `intlLocale` must reproduce today's `th-TH`/`en-US` output exactly for existing locales |
| **Currency and region** | Currency accidentally becomes locale-derived, changing prices for existing users | `lib/utils/currency.ts:15–19`, `lib/utils/geolocation.ts`, `user_profiles.detected_country` | Assert `countryToCurrency` output is unchanged for every country code | **Currency must stay country-derived.** Any locale→currency coupling is a regression |
| **Notifications** | Wrong-language push (D-1); a new locale silently delivers English (F-26); a Thai-only campaign is mislabelled (D-9) | `notificationBroadcastService.ts:324,531–532,562–574`, `unifiedNotificationJob.ts:198–201,286–288`, `notificationTemplateService.ts:23–56`, `routes/notifications.ts:75–76`, `analyticsNotificationsService.ts:195` | Per-recipient resolved-locale log for one full broadcast; assert distribution matches `user_config`; assert no `?? 'en'` path fires unexpectedly. `metadata.language` on the resulting `notifications` rows is a ready-made assertion target (F-24) — no new instrumentation needed for the broadcast path | Existing `notification_broadcasts` snapshots must remain byte-identical; template-token semantics unchanged; `metadata.language` must keep being written by every `pushService.sendToUser` caller that already writes it |
| **Activity and audit history** | Historical rows re-render in today's locale; or the backfill drops the locale that `metadata.language` already carries; or it silently invents one for user-reminder rows that never had it (D-6) | `notifications` table (`metadata.language`, F-24), `admin_audit_log`, `pet_records` concept snapshot, `notification_broadcasts` | Assert delivered `title`/`body` are never rewritten by any migration; assert `resolved_locale` matches `metadata->>'language'` for every broadcast-sourced row; report the backfilled-vs-unknown split **per source type**, since only the broadcast path has the key | **Append-only.** No backfill may modify delivered text. Broadcast-sourced locale must be preserved exactly, not re-derived; reminder-sourced locale must not be fabricated without a Q-9 decision. |
| **AI chat and insights** | Prompt loses its language directive; output language drifts; the Thai-script validator rejects a valid non-Thai response; cache identity breaks | The 14 AI branch files in §8 plus `insights/post-processor.service.ts` (localized persistence); `pet_insights` unique index; `pets.health_summary_locale` cache check (`health-summary.service.ts:53`) | Per-locale output-language adherence sampling; assert insight cache hit/miss rates are unchanged for `th`/`en` | Prompts for `th`/`en` must be byte-identical through cutover; no prompt edits in the same change as plumbing |
| **Admin editing** | Admin can no longer edit a locale it does not know about; a third locale is mislabelled "Thai" (`concepts/page.tsx:184`) | `BilingualFields.tsx`, blog forms, `concepts/page.tsx:37,178–236`, `EditUserProfileDialog.tsx:133–141`, `ai-usage/page.tsx:341–343`, `feedback/page.tsx:164–165` | Assert every admin locale control derives its options from one source; assert unknown locales render read-only rather than being dropped | Existing `th`/`en` editing flows unchanged; no admin-visible relabeling of existing locales |
| **WebView and native sync** | Native-supplied locale silently dropped (D-8); deep link breaks; blog domain change traps links in the WebView | `native-handoff/page.tsx:68,160–179`, `nativeBridge.ts`, `sessionCookies.ts:85`, `routes/external-domains.ts` | Native handoff trace with and without a DB preference; deep-link tap test on both platforms; `external_domains` contents vs any new blog host | The `?locale=` param contract must not change without native coordination (A-4). Existing handler names (`signOut`, `notificationSettingsChanged`, `sessionEstablished`) are frozen |
| **Legacy blog extraction** | A slug 404s; publication state changes; the `'en'` default (D-7) silently swaps the served language | `content.ts:22–47`, `blogService.ts`, `routes/blog.ts`, `routes/admin/blog.ts`, `app/blog/**` | Full slug inventory before/after with HTTP status per slug; assert `id`, `locale`, `slug`, `status`, `published_at` are unchanged row-for-row | Decision 18 is absolute: IDs, `'th'`/`'en'` values, slugs, publication state, and legacy links preserved. Redirect map required for any relocation |

---

## 16. Reproducible baseline counts

All counts taken on branch `refactor/localization-platform` at its creation point.

**Tooling:** `rg` (ripgrep 14.1.1). Run from `/Users/moona/Desktop/Purin-Codism/projects/pawjai`
unless noted. `rg -c` counts **matching lines**, not occurrences — a line with two matches counts
once. `rg` honours `.gitignore`, so `node_modules`, `.next`, and build output are excluded;
`--glob '*.ts' --glob '*.tsx'` further restricts to source, excluding Markdown docs and the
`db/drizzle` migration snapshots.

### 16.1 Shared helper

```bash
c() { rg -c --no-filename --glob '!node_modules' --glob '*.ts' --glob '*.tsx' "$1" "$2" 2>/dev/null | awk '{s+=$1} END {print s+0}'; }
```

### 16.2 Counts

| ID | Measurement | Command (pattern passed to `c`, repo as 2nd arg) | fe | be | admin | total |
|---|---|---|---|---|---|---|
| **B1** | Direct `"th" \| "en"` type unions | `c "['\"]th['\"][[:space:]]*\|[[:space:]]*['\"]en['\"]" <repo>` | 34 | 15 | 1 | **50** |
| **B2** | Direct `"en" \| "th"` type unions | `c "['\"]en['\"][[:space:]]*\|[[:space:]]*['\"]th['\"]" <repo>` | 21 | 22 | 9 | **52** |
| **B3** | `locale === "th"` conditions | `c "locale === ['\"]th['\"]" <repo>` | 125 | 52 | 7 | **184** |
| **B4** | `locale === "en"` conditions | `c "locale === ['\"]en['\"]" <repo>` | 16 | 5 | 2 | **23** |
| **B5** | `lang === "th"` conditions | `c "lang === ['\"]th['\"]" <repo>` | 0 | 4 | 1 | **5** |
| **B6** | `lang === "en"` conditions | `c "lang === ['\"]en['\"]" <repo>` | 4 | 1 | 0 | **5** |
| **B7** | Hardcoded `th-TH` | `c "th-TH" <repo>` | 27 | 3 | 2 | **32** |
| **B8** | Hardcoded `en-US` | `c "en-US" <repo>` | 32 | 23 | 12 | **67** |
| **B11** | Notification language-specific fields | see §16.2.2 — the pattern contains an unescaped alternation and cannot be rendered inside this table | 0 | 91 | 151 | **242** |

> **Pipe semantics — read before copying any pattern.** `rg` treats `\|` as a **literal pipe
> character** and a bare `|` as **alternation**. The two are not interchangeable, and which one
> is correct differs by measurement:
>
> - **B1 and B2 require the escaped `\|`.** They search for a TypeScript union — the source text
>   literally contains a `|`, as in `export type TemplateLang = 'th' | 'en';`
>   (`notificationTemplateService.ts:7`). Matching a literal pipe is the whole point, so `\|` is
>   correct and intentional here, not an artifact of Markdown escaping.
> - **B3–B8 contain no pipe at all.**
> - **B11 requires the unescaped `|`.** It needs *alternation* across four field names. Writing
>   it as `\b(titleTh\|bodyTh\|titleEn\|bodyEn)\b` makes `rg` search for the literal string
>   `titleTh|bodyTh|titleEn|bodyEn`, which occurs nowhere, and the command silently returns
>   **0, 0, 0** instead of erroring.
>
> An earlier revision of this document carried the B1/B2 escaping habit into B11 and published a
> command that returns zero while reporting non-zero values. B11 is therefore given only as a
> runnable block below, never inline in a table cell where a bare `|` cannot survive.

#### 16.2.1 Reproduce B1–B8

```bash
cd /Users/moona/Desktop/Purin-Codism/projects/pawjai
c() { rg -c --no-filename --glob '!node_modules' --glob '*.ts' --glob '*.tsx' "$1" "$2" 2>/dev/null | awk '{s+=$1} END {print s+0}'; }
printf "%-14s %6s %6s %8s %8s %7s %7s %6s %6s\n" repo "th|en" "en|th" "loc==th" "loc==en" "lng==th" "lng==en" "th-TH" "en-US"
for r in pawjai-fe pawjai-be pawjai-admin; do
  printf "%-14s %6s %6s %8s %8s %7s %7s %6s %6s\n" "$r" \
    "$(c "['\"]th['\"][[:space:]]*\|[[:space:]]*['\"]en['\"]" $r)" \
    "$(c "['\"]en['\"][[:space:]]*\|[[:space:]]*['\"]th['\"]" $r)" \
    "$(c "locale === ['\"]th['\"]" $r)" \
    "$(c "locale === ['\"]en['\"]" $r)" \
    "$(c "lang === ['\"]th['\"]" $r)" \
    "$(c "lang === ['\"]en['\"]" $r)" \
    "$(c "th-TH" $r)" \
    "$(c "en-US" $r)"
done
```

This block covers **B1–B8 only**. B11 is not in it — run §16.2.2 as well.

#### 16.2.2 Reproduce B11 (notification language-specific fields)

Note the **unescaped** pipes inside the alternation:

```bash
cd /Users/moona/Desktop/Purin-Codism/projects/pawjai
c() {
  rg -c --no-filename \
    --glob '!node_modules' \
    --glob '*.ts' \
    --glob '*.tsx' \
    "$1" "$2" 2>/dev/null |
    awk '{s+=$1} END {print s+0}'
}

for r in pawjai-fe pawjai-be pawjai-admin; do
  printf '%s ' "$r"
  c '\b(titleTh|bodyTh|titleEn|bodyEn)\b' "$r"
done
```

Expected output:

```
pawjai-fe 0
pawjai-be 91
pawjai-admin 151
```

**B11b — admin consumer file listing (14 files):**

```bash
rg -l --glob '*.ts' --glob '*.tsx' \
  '\b(titleTh|bodyTh|titleEn|bodyEn)\b' \
  pawjai-admin | sort
```

Expected: the 14 files enumerated in §7.3.

### 16.3 Database

**B9a — locale-valued columns: 9**
```bash
rg -n "^\s+\w+: (languageEnum|text)\('(locale|preferred_language|health_summary_locale)'\)" pawjai-be/src/db/schema
```

**B9b — language-suffixed columns: 12**
```bash
rg -n "text\('(title_th|body_th|title_en|body_en|name_th|name_en)'\)" pawjai-be/src/db/schema
```

**B9c — withdrawn.** A previous revision published "total locale-bearing database fields: 24" by
summing B9a + B9b + structures-without-a-locale-column. That sum added incompatible units
(columns, JSONB keys, and absences) and counted stable-identity patterns that carry no locale at
all. There is no replacement grand total; see §6.8 for the per-category counts and their
definitions. Categories C, D, and E are enumerated in §6.5–§6.7 but are deliberately not reduced
to a single number.

**B10 — `languageEnum(...)` schema usages: 6**
```bash
rg -c --no-filename 'languageEnum\(' pawjai-be/src | awk '{s+=$1} END {print s+0}'
```
Listing form:
```bash
rg -n 'languageEnum\(' pawjai-be/src
```
The six sites: `chat.ts:47`, `chat.ts:179`, `content.ts:25`, `pets.ts:120`, `pets.ts:410`,
`users.ts:73`. **Independently verified; matches the earlier audit's count of six.** The bare
string `languageEnum` matches 12 lines — the extra 6 are 4 imports, 1 definition, and 1 comment
(see §6.2).

### 16.4 AI

Two distinct measurements. Do not conflate them: the broad scan is a *locale-branch* count, the
AI-only scan is a *subject-matter* count.

**B12a — broad locale-branch scan: 15 files**
```bash
rg -l --glob '*.ts' "locale === '(th|en)'|isThai" \
  pawjai-be/src/services \
  pawjai-be/src/prompts \
  pawjai-be/src/config |
  sort
```
This is every file in those trees containing a locale branch, regardless of subject. It includes
`pawjai-be/src/services/blogService.ts`, which is blog presentation, not AI.

**B12b — AI locale-branch files: 14 files**
```bash
rg -l --glob '*.ts' "locale === '(th|en)'|isThai" \
  pawjai-be/src/services \
  pawjai-be/src/prompts \
  pawjai-be/src/config |
  rg -v '/blogService\.ts$' |
  sort
```
15 minus `blogService.ts` = the 14 files tabulated in §8.

**Not matched by either scan:** `pawjai-be/src/services/insights/post-processor.service.ts`. It
takes `locale` as a parameter and persists it (`:123,132,139,141,153,170`) but contains no locale
branch. Confirm it is genuinely absent:
```bash
rg -n "locale === '(th|en)'|isThai" \
  pawjai-be/src/services/insights/post-processor.service.ts
# no output, exit status 1
```
It is inventoried in §8 as a localized-persistence dependency and is **not** part of the 14.

### 16.5 Admin

**B13 — fixed-language `<option>` controls: 12**
```bash
rg -n '<option value="(th|en)"' pawjai-admin/app pawjai-admin/components
```

### 16.6 Frontend catalogs

**B14 — translation modules: 38 per locale (76 total)**
```bash
ls pawjai-fe/lib/i18n/locales/pages/th/*.ts | wc -l   # 38
ls pawjai-fe/lib/i18n/locales/pages/en/*.ts | wc -l   # 38
```

**B15 — translation keys per locale: th 1768 paths, en 1780 paths**

Leaf-string counts (arrays counted by element): th **1768**, en **1786**.
Key-path counts (arrays counted as one `[]` path): th **1768**, en **1780**.

```bash
cd pawjai-fe
bun -e '
const th = (await import("./lib/i18n/locales/th.ts")).default;
const en = (await import("./lib/i18n/locales/en.ts")).default;
const paths = (n, p="", out=[]) => {
  if (typeof n === "string") { out.push(p); return out; }
  if (Array.isArray(n)) { out.push(p+"[]"); return out; }
  if (n && typeof n === "object") for (const [k,v] of Object.entries(n)) paths(v, p?p+"."+k:k, out);
  return out;
};
const T = new Set(paths(th)), E = new Set(paths(en));
console.log("th paths:", T.size, "en paths:", E.size);
console.log("only in en:", [...E].filter(k=>!T.has(k)).length);
console.log("only in th:", [...T].filter(k=>!E.has(k)).length);
'
```
Output: `th paths: 1768`, `en paths: 1780`, `only in en: 14`, `only in th: 2`. The two key sets are
listed in §9.4. This command reads the catalogs through Bun's module loader and writes nothing.

### 16.7 Verifying this document itself

`LOCALIZATION_REFACTOR.md` is **untracked**, so plain `git diff` and `git diff --check` produce no
output for it — they inspect tracked changes only, and an empty result there is *not* evidence the
file is clean. Use `--no-index` against `/dev/null` instead:

```bash
cd /Users/moona/Desktop/Purin-Codism/projects/pawjai

# Trailing-whitespace scan — expect no output.
rg -n '[[:blank:]]+$' pawjai-be/docs/technical/LOCALIZATION_REFACTOR.md

# Full content as a diff. Exit status 1 is expected (the files differ).
git diff --no-index -- /dev/null pawjai-be/docs/technical/LOCALIZATION_REFACTOR.md

# Whitespace diagnostics. Exit status 1 is expected for a new file;
# what matters is that no whitespace-error lines are printed.
git diff --no-index --check -- /dev/null pawjai-be/docs/technical/LOCALIZATION_REFACTOR.md
```

### 16.8 Note on measurement scope

These are architecture measurements only. Per scope restrictions, **no lint rules were created and
no source code was modified based on them.** They exist to make later phases falsifiable: a phase
that claims to reduce hardcoded locale conditionals must move B3/B4; a phase that claims to
normalize notification templates must move B11; the contract phase must drive B10 to zero.

**Every command in this section must be executed, not read.** Two of the defects fixed in
Correction 1 were commands that looked correct and returned wrong or zero results (B11's escaped
alternation; B9c's incompatible sum). A count that has not been re-run is not evidence.

---

## 17. Phase implementation status

Sections 1–16 above are the original Task 0A inventory snapshot and describe the codebase
**before** any of the phases below. They are left as written; this section is the running,
append-only status log for everything implemented since.

| Phase | Description | Repo | Commit | Status |
|---|---|---|---|---|
| 1 | Expand backend locale persistence — add `notification_setting_translations`, `notifications.resolved_locale` (nullable, expand-only) | `pawjai-be` | `b3fbbe99d331ce12b291bbf010a0eec9c8c007b8` | Complete |
| 2 | Dual-write notification locale data — writes go to both legacy `title_th`/`body_th`/`title_en`/`body_en` columns and the new translation rows | `pawjai-be` | `6746baa70c75fdd0814472f8fdc2ad92b2ff4b5d` | Complete |
| 3 | Safe notification locale backfill — one-time backfill of translation rows from legacy columns for pre-existing settings | `pawjai-be` | `d6a4c7ce67dbde662d48de461a6e077cb0665796` | Complete |
| 4 | Notification translation read-cutover readiness — `NOTIFICATION_TRANSLATION_READS_ENABLED` flag (default `false`), the pure resolver/reader split, shadow comparison, and the readiness gate script | `pawjai-be` | `410d7c8fd580b8f8ca70ec809bfa6eddda2e9c4d` | Complete. Flag remains **disabled by default**; cutover itself has not run anywhere. |
| 5 | Localization observability and cutover safety (this document's update) — fan-out resolution telemetry, delivered-notification audit script, frontend missing-key telemetry, this rollout procedure | `pawjai-be`, `pawjai-fe` | Not committed as of this writing — reviewed changes left unstaged for Codex per instruction | **Observability implemented; production soak pending.** |

Frontend note: `pawjai-fe` commit `418678884191e80c8d8be92357fb053661a405b3`
(`refactor(i18n): establish scalable locale registry`) is a frontend-only precursor on the same
branch, not part of the backend phase-numbered sequence above. It is the locale registry Phase 5
Part C's missing-key telemetry is wired into (`LanguageProvider`, catalog lookup) — see §19.

Every phase to date has preserved: legacy notification columns and dual-write, historical
notification snapshots (title/body as rendered), API response shapes, and Phase 3 backfill
behavior. No phase has removed a legacy column, changed a migration, or altered the notification
fallback-to-English default for missing user config (D-1, §7.2) — Phase 5 measures that default;
it does not change it (see §18.4).

---

## 18. Phase 5 contract definitions

These terms are used precisely and identically across the resolver (`notificationContentResolver.ts`),
the reader (`notificationContentReader.ts`), the broadcast service
(`notificationBroadcastService.ts`), the new resolution-telemetry aggregator
(`notificationResolutionTelemetry.ts`), and the delivered-notification audit
(`notificationLocaleAuditClassifier.ts`, `scripts/notification-locale-audit.ts`).

### 18.1 Requested locale

The locale a specific recipient/read was targeting **before** any resolution happened — for a
broadcast recipient, their `user_config.preferred_language` if set to `th`/`en`, else the
`?? 'en'` default applied by `notificationBroadcastService.loadLanguages`/`fanOut` (D-1, unchanged
by Phase 5). Field name: `requestedLocale` (resolver/reader), `metadata.requestedLanguage`
(persisted on the `notifications` row).

### 18.2 Resolved locale

The locale the delivered/returned title and body **actually belong to**. Equals the requested
locale unless a fallback occurred (§18.4), in which case it equals the platform default locale
(`'th'`, `DEFAULT_NOTIFICATION_LOCALE` in `notificationContentResolver.ts`). Field name:
`resolvedLocale` (resolver/reader), `notifications.resolved_locale` and `metadata.language`
(persisted — both are the same value by contract, see §18.3 and the audit's `conflictCount`).

### 18.3 Source

Which storage the delivered content came from: `'translation'` (a `notification_setting_translations`
row) or `'legacy'` (the `title_th`/`body_th`/`title_en`/`body_en` columns). Every flag-off read and
every ad-hoc broadcast is `'legacy'` unconditionally — see `selectLegacyContentExact`'s doc comment
in `notificationContentResolver.ts`. Field name: `source`.

### 18.4 Fallback

`usedFallback` is `true` only when `resolvedLocale !== requestedLocale` — i.e. the requested
locale had no usable content in **either** source (translation row or legacy column), and the
platform default locale's content was substituted instead. Selecting the legacy columns for the
same locale that was requested is not a fallback (that is just a lower-priority source for the
locale actually asked for). Fallback can only happen on the flag-on (`resolveNotificationContent`)
path; `selectLegacyContentExact` (flag-off, and ad-hoc broadcasts always) never falls back —
`usedFallback` is always `false` there.

### 18.5 Missing-user-config default

When `notificationBroadcastService.loadLanguages` finds no `user_config` row for a recipient (or
finds one whose `preferred_language` is neither `'th'` nor `'en'`), `fanOut` defaults that
recipient's requested locale to `'en'` (`languages.get(userId) ?? 'en'`). This is **existing,
unchanged behavior** (D-1) — Phase 5 adds observability only:
`NotificationResolutionOutcome.hadUserConfig` is `false` for these recipients, and the per-fan-out
summary's `missingUserConfigDefaultCount` counts them. Whether defaulting to English (rather than
the platform default `'th'`, or some other rule) is correct behavior is an open product question,
not resolved by this phase — see §18.9.

### 18.6 `notification_locale_resolution_summary` (fan-out telemetry)

Emitted once per `notificationBroadcastService.fanOut` call (i.e. once per `broadcast()` or
`broadcastFromSchedule()` invocation that reaches the recipient loop), via `logger.info`, after
every recipient has been processed — never per-recipient. Fields:
`broadcastId`, `sourceSettingId` (`null` for ad-hoc broadcasts), `kind`, `targeted`, `sent`,
`failed`, `requestedLocaleCounts` (`{th, en}`), `resolvedLocaleCounts` (`{th, en}`), `sourceCounts`
(`{translation, legacy}`), `fallbackCount`, `fallbackPairs` (e.g. `{"en->th": 3}`),
`configuredLanguageCount`, `missingUserConfigDefaultCount`. Never includes user ids, titles,
bodies, template variables, device tokens, or a raw metadata dump. Purely observational: nothing
in `fanOut` branches on this aggregate, so it cannot change delivery success/failure behavior.
Aggregation logic is pure (`notificationResolutionTelemetry.ts`); the `logger.info` call itself
lives in `fanOut`, isolated behind the private, non-throwing `emitResolutionSummary` — every
count (`sentCount`/`failedCount`/`completedAt`) is already persisted, and `sent`/`failed` are
already computed, before this call happens, so even if `logger.info` itself throws, `fanOut`
still resolves normally with the correct `BroadcastResult` (proven by an integration test that
makes `logger.info` throw specifically for this event name and asserts delivery, persisted
counts, and the returned result are all unaffected — see
`notification-resolution-summary.test.ts`'s "telemetry failure isolation" suite).

### 18.7 `notification translation shadow comparison` (Phase 4, unchanged by Phase 5)

Still the flag-off, per-setting-per-fan-out drift signal described in §7.5/Phase 4 — logs setting
identifier, locale, status, and mismatched field **names** only, never title/body text. Phase 5
does not modify `compareSettingToLegacyOnce` or its logging.

### 18.8 Delivered-notification audit (`scripts/notification-locale-audit.ts`)

A separate, read-only, on-demand check of what was **actually persisted** to the `notifications`
table for broadcast-sourced rows (`source_type_enum = 'admin_broadcast'`) — see §20. It checks the
same contract from stored data rather than in-process counters, so it catches drift the live
telemetry above cannot (e.g. a bug that logs a correct summary but writes the wrong
`resolved_locale`).

### 18.9 Open product questions this phase does not answer

- Is `'en'` the right missing-user-config default, or should it be the platform default locale
  (`'th'`)? Phase 5 only measures this (§18.5); §4's open questions are unchanged.
- What soak duration and acceptable fallback/missing-config rate are required before cutover is
  considered safe? Deliberately not set by this document — see §21 and §22.

---

## 19. Frontend missing-key event contract

Implemented in `lib/analytics.ts` (existing `track` API — no new provider, endpoint, or
dependency) and wired into the `LanguageProvider` translation lookup (lookup/reporting logic kept
outside the React provider for unit-testability).

**Event name:** `localization_missing_key`

**Properties (allowed, no others):**

| Property | Meaning |
|---|---|
| `locale` | The active locale at lookup time (`'th'` \| `'en'`, or whatever the registry supports later) |
| `translation key` | The catalog key that was looked up |
| `reason` | `'missing'` (key absent from the catalog) or `'non_string'` (catalog node present but not a string — e.g. a nested object) |

No interpolation values, user text, URL, user id, or other PII is included — only the key name
itself, which is a developer-authored identifier, not user data.

**Behavior:**

- A successful lookup renders and interpolates exactly as before Phase 5 — no behavior change.
- A missing or non-string value still returns the **raw key** as the rendered string (unchanged
  fallback behavior — Phase 5 does not introduce a new fallback).
- Each `(locale, key, reason)` combination is reported **at most once per browser session** (an
  in-memory `Set`, not persisted).
- The dedupe set has a fixed bound (500 combinations) so it cannot grow without limit on a page
  that hammers a broken key in a loop; once full, further distinct combinations are silently not
  tracked (never a crash, never blocked rendering).
- A tracker/analytics failure is caught and never interrupts rendering — the raw key still
  renders even if `track()` throws.
- Uses the existing `logger`, not direct `console.*` calls, for any internal diagnostic output.
- SSR/hydration behavior, and the existing cookie / localStorage / native-handoff / WebView
  locale contracts, are unchanged — this phase only adds a side-channel analytics call on the
  client.

**Pre-initialization buffering (fixed during Codex review of this phase):** `LanguageProvider`'s
`t()` can run during the very first render — before `AnalyticsProvider`'s `useEffect` has called
`initAnalytics()`. Before this fix, `track()` (`lib/analytics.ts`) silently no-ops while
`isInitialized` is still `false`, but the dedupe `Set` had already marked that `(locale, key,
reason)` combination as seen — so the event was lost for the rest of the session with no way to
retry it. `lib/i18n/missingKeyTelemetry.ts`'s `createMissingKeyTracker` now buffers reports made
before it is told analytics is ready, and `AnalyticsProvider` calls the exported
`flushMissingKeyTelemetry()` immediately after `initAnalytics()` in the same effect, sending every
buffered report exactly once. The pending buffer needs no separate size limit: an entry is only
ever buffered for a combination that has already passed the same 500-combination dedupe cap, so it
can never hold more than 500 entries either. `flush()` is idempotent (safe under React StrictMode's
double-invoked effects) and a throwing buffered report is caught per-item, so one bad report can't
stop the rest of the buffer from flushing.

**Double-guarded non-throwing, and no worker-global state during SSR (second Codex review round):**
The per-item catch above originally logged the failure via `logger.debug` unconditionally — if the
diagnostic logger itself threw (not just the analytics reporter), that second throw was not
guarded and could still escape `report()`/`flush()`. `createMissingKeyTracker` now injects the
diagnostic callback as a parameter (defaulting to the real `logger.debug`) and wraps *that* call in
its own try/catch too, so neither `report()` nor `flush()` can throw even when both the analytics
reporter and the diagnostic logger fail (proven by a test that makes both throw and asserts calls
succeed anyway) — while the diagnostic still fires normally under the common single-failure case.
Separately, the module-level dedupe `Set`/pending buffer is Node.js process state, not per-request
state — Next.js server-renders this client component, so without a guard a missing-key event
looked up during one visitor's SSR pass could buffer into a shared server-process singleton and
leak into a different visitor's response (and would never flush, since `flush()` only ever runs
client-side). `createBrowserGatedTracker` wraps the production singleton so `report()`/`flush()`
no-op entirely outside the browser (`typeof window === "undefined"`); nothing is lost, because
client-side hydration re-runs the same lookup, correctly scoped to that one browser session.

---

## 20. Notification audit command and exit meanings

```bash
bun run scripts/notification-locale-audit.ts              # default: last 24 hours
bun run scripts/notification-locale-audit.ts --hours=72    # custom window (validated, capped at 2160h / 90 days)
```

Read-only: issues one `SELECT` (only `resolved_locale` and `metadata` — never title/body/user id)
against `notifications` rows where `source_type_enum = 'admin_broadcast'` and `created_at` falls
in the window. Never inserts, updates, deletes, or runs a migration.

Prints, deterministically: rows scanned; resolved-locale distribution (`th`/`en`/`missing`/`invalid`);
requested-locale distribution (same shape, where `missing` means **unknown**, not corrupt, for
older rows written before `metadata.requestedLanguage` existed); requested-locale unknown count;
fallback count and the requested→resolved pair distribution; missing `resolved_locale` count;
missing `metadata.language` count; invalid (non-`th`/`en`) locale-value count; and the count of
rows where `resolved_locale` conflicts with `metadata.language`. The fallback-pair object always
prints both possible keys (`en->th` and `th->en`) in that fixed order, even at count `0` — pairs
are pre-populated, not inserted as rows are scanned, so the printed key order can never depend on
the order the database happened to return rows in (proven by a test that scans the same rows
forward, reversed, and shuffled, and asserts byte-identical `JSON.stringify` output each time).

**Argument parsing** (`parseAuditCliArgs`, `notificationLocaleAuditClassifier.ts`) validates the
**entire** argv, not just a lone `--hours=` search, and rejects before any database access:

| Input | Result |
|---|---|
| no arguments | valid — defaults to 24 hours |
| `--hours=72` | valid |
| `--hours` (no value) | **invalid** |
| `--hours=` (empty value) | **invalid** |
| `--hours=abc` / `=0` / `=-5` | **invalid** |
| `--hours=` value over 2160 (90 days) | **invalid** |
| `--unknown` (any unrecognized flag) | **invalid** |
| a bare positional argument (e.g. `72`) | **invalid** |
| `--hours` supplied twice (even with identical values) | **invalid** |

Nothing is silently defaulted to 24 hours when any argument was supplied incorrectly — every
invalid form above returns a distinct, non-empty error string and the script exits before issuing
any query.

**Exit codes** (decision logic lives in the pure `decideNotificationLocaleAuditHealth`,
`notificationLocaleAuditClassifier.ts` — exhaustively unit-tested without a database):

| Exit | Meaning |
|---|---|
| `0` | HEALTHY — the window is non-empty, and every row has a present, valid `resolved_locale` that matches `metadata.language`, with no missing `metadata.language`. |
| `1` | UNHEALTHY, or not evaluable — any invalid argument form from the table above; an **empty** window (insufficient data is never treated as a healthy no-op); any row missing `resolved_locale`; any row missing `metadata.language`; any invalid (non-`th`/`en`) locale value in any of the three fields; any `resolved_locale`/`metadata.language` conflict; or the query itself failing (bad connection, etc). |

A row's `metadata.requestedLanguage` being absent (`requestedLocaleUnknownCount`) does **not** by
itself make the audit unhealthy — see §18.9/§18.5 and the contract note in §18.1.

Manually verified against a disposable local database (never staging/production): empty window →
exit 1; a fully-healthy row → exit 0; a `resolved_locale`/`metadata.language` conflict → exit 1;
`--hours=abc` → exit 1; unreachable `DATABASE_URL` → exit 1; `--hours` window boundary correctly
includes/excludes rows by `created_at`; a bare `--hours` / duplicate `--hours` / positional
argument / unknown flag all exit `1` **without ever reaching `db.select`** (confirmed by running
with `DATABASE_URL` unset — the process fails on argument validation before the missing-env-var
error would otherwise fire).

---

## 21. Rollout procedure (concise)

This is the only sanctioned procedure for enabling the Phase 4 read cutover. Steps 5–7 are
**not** performed by this phase or this document — they require an explicit, separate,
authorized deployment decision.

1. Deploy with `NOTIFICATION_TRANSLATION_READS_ENABLED=false` (the default in every environment
   today — verified absent from every `.env*.example` file, §Phase 4).
2. Run the existing translation readiness scan: `bun run scripts/notification-translation-readiness.ts`.
3. Confirm it reports `READY` (exit code `0`) — see the Phase 4 script's own doc comment for what
   READY requires.
4. Observe shadow comparison (`compareSettingToLegacyOnce` drift logs) and the new
   `notification_locale_resolution_summary` fan-out summaries (§18.6) in production logs, with the
   flag still off, for a period long enough to build confidence in the data — **duration is an
   operations decision, not specified here** (see §22).
5. Enable `NOTIFICATION_TRANSLATION_READS_ENABLED=true` **only** through an authorized deployment
   decision — never silently, never by default, never as part of a routine deploy.
6. Run test sends (`kind: 'test_send'`) and the delivered-notification audit
   (`bun run scripts/notification-locale-audit.ts`, §20) against the now-live flag.
7. Observe for the agreed soak period — **duration and acceptable fallback/drift threshold are
   product/operations decisions, not specified here** (see §22).
8. Roll back immediately by setting the flag back to `false` if any provenance or content
   regression appears — the flag-off path is always byte-identical legacy behavior
   (`selectLegacyContentExact`), so rollback is a single env var change, no data migration
   required.

---

## 22. Phase 5 exit criteria

Phase 5 (this document's update) is complete when observability exists and is proven correct —
**not** when the cutover has happened. The cutover itself (rollout steps 5–8 above) is explicitly
out of scope for this phase.

- [x] Fan-out resolution telemetry (`notification_locale_resolution_summary`) implemented, one log
      per fan-out, verified against 2- and 100-recipient fan-outs.
- [x] Delivered-notification audit script implemented and read-only-verified against a disposable
      local database (never staging/production).
- [x] Frontend missing-translation-key telemetry implemented, deduped, bounded, and non-throwing.
- [x] This document updated with the exact contract meanings, event contracts, audit command, and
      rollout procedure.

The five items below are **not** blocked on each other, and — corrected from an earlier draft of
this section — most of them are **not** blocked on the flag being enabled either. Two entirely
different things gate the remaining exit criteria: (a) being run against **real environment data**
(none of this phase's verification touched staging/production — everything so far ran against
disposable local/Docker Postgres, per the out-of-scope rules), and (b) requiring the flag to
actually be **enabled**, which is a separate, later, authorized decision. Conflating the two
previously produced an inaccurate blanket statement; the corrected breakdown:

**Do not require the flag to be enabled — only require real production data/traffic, which
already exists today regardless of Phase 5 or the flag's state:**

- [ ] Translation readiness (`notification-translation-readiness.ts`) reports `READY` **against a
      real environment's data**. This script is specifically designed to run with the flag
      **false** — that is its entire purpose as the pre-cutover gate (§21 step 2). Not yet
      evaluated against a real environment; only run against disposable local databases so far
      (Phase 4 and this phase).
- [ ] Missing-user-config defaults (§18.5) are measured **in production traffic** and explicitly
      reviewed by product/operations. The `notification_locale_resolution_summary` log (§18.6)
      already fires on every real fan-out today, flag on or off — this only requires someone to
      actually pull and review real log data, not to wait for a soak period.
- [ ] Supported frontend locales show no unexplained `localization_missing_key` events **in
      production traffic**. This telemetry is entirely independent of the backend notification
      flag — it can and should be reviewed from real traffic today, regardless of notification
      cutover status.

**Do require an authorized flag-on rollout and real traffic flowing through the flag-on path —
these two cannot be satisfied by flag-off data no matter how much of it exists:**

- [ ] The delivered-notification audit (§20) reports zero missing, zero invalid, and zero
      conflicting broadcast provenance **when run post-cutover, against rows actually produced
      while the flag was enabled**. (The audit script itself is flag-agnostic and was verified
      read-only against disposable local data in this phase — see §20 — but that verification
      proves the script works, not that a live flag-on rollout is healthy.)
- [ ] No user-visible notification regression observed during the agreed soak period (§21 step 7)
      — soak is, by definition, observing behavior while the flag is enabled; it has not started,
      and the flag has not been enabled anywhere.

Until all five criteria are checked, Phase 5 remains **observability implemented; production soak
pending**. The first three criteria can be evaluated while the flag remains disabled. Authorized
rollout steps 5–8 are the mechanism for evaluating the final two criteria. Phase 6 — Contract must
not begin until all five criteria are satisfied.
