# Orchestrator handoff — Pawjai

**Written:** 2026-08-16, by the Claude orchestrator session ending its run.
**For:** whichever agent takes the orchestrator seat next. The user relays packets between orchestrator and worker agents and holds ALL release authority.
**Companion docs:** `output/CODEX_HANDOFF_AUDIT.md` (the full audit trail through item 5), the round packets in `output/`, and the memory files under the Claude project memory (index: MEMORY.md).

---

## The protocol you are inheriting (non-negotiable)

1. **Rounds.** Work proceeds in numbered rounds: implement → orchestrator verifies → commit → push/PR — each state-changing step needs FRESH explicit authorization in that round's packet. Prior approval never carries forward. Hard stops are honored; never chain into the "obviously next" step.
2. **Verify everything yourself.** Worker reports are never accepted on faith: re-run the full test suite (check the PROCESS EXIT CODE, not the printed tally — a printed "0 fail" has masked a non-zero exit in pawjai-be before), re-run tsc/build, read the diff line-by-line, confirm SHAs/parents/stats/clean-tree/branch-not-on-remote after commits.
3. **Git hygiene.** Exact-file staging by name only. Never `git add -A`. Never `--no-verify`. If a hook blocks, stop and report its message verbatim.
4. **Secrets.** Env files are process input only — never cat/grep/print them, never unscoped `railway variables`. Tests in pawjai-be run as `bun --env-file=/Users/purin/dev/pawjai/pawjai-be/.env.local run test` (Docker throwaway DB; bare `bun test` fails ~450 suites on module init).
5. **No schema changes ad hoc.** Migrations go through `db:generate` with explicit user action, idempotency added by hand, committed WITH the schema change.
6. **Shell discipline.** Working directory persists between Bash calls — ALWAYS `cd` explicitly per command block. Two audit mistakes this session came from cwd carryover (fe counts measured inside the be repo).
7. **pawjai-admin rule:** `bun run build` before any commit (it is the type gate). Lint there is broken for a subtler reason than first recorded: `.eslintrc.json` EXISTS (legacy format, since 2025-11) but ESLint v9 requires flat config, so the tooling can't consume it — `bun run lint` fails repo-wide regardless of your changes. (Two agents and the orchestrator each got this half-wrong; the full truth took three passes.)
8. **zsh gotcha:** unquoted `$VAR` does not word-split — pass path lists explicitly.
9. **RUNTIME GATE.** Any change rendered on an always-mounted surface (dashboard, layout, providers, quick-log) requires a runtime pass in a real browser before release. Three green static gates (tsc/lint/build) shipped a total dashboard outage on 2026-08-18 — they cannot see `useSyncExternalStore` contract violations. Before signing off a PR touching an always-mounted component or hook, either get a real browser/Playwright pass or explicitly flag in the packet that none was done and why.

## Release mechanics learned the hard way (do not re-derive)

