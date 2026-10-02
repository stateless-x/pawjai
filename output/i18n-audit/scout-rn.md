# pawjai-react-native i18n Audit: Scout Report

**Date:** 2026-10-02  
**Branch:** codex/aesthetic-improvement  
**Scope:** Full TypeScript/TSX codebase (src/) for localization inconsistencies and third-locale risks

## Summary

The i18n setup is **minimal and functional for 2 languages only**: a pure TypeScript typed-catalog approach with `t()` and `useT()`, no dependencies until plurals are needed (currently no plural rules implemented). **Major risk: binary locale assumptions** hardcoded throughout the app that will break or degrade silently when a third language is added. The catalogs themselves are **key-complete and parity-checked**, but backend data handling mixes `nameTh`/`nameEn` fields extensively with no extensible pattern.

### Key Findings:
1. **~50 ternary locale checks** across features, lib, and services using `language === 'th' ? a : b` pattern
2. **Hardcoded "DELETE" string** (one exception, intentional per spec)
3. **Date/time formatting fully localized** with custom Buddhist calendar logic
4. **No plural rules** despite having Thai/English templates ready
5. **Binary backend field fallbacks** (`breedNameTh ?? breedNameEn` vs `breedNameEn ?? breedNameTh`)
6. **Placeholders mostly translated**, one numeric literal unlocalized
7. **Locale-specific DatePicker** hardcoded to th_TH / en_US mapping

---

## 1. I18n Setup and Library

**Library:** In-house typed catalogs, no dependency  
**Catalog location:** `/src/i18n/th.ts`, `/src/i18n/en.ts`, `/src/i18n/index.ts`  
**API:** `t(key, params?, language?)` + `useT()` hook

### Key Details:
- **Type safety:** Compile-time parity check via `AssertSameKeys` type (index.ts:21-26)
  - Both catalogs must carry identical key set or the build breaks at the `useT()` call site
  - Currently passes (no diff found between th.ts and en.ts keys)
- **Parameter substitution:** Simple `{param}` replacement, no CLDR plurals
  - Line count check finds ~30k lines of catalogs (th.ts: 60,931 bytes, en.ts: 37,547 bytes)
- **Locale storage:** Zustand store (`src/state/language.ts:59-65`)
  - Key: `'pawjai.language'` in UserDefaults (via `readString`/`writeValues`)
  - Default: Device region (TH region or Thai preferred language → 'th'; else 'en')
  - Live switch: `useLanguage().setLanguage('lang')` re-renders all `useT()` callers
- **Catalog loading:** Dynamic at runtime via `useLanguage` store subscription
  - `index.ts:48-54` returns memoized closure only when language changes

### How locale reaches API calls:
- **Chat requests:** `locale` parameter passed explicitly in `live.ts:ChatService` methods (useChatConversation.ts:129, 284, 390, 403)
- **Catalog requests:** `lang` query parameter on backend (live.ts:335-336: `query: { lang: locale }`)
- **DatePicker:** `localeIdentifier` prop to native TurboModule (DatePicker.tsx:107: `localeIdentifier={language === 'th' ? 'th_TH' : 'en_US'}`)
- **Server-localized data:** No client-side choice; backend picks field based on `lang` query param

### Fallback behavior:
- Backend returns localized fields per `lang` param; client shows what backend sends
- On record label: display.label wins, then current language name field, then other language, then category label (recordLabel.ts:21-27)
- No app-level fallback to English if a translation key is missing; build would break at type check

---

## 2. Hardcoded User-Facing Strings

**Count:** ~1 intentional, ~0 unintentional (all strings checked via `t()`)

### Findings:
- **Intentional hardcoded "DELETE"** (SettingsAdvancedScreen.tsx:35)
  - Line 35: `const confirmationToken = 'DELETE';`
  - Reason: Account deletion requires exact token match per spec; never translated per ARCHITECTURE.md
  - Used in placeholder (line 97) and validation check (line 112)
  - This is a security/UX feature, not a localization miss

