# ROUND 4 PACKET, PHASE 2.3C LANDING (paste to the worker; Round 1 standing rules remain in force)

## Round 3 review verdict: APPROVED

Independently verified by the orchestrator:
- Both branches confirmed exactly 2 commits ahead of their bases, both working trees clean.
- Deploy-ordering assessment CONFIRMED by reading the code myself, both directions. Fe-first: the pre-2.3C `helper.ts` at `5412650` has no query schema on those routes, so an unknown `?lang=` is ignored, and `resolvePetRecordPresentation` falls back `display?.label -> activeLegacyName -> otherLegacyName -> getRecordTypeLabel`. Be-first: `recordDisplayLangQuerySchema` has `lang: z.enum(LANGUAGE_ENUM).optional()` and the old fe never runtime-validates the response, so the extra `display` field is simply unread. Your conclusion of no coupling stands.
- Docs verified: the backend section states the divergence with an explicit "do not simplify this back to the 2.3A three-tier chain" warning, which is exactly what was needed. The fe doc correctly references rather than duplicates it.
- Your self-caught path correction verified: `src/routes/petRecordConcepts.ts` is right; `petRecordConceptCatalog` exists only as a service directory, which is precisely the trap. Good catch.
- Your note on the 2.3B docs precedent is accurate and appreciated; the separate docs commit was the better call regardless.

## Task 1: Push both branches (EXPLICITLY AUTHORIZED)

The user has explicitly authorized pushing BOTH branches to origin and opening BOTH PRs. This authorization covers exactly these actions and nothing further.

1. `pawjai-be`, from `/Users/purin/dev/pawjai/pawjai-be-helper-display-phase23c`: push `phase23c-helper-display-staging` to origin.
2. `pawjai-fe`, from `/Users/purin/dev/pawjai/pawjai-fe-helper-display-phase23c`: push `codex/phase-2-3c-helper-display-staging` to origin.
3. Push these branches only. Do NOT push to `staging`, `main`, or `master` in either repo. Do NOT force-push anything, ever.
4. Before each push, re-fetch and confirm the base has not moved (`5412650b` for be, `bcc4f249` for fe). If either base HAS moved, STOP and report rather than rebasing or merging on your own initiative.

## Task 2: Open both PRs (EXPLICITLY AUTHORIZED)

Open one PR per repo, each targeting that repo's `staging` branch (matching observed practice: PRs #254/#256 in be, #285 in fe).

Each PR body must state:
- What changed: helper-link routes/page now use the Phase 2.3A localized `display` projection.
- That it is purely additive; legacy `nameEn`/`nameTh` are unchanged, so nothing else is affected.
- The helper locale chain and why the owner-preference tier exists (`?lang` -> Accept-Language -> owner's `preferredLanguage` -> `'th'`).
- Deploy ordering: no coupling between the repos, either can ship first, with the one-line reason for each direction.
- Known deferrals: the subtype picker stays on legacy names pending the `NEXT_PUBLIC_PET_RECORD_CONCEPT_CATALOG_ENABLED` rollout, and the pre-existing first-load locale race is untouched and predates 2.3C.
- Test evidence: be full suite 1163 pass / 0 fail; fe tsc/lint/build clean.
- Cross-link the two PRs by URL once both exist.

Do NOT merge either PR. Do NOT enable auto-merge. Merging is a separate decision the user will make.

## Task 3: Worktree cleanup, report only

Do NOT remove anything. Just report: both 2.3C worktrees and any older `pawjai-fe-*` / `pawjai-be-*` sibling worktrees whose branches are already merged and could be pruned later. The user has a lot of stale ones; a list is useful, action is not authorized.

## RETURN TO ORCHESTRATOR

1. Push: confirmation per repo, base-unchanged check result, and the remote branch name.
2. PRs: both URLs and numbers, target branch confirmed as `staging` for each.
3. Cleanup candidates: the list from Task 3.
4. Anything unexpected.

Stop after this report. Do not merge, do not proceed to Phase 2.3D.