- **Twin-PR history:** both be and fe historically released features to prod via twin PRs (same logical change, different commits on each branch). Consequence: staging→prod merges CONFLICT on every twin-touched file. The proven cure when the release intent is "prod becomes exactly staging": verify staging supersedes prod content, then `git merge -s ours origin/<prod-branch>` on staging (tree stays byte-identical to staging — verify `git diff origin/staging HEAD` is 0), push, and the release PR becomes clean. NEVER hand-resolve or trust auto-merge of twin variants — interleaving risk. Done for be as `4e01f3c`; be histories are now joined, future be merges clean.
- **Superset verification technique:** for each conflicted file, `git rev-parse origin/<prod>:<file>` → `git log origin/staging --find-object=<blob> -1 -- <file>`. A hit proves prod's version is an earlier state of staging's. Files failing only due to prettier formatting (the #290 promotion formatted ~40 marketing files) need formatting-insensitive comparison instead.
- **Bunny CDN 403s all CLI probes** (any UA/referer). Do not conclude assets are missing from curl. Verify in a browser.
- **The double-squash lesson (2026-08-17).** GitHub's merge button defaults to the repo's *last-used* method, not a fixed default — fe squash-merged the original release PR #293 (destroying the `-s ours` join), and then, despite the follow-up PR #296's body explicitly stating "Create a merge commit, NOT squash," the button defaulted to squash again and did. A dropdown instruction in a PR body does not survive a human clicking the wrong button on a repo whose last click was squash. **Fixed by joining on main's side this time**: `git merge -s ours` was NOT repeated — instead a real two-parent merge commit was made directly (`9d753eb`, parents = fe's squashed `4390b4e` + staging's prior join `0ebb644`), tree-hash-verified identical to pre-join `main`, pushed to both `main` and `staging` so they share one head. **Standing rule going forward: release merges to prod are local merge commits made and pushed directly by the orchestrator/worker — a PR may still exist for review visibility, but its merge button is never used to land the release.** This removes the failure mode entirely rather than re-fighting it every release.
- **Two tooling traps for the trap list:**
  - `bunx tsc --noEmit` in pawjai-fe resolves a stray, newer standalone TypeScript rather than the repo's pinned version, and errors on this repo's `tsconfig.json` (`baseUrl`/paths options) with TS5102/TS5090 — unrelated to whatever you changed. Use `./node_modules/.bin/tsc --noEmit` instead; that is what "tsc" means in this repo's context.
  - **Stale local branch refs after user-side merges.** A local branch (e.g. `master`) left checked out from before a merge lands on GitHub does not auto-update — `git checkout <stale-local-branch> -- <path>` will silently pull OLD content into your working tree/index even though `origin/<branch>` has the merge. Caught mid-Phase-D-triage this session: a stale local `master` briefly reverted 5 already-fixed doc files during a `git checkout master -- .`, caught via `git status`, fixed with `git checkout HEAD -- .` then `git branch -f master origin/master`. Rule: always `git fetch` + compare against `origin/*`, and prefer `git checkout <sha-or-origin/branch> -- <path>` over a bare local branch name, before any checkout that reads from a local branch ref.
  - **Zustand v5 selector-stability trap.** `useStore` passes the selector straight to React's `useSyncExternalStore`, which requires `getSnapshot` to return a referentially stable value between calls — no built-in memoization. A selector like `state.someMethod(arg)` that internally does `record[key] ?? []` (or `?? {}`, `?? []`, any inline default) allocates a fresh reference on every snapshot whenever the key is absent, which is exactly the "no data yet" / first-time-user case. That triggers a synchronous re-render loop ("Maximum update depth exceeded"), invisible to tsc/lint/build. Fix pattern: select the raw stable container object/primitive from state, derive the per-key value OUTSIDE the subscription with a module-level empty constant as the fallback (never allocate inside the selector). `useShallow` from `zustand/react/shallow` is the general-purpose remedy when the selector must return a derived object/array shape; selecting the stable container + deriving outside is the tighter fix when the allocation can be avoided entirely. Incident: item 6 fe #297/`8ee8c66`, fixed in fe #298/`4bf2762`.

---

## Verified state as of 2026-08-17 (every line checked against git/gh this session)

| Repo | Prod | Staging | Delta | Version | Tag |
|---|---|---|---|---|---|
| pawjai-be | `b42c14af` (master) | `b42c14af` (synced) | 0/0 | 1.8.0 follow-up (docs only) | `v1.8.0` stays at `ab8e022` — no bump, no new tag |
| pawjai-fe | `8ee8c66` (main == staging, fast-forwarded 2026-08-18 with item 6) | `8ee8c66` | 0/0 | 1.8.0 (item 6 shipped under the same umbrella, user's call) | `v1.8.0` stays at `62a95bb` — no bump, no new tag |
| pawjai-admin | `0296e2f5` (master) | `0296e2f5` (synced) | 0/0 | 1.8.0 follow-up (docs only) | no tag scheme in this repo |
| parent | `5105ab9` bumped all three submodule pointers | — | 0 | — | — |

- **v1.8.0 base release is LIVE** (unchanged from 2026-08-16): be phases 2.3C/D/E, item 5, item 4 backend, DeepSeek routing, Stripe cancellation, chat-image lifecycle; fe rebrand + same phases; admin concept editor UI (#35→#36). Zero migrations shipped in the base release.
- **v1.8.0 follow-up is LIVE** (2026-08-17, no version bump — ships under the same 1.8.0 umbrella): vet-share page now fully localized (6 remaining English strings fixed, fe PR #295→#296), plus doc corrections across all three repos (be #265→#266, fe #294→#296, admin #37→#38).
- **fe history was squash-merged TWICE** (PR #293 then PR #296) despite instructions both times — see "The double-squash lesson" above. Fixed by a direct merge commit on main (`9d753eb`), not by re-fighting the PR button a third time. `main` and `staging` now share one head.
- Admin's concept editor UI is still only build-verified — no human has clicked it against a live backend yet.
- No open PRs anywhere.

## The in-flight plan — CLOSED

Both the base v1.8.0 release (2026-08-16) and its follow-up (2026-08-17, vet-share i18n + doc corrections) are done. See "Verified state" above.

**Post-deploy verification:**
- be prod `/health` → confirmed ok + `pendingMigrations: []` (2026-08-17, post-follow-up).
- fe prod: CLI probes return 307 (not the previously-assumed 403 WAF block) — inconclusive either way from curl. **USER, ~15 min, still never done on a real deployment:** vet share link → export PDF → Thai renders as text not boxes (the page should now be FULLY Thai, not just mostly); open a chat receipt in both languages.
- Admin click-through: `/admin/settings/concepts` loads, one harmless sortOrder edit round-trips, non-super_admin sees read-only.
- Rollback stance: no migrations → revert the merge commit per repo independently; all mixed be/fe states verified safe.

## Open items beyond the release (owner in bold)

| Item | State |
|---|---|
| **Rotate 3 keys** (**user**) | Supabase `service_role` sits in untracked `test.sh` at parent root (now gitignored per parent commit `1616c35`); admin JWT + APNs exposed 2026-08-09. ZERO rotations ever confirmed. Oldest risk on the board. |
| Daily 30-record limit (**user** decision) | Brief at `output/daily-record-limit-decision-brief.md`. Recommended: run the read-only usage query first (pet/day pairs ≥25 by type/tier — needs user auth), then option A or D. Blocks item 7. |
| Share-token revocation (**user+**) | Brief at `output/share-token-gaps-decision-brief.md`. Product decision before any code. |
| Vet-share i18n cleanup | **Done 2026-08-17.** All 6 remaining English strings localized (fe PR #295→staging→#296→prod). Helper first-load locale race is a separate, known, pre-existing issue — not folded in. |
| Roadmap item 6: progressive logger | **v1 relanded 2026-08-18** after a same-day incident: PR #297 (`8ee8c66`) shipped to fe `main`/`staging`, crashed the prod dashboard for all users (Zustand selector-stability trap — see traps list above), reverted (`07be528`), fixed, and relanded via PR #298 (`4bf2762`, squash-merged as `9ea74e1`) with an independent adversarial review + real-browser (Playwright) runtime repro of both the crash and the fix. `main` and `staging` both at `9ea74e1`; parent gitlink bumped to match (`47d6949`). Fast-follows unchanged, in `output/item6-progressive-logger-plan.md` §8 (now includes this incident as a repo-wide lesson): remaining TimelineList consumers, be-side reciprocal mirror comment, possible getRecentIdentities endpoint. Item 7 (care foundation) stays PARKED pending a product discussion. |
| Icon fidelity | The 31 broken Figma URLs were replaced with lucide/CDN stand-ins (#291/#292, merged). If the designer re-exports real assets, swap them in. |
| Worktree cleanup | **Fully done.** 2026-08-16: 11 merged/clean worktrees removed (5 be, 5 fe, 1 admin). 2026-08-17: the 4 preserved be `.claude/worktrees/` dirs (`agent-ae737a77`, `agent-a7aaa262`, `agent-ab615ced`, `agent-af87cfa9`) were triaged and **discarded** — all four were independently reimplemented on mainline months ago (timezone columns via a different `0107` migration, the notifications partial index, the chat-messages unique constraint, and the offer_events purge job all already ship on master with no shared commit ancestry to these worktrees). Nothing left outstanding here. |
| Codex returns ~week of 2026-08-17 | Hand it `output/CODEX_HANDOFF_AUDIT.md`. Everything Claude-period was reviewed by Claude only — that is the reviewer-independence caveat Codex must weigh. |
| Concept editor v2 scope (deferred from item 4, shipped v1) | Concept creation + new-key validation; `fieldSchema` editor (blocked on dynamic-forms design); translation deletion; species-variant creation beyond existing admin lookupTypes. Carried forward from `output/item4-admin-concept-editor-plan.md` before it was archived. |
| **Ad-hoc: timeline & /pet viewing UX** (added 2026-08-18, user request) | Reading surface hasn't kept pace with the write-side wins (item 6 + chat-write): timeline (`components/timeline/TimelineView.tsx` + `components/petLog/*`) and pet detail (`app/pet/[id]/PetDetailClient.tsx`) under review for readability, per-persona findability (single-pet free / premium / multi-pet), and vet-visit prep. Multi-agent study (3 Sonnet personas + 4 Opus experts) COMPLETE 2026-08-18; full plan with quadrant scoreboard, 14 confirmed defects, and 4 phases at `output/timeline-pet-improvement-plan-2026-08-18.md` (scope narrowed by user to the two pages only; vet-share/paywall findings parked in its Appendix B, incl. one SAFETY item: `vibe` mislabeled as Severity on the vet-share screen). Sits ahead of parked item 7. Phase 1/2 have explicit user decision points; Phase 0 is shippable without design input. |

## Where knowledge lives

- **Memory** (auto-loaded per session): protocol = `feedback_codex_orchestrator_protocol`; per-project state = `project_pawjai_item5_metadata_integrity`, `project_pawjai_item4_concept_editor`, `project_pawjai_release_1_8_0_scope`, `project_pawjai_public_pages_promotion`, `project_pawjai_broken_marketing_icons`, plus the secrets/env/release-flow feedback entries.
- **Packets & briefs:** current/actionable ones live at the top of `output/`; completed-round packet history for merged-and-released work is archived under `output/archive/`. The round-packet format is the contract with worker agents; keep using it verbatim (numbered scope, standing rules restated every round, explicit report-back fields, hard stop).
- **Status page for the user:** claude.ai artifact "Pawjai — What We Did" (session of 2026-08-16). Update or supersede rather than letting it go stale — stale status pages caused the "6 PRs" scope error this session had to correct.

One habit above all: **when a report and the repo disagree, the repo wins.** Every error caught this session — the 82-vs-6 scope gap, the fe-count mismeasurement, the localhost URLs, the twin-PR conflicts — was caught by re-checking primary sources, not by reading reports more carefully.
