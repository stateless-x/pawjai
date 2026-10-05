# i18n build progress

Rules: `docs/LOCALIZATION_RULES.md`. Packets: `PLAN.md` §7. All commits local, unpushed.

| Packet | Repo / worktree | Branch | Status | Commit |
|---|---|---|---|---|
| U1 | pawjai-public-wt-i18n | feat/i18n-locale | done; browser check of /en/tier + /th/tier owed | 8604cf6 |
| F2 | pawjai-fe-wt-i18n | feat/i18n-locale | done; `bun run build` + signed-in THB-on-US-IP case not verified | 84cdfdf |
| P1 | pawjai-be-wt-i18n | feat/i18n-locale-core | done; full suite 658 env-dependent fails, not diffed by name vs base | e29b97b |
| P2 | pawjai-be-wt-i18n | feat/i18n-locale-core | done; migration 0128 NOT applied anywhere but Docker test DB | 97f9ad4 |
| P3 | pawjai-be-wt-i18n | feat/i18n-locale-core | done; integration suites re-verified in be-verify round | 005cf98 |
| P4 | pawjai-be-wt-i18n | feat/i18n-locale-core | done; golden th/en prompt output byte-identical; LLM evals not run | 56e838e, 0a4c225 |
| be-verify | pawjai-be-wt-i18n | feat/i18n-locale-core | done; 40 baseline fails = 40 branch fails after 3 old-default test updates | 172482b, a0bfabc |
| 0129 | pawjai-be-wt-i18n | feat/i18n-locale-core | done; user_config.preferred_language DEFAULT 'en' only (blog_posts, pet_insights skipped by design); NOT applied | 870e6c2 |
| F1 | pawjai-fe-wt-i18n | feat/i18n-locale | done | 115732e |
| F3 | pawjai-fe-wt-i18n | feat/i18n-locale | done; cookie `pawjai_lang` on .pawjai.co | e9afbc7 |
| R3 | pawjai-react-native-wt-i18n | codex/aesthetic-improvement-i18n | done; no device run | 314330c |
| R3b | pawjai-react-native-wt-i18n | codex/aesthetic-improvement-i18n | done; OWNER must run pod install + commit Podfile.lock | 0bf235c, cfd01d8 |
| R4 | pawjai-react-native-wt-i18n | codex/aesthetic-improvement-i18n | done | ab8fa3b |
| R5 | pawjai-react-native-wt-i18n | codex/aesthetic-improvement-i18n | done; Intl.PluralRules + Buddhist offset unverified on Hermes (device check owed) | 56c0022 |
| U3a | pawjai-public-wt-i18n | feat/i18n-locale | done; target changed to /en (fe serves English to non-TH crawlers) | 0e3240f |
| U4 | pawjai-public-wt-i18n | feat/i18n-locale | done; blog coming-soon (noindex), /blog/* 301 to it | 1a19648 |
| U3b | pawjai-public-wt-i18n | feat/i18n-locale | done; only bare `/` reads cookie, Vary: Accept-Language, Cookie | ce4f076 |
| U2 | pawjai-public-wt-i18n | feat/i18n-locale | done; browser-checked /en/tier + /th/tier price table | 441ae52 |
| U5 | pawjai-public-wt-i18n | feat/i18n-locale | done; title/meta/FAQ show both currencies, JSON-LD parity | 4feea5e |
| P5 | pawjai-be-wt-i18n | feat/i18n-locale-core | done; chat/insights call sites typecheck-only (env) | 5bae833 |
| P6 | pawjai-be-wt-i18n | feat/i18n-locale-core | done; migration 0130 breed_translations + backfill; NOT applied. Deploy migration with code (stale-row window if old code renames breeds after backfill) | 1c8b109 |
| P8a | pawjai-be-wt-i18n | feat/i18n-locale-core | done; migration 0131 review_status + source; NOT applied | af5632a |
| P8b | pawjai-be-wt-i18n | feat/i18n-locale-core | done; /api/admin/i18n coverage+items+PATCH; `bun run i18n:coverage` warn-only | 956a094 |
| P7 | pawjai-be-wt-i18n | feat/i18n-locale-core | done; script (dry-run default) `bun run i18n:backfill-notification-locale` | 1eaf142 |
| P7b | pawjai-be-wt-i18n | feat/i18n-locale-core | done; reminders record locale when tokens rendered; backfill logs ids + rollback | 29c1291 |
| G1 | pawjai-be-wt-i18n | feat/i18n-locale-core | done; `bun run i18n:gap-fill` (dry-run default, LLM drafts as needs_review/machine, rollback log); owner runs after deploy | 9adf07b |
| P8c | pawjai-be-wt-i18n | feat/i18n-locale-core | done; seed gate fails CI; `i18n:coverage -- --db` is release-checklist step | 68fa068 |
| B1 | pawjai-be-wt-i18n | feat/i18n-locale-core | done; /api/subscriptions/me data.billingCurrency | 41bac79 |
| F4 | pawjai-fe-wt-i18n | feat/i18n-locale | done; signed-in: billingCurrency > country > IP | 18c9ccf |
| A1 | pawjai-admin-wt-i18n | feat/i18n-translation-ux | done; build+typecheck+tests; UI not rendered (no backend) | 781f6ab |
| A2 | pawjai-admin-wt-i18n | feat/i18n-translation-ux | done; tabs Coverage/All/Needs review, inline edit super_admin | 3152e5b |
| A3 | pawjai-admin-wt-i18n | feat/i18n-translation-ux | done; badges on concepts/notifications/breeds lists | 731bf82 |
| R7 | pawjai-react-native-wt-i18n | codex/aesthetic-improvement-i18n | done; server name used only when nameLocale matches app language | 3e2b6f8 |
| R6 | pawjai-react-native-wt-i18n | codex/aesthetic-improvement-i18n | done; literal-locale lint now error | bd62909 |
| R9 | pawjai-react-native-wt-i18n | codex/aesthetic-improvement-i18n | done; auth errors localized (follow-up from R2) | 3e87a0d |
| R1 | pawjai-react-native-wt-i18n | codex/aesthetic-improvement-i18n | done; no device run | ad2f91e |
| R2 | pawjai-react-native-wt-i18n | codex/aesthetic-improvement-i18n | done; no device run | 7b42a53 |
| R8 | pawjai-react-native-wt-i18n | codex/aesthetic-improvement-i18n | done; owner Thai copy applied | 6cd39bd, 448c4a9 |

## INCIDENT 2026-10-02
be-verify agent ran bare `bun test` (not ./scripts/test.sh) with pawjai-be `.env.local` symlinked: integration tests (pet-record-display-route, chat-source-and-selection) ran against whatever DATABASE_URL .env.local holds (memory suggests it may be PROD). Tests create users `test-<uuid>@example.com` / `route-test@example.com` + pets/records and delete them in afterAll. Symlink removed. Owner to decide on a read-only leftover check.

## Follow-ups found during build
- ~~be billing currency~~ done in B1 (41bac79) + F4. Was: expose the account billing currency (Stripe customer currency) on the profile/pricing API. fe currently uses `profile.country ?? profile.detectedCountry`; `detectedCountry` is IP-synced monthly, so a Thai account last synced abroad can flip to USD. Rule R3 says customer currency wins.
- ~~RN auth-service errors~~ done in R9 (3e87a0d). Merge note: TermsConsentView.tsx + ForgotPasswordSheet.tsx touched line-locally; other agent has uncommitted edits there.
- fe: unused `getCurrencyWord` non-th branch returns "THB"/"USD" (dead code).

- Astro nav/footer "Blog" links still point at external BLOG_URL (blog.pawjai.co); decide whether to point at /blog coming-soon.
- P4: registry gained `englishName` + `autonym`; fe/public/RN registries should mirror (do in U2/R4).
- P4: Thai typo "น้องคณเพื่อที่ดีขึ้น" in be fake summary kept byte-identical; fix separately.
- `.env.local` symlinked into pawjai-be-wt-i18n (owner-approved, never read). Remove before deleting the worktree.

## Owner decisions during build
- R8 copy approved: "You've reached the pet limit for your plan." (+ native Thai).
- U3 approved 2026-10-02: one generic rule, unprefixed non-root paths 301 to `/th/...`, unknown ends on normal 404; root `/` keeps 307 negotiation. U3 split: U3a (URLs/SEO, now) + U3b (`.pawjai.co` cookie read, after F3).
- Blog: keep as coming soon (2026-10-02); real blog later.
- DB column default th->en: write migration round; NOT applied manually (auto-applies on deploy; manual apply from unmerged branch would collide with snooze 0128).
- react-native-localize approved.
- Owner priority: Astro replaces pawjai-fe as pawjai.co; protect Astro ranking. fe packets kept minimal (only what app.pawjai.co needs: F1, F3).

## Deploy order (from P2, owner must run)
1. Merge be branch; `db:migrate` applies 0128 (2 nullable columns, no row changes) BEFORE new backend serves traffic.
2. Deploy backend; verify a new sign-in on staging gets `source = signup_seed`.
3. Only then `bun run db:apply-trigger` (railway `-e` pinned). Trigger first + old backend = new users stuck `en`/unseeded.
4. Migration number clash: snooze-drop branch (pawjai-be-wt-snooze) also has 0128; renumber whichever merges second.
- admin: `bun run lint` broken on base (Next 16 removed `next lint`; legacy .eslintrc.json under eslint 9). Pre-existing, not fixed.

## Shared negotiation vectors (PLAN §2 acceptance)
`locale-vectors.json` byte-identical (sha256 79d83f9b...) with a pinned-hash test in be (source), fe `feee3c6` (fixed drift: malformed q treated as 0, now 1), public `ab02e99`, RN `c319e55`.

## Final be regression (after all packets)
Same fake env both sides: origin/staging 10 fail / branch 10 fail, identical set (Supabase JWT suites, fake URL). Branch-only failures: 0. Comment-path fix `1de90b5`.

## Open product decision
G1 machine drafts (`needs_review`) ARE served to end users: no user-facing read path filters review_status (resolveTranslation.ts:55-80, breedNames.ts:41-44, catalogService.ts:88-95, notificationContentReader.ts:65-71). Nothing is exposed until the owner runs `i18n:gap-fill --apply`. Decide before running it: serve drafts (better than fallback language) or hide until approved (4 read paths).
