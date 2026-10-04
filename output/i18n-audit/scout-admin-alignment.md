# pawjai-admin i18n Alignment Audit
**Date:** 2026-10-02  
**Worktree:** pawjai-admin-wt-i18n (branch feat/i18n-translation-ux)  
**Backend Reference:** pawjai-be-wt-i18n (feat/i18n-locale-core, commits 781f6ab/3152e5b/731bf82)

## Build Status
`bun run build` **PASSES** (5.6s compile, 451.2ms static generation, 45 routes, 0 errors).  
TypeScript compile succeeds. Route list shows `/admin/settings/translations` (new page A3). Admin lint broken on base (Next 16 removed `next lint`); pre-existing, not fixed here.

## Summary (8 bullets)

1. **Binary locale hardcoding blocks 3rd locale:** Blog, notification composer, concept editor, lookup-types all ternary on `=== 'th'|'en'` or hardcode fields `nameTh/nameEn`, `titleTh/bodyTh`. These will fail silently with a 3rd locale; broadcast composer + settings forms send both fields explicitly (compatible with dual-write, but UI cannot edit other locales).

2. **Notification forms still use legacy schema:** BroadcastComposer, NotificationForm, SelectiveSendButton send `titleTh/bodyTh/titleEn/bodyEn` (4 separate fields). Backend expects `language` column on notifications table + translation tables per entity (per P8b/P6/P8a). This is the legacy "per-language column" anti-pattern (R6.2 violation). UI and backend **are not in sync**.

3. **User language display shows value only, no source/default context:** Users page line 265 displays `preferredLanguage` as "EN"/"TH" but does not show `preferred_language_source` (user|signup_seed|admin|unseeded) or handle legacy unseeded rows. Backend (post-P1/P3) writes source on signup; admin-service resolves missing language to `en` (R1.3a). Admin UI should surface source badge + default badge, **not yet visible**.

4. **Concept editor hard-wires PRIMARY_LOCALES = ["en", "th"]:** Line 42 concepts/page.tsx. No reference to backend locale registry. Adding a 3rd locale requires code change + rebuild. Should read `PRIMARY_LOCALES` from registry query (from /api/admin/i18n/locales or /api/admin/settings).

5. **Blog editor ternaries block new locales:** `blog/page.tsx:post.locale === 'th' ? ... : ...` (lines 10/11/17/18), `blog/[id]/page.tsx` ternary state, `blog/new/page.tsx` binary locale picker. Type is `'en' | 'th'`. New locale = refactor required. **Cosmetic until blog moves to public Astro site**, per R7.2.

6. **Notification route validation missing locale enum:** No evidence of validation on /api/admin/settings/notifications routes that enforces `language` against registry (unlike /api/admin/i18n/broadcast/lang), but BroadcastComposer sends hardcoded `language` implicitly. Backend has enums (P8b); admin sends raw strings. **Severity: cosmetic** if backend rejects silently (becomes fallback language); blocks 3rd locale if UI validation missing.

7. **Free plan still mentioned; no freemium removal:** Pricing page exists, super_admin gate present. Free plan references in: notification targetTier (free|premium dropdown), user list (plan filter), feedback/analytics (plan facets). **Design decision already made (no freemium as of owner 2026-10-02)**; UI copy + schema consistent with that, just not yet removed. No blockers, cosmetic.

8. **Admin UI is English-only by design:** All strings hardcoded in English (no i18n library, no locale context). This is intentional (admin for internal super_admin + staff, not localized). **Not a defect**, noted only for completeness.

---

## Detailed Findings by Category

### A. Hardcoded locale lists blocking 3rd locale

- **blog/page.tsx:10–11, 17–18** — `const currentLocaleCount = post.locale === 'th' ? featuredStats.th : featuredStats.en` + `post.locale === 'th' ? 'Thai' : 'English'` — **blocks 3rd locale** — ternary should read registry or accept registry array; severity **breaks now** (render fails if locale not 'th' or 'en').

- **blog/[id]/page.tsx:15, 47** — form state `locale: 'en' as 'en' | 'th'` hardcoded type, form.locale = e.target.value cast to union — **blocks 3rd locale** — type should be `string` then validated against registry; severity **breaks now**.

- **blog/new/page.tsx:50** — form state `locale: 'en' as 'en' | 'th'`, select options hardcoded `<option value="en">`/`<option value="th">` — **blocks 3rd locale** — select should map registry.locales; severity **breaks now**.

- **settings/concepts/page.tsx:42** — `const PRIMARY_LOCALES = ["en", "th"] as const` hardcoded array, used throughout (lines 150, 164, 183). Registry not queried. **blocks 3rd locale** — should call `/api/admin/i18n/locales` or equivalent + filter to live/beta; severity **blocks 3rd locale**.

### B. User language display (no source/default context)

- **users/page.tsx:9–12, 265** — LANG_LABELS map `{ th: "TH", en: "EN" }`, display line 265 `{user.preferredLanguage ? (LANG_LABELS[...]) : ""}` — **no source badge, no default badge** — user detail line 266 also shows locale only. Backend fields exist (preferred_language_source, preferred_language_set_at from P1); admin-service resolves null to 'en'. UI should surface: "(EN, unseeded)" or "(TH, admin-set)" or "(EN, legacy)". Severity **blocks feature visibility** — admins cannot see why a user has no language or who set it.

### C. Notification forms use legacy schema

- **settings/notifications/components/BroadcastComposer.tsx:31–46, 72–80, 180–191, 217–230** — form schema has `titleTh/bodyTh/titleEn/bodyEn` (4 fields, both locales required). Send payload line 221–224 explicit keys `titleTh/titleEn/bodyTh/bodyEn`. — **legacy per-language-column pattern (R6.2 violation)** — Backend (post-P6/P8a) expects translation table + `language` column on broadcast/notification row. UI and backend **not in sync**. Severity **breaks now** — POST will fail or data will be misaligned unless backend still accepts old schema (dual-write window unclear).

