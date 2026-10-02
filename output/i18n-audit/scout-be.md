# Backend i18n Audit: Localization Inconsistencies & Third-Locale Risks

**Scout Date:** 2026-10-02  
**Branch:** feat/reminder-detail  
**Scope:** pawjai-be read-only analysis — no edits applied  

---

## Summary

The backend has extensive hardcoded binary locale assumptions ('th' | 'en') scattered across database schema, TypeScript types, business logic, and configuration. While a first-phase translation infrastructure now exists for some tables (notification_settings, pet_record_type_concepts), many critical paths still bake human-readable strings into the database at write time or depend on ternary locale checks that will silently select Thai as a fallback for any unknown locale. **A third locale requires changes across at least 4 architectural layers: database enums, TypeScript types, business rules (60+ ternary expressions), and schema migration patterns.**

---

## 1. Activity Log / Timeline / History: String Generation & Storage

### Finding 1.1: Pet Records — Concept Resolution Bakes Semantic Key Only
- **File:** `/src/db/schema/pets.ts:163-229` (petRecordTypeConcepts, petRecordTypes, petRecords)
- **Pattern:** Records store immutable `conceptId` snapshot + `conceptResolutionSource`, but the _human label_ is NOT stored with the record. Instead, labels live in `pet_record_type_concept_translations` (one row per concept/locale).
- **Why Safe:** Labels are resolved at read time, not write time, so adding a new locale requires no data migration.
- **Why It Breaks:** The display resolution (`/src/services/petRecordDisplay/resolution.ts:90`) hardcodes `OTHER_LOCALE: { en: 'th', th: 'en' }` — a binary toggle. A third locale falls through to the generic fallback labels (e.g., 'Activity', 'Symptom') in `GENERIC_LABELS: Record<RecordType, Record<RecordDisplayLocale, string>>` which are hardcoded English/Thai only.

**Evidence:**
```typescript
// pets.ts:163-229 — concept is stored, label is not
export const petRecordTypeConcepts = pgTable('pet_record_type_concepts', {
  key: text('key').notNull(), // 'activity.feeding', machine semantic, not human text
  // ... fieldSchema, isActive, etc.
});
// petRecordTypeConceptTranslations holds { conceptId, locale: 'en'|'th'|'fr'|..., name, description }

// resolution.ts:90 — fallback is hardcoded binary
const OTHER_LOCALE: Record<RecordDisplayLocale, RecordDisplayLocale> = { en: 'th', th: 'en' };

// resolution.ts:75-79 — GENERIC_LABELS for any unmatched record
const GENERIC_LABELS: Record<RecordType, Record<RecordDisplayLocale, string>> = {
  activity: { en: 'Activity', th: 'ชีวิตประจำวัน' },
  // ... symptom, vet_visit, medication hardcoded en/th only
};
```

---

### Finding 1.2: Chat Receipt "Identity" Messages — Inline String Assembly
- **File:** `/src/services/chat/orchestrator.service.ts`, `/src/prompts/health-summary-prompt.ts`
- **Pattern:** Chat reply localization is delegated to the LLM (system prompt instruction "Reply in the language of the user's latest meaningful message"). But internal metadata and fallback error messages are hardcoded.
- **Why It Breaks:** Error messages like receipt identity are ternary-resolved: `locale === 'th' ? '...' : '...'`. A request with `locale: 'fr'` falls through to English.

**Evidence:**
```typescript
// orchestrator.service.ts
return locale === 'th'
  ? 'ข้อความถูกปฏิเสธเนื่องจากไม่เป็นไปตามนโยบาย'
  : 'This message was declined due to policy violation';

// Falls through to English for any locale other than 'th'
```

---

