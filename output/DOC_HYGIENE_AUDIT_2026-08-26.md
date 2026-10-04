---
type: HANDOFF
status: active
scope: pawjai docs (output/, pawjai-be, pawjai-fe, pawjai-admin)
last_reviewed: 2026-08-26
superseded_by: null
---

# Doc hygiene audit — 2026-08-26

Scope: `output/` (audited + archived) and `pawjai-be/docs`, `pawjai-fe/docs`, `pawjai-admin/docs`
(audited, report-only, no changes applied — approval needed before any move/edit).

---

## Act on this first: live credential exposure

`pawjai-be/docs/technical/ops/ADMIN_CREDENTIALS.md` contains a plaintext admin password in a
git-tracked file:

- Account: the `super_admin` admin account (bypasses all granular permission checks)
- Password: stored in plaintext in the file — value redacted here; see the file itself
- Created: 2025-11-10, still current as of this audit

This is not a doc-hygiene issue and scrubbing the file will not fix it — the value is already in
git history. The only remedy is rotating the password. This is now the third unrotated secret on
record alongside the Supabase service_role key already tracked from the record-concepts project.
Recommend rotating immediately and only then deciding whether the doc itself should stop storing
the literal password (point at the password manager instead).

---

## output/ — audited and archived

Four files moved to `output/archive/` (high confidence, self-declared complete, confirmed against
memory and cross-checked against the two live round-2 Codex reports for citations, none found):

