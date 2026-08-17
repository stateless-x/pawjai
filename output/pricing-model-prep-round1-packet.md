# PRICING-MODEL PREP — ROUND 1 packet — **ON HOLD (user deferred 2026-08-16)**

Status: written and decision-complete, deliberately NOT relayed yet — the user wants to finish smaller items first. When ready, relay the packet below verbatim. The two product decisions inside (daily-limit repurposed as abuse control for the paid+trial model; share-token DB-authority + revocation + lapse policy) were settled between the user and the orchestrator on 2026-08-16 and the packet is their record — re-confirm with the user only if significant time has passed or the pricing plan changed.

---

# PRICING-MODEL PREP — ROUND 1 packet: briefs + usage data + inventory

To: worker agent
From: orchestrator (via the user, who holds all authority)
Context of record: /Users/purin/dev/pawjai/output/ORCHESTRATOR_HANDOFF.md — its protocol applies verbatim.

BUSINESS CONTEXT (decided by the user): Pawjai is moving from freemium to PAID-ONLY with a 7-day trial. The two open product decisions below are now settled in that light; this round writes them down, gathers the validating data, and inventories the migration surface. NO product code changes in this round.

AUTHORIZED in this packet:
  a. Editing/creating the three brief documents in /Users/purin/dev/pawjai/output/ listed below.
  b. ONE read-only SQL query against the PRODUCTION database, exactly as scoped in step 2. Nothing else touches prod.
  c. Read-only exploration of pawjai-be/pawjai-fe source.
Hard stop after the report.

## Standing rules (restated)
- cd explicitly in every command block.
- Env files/secrets are process input only. NEVER print/cat/grep env vars. NEVER run unscoped `railway variables`.
- Railway calls MUST pin the environment explicitly (-e production).
- Read-only means read-only: SELECTs only.

## Step 1 — update output/daily-record-limit-decision-brief.md
Mark DECIDED (2026-08-16, paid+trial context):
- The limit's purpose changes from monetization to ABUSE CONTROL.
- Trial accounts: keep 30/pet/day, all record types.
- Paying subscribers: clinical types (symptom, medication, vet_visit) EXEMPT; activity capped at 100/pet/day as a pure runaway-script guard.
- Rationale: under paid-only, every logger is a payer or a deciding trialist; blocking a payer mid-illness is the worst churn moment; abuse risk concentrates in free-to-create trial accounts.
- Item 7 INHERITS this decision.
- Implementation is a FUTURE round (the two MAX_RECORDS_PER_PET_PER_DAY sites in petRecordServices.ts + tests). Do not implement now.

## Step 2 — validating query (read-only, prod)
Has anyone ever come near the cap, and who? Run via Railway injected env, environment pinned:
  railway run -e production --service Postgres bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" psql "$DATABASE_URL" -c "<SQL>"'
SQL shape (verify real names in src/db/schema/): pet_records grouped by (pet_id, occurred_at::date) → count n; filter n >= 25; join owner tier/status; record_type mix of those days; also global max(n). Report counts by tier, the max, the mix; ZERO rows ≥25 means the decision ships with no observable change today. If Railway access fails, STOP that step and report — no improvised paths to prod data.

## Step 3 — update output/share-token-gaps-decision-brief.md
Mark DECIDED (2026-08-16, paid+trial context):
- DB becomes the authority: verifyToken does a DB row lookup; add revokedAt to BOTH vetShareTokens and helperTokens; owners get a revoke control for active links. One fix, not two — aligns the raw-JWT path with the short-code path that already reads the DB.
- Lapse policy: EXISTING links survive subscription lapse until natural 7-day expiry (care continuity); CREATING new links requires an active trial or subscription.
- Rationale: revocation is table-stakes in a paid product; share surfaces are the organic growth loop and must not die at lapse.
- Implementation is a FUTURE round (schema via full db:generate flow + be service + fe UI). Do not implement now.

## Step 4 — NEW brief: output/freemium-to-paid-migration-brief.md
Inventory every freemium touchpoint (read-only greps; cite file:line):
- Chat rate limits (FREE_TIER_DAILY_LIMIT / PREMIUM_DAILY_LIMIT, chat/rate-limit.service.ts) + upgrade-nudge copy.
- Pet limits per plan (accessControlService / plan rules).
- Plan-based history cutoff on the vet-share path (share.ts).
- Insights/health-summary tier gating, if any.
- Offer/winback machinery (offerService, scheduled-offers, Stripe pricing config) — what assumes a free tier exists.
- Existing trial-eligibility service + subscription-lifecycle states (trial fields, grace periods).
- fe: everywhere UI branches on plan (tier page, upgrade CTAs, BillingToggle) + i18n copy saying "free".
- Anything else assuming a permanent free tier.
Structure: inventory table → open product questions for the user (existing free users on migration day, trial-abuse controls at signup, grace-period length) → proposed phasing (decisions → backend flags → Stripe/plan changes → fe → comms). NO pricing-amount recommendations.

## Report back
1. Brief diffs (summary per section).
2. Query results (or exact failure).
3. Migration inventory table + open-questions list.
4. Anything wrong or contradicting the decisions above (contradiction = STOP and report).
THEN STOP. Implementation rounds are separate, each with its own authorization.