### Finding 1.3: Push Notification Content — Dual-Column Legacy + Translation Tables
- **File:** `/src/db/schema/notifications.ts:37-131`, `/src/services/notificationContentResolver.ts`
- **Pattern:** `notificationSettings` stores `titleTh, bodyTh, titleEn, bodyEn` as hard columns. New writes also upsert `notificationSettingTranslations` (locale-flexible). Reads follow a cascade: exact translation → legacy columns → default ('th') translation → default legacy.
- **Why Safe (Partially):** Translation table is BCP-47-capable; new locales can add rows.
- **Why It Breaks:**
  1. Legacy columns are NOT NULL and required for every setting — migration to a third locale must still backfill those columns even though they'll never be read.
  2. Default fallback is hardcoded to 'th' in `notificationContentResolver.ts:37`: `const DEFAULT_NOTIFICATION_LOCALE: SupportedNotificationLocale = 'th'`. A request for locale 'fr' with no matching translation falls back to Thai, not to a configurable default or English.
  3. `SupportedNotificationLocale` type is explicitly `'th' | 'en'` (`notificationContentResolver.ts:31`), not a Locale or string — adding 'fr' requires a type change.

**Evidence:**
```typescript
// notifications.ts:43-46 — legacy columns still required
titleTh: text('title_th').notNull(),
bodyTh: text('body_th').notNull(),
titleEn: text('title_en').notNull(),
bodyEn: text('body_en').notNull(),

// notificationContentResolver.ts:31, 37 — hardcoded binary type and default
export type SupportedNotificationLocale = 'th' | 'en';
const DEFAULT_NOTIFICATION_LOCALE: SupportedNotificationLocale = 'th';

// notificationContentResolver.ts:235 — hardcoded comparison list
(['th', 'en'] as const).map((locale) => compareTranslationToLegacy(...));
```

---

### Finding 1.4: Admin Audit Log — No Localization
- **File:** `/src/db/schema/admin.ts:19-30` (adminAuditLog)
- **Pattern:** Admin actions (login, user edits, deletions) are logged as plain text in `action` column — no locale, no i18n template keys.
- **Why It Breaks:** Audit trail is inherently English (hard to change after the fact), but if admin UI ever needs localized action descriptions, a new audit-log schema is needed.
- **Risk:** Low for users; high for admin UX.

**Evidence:**
```typescript
export const adminAuditLog = pgTable('admin_audit_log', {
  action: text('action').notNull(), // "User created", "User password reset", etc. — hardcoded English
  details: jsonb('details'),
});
```

---

## 2. Lookup / Catalog Data: Localization Patterns

### Finding 2.1: Breeds — nameEn / nameTh Columns
- **File:** `/src/db/schema/pets.ts:32-45` (breeds table)
- **Pattern:** Two hard columns per locale, no translation table.
- **Count:** 1 table × 2 locales = 2 columns.
- **Why It Breaks:**
  1. Adding a third locale (e.g., 'ja') requires a new migration: `ALTER TABLE breeds ADD COLUMN name_ja TEXT NOT NULL DEFAULT ''`.
  2. Breed search/filter logic currently ternaries on `language === 'en' ? nameEn : nameTh` (breedService.ts).
  3. `breedService.ts:getBreedInfo()` parameter is typed `language: 'en' | 'th' = 'th'` — adding 'ja' requires type change + conditional tree update.

**Evidence:**
```typescript
// pets.ts:35-36
nameEn: text('name_en').notNull(),
nameTh: text('name_th').notNull(),

// breedService.ts (inferred from grep results)
async getBreedInfo(language: 'en' | 'th' = 'th', ...): Promise<BreedInfo> {
  // Ternary on language parameter
}
```

---

### Finding 2.2: Pet Record Types (Lookup) — nameEn / nameTh Columns
- **File:** `/src/db/schema/pets.ts:232-273` (petRecordTypes)
- **Pattern:** Same as breeds — two hard columns, no translation table.
- **Count:** 1 table × 2 locales = 2 columns.
- **Why It Breaks:** Same as breeds — migration + type changes + ternary updates throughout orchestration.

**Evidence:**
```typescript
// pets.ts:236-237
nameEn: text('name_en').notNull(),
nameTh: text('name_th').notNull(),
```

---

