# ROUND 3 PACKET (paste to the worker agent; all Round 1 standing rules remain in force)

## Round 2 review verdict: APPROVED

The orchestrator independently verified everything you reported:
- Backend commit `70139901d8d2b3c364ccef709318990926d6576d` confirmed: exactly the two intended files, working tree clean afterward, hook passed, no push.
- Fe worktree confirmed on `codex/phase-2-3c-helper-display-staging` off `bcc4f249` with only the two intended files modified.
- `HistoricalRecordIcon` confirmed as the genuine Phase 2.3B shared component (4 existing owner-side usages); your props match its interface, and `size={20}` + `w-5 h-5 text-orange-600` matches `petRecordDeleteDialog.tsx`'s mobile convention. Good call using the shared component over a raw Image.
- Your locale-race claim independently confirmed PRE-EXISTING: base revision `origin/staging` already had deps `[token, setLocale]` while reading `locale` in the effect closure. You did not introduce it.
- Re-ran all gates myself: `tsc --noEmit` 0 errors, `bun run lint` 0 errors with no findings in either touched file, `bun run build` clean with `/helper/[token]` compiling.

Your three flagged items are all resolved and need no action: the locale race stays as-is (pre-existing, out of scope), the `recordType` narrowing to `PetRecordType` stays bundled (it is a direct requirement of `resolvePetRecordPresentation`'s input type, not unrelated drift), and the icon addition is accepted as a deliberate improvement.

## User decision on the subtype picker: DEFER

The subtype picker stays on legacy `nameEn`/`nameTh`. It will ride on whatever resolves the `NEXT_PUBLIC_PET_RECORD_CONCEPT_CATALOG_ENABLED` rollout, so we do not build a second catalog integration that gets discarded when that flag flips on. Do NOT touch the picker this round. Your investigation was correct and is what drove this decision.

## Task 1: Frontend commit (EXPLICITLY AUTHORIZED, this round only)

The user has explicitly authorized ONE commit in `/Users/purin/dev/pawjai/pawjai-fe-helper-display-phase23c` on branch `codex/phase-2-3c-helper-display-staging`. Commit only. Push is NOT authorized. PR is NOT authorized. Do not push the backend commit either.

1. Stage EXACTLY these two files by name (never `git add -A`):
   - `lib/api/helperService.ts`
   - `app/helper/[token]/page.tsx`
2. Commit following repo convention, e.g. `feat(helper): localize helper history using record display`. Never `--no-verify`; if a hook blocks, stop and report.
3. Confirm `git status` is clean afterward and no other file was swept in.

## Task 2: Documentation (same commit or a second commit, your judgment)

Phase 2.3A and 2.3B each shipped a docs commit ("document localized record display projection"). Match that precedent for 2.3C:

1. Find the existing record-display docs in both repos (`pawjai-be/docs`, `pawjai-fe/docs`) that 2.3A/2.3B wrote or updated.
2. Update them additively to document the 2.3C helper surface. Cover specifically:
   - The helper endpoints now return `display` alongside unchanged legacy `nameEn`/`nameTh`.
   - The helper locale chain and how it DIFFERS from the owner-facing chain: `?lang` -> Accept-Language -> pet owner's `userConfig.preferredLanguage` -> `'th'`. State plainly why the owner-preference tier exists (the helper is a third party with no session of their own, so the owner's language is the best available signal). This is the single most important thing to write down, because it is a deliberate divergence someone will otherwise "fix" later.
   - That the helper subtype picker is still on legacy names by decision, pending the concept-catalog flag rollout. Note the catalog endpoint already exists and is public.
3. Keep it factual and short. Do not restate the whole 2.3A contract; link or reference it.
4. Docs may be committed (this authorization covers docs files in both repos, named explicitly when staging). Still no push.

## Task 3: Round 4 prep, report only, DO NOT EXECUTE

The user will decide pushes and PRs separately. Gather the facts they need:
1. For each repo, state the exact branch, commit SHA(s), and the base each branch will target.
2. Check each repo's CONTRIBUTING/CLAUDE.md/docs for the documented staging PR convention, and report what it says (do not act on it).
3. Note any deploy-ordering constraint between the two repos. In particular: state explicitly whether the fe change is safe if it deploys BEFORE the backend (the fallback chain suggests yes, but verify by reading the code rather than assuming), and whether the backend is safe deploying alone ahead of fe.

STOP after Task 3 and report.

## RETURN TO ORCHESTRATOR (report format)

1. Fe commit: SHA, `git show --stat`, hook result, clean-tree confirmation.
2. Docs: files touched, one line each on what you added, and the commit SHA(s) if committed separately.
3. Round 4 prep: the branch/SHA/base table, each repo's PR convention as documented, and your deploy-ordering assessment with the code evidence behind it.
4. Anything you found that contradicts this packet.

Do not push, do not open PRs, do not proceed past this report.