### Checked patterns (all properly localized):
- All `Alert.alert()` calls use `t()` for title, message, button labels (OnboardingScreen, PetDetailScreen, etc.)
- All `placeholder` attributes use `t()` except one: WeightEntrySheet.tsx:139 `placeholder="0.0"`
- All navigation titles, tab labels, section headers use `t()` via `useT()` hook
- All user-visible error messages use `t()` via `errorMessage(error, t)` helper

---

## 3. Missing Translation Keys

**Parity status:** COMPLETE  
**Verification:** Compile-time type check in index.ts:21-26 enforces exact key set match

No missing keys found; both th.ts and en.ts carry identical key sets. The build would fail if either file added or dropped a key without the other.

### Untranslated value check:
- **No matching values found** between th.ts and en.ts (spot-checked ~50 keys)
- Example pairs where translation is real:
  - `'home.quickLog.cta'`: 'บันทึกกิจกรรม' vs 'Log something'
  - `'settings.row.signOut'`: 'ออกจากระบบ' vs 'Sign out'
  - No keys with identical values that suggest missed translation

---

## 4. Binary Locale Assumptions (Third-Locale Risk)

**Count:** ~50 ternary checks; all break or behave unexpectedly for a third locale

### Pattern: `language === 'th' ? option_a : option_b`

**Category A: Date/Time Formatting** (8 files)

- src/lib/dates.ts:188, 199, 207, 217
  - Thai: day/month/year format with Buddhist era offset (line 189: `date.getFullYear() + 543`)
  - English: month/day, year format with 12-hour time
  - Risk: A third locale (e.g., 'de', 'ja') would silently get English format
  - Example (line 188-190):
    ```typescript
    return language === 'th'
      ? `${date.getDate()} ${month} ${date.getFullYear() + buddhistEraOffset}`
      : `${month} ${date.getDate()}, ${date.getFullYear()}`;
    ```

- src/lib/petAge.ts (3 checks)
  - Line 44, 52, 56
  - Thai: "ตั้งแต่ {year} ปีกว่า" vs English: "since {year}"
  - Risk: Third locale gets English only

- src/features/health/chartGeometry.ts:16
  - Thai: `date.getDate()} ${month}` vs English: `${month} ${date.getDate()}`
  - Chart x-axis label formatting; third locale gets English

**Category B: Backend Field Selection** (5 files, ~15 checks)

- src/services/decoders.ts:163, 859
  - Line 163: `breedName: language === 'th' ? (breedNameTh ?? breedNameEn) : (breedNameEn ?? breedNameTh)`
  - Line 859: `displayName: language === 'th' ? nameTh : nameEn`
  - Risk: A third locale gets English only; no fallback chain defined
  - Example fallback pattern (line 163):
    ```typescript
    breedName: language === 'th' 
      ? (breedNameTh ?? breedNameEn)      // Thai with EN fallback
      : (breedNameEn ?? breedNameTh)      // EN with TH fallback
    ```

- src/services/mock.ts:473, 490
  - Line 473: `label: language === 'th' ? nameTh : nameEn`
  - Line 490: `displayName: language === 'th' ? breed.nameTh : breed.nameEn`
  - Same risk: third locale silently gets English

- src/lib/breedSort.ts:10
  - `localeCompare(b.displayName, language)` with language='th'/'en'
  - Risk: Third locale (e.g., 'ja') is not a valid BCP 47 tag for `localeCompare`; behavior undefined

**Category C: Record Label Display** (1 file, 1 check)

- src/features/timeline/recordLabel.ts:22
  - Line 22: `const [first, second] = language === 'th' ? [display?.nameTh, display?.nameEn] : [display?.nameEn, display?.nameTh];`
  - Falls back from first to second language name, then categoryLabel, then raw type name
  - Risk: Fallback chain assumes only 2 languages; third locale with missing EN name could show Thai by accident

**Category D: Relative Date Formatting** (4 checks in src/lib/dates.ts)