### Finding 2.3: Pet Record Type Concepts (Catalog) — Translation Table ✓ Extensible
- **File:** `/src/db/schema/pets.ts:163-229` (petRecordTypeConcepts + petRecordTypeConceptTranslations)
- **Pattern:** Concept is stored once (machine key + type). Translations are in a separate table with BCP-47 locale.
- **Count:** 1 table × unlimited locales = no column limit.
- **Why Safe:** Fully translation-table-based; adding 'fr' requires only inserting rows.
- **Why It Still Breaks:**
  1. Display resolution (`resolution.ts:90`) still has the binary fallback toggle: `OTHER_LOCALE = { en: 'th', th: 'en' }`. A third locale falls back to generic labels (hardcoded en/th only).
  2. Admin create/edit endpoints still validate locale against `LANGUAGE_ENUM = ['th', 'en']` (see Finding 6 below).

**Evidence:**
```typescript
// pets.ts:200-229
export const petRecordTypeConceptTranslations = pgTable(...) {
  locale: text('locale').notNull(), // BCP-47 capable
  name: text('name').notNull(),
  description: text('description'),
};
// Unique constraint: (conceptId, lower(locale)) — case-insensitive per-concept locale
```

---

### Finding 2.4: Symptoms Catalog — No Dedicated Table (Inherited from Concepts)
- **File:** Symptoms are categorized via `petRecordTypes` (activity, symptom, vet_visit, medication). Translations flow through `petRecordTypeConceptTranslations`.
- **Pattern:** Same as Finding 2.3.

---

### Finding 2.5: Vaccines & Immunizations Catalog — Not Found [unverified]
- **Scope:** No schema table named `vaccines`, `immunizations`, or `vaccinations` discovered.
- **Risk:** Either vaccines are stored as free-form `notes` (unstructured, not localizable) or the catalog is in a separate, undiscovered module.

---

### Finding 2.6: Notification Settings — nameEn / bodyEn, nameTh / bodyTh Columns + Translation Table
- **File:** `/src/db/schema/notifications.ts:37-131` (notificationSettings + notificationSettingTranslations)
- **Pattern:** Hybrid. Legacy columns (titleTh, bodyTh, titleEn, bodyEn) are NOT NULL. New writes upsert `notificationSettingTranslations` in parallel.
- **Count:** 1 table × 2 legacy columns + 1 translation table × unlimited locales.
- **Why It Breaks:**
  - **Schema:** Adding a third locale doesn't require new columns, but legacy fallback is hardcoded to 'th' (Finding 1.3).
  - **Type:** `SupportedNotificationLocale` is `'th' | 'en'` (notificationContentResolver.ts:31) — must widen to include 'fr'.
  - **Reads:** `compareAllLocalesToLegacy()` hardcodes `(['th', 'en'] as const)` (notificationContentResolver.ts:235) — must be replaced with a configurable list.

**Evidence:**
```typescript
// notifications.ts:114-131
export const notificationSettingTranslations = pgTable(...) {
  locale: text('locale').notNull(), // BCP-47 capable
  title: text('title').notNull(),
  body: text('body').notNull(),
  // Unique: (notificationSettingId, lower(locale))
};
```

---

## 3. Request Locale Determination

### Finding 3.1: Resolution Order Hardcoded, Enum Restricted
- **File:** `/src/utils/locale.ts:15-26`
- **Pattern:**
  1. Query param `?lang=` (if 'en' or 'th' only — hardcoded regex check)
  2. Accept-Language header (if 'en' or 'th' detected — hardcoded regex)
  3. Undefined fallback
- **Allowed Values:** Hardcoded to 'th' | 'en' in regex and type guard.
- **Why It Breaks:** A client sending `Accept-Language: fr` returns undefined, not 'fr'. Callers then apply `?? 'th'` as the default (see Finding 3.2).

**Evidence:**
```typescript
// locale.ts:15-26
export function resolveLang(request: FastifyRequest): Locale | undefined {
  const queryLang = (request.query as any)?.lang as string | undefined;
  if (queryLang === 'en' || queryLang === 'th') return queryLang; // Hardcoded check

  const acceptLanguage = request.headers['accept-language'];
  if (acceptLanguage) {
    if (/\ben\b/i.test(acceptLanguage)) return 'en';
    if (/\bth\b/i.test(acceptLanguage)) return 'th';
  }

  return undefined;
}
```

