# Codex handoff: audit trail of work done while Codex was out

**Period:** 2026-08-13 to 2026-08-17 (Codex out of credits, expected back ~week of 2026-08-17)
**Setup:** Claude acted as orchestrator (wrote numbered instruction packets, reviewed every report against the actual code). A separate Claude worker session executed. The user relayed packets between them and held all release authority.
**Purpose of this document:** give Codex everything needed to review the work independently, without re-deriving it from git history.

---

## How to review this quickly

Chapter 0 below is the Codex-directed work that preceded the handoff (already verified, context only). Since then, **four phases, all merged to staging and released to production in v1.8.0** as of 2026-08-16: 2.3C (helper localization), 2.3D (chat receipt identity), 2.3E (vet share privacy + localization), and roadmap item 5 (metadata integrity on record edit). Every PR was merged manually by the user; **Claude was the only reviewer on all of them** -- that is what makes your independent review of the shipped code valuable.

**Everything below is IN PRODUCTION as v1.8.0.** Your re-audit is of shipped code, and every line of it had Claude as the only reviewer. Highest-value review targets, in order:
1. `pawjai-be/src/services/chat/historical-receipt-resolver.service.ts` (2.3D) -- the most novel logic. Read-path enrichment on a hot endpoint.
2. Item 5's identity-immutability design: `pawjai-be/src/db/concepts/recordMetadataMerge.ts` (pure merge, `RESOLUTION_METADATA_KEYS`) and its wiring in `updateRecord` -- a POLICY decision (identity-bearing metadata keys immutable on PATCH) made by Claude with the user's delegation. Review the policy itself, not just the code.
3. Item 4, the admin concept editor (full chapter below) -- live admin mutation surface over the concept registry YOU built. Review the access-control shape (hard super_admin role gate, confirm-flag flow, audit-await semantics) and the `isVetVisible` blast radius: an admin flip now takes effect on live vet-share links immediately.
4. **The release mechanics chapter below** -- your twin-PR release pattern was retired 2026-08-16 via `-s ours` merges. Verify you agree the supersession proofs were sufficient, because that decision is now baked into both repos' history.
5. The helper locale chain in `pawjai-be/src/routes/helper.ts` (2.3C) -- a deliberate divergence from the Phase 2.3A pattern.
6. `isVetVisible` enforcement in `pawjai-be/src/routes/share.ts` (2.3E) -- fail-closed access control on the vet-share path.

---

## Chapter 0: Codex, this is what you directed before the handoff

Written back to you as context, because the phases below build directly on it and reuse the machinery you shipped. **Already verified twice over (you + the user independently) -- not asking for re-review**, with one exception flagged at the end.

### The arrangement you ran

You orchestrated; Claude implemented; the user relayed packets between you and held release authority. Roughly 10 rounds. The rules you enforced, which Claude then carried forward verbatim into the phases below:
- Fresh explicit authorization per round for anything touching shared state. Previews of an authorization were never the authorization; you required the literal "I explicitly authorize..." line.
- Hard stop points ("stop after X") honored without chaining into the next logical step.
- Exact-file staging, never `git add -A`, never `--no-verify`.
- Every claimed root cause independently verified against real source or live data before acting.

### What you shipped to production

The **record-concepts feature**: a canonical record-type concept registry (`pet_record_type_concepts`, `pet_record_type_concept_translations`, `pet_record_types.concept_id`), immutable concept-snapshot columns on `pet_records` (migrations 0116/0117), plus a schema-only 0115 telemetry layer with runtime deliberately excluded.

You built the release candidate by **isolating 9 commits / 46 files out of a 61-commit `master..staging` diff**, deliberately excluding DeepSeek, LLM routing, chat-image-lifecycle, and Stripe-cancellation work. 0115 was hand-extracted as schema-only from host commit `76c3430` (byte-identical SQL/snapshot/journal to staging). You proved `678839ec` (migration-runner/fresh-DB test infra) necessary via counterfactual test, and inserted three prerequisite fixes (`aabb176f`, `b07a3f39`, `b68c4528`) to get the suite green (738 -> 750 pass).

Production data migration, in your authorized stages with a stop point between each:
1. **Migrations 0115/0116/0117 applied.** Verified via `drizzle.__drizzle_migrations` (count 116 -> 119, hashes identical to staging), `/health` reporting `pendingMigrations: []`.
2. **Lookup-concept backfill** (2026-08-10): fresh backup taken and restore-drilled to a throwaway container first, checksums cross-checked against live prod, dry-run clean (49 mapped, 0 unresolved), applied, idempotency proven by a second dry-run. Post-apply: 49/49 linked, 26 concepts, 52 translations, 0 category mismatches, both checksums byte-identical to baseline.
3. **Record-snapshot backfill** (2026-08-10): same discipline. 346 records updated, idempotency proven, all 346 rows carrying the complete 5-column snapshot bundle, 0 category mismatches, non-snapshot checksum byte-identical (`48086fe9...`) confirming every other field untouched.

### Production state has moved since your last session -- verified 2026-08-14