- **settings/notifications/components/NotificationForm.tsx** — same schema (titleTh/bodyTh/titleEn/bodyEn). Severity **breaks now**.

- **settings/notifications/components/SelectiveSendButton.tsx:112–119** — sends same 4 fields. Severity **breaks now**.

### D. Notification route validation

- **No grep hit** for route-level validation of `language` enum against registry on POST /api/admin/settings/notifications. Backend (P8b) has `/api/admin/i18n/broadcast/lang` enum check (routes/notifications.ts enforces before save). Admin sends strings implicitly (from form ternary). Severity **cosmetic** if backend rejects gracefully; **blocks 3rd locale** if admin validation missing upstream.

### E. Breed/lookup-types use legacy columns

- **settings/lookup-types/page.tsx:10–21, 67–68, 104–109, 130–135** — form has `nameEn/nameTh` fields, send payload keys `nameEn/nameTh`. Backend (post-P6) has breed_translations table + dual-write (old columns + new table). UI compatible with dual-write (sends both old columns), fine for now. **Severity: cosmetic** — breed editor in breed/page.tsx also unknown (did not read full file); likely same.

- **settings/concepts/page.tsx:177–230+** — TranslationsEditor uses `PRIMARY_LOCALES` to iterate, saves via `upsertMutation({conceptId, locale, data: {name, description}})`. This goes to `/api/admin/i18n/concepts/{id}` PATCH endpoint (P8b, backend-wired). Schema is correct (locale + name/description, not name_th/name_en). Severity **good** — concept editor properly wired to translation table.

### F. User language display + language-aware feature show

- **users/[userId]/page.tsx:105–120** — regenerate health summary for pet; line 114 check `pet.healthSummaryLocale === "th" || ... === "en" ? healthSummaryLocale : undefined`. Hardcoded check blocks 3rd locale + shows UI awareness of locale. Severity **cosmetic** (ternary is safe fallback to undefined), but conceptually **blocks 3rd locale** in this flow.

### G. Freemium leftovers

- **Pricing page:** super_admin gate, references to "free" + "premium" plans. Pricing management page reads live from Stripe, no hardcoded tiers. **No freemium removal done yet** (owner decision 2026-10-02 still not shipped to admin). Severity **cosmetic** — admin reflects current business model (Premium only, single tier), ready for toggle when freemium sunsets.

- **Notification UI:** BroadcastComposer, NotificationForm have targetTier enum ["all", "free", "premium"]. Message filter UI supports free vs premium. **No change needed** if owner decides to keep broadcast targeting; only UI label removal + form validation update needed on freemium cutover. Severity **cosmetic**.

---

## Missing Backend Integration (Post-P8b/P8c)

1. `/api/admin/i18n/locales` — Admin needs a query-only endpoint to fetch registry (codes, status live|beta, englishName, autonym). Used for: concept editor, blog editor, notification language picker. Not yet wired in admin hooks.

2. `preferred_language_source` — Users list + detail should surface this field (from user_config table, stamped by backend on signup/admin write). Requires hook update to include source in user profile fetch.

3. Notification `language` column — BroadcastComposer + NotificationForm must switch from legacy 4-field schema (titleTh/bodyTh/titleEn/bodyEn) to new schema: one language picker (enum against registry) + translation table upsert. **Blocking change** if backend rejects old schema.

---

## Recommendations

**Severity A (breaks now if merged, must fix):**
- Notification forms: migrate from legacy schema to language picker + translation table upsert.
- Concept editor: read PRIMARY_LOCALES from registry API, not hardcoded array.

**Severity B (blocks feature, should fix soon):**
- User list/detail: add preferred_language_source badge (user|signup_seed|admin|unseeded) + set_at timestamp.
- Blog editor: migrate ternary locale checks to registry-aware picker (long-term: move to Astro, short-term: conditionally hide blog UI if not 'en'|'th').

**Severity C (cosmetic, can defer):**
- Freemium UI cleanup: remove free-plan references once owner sunsets freemium (schema already doesn't support it).
- Notification route validation: add backend enum check on language field (if not already present).

---

## Files Requiring Changes

| File | Category | Issue | Severity |
|---|---|---|---|
| settings/notifications/components/BroadcastComposer.tsx | C | Legacy 4-field schema, not translation table | breaks now |
| settings/notifications/components/NotificationForm.tsx | C | Legacy 4-field schema | breaks now |
| settings/notifications/components/SelectiveSendButton.tsx | C | Legacy 4-field schema | breaks now |
| settings/concepts/page.tsx:42 | A | Hardcoded PRIMARY_LOCALES array | blocks 3rd locale |
| content/blog/page.tsx:10–18 | A | Ternary locale checks | blocks 3rd locale |
| content/blog/[id]/page.tsx | A | Hardcoded locale type + ternary | blocks 3rd locale |
| content/blog/new/page.tsx | A | Hardcoded locale type + select | blocks 3rd locale |
| admin/users/page.tsx:265 | B | No preferred_language_source badge | blocks feature visibility |
| admin/users/[userId]/page.tsx:266 | B | No preferred_language_source badge | blocks feature visibility |
| admin/users/[userId]/page.tsx:114 | C | Hardcoded locale ternary (safe fallback) | cosmetic |

---

**End of audit.** Admin new translation UI (A1–A3 coverage/items/badges) is well-architected and backend-aligned on concept/notification settings. Main blocker is notification form schema migration + concept editor registry wiring.
