# PHASE 2.3E ROUND 1 PACKET: investigation only, READ-ONLY (paste to the worker; Round 1 standing rules remain in force)

STATUS: Phase 2.3D is code-complete, PRs #259 (be) and #287 (fe) are open and unmerged. Do NOT touch them. Start this round from fresh `origin/staging` in each repo.

**This round is strictly READ-ONLY.** No code changes, no commits, no branches, no worktrees. The deliverable is a findings report. This is the most safety-sensitive phase on the roadmap, so we diagnose completely before writing anything.

## Goal

Phase 2.3E: "Secure and localize vet sharing/PDF." A pet owner can generate a share link for their vet. That surface has two problems: a privacy guard that is never enforced, and English-heavy/legacy-name display.

## What the orchestrator already found (verify, do not re-derive)

`pawjai-be/src/routes/share.ts` (231 lines) serves the vet share:
- The record query (~lines 116-143) selects from `petRecords` left-joined to `petRecordTypes`, filtered ONLY by `petId`, `deletedAt IS NULL`, and a plan-based `cutoffDate`. **There is no `isVetVisible` condition anywhere.** Capped at 100 records.
- Grouping (~lines 146-151) is done in JS *after* the fetch, by `recordType`: `symptoms`, `medications`, `vetVisits`. Activities are excluded here, by category, with an inline comment saying so.
- `isVetVisible` appears NOWHERE in `src/routes/` or `src/services/` -- only in `src/db/concepts/petRecordConcepts.ts` (the concept definitions) and `src/db/concepts/applyBackfill.ts`. It is a defined-but-unenforced flag.
- The query still selects legacy `petRecordTypes.nameEn`/`nameTh`/`iconUrl`, bypassing the Phase 2.3A `petRecordDisplay` machinery that 2.3C and 2.3D now both use.

**Critically: there is no live leak today.** In the seed data, all 8 concepts with `isVetVisible: false` are `type: 'activity'`, and activities are already excluded by the category grouping. The guard is currently redundant. **That is a property of today's data, not a guarantee** -- the moment any `symptom`/`medication`/`vet_visit` concept is marked not-vet-visible (by a seed change, or by the admin concept editor that is roadmap item 4), it silently leaks to vets with no code change and no error.

**USER DECISION: enforce the flag properly.** Treat this as a latent privacy bug to close now, not a hypothetical. Do not argue for deferring it.

## Investigate and report

1. Confirm every claim above against current code, with actual path:line. Correct anything that has drifted.
2. **Verify the "no live leak today" claim against real data, not just the seed file.** Check staging (and production if you can do so read-only and safely) for any concept row where `is_vet_visible = false` AND `type` is in (`symptom`, `medication`, `vet_visit`), and for any `pet_record_types` row linked to such a concept. Report exact counts. If ANY exist, say so loudly at the top of your report -- that would mean a live leak, which changes this from preventive work to an incident.
3. Trace the full vet-share surface end to end. The record list is one consumer; find every other: counts/summaries shown to the vet, the grouping, and the PDF. Where is the PDF generated -- backend, frontend, or client-side print? List every place record data reaches a vet, with path:line.
4. Determine where enforcement belongs so that it covers ALL of those consumers at once. The packet's working assumption is a single filter in the query so counts, grouping, and PDF all inherit it, but verify that is actually true of the code rather than assuming.
5. Work out how enforcement should read `isVetVisible`. Note the subtlety: `pet_records` carries a concept SNAPSHOT (`conceptId` and related columns from the 2026-08 backfill), while `isVetVisible` lives on the concept registry. Report whether the flag should be read live from the concept (so an admin toggling it immediately affects existing shares) or from a snapshot (so historical shares stay stable). **State the trade-off and recommend one; do not implement.** This is the key design decision of the phase and the user will make it.
6. Records whose concept cannot be resolved (legacy, unmatched, `conceptId IS NULL`): what should happen? Consider fail-open vs fail-closed explicitly. For a privacy guard, argue the safer default and say what it would hide.
7. Localization: what the vet share needs to reuse `petRecordDisplay` the way 2.3C/2.3D do, including the locale question -- a vet is a third party like a helper, so look at 2.3C's `resolveHelperDisplayLocale` (`?lang` -> `Accept-Language` -> owner's `preferredLanguage` -> `'th'`) and say whether the same chain fits here.
8. The PDF specifically: what is English-hardcoded, and would localizing it need font work for Thai? Flag any Thai rendering risk early; that can be a hidden cost.
9. Check `pawjai-be/docs` and `pawjai-fe/docs` for existing vet-share docs (`SHARE_WITH_VET.md` was referenced in the 2.3D docs work).
10. Flag anything else you notice on this surface. It is a public, token-authenticated endpoint, so also note anything about token scope, expiry, or rate limiting that looks off -- report only, do not fix.

## RETURN TO ORCHESTRATOR

1. **Live-leak check result first** (item 2), stated plainly: is anything leaking right now, yes or no, with counts.
2. Confirmed findings with path:line.
3. Full vet-share surface map, including where the PDF is generated.
4. Where enforcement belongs, and whether one filter really covers every consumer.
5. Live-vs-snapshot recommendation with the trade-off (item 5).
6. Unresolvable-concept recommendation, fail-open vs fail-closed (item 6).
7. Localization plan and whether the helper locale chain fits.
8. PDF localization assessment including Thai font risk.
9. Docs that need updating.
10. Anything else noticed.
11. Proposed round split (expect backend-enforcement-first, given the privacy sensitivity).

READ-ONLY. No edits, no commits, no branches. Do not touch the open 2.3D PRs. Stop after this report.