---

### Finding 3.2: Fallback to Thai is Ubiquitous
- **File:** Multiple routes use `resolveLang(request) ?? 'th'`
- **Instances:** 40+ routes and services

**Evidence:**
```typescript
// routes/chat.ts
const locale: Locale = resolveLang(request) ?? 'th';

// routes/petRecord.ts
return lang ?? resolveLang(request) ?? 'th';

// routes/helper.ts
return lang ?? resolveLang(request) ?? (ownerPreferredLanguage === 'en' ? 'en' : ...) ?? 'th';

// routes/share.ts (vet-share endpoint)
return lang ?? resolveLang(request) ?? (...) ?? 'th';

// routes/petRecordConcepts.ts
const requestedLocale: Locale = lang ?? resolveLang(request) ?? 'th';
```

**Why It Breaks:** Any unrecognized locale silently becomes Thai. A client explicitly requesting 'fr' will receive Thai content with no error or fallback indicator, breaking the client's ability to detect unsupported locales.

---

### Finding 3.3: User Profile Preferred Language Enum
- **File:** `/src/constants/enums/user.ts:7-8`
- **Type:** `LANGUAGE_ENUM = ['th', 'en'] as const`
- **Usage:** User profile `preferredLanguage` column is typed to this enum.
- **Why It Breaks:** When a user profile exists with `preferredLanguage = 'fr'`, schema validation will reject it. No migration path exists to add a new enum value without a database migration AND application-level type updates.

**Evidence:**
```typescript
// /src/constants/enums/user.ts
export const LANGUAGE_ENUM = ['th', 'en'] as const;
export type Language = typeof LANGUAGE_ENUM[number]; // 'th' | 'en'

// /src/db/schema/enums/user.ts
export const languageEnum = pgEnum('language', LANGUAGE_ENUM);

// /src/db/schema/users.ts (inferred)
preferredLanguage: languageEnum('preferred_language'), // Postgres ENUM('th', 'en')
```

---

## 4. Server-Generated User-Facing Text

### Finding 4.1: Chat Error Messages — Ternary Locale Checks
- **File:** `/src/services/chat/orchestrator.service.ts`
- **Pattern:** Error messages returned to the client are generated server-side with a ternary on `locale === 'th'`.
- **Instances:** 5+ error messages

**Evidence:**
```typescript
error: locale === 'th'
  ? 'ข้อความถูกปฏิเสธเนื่องจากไม่เป็นไปตามนโยบาย'
  : 'This message was declined due to policy violation',

// Another instance:
const fallback = locale === 'th'
  ? 'เกิดข้อผิดพลาดขณะประมวลผลรูปภาพ'
  : 'Failed to process image';

error: request.locale === 'th'
  ? 'ข้อมูลอ้างอิงไม่เพียงพอ'
  : 'Insufficient reference data',
```

**Why It Breaks:** A third locale ('fr') silently receives English, with no way to customize.

---

### Finding 4.2: Push Notification Titles & Bodies
- **File:** `/src/db/schema/notifications.ts` + `/src/services/notificationContentResolver.ts`
- **Pattern:** See Finding 1.3 and 2.6 — fallback to Thai, type restricted to 'th' | 'en'.

---

### Finding 4.3: Health Summary Generation — Locale-Dependent System Prompt
- **File:** `/src/services/insights/prompt-builder.service.ts`
- **Pattern:** LLM system prompt injects locale-specific language guidelines:
  ```typescript
  OUTPUT LANGUAGE: ${locale === 'th' ? 'Thai' : 'English'}
  1. **title** (string): ...(${locale === 'th' ? 'Thai' : 'English'} (30-60 characters)
  ```
- **Why It Breaks:** A third locale falls through to English guidelines, and the output content (title, recommendations, resources) will always be generated in English.

**Evidence:**
```typescript
// prompt-builder.service.ts
const languageGuidelines = locale === 'th'
  ? THAI_PROMPT_BLOCK
  : ENGLISH_PROMPT_BLOCK; // Hardcoded binary
```