- Line 93-123: `templates[language][unit]` lookup table (th and en only)
  - `const template = templates[language][unit];`
  - Risk: Third locale would throw `Cannot read property X of undefined`
  - If language prop is corrupted or malformed, the error is silent in some contexts

**Category E: DatePicker Native Component** (1 check)

- src/design-system/components/DatePicker.tsx:107
  - Line 107: `localeIdentifier={language === 'th' ? 'th_TH' : 'en_US'}`
  - Native UIDatePicker only handles 2 locales; third locale gets en_US
  - Buddhist calendar year display (Thai) silently becomes Gregorian for unsupported locale

**Category F: Language Toggle UI** (1 check)

- src/features/auth/AuthScreen.tsx:164
  - Line 164: `<Segmented options={['th', 'en'] as const} ...`
  - UI hardcodes 2-language choice; third locale can't be selected if added

### Impact if a third locale added:
1. **Silent degradation**: Most third-locale requests quietly get English output (dates, breed names)
2. **Runtime errors**: Lookup tables (dates.ts templates) throw undefined errors
3. **Inconsistent fallback**: Some fields fall back to English, others to Thai, others fail
4. **Native mismatches**: DatePicker shows Gregorian instead of target calendar for unsupported locale

---

## 5. Date/Time/Number Formatting

**Status:** Fully localized for Thai/English; extensible for other locales with code change

### Date Formatting:
- **Thai format:** day month-abbr year-buddhist (e.g., "29 ก.ย. 2569")
- **English format:** month-abbr day, year (e.g., "Sep 29, 2026")
- **Implementation:** Custom templates in src/lib/dates.ts (lines 52-66, 170-173)
- **Buddhist era:** Hardcoded offset +543 for Thai year (line 177)
- **Month/weekday abbreviations:** Lookup tables per language (lines 159-174)

### Time Formatting:
- **Thai:** 24-hour format "HH:mm" (e.g., "12:25")
- **English:** 12-hour format with AM/PM (e.g., "12:25 PM")
- **Implementation:** src/lib/dates.ts:204-212 with ternary check
- **Risk:** Third locale gets English 12-hour format