Your memory of prod `master` was `63eaf0c5` (PR #247). **It is now `aa05ade9845ca42bad1d2651aa2275b7eef05d32`** (PR #255, catalog content). `63eaf0c5` is still an ancestor, so record-concepts remains deployed; master simply moved forward while you were out.

What that means: **Phase 2.3A (the localized record display projection) and the 2.4 catalog content rollout are already in production**, via PRs #252/#253/#255. This matters for the phases below, because 2.3C and 2.3D both consume 2.3A's `petRecordDisplay` machinery, and it is live rather than staging-only.

### The one thing worth your attention, not just your awareness

**`ADMIN_JWT_SECRET` and the APNs key (`APNS_KEY_BASE64`/`APNS_KEY_ID`) were disclosed on 2026-08-09** by an unscoped `railway variables` call piped to `head`, during your period. The user said they would rotate both manually, outside the session. **No session since has confirmed the rotation happened.** Please verify it did. This is the only Chapter 0 item that is genuinely open.

The resulting operating rule (env files and secrets are process input only, never inspected) has been followed strictly since, including throughout both phases below.

Your key-independence check from that period -- APNs and Apple Sign-In are different keys with different key IDs, verified by in-memory public-key fingerprint comparison with no key material rendered -- is what the CLAUDE.md doc fix below finally writes into the documentation. You recorded that defect at the time and explicitly deferred it as out of scope; it has now been fixed and is sitting in PR #258.

---

## Protocol used (unchanged from the Codex packet protocol)

Every rule that governed the Codex rounds was kept:
- No commit, push, merge, migration, or production action without fresh explicit authorization in that round's packet. Prior approval never carried forward.
- Hard stop points honored; no chaining into the "obviously next" step.
- Exact-file staging by name; never `git add -A`, never `--no-verify`.
- Env files/secrets treated as process input only, never inspected.
- Every worker claim independently verified against the code before acceptance.

**Difference from the Codex arrangement, stated plainly:** with Codex unavailable, the reviewer was Claude rather than a separate system. The compensating controls were the user's authorization gate on every state-changing action, and orchestrator re-running of all test/build gates rather than trusting reports. All merges were performed by the user manually.

---

## PHASE 2.3C: Localize helper history using display -- COMPLETE, MERGED

**Problem:** the helper-link page (unauthenticated, token-based, used by pet sitters) still rendered legacy bilingual `nameEn`/`nameTh` fields instead of the Phase 2.3A localized `display` projection.

**Merged to staging 2026-08-14** (user merged both PRs manually):
- `pawjai-be` PR #257 -> staging is now `f6280af7a0c8299757f10c9a5f803b268bfc2109`
- `pawjai-fe` PR #286 -> staging is now `63f46d0f770b6615d81dd60df4f5179182dda671`
- Released to production in v1.8.0 (2026-08-16, fe PR #293, tag `v1.8.0`). 2.3A's `petRecordDisplay` machinery, which 2.3C consumes, is live in prod via PRs #252/#253.

### Rounds

| Round | Scope | Outcome |
|---|---|---|
| 1 | Backend implementation, no commit | `src/routes/helper.ts` GET+POST return additive `display`; new integration suite. Verified: full suite 1163/0, tsc clean |
| 2 | Backend commit + frontend implementation | be `7013990`; fe used `resolvePetRecordPresentation` + `HistoricalRecordIcon`. Verified: tsc/lint/build clean |
| 3 | Frontend commit + docs | fe `e8a4e0c`, docs `b9230e5` (be) and `0d36886` (fe) |
| 4 | Push + open PRs | PRs #257/#286 opened, then merged by the user |

### Decisions made (user-approved, not worker-assumed)

**1. Helper locale chain diverges from Phase 2.3A. This is the item most worth Codex's review.**

Owner-facing routes (2.3A) resolve: `?lang` -> `Accept-Language` -> `'th'`.
Helper routes (2.3C) resolve: `?lang` -> `Accept-Language` -> **the pet owner's `userConfig.preferredLanguage`** -> `'th'`.

Rationale: a helper is a third party with no account or stored preference, so the owner's language is the best available signal. Implemented as `resolveHelperDisplayLocale` in `src/routes/helper.ts`. Documented in `pawjai-be/docs/technical/database/LOOKUP_TYPES.md` with an explicit "do not simplify this back to the 2.3A three-tier chain" warning, because it looks like an oversight if you don't know why.

Cost: one extra indexed `userConfig` lookup on the POST path (the GET path already fetched it).

**2. Subtype picker deliberately NOT localized.** It still shows legacy names. The concept catalog endpoint (`GET /api/pet-record-concepts/catalog`) already exists and is public, but the only frontend consumer is `usePetRecordTypeOptions`, gated behind `NEXT_PUBLIC_PET_RECORD_CONCEPT_CATALOG_ENABLED` (defaults false) with a 515-line grouped adapter that does not match the flat list the helper picker renders. Deferred so we don't build a second integration that gets discarded when that flag flips on.

### Known issues accepted, not introduced

- **First-load locale race on the helper page.** The effect deps are `[token, setLocale]`, so the initial fetch uses the cookie/default locale before the owner's `ownerLocale` arrives in that same response. Verified present on the base revision before 2.3C; not introduced by this work. Left alone as out of scope.

### Verification performed by the orchestrator (not just reported)

- Full backend suite re-run: 1163 pass / 0 fail.
- `tsc --noEmit`, `bun run lint`, `bun run build` re-run on the frontend: clean, no lint findings in either touched file.
- Confirmed `HistoricalRecordIcon` is the genuine 2.3B shared component with 4 existing owner-side usages, and that icon sizing matched the existing mobile convention.
- Deploy ordering verified in code **both directions**: no coupling. Fe-first is safe because the old backend has no query schema on those routes (unknown `?lang` ignored) and the fallback chain degrades to legacy names. Be-first is safe because `lang` is `.optional()` and the old frontend never runtime-validates responses.
- Pushed heads confirmed byte-identical to reviewed commits; both `origin/staging` refs confirmed untouched at push time.

---

## PHASE 2.3D: Fix chat receipt identity and localized labels -- COMPLETE, MERGED AND RELEASED (v1.8.0)

**Problem (confirmed in code, not assumed):** when the chat assistant logs a record, the receipt card fabricates the record's identity.

- `pawjai-fe/components/chat/proposal/ReceiptCard.tsx:294` passes a human-readable name where a `typeId` belongs.
- Lines ~299-324 write the *same string* into both `nameEn` and `nameTh`, so a receipt's label is frozen in whatever language was active at commit time and cannot re-localize.
- The backend had the real `typeId` and `recordId` at receipt-construction time and discarded the `typeId`, shipping only a pre-localized string via a standalone legacy query (`lookupSubtypeName`) that bypassed the 2.3A machinery entirely.

**Load-bearing finding: receipts are PERSISTED.** `receiptPayloadBase` is written into `pet_chat_messages.metadata` (untyped `jsonb`, no version field) *before* the SSE yield, and the history read path passes it through with zero re-resolution. So every receipt ever displayed is frozen in the database. This is what determined the shape of the whole fix.

**Repairability:** every persisted receipt carries a real `recordId` (only the frontend fabricated a typeId), and `pet_records` holds the concept snapshot. So historical receipts can be re-resolved at read time with no data migration.

### Decisions made (user-approved)

1. **Re-localize at read time.** A receipt reopened in a different UI language shows the current language, not the commit-time freeze. Otherwise the chat pane and timeline disagree about the same record.
2. **Read-path repair, no migration.** Nothing writes to existing `pet_chat_messages.metadata` rows. A name-to-typeId backfill would be lossy, which is why it was rejected.
3. **No-locale requests skip re-resolution** rather than defaulting to `'th'`, so we don't pay two queries per history page for callers that ignore the result. `subtypeName` makes "do nothing" a correct response.
4. **Test depth accepted as-is.** `tryAutoCommit` is private; testing it end-to-end would mean mocking the whole LLM tool-call layer. Its dependencies are tested directly instead.

### Current state: both PRs merged and released to production in v1.8.0. Historical review content below still applies to the shipped code.

| Repo | PR | Branch | Commits | Base |
|---|---|---|---|---|
| pawjai-be | **#259** | `phase23d-chat-receipt-identity-staging` | `a7354bc` (feat) -> `21e0bd8` (docs) | `f6280af7` |
| pawjai-fe | **#287** | `codex/phase-2-3d-chat-receipt-identity-staging` | `66f79905` | `63f46d0f` |

Both merged to staging and released to production in v1.8.0. Orchestrator verified pushed heads byte-identical to reviewed commits and both `origin/staging` refs untouched.

**Backend** (`a7354bc`, 5 files, +493/-38): deleted `lookupSubtypeName`; `tryAutoCommit` now passes `locale` as `displayLocale` to `createRecord`/`updateRecord` (both already supported it) and reads the real `typeId` + resolved `display`. `subtypeName` retained, now derived from `display.label`. Fixed the amend path, which previously carried no subtype label at all. Weight records correctly untouched (`pet_weight_records` has no `typeId`/`conceptId`). New `src/services/chat/historical-receipt-resolver.service.ts` for batched read-path repair. Full suite **1173 pass / 0 fail** (1163 baseline + 9 new), tsc clean, both re-run by the orchestrator.

**Frontend** (`66f79905`, 6 files): the fabrication is gone -- `typeId: receipt.subtypeName || receipt.recordType || "activity"` became `typeId: receipt.typeId ?? ""`, and the dual-locale duplication is replaced by `resolvePetRecordPresentation`. The empty-string placeholder is safe because `RecordSummaryHeader`/`PetRecordViewDialog` never read `record.typeId` (verified by grep, not assumed). `?lang=<current UI locale>` is now sent on the chat-history fetch, and the react-query cache key is locale-aware so a language switch refetches instead of serving stale labels. tsc/lint/build all clean, re-run by the orchestrator.

**Deploy ordering: no coupling, re-verified in code for this phase specifically rather than carried over from 2.3C.** Fe-first is safe (the pre-2.3D `/history` handler attaches no query schema, so an unknown `?lang=` is ignored, and the frontend degrades through `display?.label -> subtypeName -> generic`). Be-first is safe (`lang` is `.optional()`, so an old frontend omitting it takes the same zero-extra-query skip path, and it never runtime-validates responses so the new fields are simply unread).

**One transitional difference from 2.3C worth knowing:** there is a genuine **inert window**. The backend skips enrichment unless a locale is supplied, so if the backend ships first, its read-repair capability sits unused until the frontend also ships and starts sending `?lang=`. Not a bug and not a breakage, but it means the backend cannot be validated end-to-end on its own.

### Specific things worth Codex's scrutiny

1. **`historical-receipt-resolver.service.ts` on a hot path.** It runs on every chat-history request that supplies a locale. Orchestrator verified it is genuinely batched (one `inArray` query joined to `pets`, one `enrichRecordsWithDisplay` call per page, early returns when a page has no receipts) and non-destructive (returns patched copies, no `db.update`). Worth a second opinion on query cost under real load and on page sizes up to `CHAT_DEFAULT_PAGE_SIZE` (50).
2. **Re-resolution applies to ALL receipts, not just pre-phase ones** -- including new receipts that already carry `typeId`. Deliberate, per decision 1, but it means the enrichment cost is permanent rather than transitional.
3. **Deleted-record behavior.** If the underlying record was soft-deleted or removed, that receipt's metadata is returned exactly as stored and the frontend falls back to `subtypeName`. Never throws, so one bad receipt cannot fail a history request.
4. **`src/routes/pet-chat.ts` was deliberately left alone** -- its wrapper already strips metadata before the route, so no receipt data reaches it. Worth confirming that reading is right.

---

## Side task: CLAUDE.md documentation defect -- FIXED, PR OPEN

`pawjai-be/CLAUDE.md` falsely claimed APNs and Apple Sign-In share one `.p8` key, sitting in the "Common issues" incident-response section where it would misdirect an on-call responder.

Verified false against the code: APNs uses `APNS_KEY_PATH`/`APNS_KEY_BASE64`/`APNS_KEY_ID` via `src/config/env.ts:78-80`. Apple Sign-In uses `APPLE_PRIVATE_KEY_BASE64` plus `APPLE_TEAM_ID`/`APPLE_KEY_ID`/`APPLE_CLIENT_ID`, read straight from `process.env` (never through `env.ts`) by `scripts/renew-apple-client-secret.js:27-30`, sourced from a gitignored `.env.apple-renew`. Separate keys, separate key IDs, separate config paths.

**`pawjai-be` PR #258, commit `72a0169`, branch `docs/fix-apns-apple-signin-key-claim`. MERGED 2026-08-15.**

---

## Repository hygiene

Cleanup done 2026-08-14 after the 2.3C merges: 18 worktrees and 18 local branches removed, each confirmed merged first.

Deliberately preserved:
- `pawjai-be/.claude/worktrees/agent-ae737a77` -- ~~contains real uncommitted work; do not prune~~ **RESOLVED 2026-08-17: triaged and DISCARDED along with three sibling agent worktrees** (`agent-a7aaa262`, `agent-ab615ced`, `agent-af87cfa9`, all based on v1.7.4). Evidence-verified supersession for every one: ae737a77's timezone-column fixes shipped as `0107_rich_mephisto.sql` with byte-identical ALTERs; the partial `notifications_is_read_idx`, the `pet_chat_messages_unique_idx` constraint, and `purgeOldOfferEvents()` were each independently reimplemented on mainline (no shared ancestry -- reimplemented, not cherry-picked). Orchestrator re-verified all four claims against `origin/master` before authorizing removal.
- ~~Three `worktree-agent-*` branches with no PR ever opened, last commit 2026-05-30 (notifications index, chat message constraint, offer_events archival job). Disposition unknown.~~ **RESOLVED 2026-08-17** in the same pass as ae737a77 above -- all three deleted along with their worktrees.

**Methodology note for future cleanup:** `git merge-base --is-ancestor` under-reports merged branches in these repos because most PRs are squash-merged. Cross-check with `gh pr list --state merged`.

---

## Open items

| Item | State | Owner |
|---|---|---|
| ~~v1.8.0 release~~ | **DONE.** Released 2026-08-16: be `ab8e022`/tag v1.8.0, fe `62a95bb`/tag v1.8.0 (PR #293), admin `ba50baa`. | — |
| **Rotate `ADMIN_JWT_SECRET` + APNs key** (disclosed 2026-08-09) | Still unconfirmed; user said they'd do it manually | **User -- worth Codex verifying it happened** |
| **Rotate Supabase `service_role` key** | Live key in untracked `test.sh` at repo root (now gitignored per parent commit `1616c35`; rotation itself still unconfirmed). Found 2026-08-16 | **User** (Supabase dashboard) |
| Daily 30-record limit | Product decision brief at `output/daily-record-limit-decision-brief.md` (split out of item 5, blocks item 7) | **User** |
| Share-token revocation + JWT authority | Decision brief at `output/share-token-gaps-decision-brief.md`; needs a product decision before any code | **User + Codex** |
| ~~Residual hardcoded English on vet-share page~~ | **DONE 2026-08-17.** All 6 strings localized (fe #295, shipped to prod via #296). | — |
| `agent-ae737a77` unfinished migration | RESOLVED 2026-08-17: all four 0107-era agent worktrees proven superseded and discarded | Closed |
| Item 4 (admin concept editor) | **Done, shipped** (admin PR #35/#36, released with v1.8.0) | — |
| Item 5 (logger safety / metadata integrity) | Metadata half done, merged to staging and released to production in v1.8.0. Daily 30-record limit still split out as a separate product decision brief, not implemented | **User** (for the limit decision) |
| Item 7 (care foundation) | Parked pending a product discussion; may be deferred or collapsed into record-model fields | **User + Codex** |

---

## PHASE 2.3E: Secure and localize vet sharing/PDF -- COMPLETE, MERGED AND RELEASED (v1.8.0)

**The privacy finding:** `isVetVisible` was defined on every concept but **never enforced anywhere on the vet-share path**. `src/routes/share.ts`'s record query filtered only by pet, soft-delete, and a plan-based date cutoff. The flag existed in the concept registry and the catalog service (as a passthrough field), but nothing ever used it as an access-control condition.

**It was not leaking.** The user ran a full-table read-only query against staging and production: zero clinical concepts marked not-vet-visible (active or inactive), zero with records attached, and zero unresolvable clinical records. So this is **preventive hardening, not incident response**, and the fail-closed rule hides nothing that vets currently see. The guard was redundant only because every not-vet-visible concept happened to be an activity, and activities were already excluded by category -- a property of the data, not a guarantee. The admin concept editor (roadmap item 4) would have made it reachable.

| Repo | PR | Branch | Commit | Base |
|---|---|---|---|---|
| pawjai-be | **#261** | `phase23e-vet-share-staging` | `60fac04c` (3 files, +532/-15) | `bea551bd` |
| pawjai-fe | **#288** | `codex/phase-2-3e-vet-share-staging` | `ab1d1e47` (12 files, +336/-81) | `63f46d0f` |

Both merged to staging and released to production in v1.8.0. Orchestrator verified pushed heads match and both `origin/staging` refs untouched.

**User decisions:** enforce via a **live join** to the concept registry (an admin toggle applies immediately to existing share links; no schema change, matching how 2.3A already treats concepts); **fail closed** for unresolvable concepts, **with a non-specific omission signal** (a count only, never type/date/reason) so a vet never reads a withheld-record summary as complete.

**Also in this phase:** the surface had **zero test coverage** before `vet-share-privacy.test.ts` (12 tests). Localization now reuses `petRecordDisplay` throughout. The PDF's Thai font bug is fixed -- it hardcoded `Arial, Helvetica, sans-serif`, none of which cover Thai -- and rendering was verified by running the actual `html2canvas` bundle in headless Chrome and inspecting the rasterized output, not inferred from the CSS change.

**Deploy ordering: no coupling and no inert window** (unlike 2.3D). Re-verified in code for this phase.

**Known residual:** some hardcoded English remains on the vet-share page -- `VetShareView.tsx` "Generating PDF..." (:441), "Download PDF" (:467), "Most Frequent Symptoms (Last 7 Days)" (:487), "History Period:" (:538), "This link expires on" (:542, beside a now-localized date), and `RecordCard.tsx:47` "Severity: {vibe}/5". One small cleanup round.

**Pre-existing gaps found but deliberately NOT fixed** (recorded for you to judge): neither `vetShareTokens` nor `helperTokens` has a revocation column, so an owner cannot kill a mis-shared link before its 7-day expiry; and `shareTokenService.verifyToken` validates only the JWT signature/expiry without querying the table, so a raw JWT keeps working even if its row is deleted (the short-code path users actually get does check the DB). These are one problem, not two -- adding a `revokedAt` column achieves nothing on a path that never reads the table. **Written up as a decision brief at `output/share-token-gaps-decision-brief.md`**, with the three implementation shapes and their costs. No code will be written until the product question ("what should revocation mean here?") is answered.

---

## Side fix: helper test rate-limit flake -- PR #260 MERGED

While verifying a 2.3E report, the orchestrator caught a worker claim of "1185 pass / 0 fail" that was wrong: the suite exited non-zero with 7 failures in the Phase 2.3C `helper-display-route.test.ts`. All were `429`s. The helper route allows 30 requests/hour, the limiter is Redis-backed and keys on `request.ip`, and every `app.inject()` in that file shared one bucket that **persisted across separate test invocations**. Reproduced on clean `origin/staging` with no 2.3E changes present, so it was pre-existing on merged code, and state-dependent (passes on a cold bucket, fails on re-run), which is why earlier runs looked green.

Fix is test-only (`bb247f3`, +26/-2): `trustProxy: true` plus a distinct `x-forwarded-for` per request. Verified by three consecutive clean runs and a full suite at exit code 0. **PR #260, merged 2026-08-14.**

**Generalizable lesson for this repo:** a printed "N pass / 0 fail" is not sufficient -- check the process exit code. And any suite hitting a rate-limited route needs `trustProxy` plus per-request IPs.

---

## Where these phases sit in the roadmap

The user's 10-item roadmap, defined 2026-08-13. Phases 2.3C and 2.3D below are items 1 and 2. Everything above item 1 was already complete when Claude took over.

| # | Phase | Status |
|---|---|---|
| 1 | 2.3C localize helper history | **Done, merged to staging** (be #257 / fe #286) |
| 2 | 2.3D chat receipt identity | **Done, merged to staging** (be #259 / fe #287, merged 2026-08-14) |
| 3 | 2.3E secure + localize vet sharing/PDF | **Done, merged to staging** (be #261 / fe #288, merged 2026-08-15) |
| 4 | Admin concept editor | **Done, shipped** (admin PR #35/#36, released with v1.8.0). Ship gate satisfied: `isVetVisible` enforcement (2.3E) was already live in prod before the toggle shipped |
| 5 | Logger safety fixes | **Metadata half done, merged to staging AND released to production** in v1.8.0 (be #262 / fe #289, merged 2026-08-16 -- see the item 5 section below). 30-record daily limit split out as a product decision brief, NOT implemented |
| 6 | Progressive logger | Recent/pinned/"log again" shortcuts, identity only, never copying time/note/photo/severity/dose |
| 7 | Care foundation | Explicit care mode, care tasks, medication outcomes |
| 8 | New species | Bird or hamster pilot |
| 9 | Fish discovery | Deferred pending the one-fish-vs-tank-vs-community modeling question |
| 10 | Legacy cleanup | Retire old lookups and the remaining `nameEn`/`nameTh` consumers |

Open decisions the user flagged as needing resolution before care mode (item 7): the 30-record daily limit vs. emergency/frequent monitoring, task vs. record semantics (a reminder is not proof care happened), distinct medication outcomes (given/refused/skipped/missed/snoozed), preserving unknown metadata during edits, whether subscription limits should ever block essential care logging, and what "universal" concepts must mean to be safe across every supported species.

**Relevant to item 10:** phases 2.3C and 2.3D both deliberately kept legacy fields (`nameEn`/`nameTh`, `subtypeName`) as fallbacks rather than removing them. That was the additive discipline; the removals belong to item 10, not to these phases.

---

## 2026-08-15/16: all PRs merged, v1.8.0 staged, and a release-scope correction

**Merges (all by the user, manually):** #258, #260, #287 (2026-08-14), #261/#288 (2026-08-15), and item 5's #262/#289 (2026-08-16). Nothing from the Claude period remains unmerged. Staging heads as of 2026-08-16 post-release: be `ab8e022` (== prod master), fe `fd1da35` (staging's merge-back after the release; content-identical to prod main `62a95bb`).

### The v1.8.0 release and its real scope -- SHIPPED

The 5-stage release packet (bump both repos to 1.8.0, merge staging -> prod, tag, sync submodules, verify) at `output/release-1.8.0-packet.md` was **executed 2026-08-16.** Zero pending migrations in either repo -- it was a code-only deploy, as verified.

**The correction (now historical context):** earlier status reporting framed v1.8.0 as "the 6 audited PRs." The real prod delta that shipped was **84 commits in pawjai-be** (PR merges #246, #249, #251, #254, #256, #257-#262) and **62 commits in pawjai-fe** (whose prod branch is `main`, not `master`; PR #293 "Release v1.8.0" merged staging into main 2026-08-16). The extra scope included **DeepSeek LLM routing, Stripe cancellation-on-deactivate, chat-image lifecycle, and a win-back offer fix -- the exact work previously excluded from the record-concepts release.** Verified mitigations: `DEEPSEEK_API_KEY` is `z.string().optional()` and `selectProvider()` falls back to Gemini when unset, so prod without the key degrades cleanly. The Stripe and chat-image paths were NOT independently re-verified beyond the standard release checks. The user decided to ship this scope; it shipped 2026-08-16 as v1.8.0.

### Roadmap item 5: metadata integrity on record edit -- DONE, MERGED (be #262 / fe #289)

User re-sequenced the roadmap to **5 -> 4 -> 6, item 7 parked** for a product discussion (may be deferred or collapsed into record-model fields).

**Two defects, one mechanism** (both verified in source before any code):
- **Defect A (all records):** the FE edit dialog rebuilt `metadata` from only its rendered fields (amount/severity/frequency) and the BE whole-replaced the blob -- so a note-only edit destroyed unrendered keys, e.g. `metadata.duration`, which `recent-symptoms.service.ts` reads.
- **Defect B (legacy records, worse):** `recordConceptResolution.ts` reads `metadata.detailType` for `LEGACY_METADATA_OVERRIDES` (bathroom -> urination), and `updateRecord` re-resolved the concept snapshot against the client fragment. Editing a legacy urination record's note silently rewrote its immutable concept snapshot to `activity.bowel_movement`. Scope-checked: `detailType` is legacy-only -- the current FE never sends it (quick-log creates urination/bowel as separate concepts) and nothing edits it post-creation.

**Policy decision (user delegated the call to Claude -- review the policy, not just the code):** identity-bearing metadata keys are **immutable on PATCH**. `RESOLUTION_METADATA_KEYS` (today: `['detailType']`) exported next to the overrides; a pure `mergeRecordMetadata` (`src/db/concepts/recordMetadataMerge.ts`) shallow-merges stored+supplied, pins identity keys (changing one -> 400), treats `{key: null}` as single-key deletion, and `metadata: null` clears user-facing keys while preserving identity keys. The merged blob feeds BOTH the UPDATE and `resolveRecordConceptSnapshot` in one statement, so **an edit can never change `conceptId` -- only an admin catalog remap can** (the existing intended path, which your item 4 editor will use). A unit test enforces that any future override key must be added to the list.

**FE half (#289):** the dialog now omits `metadata` entirely when no rendered field changed, and otherwise sends the full stored blob merged client-side (unrendered keys ride through; cleared fields become `{key: null}`). Deploy-order independent -- safe against both the old whole-replace and new merge backends. Bonus: non-activity/non-symptom record types previously sent `metadata: null` on every save (wholesale-clearing their metadata); now omitted.

**Verification (orchestrator re-ran everything, worker reports not trusted):** be suite 1206 pass / 0 fail at exit code 0 (baseline 1173 + 33 new; the urination-corruption regression test asserts persisted metadata, `conceptId`, and `conceptResolutionSource` together), tsc/build clean both repos, fe lint 0 errors (182 pre-existing warnings repo-wide, none in the touched file). One pre-existing test rewritten because it asserted the old, now-forbidden behavior (editing `detailType` expected to succeed); a catalog-remap test was added so the legitimate re-resolution path kept coverage.

**Deliberately NOT done in item 5:** the 30-record/day limit. It is one of item 7's declared blockers and a product-values question (does a subscription limit ever block essential care logging?). Written up with options and a recommended read at `output/daily-record-limit-decision-brief.md` -- the recommendation is to run a read-only usage query (pet/day pairs at 25+, by type and tier) before choosing.

### Also of note for your review

- The **status artifact shown to the user** (claude.ai) initially carried the "6 PRs" framing; it was corrected the same day with the full scope comparison. The audit habit that caught it: re-verify every claim against `git`/`gh` rather than trusting prior session reports.
- A third unrotated credential joined the list on 2026-08-16: a live Supabase `service_role` key in the untracked `test.sh` at the parent repo root (now gitignored per parent commit `1616c35`; rotation itself still unconfirmed).

## ROADMAP ITEM 4: admin concept editor -- SHIPPED in v1.8.0 (be #263, admin #35/#36)

**Scope decided by the user:** edit-only v1 (no concept creation -- that stays in your code-reviewed rollout planners), mutations super_admin-only, reads all-admin. Design of record was `item4-admin-concept-editor-plan.md` (now in `output/archive/`).

**Backend** (`ee0b89d`, PR #263, 5 files +1051): new `src/services/conceptEditorService.ts` + `src/routes/admin/concepts.ts` + a remap endpoint added to `admin/lookupTypes.ts`. Surface: GET list (translations + linked-lookup + attached-record counts, batched -- no N+1), GET single, PATCH concept (ONLY sortOrder/isActive/isVetVisible; `key`/`type`/`fieldSchema`/`metadataSchemaVersion` rejected by a `.strict()` schema + `.refine` requiring at least one mutable field), PUT translation upsert (case-insensitive locale per the functional unique index), PATCH `lookup-types/:id/concept` (same-type remap, composite FK surfaces cross-type as clean 400). Flipping isActive/isVetVisible on a concept with attached records demands `confirm:true`; the refusal carries the affected-record count. Every mutation stamps `updatedBy` and AWAITS an `adminAuditLog` insert -- fire-and-forget was implemented first and corrected in review to match `lookupTypeService` precedent (known accepted tradeoff: mutation UPDATE and audit INSERT are separate statements, not one transaction). 23 integration tests; suite 1229/0 exit 0.

**Admin UI** (`5fa10e7`, admin #35, released via #36): settings page next to Record Types, role-gated per the AdminSidebar pattern (mutations hidden for non-super_admin; server enforces). Toggle flow calls optimistically and surfaces the CONFIRMATION_REQUIRED count in a dialog; remap flow is dialog-first with a single confirmed request. One shared-infra fix worth your eyes: `lib/api/client.ts` + `types/admin.ts` previously DROPPED the backend's error `details` -- additive `details?: unknown` threading was required to make the confirm-count reachable at all.

**Things worth your scrutiny:** (a) the hard role check is `admin.role !== 'super_admin'` inline, deliberately NOT `requirePermission` (which auto-passes any admin holding a named permission string); (b) the `isVetVisible` live-join consequence -- an admin flip immediately withholds records from existing share links (fail-closed, count-only omission signal per 2.3E); (c) known viewer gap: the admin audit-log page's action-category filters predate the new `update_concept` / `*_concept_translation` / `remap_lookup_concept` actions -- writes are verified present, the VIEWER may not surface them; (d) the editor has had exactly ONE human click-through pass, post-release.

**Deferred to v2, recorded:** concept creation + key validation, `fieldSchema` editor (blocked on dynamic-forms design), translation deletion, species-variant creation beyond existing lookupTypes admin.

---

## THE v1.8.0 RELEASE MECHANICS -- retiring your twin-PR pattern (review this decision)

Past releases put features on prod via twin PRs (same logical change, separately squash-merged to each branch -- your pattern). Consequence discovered when the user opened be #264 (staging->master): the merge CONFLICTED on every twin-touched file (9 in be, 20 real in fe), because the same content existed as different commits.

**The fix, applied to both repos:** prove staging strictly supersedes prod, then `git merge -s ours origin/<prod-branch>` on staging -- the tree stays byte-identical to staging, histories join, and the release PR merges clean with prod becoming exactly staging.

**The supersession proofs (re-verify if you doubt them):**
- be: 8/9 conflicted files -- master's exact blob exists in staging's history (`git log origin/staging --find-object=<blob>`); the 9th (CLAUDE.md) held only stale text INCLUDING the false APNs/Sign-In shared-key claim that #258 corrected. Merge commit `4e01f3c`; release merge `ab8e022`; post-merge master tree == staging tree, verified by hash.
- fe: 1 blob-hit + 18 formatting-only (token-stream identical) + 1 large file (`PawjaiLongevityResearch.jsx`, 720 vs 1773 lines) proven equal modulo exactly 2 `&quot;` entity tokens -- independently re-verified by the orchestrator. Merge commit `fd1da35`; release PR #293 -> main `62a95bb`, tagged v1.8.0; tree-hash equality verified pre- and post-merge.
- Deliberately NOT hand-resolved and NOT trusted to auto-merge: interleaving two twin variants can produce code that is neither. `-s ours` was chosen precisely to make the merge content-free.

**Consequence you inherit:** both repos' histories are now joined; future staging->prod merges will not conflict. The twin-PR pattern is dead. If you disagree with any supersession proof, say so BEFORE directing new work -- it is the foundation the release sits on.

**The v1.8.0 follow-up and the DOUBLE-squash lesson (2026-08-17).** A follow-up shipped under the 1.8.0 umbrella (no bump, no new tag, user's call): the last 6 hardcoded English strings on the vet-share page localized with interpolation (fe #295), plus the post-release doc corrections (be #265 / fe #294 / admin #37). Release PRs: fe #296, be #266, admin #38 -- each verified pre-merge to produce a tree byte-identical to staging. be and admin merged as true 2-parent merges. **fe #296 was squash-merged AGAIN despite its PR body bolding "merge commit, not squash"** -- GitHub's merge button defaults to the repo's last-used method (fe's was squash from #293), and a body instruction does not survive a habitual click. No content was ever at risk (squash captured the tree exactly); only the history join died a second time. **Fix, this time on main's side:** a real 2-parent merge `9d753eb` (parents: fe's squash `4390b4e` + staging's join `0ebb644`), tree-hash-verified identical to main, pushed to BOTH main and staging -- the two branches now share one head, so no future squash has divergent history left to orphan. **Standing rule: release merges to prod are local merge commits pushed directly; a PR may exist for review visibility but its button is never used to land a release.** Current heads: be master `b42c14a`, fe main == fe staging `9d753eb`, admin master `0296e2f`, parent `5105ab9` (all three pointers bumped).

**Also shipped around the release (fe side-quests):**
- **Public-pages early promotion** (fe #290, pre-release): the rebranded marketing pages (home/about/blog/features/contact/longevity-research) were file-level-isolated out of the tangled rebrand squash `2728254` (which also carried Pepe chat UI depending on be #246, then unreleased) and shipped to prod ahead of v1.8.0. 42 files, every one verified to have the rebrand as its only touching commit.
- **Broken marketing images** (fe #291/#292): that rebrand squash hardcoded **31 `http://localhost:3845/assets/*` URLs** -- Figma's plugin dev server -- across 5 phone-mockup components; broken on every deployed environment since 2026-08-07. Replaced with real CDN assets where semantics matched (`LOOKUP_ICONS.main.*`, `PET_AVATARS.*`) and lucide-react glyphs otherwise. Fidelity is icon-approximate; if the designer re-exports real Figma assets, swap them in. Lesson recorded: Bunny CDN 403s ALL CLI probes, so asset existence is only verifiable in a browser.

---

## PENDING PRODUCT DECISIONS -- decided in principle, NOT implemented (your input welcome before code)

The user is moving Pawjai from freemium to **paid-only with a 7-day trial**. Two standing questions were settled against that model on 2026-08-16 (full packet, ON HOLD at user's request: `output/pricing-model-prep-round1-packet.md`):
1. **Daily 30-record limit** -- repurposed from monetization to abuse control: trial accounts keep 30/pet/day; paying subscribers get clinical types (symptom/medication/vet_visit) EXEMPT with activity capped at ~100/day as a runaway guard. Item 7 inherits this. Validating prod usage query not yet run.
2. **Share-token revocation** -- DB becomes the authority (`verifyToken` reads the row; `revokedAt` on both token tables; owner-facing revoke control). Lapse policy: existing links survive subscription lapse until natural 7-day expiry; creating new links requires an active trial/sub. Your original finding (JWT-authority never reads the DB) is the thing being fixed.
Neither is implemented. The freemium->paid migration itself needs a full inventory round (scoped in the on-hold packet, step 4).

---

## RUNNING AGENTS ON THIS CODEBASE -- what makes the rounds work (for you, directing agents)

The full protocol lives in `output/ORCHESTRATOR_HANDOFF.md`; it is your protocol, kept verbatim. The practical additions learned across ~20 rounds of directing Claude worker agents:
- **Packets that work** are numbered-scope + restated standing rules EVERY round + explicit report-back fields + a literal hard stop. Agents honor exactly what is written; ambiguity becomes improvisation.
- **Verify reports against the repo, never against the report.** Every real error this period (the 6-PRs-vs-84-commits scope gap, a wrong-repo measurement, the localhost URLs, a false "no eslint config" claim that took three passes to fully correct) was caught by primary-source checks, not by careful reading.
- **Exit codes, not printed tallies** (`bun run test; echo $?`) -- a printed "0 fail" has masked a non-zero exit here.
- **Traps that have bitten agents:** shell cwd persists between commands (cd explicitly, always); zsh aborts a whole command on one failed glob AND does not word-split unquoted vars; `git merge-base --is-ancestor` under-reports squash-merged branches (cross-check `gh pr list --state merged`); pawjai-be tests need `bun --env-file=<be>/.env.local run test` (Docker throwaway DB); pawjai-admin's lint is dead (legacy `.eslintrc.json` vs ESLint v9 flat-config) so `bun run build` is the real gate there; `bunx tsc --noEmit` in pawjai-fe resolves a stray newer standalone TypeScript that errors on this repo's `tsconfig.json` (TS5102/TS5090) -- use `./node_modules/.bin/tsc --noEmit` instead; a local branch left checked out from before a merge lands on GitHub does not auto-update, so `git checkout <stale-local-branch> -- <path>` can silently pull OLD content into your working tree even though `origin/<branch>` has the merge -- always `git fetch` and compare/checkout against `origin/*`, not a bare local branch name, right before any checkout that reads from one (caught mid-round 2026-08-17: a stale local `master` briefly reverted 5 already-fixed doc files).
- **Agents hold correctly when packets are honest about authority.** A worker refused to push the parent repo on an ambiguous relay -- that is the system working; write authorization lines so that refusing is easy.

## Packet archive

Instruction packets and the reports they produced live under `/Users/purin/dev/pawjai/output/`. Packets for phases now merged and released to production (2.3C, 2.3D, 2.3E, item 4, item 5, the ratelimit fix, and the release-1.8.0 packet itself) have been moved to `/Users/purin/dev/pawjai/output/archive/` as of the 2026-08-16 post-release housekeeping sweep. Still-current material (this document, `ORCHESTRATOR_HANDOFF.md`, the open decision briefs, the on-hold pricing packet, the leak-check SQL) remains at the top level.

---

## Maintenance note

This document is the running record of the Claude-orchestrated period. It is updated at the end of each round: a new row in the phase's round table, any decision the user made, and any state change (commit SHA, PR number, merge). If it disagrees with the repo, the repo wins -- every SHA and PR number here was verified against `git`/`gh` at the time of writing, but merges and pushes happen outside this session.

**Last updated:** 2026-08-18, after the item 6 incident + reland. New since the 08-17 pass: vet-share page fully localized (fe #295 -> prod via #296), post-release doc corrections on all three repos (#265/#294/#37 -> prod via #266/#296/#38), the DOUBLE-squash lesson + the permanent fix (fe main == staging at `9d753eb`, one shared head) + the standing rule (release merges land as direct-pushed local merge commits, never the PR button), and the four 0107-era agent worktrees triaged and discarded on verified supersession evidence. Still awaiting the user: three key rotations (ZERO confirmed) and the browser pass (vet-share Thai PDF + chat receipt -- the page is now fully Thai, so this is the moment).

**Item 6 (progressive logger) incident, 2026-08-18: ship -> crash -> revert -> reland-fixed.** Sequence:
1. **Ship.** v1 (fe PR #297, `8ee8c66`) fast-forwarded onto fe `main`/`staging` 2026-08-18. The orchestrator signed off with zero runtime passes -- tsc/lint/build were all green and that was treated as sufficient. It was not: none of the three static gates can see a `useSyncExternalStore` contract violation.
2. **Crash.** The chip-row hook (`hooks/useRecentLogShortcuts.ts`) selected pins via `state.listPins(petId)`, which resolves to `pinsByPet[petId] ?? []` -- a freshly-allocated array on every store snapshot for any pet with zero pins, i.e. every first-time user. `QuickLogDialog` (and this hook) mounts unconditionally on the dashboard whenever the user has >=1 pet, independent of the dialog's open/closed state, so the unstable selector fired a React re-render loop ("Maximum update depth exceeded") on dashboard load for essentially all users. The dashboard's error boundary surfaced this as "Something went wrong" -- a total outage, not a degraded feature.
3. **Revert.** `07be528` reverted `8ee8c66` on both fe `main` and `staging` same-day, restoring the dashboard.
4. **Reland-fixed.** A fix was prepared by the orchestrator (unpushed, on branch `fix/item6-pin-selector-loop`: `0386efd` reapply + `4bf2762` the actual fix) selecting the stable `pinsByPet` object from the store and deriving the per-pet list outside the subscription against a module-level `EMPTY_PINS` constant. **Roles reversed for verification: the fix itself was written by the orchestrator under incident pressure, then adversarially reviewed by the worker with no deference** -- independent mechanism confirmation (read the store's `listPins` implementation directly, confirmed the `?? []` allocation; re-audited every other `useLogShortcutPinStore` call site and confirmed `isPinned` returns a primitive and `pin`/`unpin` are stable refs), independent gate re-runs (tsc/lint/build via `./node_modules/.bin/tsc`, not bunx), and a **real-browser runtime repro** via Playwright/Chromium against a throwaway dev-only route (deleted before merge) mounting the actual `useRecentLogShortcuts` hook: before-fix showed the exact "Maximum update depth exceeded" / "Something went wrong" failure with console evidence, after-fix showed a clean mount. Relanded via fe PR #298, squash-merged as `9ea74e1`. fe `main` fast-forwarded to `staging` (`9ea74e1`, verified `git merge-base --is-ancestor`), parent gitlink bumped `47d6949`.
5. **Lesson codified.** `output/ORCHESTRATOR_HANDOFF.md` protocol section: new RUNTIME GATE rule (any always-mounted-surface change needs a real browser pass, not just static gates) and the Zustand v5 selector-stability trap added to the traps list. `output/item6-progressive-logger-plan.md` §8 updated with the same as a repo-wide lesson.

Current prod/staging heads after the reland: fe `main` == `staging` == `9ea74e1`, parent `47d6949`; version stays 1.8.0 (user's explicit call — no bump for an incident fix within the same release), no new tag. Roadmap item 6 (progressive logger) v1 back in staging/main as of the reland — identity-only shortcuts built on item 5's RESOLUTION_METADATA_KEYS classification (fe-local mirror, one-way lockstep comment; reciprocal be comment is a queued fast-follow), recents/pins/log-again UI, design-guide additions user-approved; still awaiting the user's browser confirmation that prod is healthy post-deploy. Item 7 stays parked; the daily-limit + share-token decisions are settled-in-principle inside the ON-HOLD pricing-model prep packet in output/.

---

## 2026-08-18 evening addendum — the chat-write day (verify against git)

Shipped to prod at the user's direct release cadence (be/fe heads joined throughout):
- **R2 receipt trust hardening**: be #268 (read-time `status:'deleted'` stamping in the historical-receipt resolver — receipts can never claim a dead record is saved) + fe #302 (inline undo via soft-delete w/ idempotent double-tap, 2-min duplicate guard cleared on undo, pet-identity prominence, per-send idempotency-key passthrough).
- **typeId enum (be #267): shipped to prod and REVERTED same day (`10ea791`).** Deterministic empty-Gemini responses on record-write turns began at the enum's deploy; the second incident went double-empty through the fresh silent-retry — identical input failing twice in 1.3s = input problem, prime suspect the ~48-UUID enum (+ prose asymmetry). Re-landing gated on: finish-reason logging on empty responses, R1.2 prose widening, and a LIVE-GEMINI eval before deploy. Lesson: model-facing schema changes need a live-model gate, exactly as UI needed rule 9's browser gate — schema-conversion tests passed while the real model choked.
- **Silent retry on empty Gemini responses (be #269, KEPT)**: one retry, only when zero chunks yielded; double-empty falls back as before; retry/recovery rates observable in logs.
- **Chat message length bounds: 3..1000 → 1..4000**, both repos in lockstep (short Thai replies bounced with a swallowed 400; pasted vet reports were silently sliced to 1000 chars — Pepe answered on truncated medical info).
- Ticketed, not built: fe surfaces a generic apology instead of the backend's specific 400 rejection text; `record_undo` analytics event; enum re-landing conditions above.

- **Ad-hoc roadmap item added (user request): timeline & /pet viewing UX.** 7-agent study (3 personas + 4 experts) completed 2026-08-18; plan at `output/timeline-pet-improvement-plan-2026-08-18.md`. Scope: the two pages only (user decision). 14 confirmed defects incl. blind delete dialog (no pet identity), photos never rendered in read path, silent deep-link dead-end (shipped `/records/:id` endpoint unused), nullable-`occurredAt` NULLS FIRST sort bug, broken window-virtualizer `scrollMargin`, and a race that silently removes "Log again". Parked out-of-scope in its Appendix B: `vibe` mood rating rendered as "Severity" to vets on the share screen (SAFETY, recommend early standalone fix). No code changed yet.

**Last updated:** 2026-08-18 evening. Current heads: be master==staging `d6e5aa8a`, fe main==staging `58854e0`, parent `cd1cd2c`.