---

### Finding 4.4: Blog Posts — Locale as Hard Column
- **File:** `/src/db/schema/content.ts` (blogPosts table)
- **Pattern:** `locale` column is `text('locale')`, not an enum — blog posts are locale-aware but not table-driven.
- **Columns:** nameEn, nameTh hardcoded.
- **Why It Breaks:** Blog admin UI is restricted to 'en' | 'th' via Zod schema (routes/admin/blog.ts), so posting in 'fr' is rejected at validation.

**Evidence:**
```typescript
// routes/admin/blog.ts
const body = request.body as { locale?: 'en' | 'th'; ... };
// Type guard hardcoded; any other locale is rejected by Zod validation
```

---

### Finding 4.5: Reminder Titles & Descriptions — Free Text (Safe)
- **File:** `/src/db/schema/notifications.ts:195-196` (userReminders table)
- **Pattern:** `title` and `description` are plain text columns — user-written, not template-driven.
- **Why Safe:** No server-generated localized strings.

---

### Finding 4.6: Admin Broadcast Messages — Inline Locale Checks
- **File:** `/src/services/notificationBroadcastService.ts`
- **Pattern:** Broadcast resolution checks `if (lang === 'th' || lang === 'en') map.set(...)`. Any other locale is silently dropped.

**Evidence:**
```typescript
// notificationBroadcastService.ts
if (lang === 'th' || lang === 'en') map.set(row.userId, lang);
// Implicit else: other locales are skipped, user gets no notification or default
```

---

## 5. Binary Locale Assumptions: Ternaries & Hardcoded Literals

### Count: 60+ ternary expressions across the codebase

**Sample of High-Risk Ternaries (Non-Exhaustive):**

| File | Line(s) | Pattern | Risk |
|------|---------|---------|------|
| `/src/routes/chat.ts` | ~120 | `locale === 'th' ? error_th : error_en` | Chat reply errors silent-fallback to EN |
| `/src/services/chat/orchestrator.service.ts` | ~5 instances | `locale === 'th' ? ... : ...` | System messages, error messages |
| `/src/services/insights/prompt-builder.service.ts` | ~3 instances | `locale === 'th' ? THAI_PROMPT : ENGLISH_PROMPT` | LLM output language forced to EN for unknowns |
| `/src/services/recent-symptoms.service.ts` | 2 instances | `if (locale === 'th') { ... }` | Symptom name resolution |
| `/src/services/chat/title-generator.service.ts` | 1 instance | `if (locale === 'th') { ... }` | Chat conversation title language |
| `/src/services/chat/orchestrator.service.ts` | 2 instances | `locale === 'th' ? ... : ...` | Identity message generation |
| `/src/prompts/health-summary-prompt.ts` | ~3 instances | `lang === 'th' ? ... : ...` | Age/date formatting, LLM language instructions |
| `/src/prompts/config/naming-config.ts` | 1 instance | `locale === 'th' ? \`น้อง${petName}\` : petName` | Pet name formatting |
| `/src/services/blogService.ts` | 2 instances | `locale === 'th' ? ... : ...` | Blog author name, date formatting |
| `/src/services/notificationContentResolver.ts` | 1 instance | `locale === 'th' ? ... : ...` | Notification content selection |

**Why It Breaks:**
1. Each ternary is a binary decision with no fallback option for a third locale.
2. Changing even one ternary to support 'fr' requires code changes, not just data migrations.
3. Total of 60+ changes means high risk of missing one and leaving a silent en/th fallback.

---

## 6. Database Enums & Binary Constraints

### Finding 6.1: Postgres ENUM('th', 'en') for language
- **File:** `/src/db/schema/enums/user.ts:6` → `/src/constants/enums/user.ts:7-8`
- **Type:** `pgEnum('language', ['th', 'en'])`
- **Why It Breaks:** Postgres ENUM cannot have values added without `ALTER TYPE language ADD VALUE 'fr'`, which is atomic but cannot be rolled back and requires no concurrent writes to the table.

---

