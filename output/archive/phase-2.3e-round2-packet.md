# PHASE 2.3E ROUND 2 PACKET: backend enforcement + localization (paste to the worker; Round 1 standing rules remain in force)

## Round 1 review verdict: APPROVED, and your correction is accepted

Independently verified by the orchestrator:
- **Your correction to my claim is right and I have adopted it.** `isVetVisible` DOES appear in `src/services/petRecordConceptCatalog/catalogService.ts:18,45` and `resolution.ts:21,51,216` -- I checked. It is a passthrough type field and select projection, never a filter, so the conclusion (unenforced everywhere) stands, but my "appears NOWHERE in src/services" was wrong. Correcting the orchestrator rather than quietly working around a false premise is exactly right; keep doing it.
- PDF findings verified: `VetShareView.tsx:91` really does hardcode `font-family: Arial, Helvetica, sans-serif`, and `:32` hardcodes `toLocaleDateString("en-US")`. I also confirmed the other half of your analysis: `Noto Sans Thai` is loaded globally (`app/layout.tsx:94`) and is tailwind's `font-ui` (`tailwind.config.ts:52`), so Thai currently renders only via unreliable browser fallback. Your read that rasterization avoids font-embedding work is correct and materially de-risks the phase.
- Surface map accepted: one backend filter covering all five consumers, verified by your tracing.
- Your honesty about the live-leak check's scope limit was the most valuable part of the report. Handling the DB-access blocker by flagging it instead of working around it, and specifically NOT rendering the connection string, was correct.

## USER DECISIONS (all three explicit, these are now the spec)

1. **LIVE from the concept registry.** Join to `pet_record_type_concepts` at read time and filter on the current `isVetVisible`. An admin toggle applies immediately to every existing share link. No schema change, no new snapshot column. Your recommendation was accepted with your reasoning.
2. **FAIL CLOSED, WITH AN OMISSION SIGNAL.** A clinical record whose concept cannot be resolved is hidden from the vet, AND the response must carry a signal that something was withheld. Do not let the vet see a summary that looks complete when it is not. Design the signal per the constraints below.
3. **The live-data gap is CLOSED. Result: clean on both staging and production.** The user ran the full-table read-only query personally (direct table access, so it covers INACTIVE concepts too -- the exact gap your public-API check could not reach). All three queries returned zero rows on both environments:
   - Zero not-vet-visible clinical concepts have any records attached. **No live leak; this phase is confirmed preventive work, not incident response.**
   - Zero clinical concepts are marked not-vet-visible at all, active or inactive.
   - **Zero unresolvable clinical records (`conceptId IS NULL`) on either environment.** This one matters for your implementation: the fail-closed rule will hide *nothing* today, so there is no risk of it silently removing records vets currently rely on. Build it anyway -- it is the guard for future data, and the omission signal still needs to be correct -- but you can implement it without worrying that you are degrading today's clinical summaries.

   Do NOT attempt DB access yourself and do not re-run this check; it is settled.

## Scope: pawjai-be only. Frontend is Round 3.

Setup: `git fetch origin`, worktree at `/Users/purin/dev/pawjai/pawjai-be-vet-share-phase23e`, branch `phase23e-vet-share-staging` off fresh `origin/staging`. Report the base SHA. Do NOT touch the open 2.3D PRs (#259, #287) or their branches.

1. **Enforce `isVetVisible`** in `src/routes/share.ts`'s record query (~117-142), before the grouping (~148-152). Add `conceptId` to the select (currently absent), join to `pet_record_type_concepts`, and exclude clinical records whose concept has `isVetVisible = false`.
   - Activities are already excluded by category; do not change that behavior or make it depend on the new filter.
   - Verify the counts at ~200-204 inherit the filter rather than being computed from a separate unfiltered source.
2. **Fail-closed handling.** Clinical records with an unresolvable concept (`conceptId IS NULL`, or a concept row that no longer exists) are excluded.
   - **Omission signal:** add a count of withheld records to the response, in a location consistent with this repo's API contract (domain metadata belongs inside `data`, never in root `meta` -- see CLAUDE.md). It must be non-specific: a count, never the names, types, or ids of what was hidden, since leaking *what* was withheld partially defeats the guard. Distinguishing "hidden because not-vet-visible" from "hidden because unresolvable" in the count is your call; argue whichever you choose.
   - Also log it server-side so this cannot become an invisible, undiagnosable gap.
3. **Localization.** Add `conceptId` (from step 1) and wire `enrichRecordsWithDisplay`, the same batched read-path tool 2.3D used. Reuse the helper locale chain (`?lang` -> `Accept-Language` -> owner's `preferredLanguage` -> `'th'`); `share.ts` already has `ownerId` from the token payload (~53) and already queries by it (~83), so this is an extension of an existing pattern. `resolveHelperDisplayLocale` is currently private to `helper.ts`: either export/share it or copy it. Your call, but state which and why -- note that `petRecord.ts` and `helper.ts` already deliberately keep two separate chains, so duplication is defensible here.
4. **Tests. This surface has NO test coverage at all today, which is the real risk.** Cover at minimum: a not-vet-visible clinical record is excluded; a vet-visible one is included; an unresolvable-concept clinical record is excluded and counted; activities remain excluded regardless; the omission count is correct and leaks no identifying detail; localized display resolves; and the counts/grouping reflect the filtered set. Treat this as the phase's primary deliverable alongside the filter itself.
5. Run the full backend suite (`bun --env-file=/Users/purin/dev/pawjai/pawjai-be/.env.local run test`), `bunx tsc --noEmit`, `bun run build:ts`.

Constraints: no schema changes, no migrations, additive only. Do not fix the pre-existing gaps you found (no link revocation, JWT bypassing the DB) -- they are recorded and out of scope. No commit this round.

STOP after step 5 and report.

## RETURN TO ORCHESTRATOR

1. Base SHA, worktree/branch.
2. Changes: every file, path:line, one line each.
3. The exact SQL shape of the enforcement (the join and its conditions), and confirmation that counts and grouping both inherit it.
4. Your omission-signal design: where it sits in the response, what it does and does not reveal, and why.
5. Locale-chain decision (shared vs copied) and why.
6. Tests: names, what each proves, suite results before/after, tsc/build results.
7. Open questions, risks, proposed Round 3 (frontend) scope.

No commit, no push, no PR. Do not touch the frontend or the 2.3D PRs. Stop after this report.
