# ROUND 2 PACKET (paste to the worker agent; Round 1 standing rules remain in force)

## Round 1 review verdict: APPROVED

The orchestrator independently verified your Round 1 work: diff reviewed line by line against the petRecordDisplay contracts (both species-map keyings confirmed correct), tsc clean, your 6 tests re-run and passing, full suite re-run at 1163 pass / 0 fail. Your report was accurate throughout.

Decisions on your open questions (confirmed by the user):
1. Locale chain: your option (b) is APPROVED and is now the spec. `?lang` -> Accept-Language -> owner's preferredLanguage -> 'th'. Do not change it.
2. The extra userConfig SELECT on POST: accepted as-is, no change.
3. Accept-Language coverage: add ONE test to helper-display-route.test.ts asserting the Accept-Language tier on the helper GET route (no ?lang, header set, expect that locale). Do this before the commit below.

## Task 1: Backend commit (EXPLICITLY AUTHORIZED, this round only)

The user has explicitly authorized ONE commit on `phase23c-helper-display-staging` in the worktree `/Users/purin/dev/pawjai/pawjai-be-helper-display-phase23c`. Commit only. Push is NOT authorized. PR is NOT authorized.

1. Add the Accept-Language test from verdict item 3.
2. Re-run the targeted suite (`bun --env-file=/Users/purin/dev/pawjai/pawjai-be/.env.local run test src/__tests__/integration/helper-display-route.test.ts`) and `bunx tsc --noEmit`. Both must pass.
3. Stage EXACTLY these two files by name (never `git add -A`):
   - `src/routes/helper.ts`
   - `src/__tests__/integration/helper-display-route.test.ts`
4. Commit with a message following repo convention, e.g. `feat(helper): add localized display projection to helper endpoints`. Never `--no-verify`; if the pre-commit hook blocks, stop and report instead of bypassing.

## Task 2: Frontend implementation (pawjai-fe)

Setup: `git fetch origin` in `/Users/purin/dev/pawjai/pawjai-fe`, then create a worktree at `/Users/purin/dev/pawjai/pawjai-fe-helper-display-phase23c` on new branch `codex/phase-2-3c-helper-display-staging` based on `origin/staging`.

GATE FIRST: verify Phase 2.3B actually landed on fe `origin/staging`: `lib/utils/petRecordPresentation.ts` exists and `lib/mappers/petRecord.ts` passes `display` through. The orchestrator's scout only found these on the branch `codex/phase-2-3b-record-display`; the local staging checkout was stale. If 2.3B is NOT on origin/staging, STOP immediately and report; Round 2 cannot proceed on an unmerged base.

Then implement, additive only (keep all nameEn/nameTh fields and fallbacks):

1. `lib/api/helperService.ts`: add an optional `display` field to the helper log type and the create-log response type. Shape (from backend `PetRecordDisplay`): `{ conceptId, key, type, label, description, iconUrl, requestedLocale, resolvedLocale, usedFallback }`. Reuse the existing fe type for this if 2.3B already defined one (check `types/` and `lib/mappers/petRecord.ts`); do not redefine a duplicate shape.
2. Pass `?lang=<current UI locale>` explicitly on the helper GET and the create-log POST, so display labels always match the page chrome. The backend fallback chain is only a safety net.
3. `app/helper/[token]/page.tsx` history list (~445-447, re-verify lines): prefer `log.display?.label`, falling back to the existing `locale === 'th' ? nameTh : nameEn` ternary when display is absent (defensive for any deploy-order window).
4. Icons in the history list: prefer `display?.iconUrl` with fallback to the legacy type icon, mirroring `petRecordPresentation.ts`. Do not redesign anything visually; label/icon source swap only (DESIGN_GUIDE.md applies).
5. Subtype picker (~569-586): INVESTIGATE BEFORE TOUCHING. Those labels come from a list of available record types, not from per-record data, so Round 1's per-record display cannot cover them. Find where that list is fetched and whether a localized/concept-aware variant already exists (check what Quick Log uses after phases 2.3B/2.4 catalog work). If localized data is already available to the helper page, wire it in the same additive style. If it would need new backend support, DO NOT build it; describe exactly what is missing in the report and leave the picker on legacy names for now.
6. Verification: `bunx tsc --noEmit` (or the repo's typecheck script), lint, and `bun run build`. Extend fe tests only if an existing test pattern covers this page or the helper service; do not invent a new test harness this round.

NO commit in pawjai-fe this round. Frontend commit needs its own authorization after review.

STOP after Task 2 verification and produce the report below.

## RETURN TO ORCHESTRATOR (report format)

1. Backend: new test name + targeted suite/tsc results, commit SHA, `git show --stat` summary of the commit, and confirmation the pre-commit hook passed.
2. Frontend gate: evidence of 2.3B on fe origin/staging (or the STOP report if absent), plus base SHA and worktree path.
3. Subtype picker finding: where the list comes from, whether localized data was available, what you did (wired vs left legacy plus what backend support would be needed).
4. Changes: every fe file touched, path:line, one line each.
5. Verification: typecheck/lint/build results; any test changes and results.
6. Open questions / risks, and proposed Round 3 scope (expected: fe commit authorization, then staging PR strategy for both repos).

Do not proceed past this report for any reason.