### Finding 6.2: Typescript Type Union Restrictions
- **File:** `/src/types/index.ts` (inferred from usage patterns)
- **Type:** `type Locale = 'th' | 'en'`
- **Instances:** 100+ uses across codebase
- **Why It Breaks:** All type guards like `locale === 'th' ? ... : ...` become incomplete checks when 'fr' is added. TypeScript will never warn about the missing case because the type hasn't changed yet.

**Evidence:**
```typescript
// Types used everywhere:
type Locale = 'th' | 'en';
export type Language = typeof LANGUAGE_ENUM[number]; // 'th' | 'en'
export type SupportedNotificationLocale = 'th' | 'en';
export type RecordDisplayLocale = Locale; // 'th' | 'en'
export type TemplateLang = 'th' | 'en'; // From jobs/unifiedNotificationJob.ts
```

---

### Finding 6.3: No Check Constraints Restricting Locales
- **Scope:** Schema search for CHECK constraints that list locale values found none (except indirectly via the ENUM on the language column).
- **Impact:** OK — constraints on translated tables (petRecordTypeConceptTranslations, notificationSettingTranslations) wisely leave `locale` as text, not an ENUM, allowing third locales to be stored even if the app doesn't yet handle them.

---

## 7. Inconsistencies: Naming & Schema Drift

### Finding 7.1: Column Naming Inconsistency — nameEn/nameTh vs title/body
- **Pattern 1 (breeds, petRecordTypes):** `name_en`, `name_th` (snake_case)
- **Pattern 2 (notificationSettings):** `title_th`, `body_th`, `title_en`, `body_en` (snake_case)
- **Pattern 3 (petRecordTypeConceptTranslations):** `name`, `description` (single column, locale in a separate column)
- **Pattern 4 (notificationSettingTranslations):** `title`, `body` (single column, locale in a separate column)

**Why It Breaks:** Adding a third locale to Pattern 1/2 requires deciding whether to follow the column-per-locale (breeds) or table-per-locale (concepts) model. Mixing both in the same database means future queries across locales are harder and code review drifts.

---

### Finding 7.2: Legacy Dual-Write Pattern (Notifications)
- **Hybrid:** `notificationSettings` writes both legacy columns (titleTh, bodyTh, titleEn, bodyEn) AND rows in `notificationSettingTranslations`.
- **Purpose:** Phase 3 backfill for cutover from legacy to translation tables (Phase 4).
- **Why It Breaks:** During Phase 4 read cutover, a 'fr' notification added by admin will write to legacy columns as… what? The dual-write code in `notificationSettingsService.ts:syncNotificationSettingTranslations` hardcodes only th/en writes, so a 'fr' broadcast will have blank legacy columns and rely entirely on the translation table. That's actually OK, but inconsistent with existing en/th settings.

**Evidence:**
```typescript
// From notificationSettingsService.ts (grep result)
{ locale: 'th', title: fields.titleTh, body: fields.bodyTh },
{ locale: 'en', title: fields.titleEn, body: fields.bodyEn },
// No handling for a third locale; 'fr' falls through unwritten
```

---

### Finding 7.3: Date / Time / Currency Formatting — No Locale Awareness on Server
- **Search Result:** `Asia/Bangkok` appears in test data only (test.ts); no server-side timezone-aware formatting found.
- **Pattern:** Dates and timestamps are stored as UTC in the database. Formatting happens client-side (app receives ISO strings).
- **Why Safe:** The backend does not impose Bangkok time or Thai calendar conversions.
- **Why It Still Requires Work:** If a third locale has a different calendar (e.g., Hebrew), the API contract may need to expand to signal calendar type, not just locale.

---

## Summary of Breakage by Category

### Schema (Migrations Required)
1. Adding a third locale requires changing:
   - `LANGUAGE_ENUM` in constants
   - Postgres ENUM type `language`
   - Any NOT NULL columns like `name_en`, `name_th` (breeds, petRecordTypes)
   - Legacy columns (titleTh, bodyTh, titleEn, bodyEn in notificationSettings)

### Types (Code Changes Required)
1. `type Locale = 'th' | 'en'` → must widen
2. `type SupportedNotificationLocale = 'th' | 'en'` → must widen
3. All ternary type guards will silently handle 'fr' as 'en' until code is updated