- `ORCHESTRATOR_REPORT_chat_write_repair.md` — headline claimed the fix was "inert in every
  environment"; both dry-run rollout files postdate it and the rollout was applied, dead card
  wiring resolved (PR #324), Gemini empty-STOP fixed (PR #288), submodules at v1.9.0.
- `PROD_ROLLOUT_DRYRUN_2026-08-23.txt` — catalog rollout confirmed live on prod 2026-08-23.
- `STAGING_ROLLOUT_DRYRUN_2026-08-23.txt` — staging rollout confirmed applied.
- `vet-share-i18n-cleanup-packet.md` — ORCHESTRATOR_HANDOFF.md states this was done 2026-08-17.

Also archived (2026-08-26, follow-up pass):

- `phase-2.3e-leak-check.sql` — moved to `archive/`, path in its own header comment updated to
  `archive/phase-2.3e-leak-check.sql` so the documented rerun command stays correct, and a
  "COMPLETED" note added recording the clean result on both envs.

Corrected in place (2026-08-26, follow-up pass):

- `ORCHESTRATOR_HANDOFF.md` — added a superseded-notice above the 2026-08-17 version table
  pointing at the v1.9.0 release (parent `7112e18`, memory `project_pawjai_release_1_9_0`)
  instead of silently rewriting the frozen table's SHAs.

Kept, still active:

- `CODEX_REPAIR_REPORT_round2.md`, `CODEX_REPORT_deepseek_chat_stabilization.md` — in-flight,
  uncommitted DeepSeek stabilization round, dated today.
- `daily-record-limit-decision-brief.md`, `share-token-gaps-decision-brief.md` — still correctly
  unmarked. `pricing-model-prep-round1-packet.md` claims both were "settled" 2026-08-16, but its
  own header says that packet was deliberately never relayed to you (you wanted smaller items
  finished first), so the standalone briefs staying un-marked is consistent, not a contradiction.
  Note: the packet's own re-confirm trigger ("re-confirm if significant time has passed") is
  arguably tripped at ten days elapsed — worth a check if you pick this back up.
- `item6-progressive-logger-plan.md` — active, fast-follows still queued.
- `CODEX_HANDOFF_AUDIT.md` — last touched 2026-08-18; two rounds of Codex work have happened
  since without updating it, and Codex is now active again. Currency is a live question.
- `timeline-pet-improvement-plan-2026-08-18.md` — active, Phase 0 runnable, Phases 1/2 await
  decisions.
- `archive/` (16 files) — spot-checked, all correctly archived, nothing needs restoring.

---

## pawjai-be/docs (49 files, report-only)

0/49 files carry freshness frontmatter. Coverage note: business/ (15 files) and most of
technical/ (10 files) were accepted on a uniform 2026-08-07 batch-commit date without individual
re-verification against source — LOW confidence, listed as KEEP by default rather than confirmed.
Substantively verified against code: roughly 12 files, not the full 49.

**Dead reference found and not yet fixed:** `pawjai-be/CLAUDE.md:183` points to
`docs/PRICING_GUIDE.md`, which does not exist. The real pricing docs are `CURRENT_PRICING.md` and
`technical/api/PRICING.md`. This matches the "fix CLAUDE.md doc defect" item already open from
the record-concepts project. One-line fix, drafted but not yet applied — held pending your
approval since it's inside a submodule mid an active Codex round.

**Index drift:** `docs/README.md` omits all 7 `planning/*` files, both `future-improvement/*`
files, `technical/CHAT_RECEIPTS.md`, `technical/LOCALIZATION_REFACTOR.md`, and
`technical/ops/ADMIN_CREDENTIALS.md` — the same credentials file above. An unindexed ops doc is
plausibly why the exposed password went unnoticed this long.

Recommended ARCHIVE (self-declared superseded/complete, matches CLAUDE.md-documented current
architecture):
- `planning/NEXT_SESSION_HANDOFF.md` — dated 2026-08-07, one section self-flagged "Superseded
  (2026-08-16)"; router now has DeepSeek-gated chat routing this doc doesn't describe.
- `planning/llm-provider-migration.md` — self-declares `Status: Superseded`.
- `planning/chat-image-deletion.md` — self-declares "Implemented," confirmed live in CLAUDE.md.

Recommended REVIEW_REQUIRED:
- `technical/ops/ADMIN_CREDENTIALS.md` — see top of report.
- `docs/CURRENT_PRICING.md` — 6.5 months stale, asserts specific Stripe price IDs; prices are
  DB-backed per CLAUDE.md, needs a human/admin-panel check rather than a code grep.
- `planning/support-android.md` — last touched 2026-03-28, predates the android app scaffold;
  verify against current plan before deciding.

Kept, verified against source (higher confidence):
- `technical/SHARE_WITH_VET.md` — `isVetVisible` fail-closed join in `src/routes/share.ts`
  matches the doc including comments.
- `technical/api/PRICING.md` — `/pricing` route confirmed live.
- `technical/CHAT_RECEIPTS.md`, `technical/database/LOOKUP_TYPES.md` — recent (08-14), aligns
  with known-live chat subtype/receipt work.

## pawjai-fe/docs (20 files, report-only)

0/20 files carry freshness frontmatter.

**Broken canonical-doc links, HIGH confidence:** `docs/README.md`, `docs/business/README.md`,
and `docs/technical/README.md` all link to `docs/business/DESIGN_PRINCIPLES.md` and
`docs/technical/DESIGN_SYSTEM.md` (12 references across the three index files) — neither exists
at those paths. The real, current design guide lives at `pawjai-fe/DESIGN_GUIDE.md` (repo root,
283 lines, references a `MIGRATION_GUIDE.md` for how-to-change guidance), not inside `docs/` at
all. This is the doc your global CLAUDE.md instruction points at for pawjai-client design-guideline
compliance, so every one of those 12 links currently 404s for anyone who follows the docs index.
Recommend fixing the links to point at `../DESIGN_GUIDE.md` rather than recreating the content
inside `docs/`.

**Duplicate:** `API_STANDARDIZATION_REPORT.md` is a byte-for-byte duplicate of the pawjai-admin
copy (same "Generated: 2026-02-19" date, identical table), all 4 phases marked Complete.
Recommend archiving one copy and keeping a single canonical owner — same self-contradiction
flagged in the admin copy above (Phase 3 admin auto-unwrap claim) applies to this copy too.

**Stale claim:** `weight-unit-improvement-plan.md`'s "Problems" section claims `formatWeight()`
defaults to 2 decimal places; current source (`decimals: number = 1`) shows this already shipped
at 1. Part of the plan is done and the doc wasn't updated to reflect it.

**Completed, recommend ARCHIVE:** `technical/PRICING_PAGES_OPTIMIZATION.md` — self-marked
"Status: Completed," a one-time refactor record.

**Near-duplicate scope, recommend MERGE:** `technical/IOS_EXTERNAL_LINKS.md` and
`technical/EXTERNAL_DOMAINS_MANAGEMENT.md` have near-identical architecture diagrams.

Kept, verified against source: `CACHE_INVALIDATION_GUIDE.md`, `technical/
MOBILE_SESSION_FIX_IMPLEMENTATION.md`, `technical/HIDE_SUBSCRIPTION_FEATURES_IOS.md`, `technical/
PET_RECORD_DISPLAY.md` — all confirmed against current source with no contradiction.

## pawjai-admin/docs (10 files, report-only)

0/10 files carry freshness frontmatter.

**Direct contradiction, HIGH confidence:** `business/FUTURE_FEATURES.md` lists "Advanced
Permissions — Not Building ❌," but `app/admin/settings/permissions/page.tsx` is a fully built
granular permission-management UI (10 permission types across 5 categories). Stakeholder-facing
and actively misleading if read today. Also: Phase 4 "Advanced Analytics" is largely already
shipped (breeds/subscriptions/offers/notifications/followup/demographics analytics pages exist),
though Phase 6 offer-creation/discount-code CRUD genuinely is not built yet.

**Self-contradiction:** `API_STANDARDIZATION_REPORT.md` claims in its status table that "Phase 3:
Admin auto-unwrap" is Complete, but its own body text says the admin client "does NOT
auto-unwrap." Source (`lib/api/client.ts:83-86`) confirms it DOES auto-unwrap by default — the
body text is the stale part. This file is also duplicated near-verbatim in `pawjai-fe/docs`;
recommend picking one canonical owner once the fe audit is in.

**Index gap:** `README.md` omits `BREED_MANAGEMENT.md`, `featured-blog-management-plan.md`, and
`API_STANDARDIZATION_REPORT.md`.

**Partially shipped:** `featured-blog-management-plan.md` — featured-count-by-locale is built
(`app/admin/content/blog/page.tsx:41-47`); ordering/bulk-limit enforcement is not. Not a
completed plan, needs the shipped parts struck rather than a full archive.

Kept, verified against source: `business/DASHBOARD.md`, `business/ADMIN_MANAGEMENT.md` (roles
match `adminManagementService.ts:7` exactly), `business/USER_MANAGEMENT.md`,
`business/SUBSCRIPTIONS.md` (no password-policy contradiction — admin min-length-5 decision not
referenced here, nothing to flag).

---

## What's authorized vs. what's waiting

Applied: the four `output/` archive moves above.

Waiting on your go-ahead (all three submodules have uncommitted changes from an active Codex
round in progress, per `git status` on the parent repo — did not want to interleave doc edits
with that):
- Rotate the admin password (independent of everything else, do this regardless).
- Fix `pawjai-be/CLAUDE.md:183`'s dead `PRICING_GUIDE.md` reference.
- Archive the three `pawjai-be/docs/planning/*` files listed above.
- Correct `business/FUTURE_FEATURES.md` in pawjai-admin.
- Fix the `API_STANDARDIZATION_REPORT.md` self-contradiction and de-duplicate the fe/admin copy.
- Fix the 12 broken `DESIGN_PRINCIPLES.md`/`DESIGN_SYSTEM.md` links across three pawjai-fe
  README index files to point at the real `pawjai-fe/DESIGN_GUIDE.md`.
- Backfill README indexes in `pawjai-be/docs`, `pawjai-fe/docs`, and `pawjai-admin/docs`.
