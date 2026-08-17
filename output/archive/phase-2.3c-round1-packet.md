# WORKER PROTOCOL + ROUND 1 PACKET (paste this whole document to the worker agent)

You are the implementation worker for the Pawjai project. An orchestrator agent (another Claude session) plans and reviews; the user relays packets between you. You execute exactly what each packet scopes, then report back and STOP. This mirrors the existing "Codex packet" protocol this project has used for months.

## Standing rules (apply to every round, never expire)

1. NEVER commit, push, merge, deploy, run migrations, or touch staging/production infrastructure without a fresh, explicit authorization inside the current packet. Prior approval never carries forward.
2. When a packet says "stop after X", stop after X. Do not chain into the obviously-next step.
3. No schema or migration changes in this phase. If something appears to need one, stop and report instead.
4. Env files and secrets are process input only. Never render them: no cat/head/grep on .env files, no env/printenv, no `set -x`, no unscoped `railway variables`. Ask before any command that could print variable values.
5. When (and only when) a later packet authorizes a commit: stage exact named files (`git add <file> <file>`), never `git add -A`, never `--no-verify`. Follow each repo's commit conventions.
6. Verify every claim in this packet against the actual code before acting on it. Line numbers below come from a scout and may have drifted.
7. Additive changes only: keep legacy `nameEn`/`nameTh` fields in API responses and types. Removing them is a separate future phase (legacy cleanup).
8. Follow existing patterns; do not invent new ones. Check each repo's `/docs` and CLAUDE.md. For pawjai-fe UI work, do not deviate from DESIGN_GUIDE.md.
9. Both repos use bun (`bun test`, `bun run build`, etc.).
10. If any instruction is ambiguous about environment or scope, stop and ask via the report instead of guessing.

## Project context

- Feature: Phase 2.3C, "Localize helper history using display".
- The app has a canonical record-type concept registry (deployed to prod 2026-08). Phase 2.3A added a localized "record display projection" to the backend: `pawjai-be/src/services/petRecordDisplay/` (loader.ts, resolution.ts, index.ts), merged to backend staging via PR #254, integrated in `src/services/petRecordServices.ts`. Phase 2.3B consumed it in the owner-facing frontend.
- The helper feature (token-based, unauthenticated access at `app/helper/[token]`) was NOT migrated. It still uses legacy bilingual name columns.

Known legacy sites (verify first):
- `pawjai-be/src/routes/helper.ts` ~111-112 and ~145-146: history list query selects `petRecordTypes.nameEn/nameTh` and returns them as `type.nameEn/nameTh`.
- `pawjai-be/src/routes/helper.ts` ~240-241 and ~257-258: same pattern in the record-creation/complete response.
- `pawjai-fe/app/helper/[token]/page.tsx` ~445-447: renders `locale === "th" ? log.type.nameTh : log.type.nameEn`.
- `pawjai-fe/app/helper/[token]/page.tsx` ~569-586: subtype picker labels/alt from nameTh/nameEn.
- `pawjai-fe/lib/api/helperService.ts` ~17-18: response types declare `nameEn/nameTh`.

Target frontend pattern (from Phase 2.3B, branch `codex/phase-2-3b-record-display`):
- `pawjai-fe/lib/utils/petRecordPresentation.ts`: label resolution preferring `record.display?.label`, icon preferring `display?.iconUrl`, with fallback chain.
- `pawjai-fe/lib/mappers/petRecord.ts`: passes `display` through from API to UI types.

## ROUND 1 SCOPE: backend only (pawjai-be)

Work from `/Users/purin/dev/pawjai`. The pawjai-be repo is at `/Users/purin/dev/pawjai/pawjai-be` (a submodule; sibling worktree dirs are the convention, e.g. `pawjai-be-record-display-phase23a`).

1. Setup: `git fetch origin` in pawjai-be, then create a worktree at `/Users/purin/dev/pawjai/pawjai-be-helper-display-phase23c` on a new branch `phase23c-helper-display-staging` based on `origin/staging`. Do all work there.
2. Verify: confirm the legacy sites in `src/routes/helper.ts` listed above, and read `src/services/petRecordDisplay/` plus its docs (a docs commit exists: "document localized record display projection") to learn the projection's contract, especially how locale is resolved in Phase 2.3A's integration (query param? Accept-Language? both locales returned?). The helper route is unauthenticated, so note how locale resolution applies there.
3. Implement: extend the helper endpoints' record/type payloads with the display projection, reusing `petRecordDisplay` exactly as `petRecordServices.ts` does (no parallel reimplementation). Keep `nameEn`/`nameTh` in the response unchanged. Cover BOTH the history list response and the record-creation/complete response.
4. Tests: extend existing helper tests (see `src/__tests__/unit/helper-log-schema.test.ts` and any helper route tests) to assert the display fields appear and legacy fields still exist. Run the full backend test suite and typecheck/build. Do not fix unrelated failures; report them.
5. Do NOT commit, push, or touch the frontend. Frontend is Round 2 after review.

STOP after step 4 and produce the report below.

## RETURN TO ORCHESTRATOR (report format)

Reply with exactly these sections so the user can relay them:

1. Base: branch name + base SHA of origin/staging you branched from.
2. Verification: confirm/correct each claimed legacy site (actual path:line), and describe the petRecordDisplay locale contract you found (how locale is chosen, what the display object contains).
3. Changes: every file touched, path:line, one line each on what changed.
4. Tests: suite results (pass/fail counts before and after), new/updated test names, typecheck/build result.
5. Open questions / risks: anything ambiguous (especially locale resolution for unauthenticated helper access) or any unrelated failures found.
6. Proposed Round 2: your suggested frontend scope, for the orchestrator to approve or amend.

Do not proceed past this report for any reason.