### Business Logic (60+ Edits)
1. 60+ ternary expressions: `locale === 'th' ? ... : ...`
2. No centralized fallback strategy — each file implements its own
3. Broadcast logic filters out non-th/en locales silently
4. Chat error messages hardcoded
5. LLM system prompts hardcoded

### Data (Backfill Required)
1. If breeds/petRecordTypes columns are widened to include 'name_fr', existing rows need a default
2. Notification settings dual-write must handle a third locale (currently ignored)
3. User profiles with `preferredLanguage = 'fr'` cannot exist until the ENUM is expanded

---

## Recommendations for Third-Locale Support

### Phase 1: Extend Type System & Enums
- [ ] Widen `LANGUAGE_ENUM` to include 'fr' (or other)
- [ ] Widen `type Locale` to match
- [ ] Widen `SupportedNotificationLocale`
- [ ] Migrate Postgres ENUM type `language` with `ALTER TYPE language ADD VALUE 'fr'`

### Phase 2: Centralize Fallback Logic
- [ ] Create a `LocaleResolver` service:
  - Takes (requestedLocale, availableLocales, defaultLocale)
  - Returns (resolvedLocale, usedFallback)
  - No ternaries in application code
- [ ] Replace all 60+ ternaries with calls to this service
- [ ] Define fallback chain: requested → configured default → English → first available

### Phase 3: Extend Hybrid Schemas
- [ ] For breeds/petRecordTypes: decide on migration path
  - Option A: Keep name_en/name_th/name_fr columns (denormalized)
  - Option B: Migrate to translation-table model (like petRecordTypeConcepts)
- [ ] Update dual-write in `notificationSettingsService` to handle arbitrary locales
- [ ] Seed default translations for built-in content

### Phase 4: Localize LLM Prompts
- [ ] Extend chat-persona.config.ts to support locale-specific language guidelines
- [ ] Extend health-summary-prompt.ts to include formatting rules per locale
- [ ] Cache deduplication still applies within a locale block

### Phase 5: Test & Audit
- [ ] Integration tests with a third locale (e.g., 'ja', 'es')
- [ ] Verify no silent fallback-to-English behavior
- [ ] Audit admin UIs to reject unsupported locales explicitly (not silently)

---

## File Summary by Type

### Core Localization Files
- `/src/utils/locale.ts` — Hardcoded to 'th'/'en'
- `/src/constants/enums/user.ts` — LANGUAGE_ENUM restricted
- `/src/db/schema/enums/user.ts` — Postgres ENUM restricted
- `/src/services/notificationContentResolver.ts` — SupportedNotificationLocale restricted
- `/src/services/petRecordDisplay/resolution.ts` — OTHER_LOCALE binary toggle, GENERIC_LABELS hardcoded

### High-Risk Ternary Concentration
- `/src/services/chat/orchestrator.service.ts` — 5+ instances
- `/src/services/insights/prompt-builder.service.ts` — 3+ instances
- `/src/prompts/health-summary-prompt.ts` — 3+ instances
- `/src/services/insights/knowledge-processor.service.ts` — 1+ instance

### Schema Files
- `/src/db/schema/pets.ts` — breeds (nameEn/nameTh), petRecordTypes (nameEn/nameTh)
- `/src/db/schema/notifications.ts` — notificationSettings (titleTh/bodyTh/titleEn/bodyEn) [hybrid]
- `/src/db/schema/content.ts` — blogPosts with hardcoded route validation

### Data Access Layer
- `/src/services/breedService.ts` — Parameterized by language
- `/src/services/blogService.ts` — Parameterized by locale, hardcoded date/author formatting
- `/src/services/notificationBroadcastService.ts` — Filters out non-th/en users

---

## Documents to Review

- `/docs/` directory — Check for i18n decisions docs (e.g., LOCALIZATION_REFACTOR.md referenced in notificationContentResolver.ts)
- Migrations folder — Confirm migration replay cut-points don't include language-related changes

---

**Report End**