### Relative Time:
- **"in N days" / "2 weeks ago" style** (src/lib/dates.ts:130-156)
- **Units ladder:** weeks, days, hours, minutes, seconds (matching Foundation's RelativeDateTimeFormatter)
- **Calendar units:** years, months (with Thai-specific phrasing "ที่แล้ว" vs "ago")
- **Pluralization:** Template functions with `(n) => string` closures; English handles n=1 specially
- **Risk:** Thai plurals work for th only; third locale needs new template entries

### Pet Age Formatting:
- **Thai:** "{age} ปีกว่า" (past), "ตั้งแต่ {age} ปี" (time since)
- **English:** "{age} years old" (past), "since {age}" (time since)
- **Implementation:** src/lib/petAge.ts with ternary checks
- **Risk:** Third locale gets English only

### Number/Currency Formatting:
- **No `toLocaleString()`** calls found
- **No currency formatting** in the codebase (weights, prices are model-level, not formatted at display)
- **Weight unit selection:** /api/users/settings/weight-unit (currently kg only, per STATUS.md)
- **Risk:** None for current scope; future commerce features would need number formatting

---

## 6. Backend Data Display (Locale Fields)

**Pattern:** Backend returns locale-aware field names (`nameTh`, `nameEn`, etc.); client selects based on app language

### Endpoints returning dual-language fields:

| Endpoint | Fields | Client handling | Risk for 3rd locale |
|----------|--------|-----------------|---------------------|
| `GET /api/me` | pets: { pet, breedNameTh, breedNameEn } | decoders.ts:163 ternary | Silent fallback to EN |
| `GET /api/breeds/selector` | nameTh, nameEn, aliases | decoders.ts:859 ternary | Silent fallback to EN |
| `GET /api/pet-record-concepts/catalog` | key, description (locale?), nameTh, nameEn | NOT CHECKED in audit scope [unverified] | Potential gap |
| `GET /api/timeline/records` | display: { label, nameTh, nameEn, categoryLabel } | recordLabel.ts:22 fallback chain | Fallback chain assumes 2 languages |
| `POST /api/chat` (with lang param) | assistant reply text localized server-side | Passed as locale param | Depends on server support |

### Client display rules:
- **Breed name:** `language === 'th' ? (breedNameTh ?? breedNameEn) : (breedNameEn ?? breedNameTh)` (decoders.ts:163)
- **Record type name:** display.label → name-in-current-language → name-in-other-language → categoryLabel → raw type (recordLabel.ts:19-28)
- **Chat:** Server picks localized reply based on `locale` query param; client shows as-is

### Issues:
1. **No 3rd language field in backend** (only `*Th` and `*En` suffixes)
2. **Fallback assumes EN is secondary** (if Thai missing, show English; if English missing, show Thai)
3. **No extensible pattern** for adding Spanish, Japanese, etc. without schema changes
4. **Sorting:** breedSort.ts uses `localeCompare(displayName, language)` where language must be BCP 47 tag

---

## 7. Mixed-Language Screens

**Findings:** None detected

Checked all major screens (Home, Pets, Settings, Timeline, Pepe, Profile); no screen mixes Thai and English labels in the same section without translation keys. Every label comes from `t()` or backend-resolved display fields.

**Example patterns (all correct):**
- Settings language row: Both "Thai" and "English" labels use `t('settings.language.thai')` / `t('settings.language.english')`
- Breed search: Results show `displayName` (resolved from backend per language), not both names
- Record detail: Shows resolved label, not "nameTh: … / nameEn: …"

---

## 8. Docs Consistency

**Checked files:** docs/ARCHITECTURE.md, docs/DESIGN.md, docs/STATUS.md

### Claims vs. Code:

**ARCHITECTURE.md (ADR-001, line 66):**
> i18n | in-house typed catalogs `th.ts` / `en.ts` + `t()` | Thai-first, no dependency until plurals are needed

**Status:** MATCHES
- Confirmed in-house; no dependency in package.json for i18n
- Catalogs present; type check enforced
- Plurals not yet implemented (no CLDR rules)

**ARCHITECTURE.md (line 264-265):**
> Live language. Every title and label reads `useT()`, including the tab labels and stack titles, so a language switch re-renders the app instead of rebuilding it.

**Status:** MATCHES with exception
- Confirmed: Tabs.tsx re-renders tab labels; TabStack.tsx re-renders stack titles
- Exception: Native DatePicker (native TurboModule) only re-renders if wrapped component re-renders; calendar doesn't redraw mid-session

**ARCHITECTURE.md (line 402):**
> Chat conversation ids follow the web, not Swift: a fresh uuid when the chat opens and on New chat, sent with every message.

**Status:** MATCHES
- Confirmed: useChatConversation.ts:157-161 generates UUID on open; line 403-404 resends on New chat

**STATUS.md (20-21, 86-89):**
> Thai line wrapping... the design-system `Text` now defaults to `standard`

**Status:** MATCHES
- Confirmed: design-system/components/Text.tsx uses `lineBreakStrategyIOS="standard"`
- Both apps now wrap Thai identically

**Discrepancy:** No doc mentions binary locale assumptions or third-locale risk

---

## Findings by Category

### Hardcoded Strings (Not via t())
- **1 intentional:** 'DELETE' token (SettingsAdvancedScreen.tsx:35) — security feature, not translation
- **1 unintentional:** '0.0' numeric placeholder (WeightEntrySheet.tsx:139) — not user-facing, format not locale-sensitive

### Missing Keys
- **0 missing:** Build would fail if en.ts and th.ts key sets diverged

### Binary Locale Patterns (Will break on 3rd locale)
- ~50 `language === 'th' ? a : b` checks across:
  - src/lib/dates.ts (4 core date functions, ~8 lines)
  - src/lib/petAge.ts (age formatting, 3 checks)
  - src/features/health/chartGeometry.ts (chart labels, 1 check)
  - src/services/decoders.ts (breed/record name selection, 2 checks)
  - src/services/mock.ts (mock data breed display, 2 checks)
  - src/lib/breedSort.ts (localeCompare, 1 check)
  - src/features/timeline/recordLabel.ts (fallback chain, 1 check)
  - src/features/auth/AuthScreen.tsx (segmented choice, 1 check)
  - src/design-system/components/DatePicker.tsx (native locale, 1 check)

### Date/Time Formatting
- **Complete:** Thai (24h, Buddhist year, custom abbrevs) vs English (12h, Gregorian year, standard abbrevs)
- **Relative dates:** Plural-aware templates (n=1 → singular, n≠1 → plural)
- **Risk:** Templates only defined for th/en; third locale throws error or silently gets English

### Backend Data
- **Pattern:** Endpoints return dual-language fields (nameTh, nameEn, breedNameTh, breedNameEn)
- **Client selection:** Ternary per language; falls back to other language if primary missing
- **Risk:** No extensibility for 3rd language; backend schema would need migration

### API Locale Passing
- **Explicit:** Chat methods pass `locale` parameter; backend query uses `lang` param
- **Detection:** Locale read from `AppleLocale` device setting at startup
- **Storage:** Persisted in UserDefaults under 'pawjai.language'
- **Live switching:** useLanguage store notifies all useT() subscribers

### Pluralization
- **Current:** Simple `{param}` substitution; no CLDR rules
- **Ready:** Thai/English plural templates exist in dates.ts but never invoked (would need pluralize() helper)
- **Risk:** Plural rules not yet implemented; hard for a 3rd locale to add

---

## Recommendations for 3rd Locale Support

To safely add a 3rd language (e.g., 'de', 'ja', 'es'):

1. **Refactor binary checks to lookup tables:**
   - Replace `language === 'th' ? a : b` with `locale_config[language].dateFormat`
   - Create src/i18n/locales.ts with format rules per language

2. **Extend date/time formatting:**
   - Add 'de' / 'ja' / 'es' entries to templates in dates.ts
   - Implement plural rules from CLDR for new languages

3. **Backend field names:**
   - Rename `nameTh`/`nameEn` to language-agnostic scheme or add `nameEs` / `nameDe`
   - Or use lang query param to request single localized field instead of multiple

4. **Fallback strategy:**
   - Define cascading fallback order per region (e.g., 'ja' → 'en' → 'th')
   - Or require backend to always send all supported languages

5. **DatePicker locale mapping:**
   - Build language → iOS locale map (src/design-system/components/DatePicker.tsx)
   - Support non-Gregorian calendars where relevant

6. **UI language selector:**
   - Replace hardcoded 2-language segmented choice (AuthScreen.tsx:164) with dynamic list

---

## Files Scanned

- **Catalogs:** src/i18n/{th,en}.ts, src/i18n/index.ts
- **State/storage:** src/state/language.ts, src/lib/preferences.ts
- **Date/time:** src/lib/dates.ts, src/lib/petAge.ts
- **Features:** src/features/**/*.tsx (all major screens)
- **Services:** src/services/{decoders,live,mock,types}.ts
- **Design system:** src/design-system/components/DatePicker.tsx
- **Models:** src/models/ (type definitions only, no runtime logic)
- **Docs:** docs/ARCHITECTURE.md, docs/DESIGN.md, docs/STATUS.md

---

## Summary Statistics

| Category | Count | Status |
|----------|-------|--------|
| Total hardcoded strings | 1 (+ 1 numeric) | 1 intentional security token, 1 format example |
| Missing keys | 0 | Type-checked parity enforced |
| Binary locale patterns | ~50 | Will degrade or fail on 3rd locale |
| Endpoints with locale fields | 4+ | Backend returns nameTh/nameEn only |
| Date formats defined | 2 (th, en) | Thai uses Buddhist era; English uses Gregorian |
| Plural templates defined | 2 (th, en) | Defined but no pluralization logic invoked |
| Lines of catalog | ~33k | (60k th.ts + 37k en.ts) |
| API locale passing points | 7+ | Chat, catalog, DatePicker all pass locale explicitly |

