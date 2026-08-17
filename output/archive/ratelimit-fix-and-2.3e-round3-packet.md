# PACKET: land the rate-limit test fix + Phase 2.3E Round 3 frontend (paste to the worker; Round 1 standing rules remain in force)

## Rate-limit fix review verdict: APPROVED

Independently verified by the orchestrator:
- Branch/base confirmed (`fix-helper-test-rate-limit-flake-staging` off `bea551bd`), footprint is exactly one test file, +26/-2, **zero production code touched**.
- The 11 `nextTestIp()` calls produce 11 distinct IPs (checked the arithmetic, including the `/255` rollover).
- **Ran the helper suite 3x consecutively: 7/7 pass every time.** That is the decisive evidence, since the old code specifically could not survive repeat runs within the hour. 21 requests through a bucket that previously broke at ~30.
- **Full suite: EXIT CODE 0, 1173 pass / 0 fail.** I checked the exit code explicitly this time, not just the printed pass count.
- Your root cause matches mine exactly, and reproducing against both the broken and fixed states before claiming success was the right method.

Your handling of the second issue was the most valuable part of the report. Rapid back-to-back single-file runs produced symptom-varying failures across unrelated suites that then cleared on their own; you flagged it as unexplained local contention rather than folding it in as solved. **Do not chase it now.** It is recorded. If it recurs outside that diagnostic pattern, it becomes its own investigation.

## Task 1: Land the rate-limit fix (EXPLICITLY AUTHORIZED)

1. Stage exactly `src/__tests__/integration/helper-display-route.test.ts` by name. Never `git add -A`, never `--no-verify`.
2. Commit, e.g. `test(helper): isolate rate-limit buckets per request to fix re-run flake`. The message should make clear this is test-only and explain the shared-bucket cause, since the next person to hit a 429 in a test needs that context.
3. Re-fetch and confirm `origin/staging` is still `bea551bd` before pushing. If it moved, STOP and report rather than rebasing on your own initiative.
4. Push the branch and open a PR against `staging`. Body should cover: the symptom (429s on re-run), the cause (30/hour Redis-backed bucket keyed on `request.ip`, shared by every `app.inject()` in the file, persisting across separate test invocations), the fix, that it is test-only, and the evidence (3x consecutive clean runs, full suite exit 0).
5. Do NOT merge. Do NOT enable auto-merge.

Note in the PR body that this pattern generalizes: **any suite hitting a rate-limited route needs `trustProxy: true` plus a per-request `x-forwarded-for`**, or it will pass on a cold bucket and fail on re-run.

## Task 2: Phase 2.3E Round 3, frontend (pawjai-fe)

Setup: `git fetch origin`, worktree at `/Users/purin/dev/pawjai/pawjai-fe-vet-share-phase23e`, branch `codex/phase-2-3e-vet-share-staging` off fresh `origin/staging`. Report the base SHA.

**Important:** fe PR #287 (2.3D frontend) is still OPEN and unmerged, so `origin/staging` does NOT yet contain 2.3D's frontend changes. Your 2.3E branch will not include them. That is fine -- the two touch different surfaces (chat receipts vs. vet share) -- but do NOT branch off #287's branch, and do NOT touch that PR.

Implement, additive only:

1. **`?lang=<current UI locale>` on the share fetch** (`lib/api/shareService.ts`), so the backend's locale chain and display enrichment actually activate. Same pattern as 2.3C's helper page and 2.3D's chat history. Without this the Round 2 backend work is inert.
2. **Swap legacy-name reads for `resolvePetRecordPresentation`**, the same 2.3B/2.3C/2.3D pattern, in all three places the scout identified:
   - `components/share/RecordCard.tsx:27` (`record.typeNameEn || recordTypeLabels[...]`)
   - `components/share/constants/vetShareStyles.ts:40-65` (`getFrequentSymptoms`, keys on `s.typeNameEn || s.recordType`) -- note this one *groups* by that key, so switching the key changes grouping behavior; make sure it still groups correctly and does not split one concept across two buckets.
   - `components/share/VetShareView.tsx:44` (the PDF's record rows)
   Keep legacy fields as the fallback tier.
3. **Surface the withheld-record count** from Round 2's omission signal. A vet must not read a summary as complete when records were withheld. Keep it non-specific -- a count and a brief explanation, never what was hidden. Follow DESIGN_GUIDE.md; if the right presentation is genuinely ambiguous, implement the most restrained version and flag it rather than inventing a prominent new UI element.
4. **The Thai font fix**: `VetShareView.tsx:91` hardcodes `font-family: Arial, Helvetica, sans-serif` in the PDF's inline style block, none of which cover Thai. The app already loads `Noto Sans Thai` (`app/layout.tsx:94`) and it is tailwind's `font-ui` (`tailwind.config.ts:52`). Add it to that declaration. **Verify the PDF actually renders Thai** rather than assuming -- generate one with Thai content and confirm the glyphs are not boxes or blanks. If you cannot verify it end to end, say so plainly instead of reporting it as done.
5. **PDF string i18n**: the hardcoded English labels throughout `generatePdfHtml` (~27-349) and the `toLocaleDateString("en-US")` at `:32`. Use the repo's existing i18n mechanism; do not invent a parallel one.
6. Verification: `bunx tsc --noEmit`, `bun run lint`, `bun run build`. Extend tests only if an existing harness covers these files.

NO commit for the 2.3E frontend this round. Task 1's commit/push/PR is the only write authorized here.

STOP and report.

## RETURN TO ORCHESTRATOR

1. Rate-limit fix: commit SHA, `git show --stat`, hook result, base-unchanged confirmation, PR URL/number, target branch.
2. 2.3E frontend: base SHA, worktree/branch, every file touched with path:line.
3. Confirmation `?lang=` is sent on the share fetch, and how you get the UI locale there.
4. `getFrequentSymptoms`: what you keyed the grouping on now, and evidence it does not split or merge concepts incorrectly.
5. The withheld-count presentation: what it shows, what it deliberately does not reveal, and where it sits.
6. **Thai PDF rendering: did you verify it end to end, yes or no, and how.**
7. Verification: tsc/lint/build results.
8. Open questions, risks, proposed Round 4.

Do not merge anything. Do not touch fe PR #287 or the 2.3E backend branch. Stop after this report.
