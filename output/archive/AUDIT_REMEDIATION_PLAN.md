# Pawjai Audit Remediation Plan

Source audit: 10x-engineer review, 2026-06-01. This plan turns the 10 risks into ordered, verifiable work, grouped into release waves. Each wave is independently shippable and revertible.

## Phasing at a glance

| Wave | Risks | PRs | Goal |
|------|-------|-----|------|
| **Wave 1 — immediate** | R2, R6, R3 (rate-limit only) | 3 small PRs | Stop ongoing correctness/security bleeding. No schema changes. |
| **Wave 2 — investigation** | R1 | 0 code PRs, 1 doc | Decide JWT verification strategy with evidence, not assumption. |
| **Wave 3 — admin hardening** | R3 (full), R4 | 2 PRs | Audit logs + revocation + safer destructive ops. Touches schema. |
| **Wave 4 — operational** | R8, R10, R9 | 3 PRs | Surface failures, gate migrations, see latency. |
| **Wave 5 — scale** | R5, R7 | 2 PRs | Make jobs safe to run on >1 replica and at >10K free users. |

Each wave's PRs are independently revertible. Wave 1 ships this week. Wave 2 starts in parallel.

---

## Wave 1 — Immediate (this week)

### PR 1.1 — Fix Stripe webhook TOCTOU (Risk 2)

**Why:** The current `SELECT existing → dispatch → INSERT event` sequence in `src/routes/stripe.ts:41-100` is racy. Stripe retries on non-2xx, so two concurrent deliveries of the same `event.id` can both observe "not seen", both run handlers, both insert. Real-world impact: double-applied subscription plan changes, double-fired offer creation, duplicate invoice processing.

**Root cause (one sentence):** Idempotency record is written *after* the work, not *before* — so the gate doesn't protect the work it was supposed to gate.

**Approach:**
1. Insert idempotency row first with `ON CONFLICT (event_id) DO NOTHING RETURNING event_id`.
2. If `rowCount === 0`, return 200 immediately with `{ skipped: true }` (do not dispatch).
3. If `rowCount === 1`, dispatch to `stripeWebhookService.*`.
4. On dispatch failure, throw — Stripe will retry. The idempotency row stays. Add a `processed_at` column (nullable) and update it after successful dispatch; this lets us distinguish "claimed but failed mid-handler" from "fully processed" for ops debugging. (Optional follow-up: not blocking for this PR.)

**Files touched:**
- `src/routes/stripe.ts` — reorder insert before dispatch.
- `src/db/schema/<wherever subscriptionEvents lives>.ts` — confirm `eventId` already has a UNIQUE constraint; if not, add it. (If it does, no schema change.)

**Verify:**
- Unit test: simulate two concurrent calls with same `event.id`, assert only one dispatch runs. Use the existing test pattern in `src/__tests__/unit/` — mock `db` and `stripeWebhookService`.
- Replay a real test-mode Stripe event in dev twice via `stripe trigger`. Confirm only one execution.
- Existing `subscription_events` rows are unaffected (no migration of historical data needed).

**Risk of regression:** Low. The control flow is local to one route handler. Worst case: a handler that previously double-processed will now process once, which is the desired behavior.

**Size:** ~30 LoC.

---

### PR 1.2 — Remove fail-open from activity metadata validation (Risk 6)

**Why:** `src/routes/petRecord.ts:55-58` catches any error from `validateActivityMetadata` and returns `{ success: true, data: metadata }`. This directly violates the project rule "no fallback values that hide failure" (global CLAUDE.md). It also means a corrupted lookup-types fetch or a schema mismatch silently lets invalid metadata into `pet_records`.

**Root cause (one sentence):** A "backward compatibility" catch was added as a safety net during a past refactor and never removed; it now masks legitimate validation failures.

**Approach:**
1. Remove the outer `try/catch` swallow. Let unexpected errors propagate.
2. Keep the legitimate "no schema matched" path (`return { success: true, data: metadata }` at line 54) — that is a *design choice* to allow unknown metadata shapes, not a failure swallow. The PR removes only the catch at lines 55-58.
3. The route already handles validation failures via the `validationResult.success === false` branch — no changes needed there.

**Files touched:**
- `src/routes/petRecord.ts` — remove lines 55-58, let the function be `async` without try/catch.

**Verify:**
- Unit test: pass metadata that triggers a thrown error from `lookupTypeService.getLookupTypes`. Assert the route returns 500, not 200 with the unchecked metadata.
- Manual check in dev: create a bathroom record with invalid `detailType` — confirm 400 with validation error, not 200.

**Risk of regression:** Low-medium. If `lookupTypeService.getLookupTypes` is flaky in production, this PR converts those flaps into 500s instead of silent success. That is the *correct* behavior but ops should be ready to see them in Sentry briefly. Recommend deploying with Sentry alerts on `validateActivityMetadata` failures pre-armed.

**Size:** ~5 LoC removed.

---

### PR 1.3 — Rate-limit admin login route (Risk 3, partial)

**Why:** `src/routes/admin/auth.ts:17` exposes `POST /api/admin/auth/login` with no rate limit. Combined with `password: z.string().min(5)`, a brute-force attacker faces zero friction. This endpoint guards the dev-tools batch-delete (Risk 4) and 7-day non-revocable JWTs.

**Root cause (one sentence):** The route was wired up before rate-limiting infra existed and was never retrofitted when `src/lib/rate-limiter.ts` landed.

**Approach:**
1. Use the existing `createRateLimiter` from `src/lib/rate-limiter.ts` (Redis-backed with in-memory fallback). Do NOT add `@fastify/rate-limit` as a second mechanism.
2. Composite key: `${ip}:${email}` — prevents an attacker from locking out a victim by spamming their email from many IPs, and prevents a single IP from churning many emails.
3. Limits: `max: 5, windowMs: 15 * 60 * 1000` (5 attempts per 15 minutes per IP+email pair).
4. Apply as `preHandler` on the login route only (not on `/me`, not on `/logout`).

**Files touched:**
- `src/routes/admin/auth.ts` — add `preHandler` with `createRateLimiter`.

**Verify:**
- Unit test: 6 requests in rapid succession from same IP+email — 6th returns 429 with `RATE_LIMIT_EXCEEDED`.
- Confirm `X-RateLimit-*` headers present on responses.
- Confirm rate-limit scope `admin-login` does not interfere with existing scopes.

**Risk of regression:** Low. If Redis is unreachable, the limiter falls back to in-memory (per-process); this is fine for a low-traffic endpoint.

**Size:** ~15 LoC.

**Out of scope (deferred to Wave 3):** Raising password minimum, token revocation, audit logging on login attempts. Doing those now requires a schema change and a password-reset coordination with current admins. Wave 1 is "no schema changes".

---

## Wave 2 — Switch to `supabase.auth.getClaims()` (Risk 1)

**Why:** The audit flagged that `verifySupabaseJWT` calls `supabase.auth.getUser(token)` on every authenticated request — a remote RPC. The code comment in `src/utils/jwt.ts:44-46` says this is *deliberate* because Supabase JWTs may be HS256 or ES256, and `getUser()` handles both.

**Supabase docs (verified 2026-06-01) provide a drop-in replacement: `supabase.auth.getClaims(token)`.** From the Supabase JS reference:

> "Prefer this method over #getUser which always sends a request to the Auth server for each JWT."

Behavior:
- **Asymmetric keys (ES256 / RS256):** verifies locally against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, JWKS cached by the SDK (Supabase edge caches the endpoint for 10 minutes).
- **Symmetric keys (HS256):** automatically falls back to a remote call (same behavior as `getUser`).

This means we **do not need to know the algorithm in advance** — the SDK picks the right path. The win is "fast path when possible, safe fallback otherwise" with zero risk of breakage on the symmetric case.

Per the Supabase signing keys docs, HS256 is the legacy default and is **explicitly "not recommended for production applications"**. Projects can migrate via the dashboard's "Migrate JWT secret" → "Rotate keys" flow with a >75 minute soak window for token expiry.

**Two-step approach:**

### PR 2.1 — Swap `getUser` for `getClaims` in `verifySupabaseJWT`

**Approach:**
1. Replace `getAdminClient().auth.getUser(token)` with `getAdminClient().auth.getClaims(token)` in `src/utils/jwt.ts`.
2. Adjust the result mapping — `getClaims` returns `{ data: { claims }, error }` instead of `{ data: { user }, error }`. The `claims` object already has the JWT payload shape we want, so the subsequent `decodeJwt(token)` call becomes redundant and can be removed.
3. Keep the existing Zod parse on the returned claims for type safety.
4. No env var changes. No JWKS plumbing. The SDK handles it.

**Files touched:**
- `src/utils/jwt.ts` — one method swap, removal of redundant decode.

**Verify:**
- Unit test: valid token → claims returned, no error.
- Unit test: tampered token → throws.
- Manual: hit a dev endpoint with a real token, confirm 200 + correct user; tail logs and confirm Supabase JWKS endpoint is hit on cold start and not on every subsequent request.
- **Verify Supabase JS SDK version supports `getClaims`.** Check `package.json` — if `@supabase/supabase-js` is older than the version that introduced `getClaims`, bump it in this PR.

**Expected impact:** If the project is already on ES256, this delivers the full local-verification win immediately. If still on HS256, behavior is unchanged (also a remote call) but the code is correctly positioned for the migration in PR 2.2.

**Risk of regression:** Low. The SDK's fallback ensures HS256 projects continue to work; the asymmetric path is well-trodden across the Supabase JS user base.

**Size:** ~10 LoC + dep bump if needed.

---

### PR 2.2 (optional, follow-up) — Migrate Supabase project from HS256 to ES256

**Why:** Only after PR 2.1 ships and the SDK is in place. This step unlocks the actual latency win for projects still on HS256.

**Approach (per Supabase dashboard flow, no code change):**
1. Confirm current algorithm in Supabase dashboard → Project Settings → JWT Signing Keys (URL: `/dashboard/project/_/settings/jwt`).
2. If HS256: click "Migrate JWT secret" — imports legacy secret, creates new ES256 key in "standby" status.
3. Click "Rotate keys" — promotes ES256 to active. New tokens issued from now on use ES256; existing HS256 tokens remain valid until expiry.
4. **Soak window:** wait ≥ (token expiry duration + 15 minutes). If tokens expire in 1h, wait 1h15m minimum.
5. Revoke the legacy HS256 secret in the dashboard.

**Pre-flight checks before clicking "Migrate":**
- PR 2.1 deployed and stable for ≥48h.
- Confirm no other backend service relies on the raw HS256 `SUPABASE_JWT_SECRET` for verification (grep all repos: `pawjai-be`, `pawjai-admin`, `pawjai-fe`, any Edge Functions). The Supabase docs explicitly warn about this.
- If Supabase Edge Functions are in use with "Verify JWT" enabled, disable it before rotation, or those functions will reject tokens during the transition.
- Confirm staging is on the same algorithm path before touching prod.

**Risk of getting this wrong:** Total auth outage if a backend service is doing manual HS256 verification with the legacy secret and isn't updated to use the SDK / JWKS path first. The investigation step above (grep for `SUPABASE_JWT_SECRET` usage) is the gate.

**Sources:**
- https://supabase.com/docs/guides/auth/signing-keys
- https://supabase.com/docs/guides/auth/jwts
- https://supabase.com/docs/reference/javascript/auth-getclaims

---

## Wave 3 — Admin hardening (Risks 3 full, 4)

### PR 3.1 — Admin auth: revocation, audit, stronger passwords (Risk 3 remainder)

**Why:** Even with rate-limiting (PR 1.3), the admin auth model has structural gaps: 5-char passwords, 7-day non-revocable JWTs, no per-attempt audit log.

**Approach:**
1. **Audit logging:** Log every admin login attempt (success + failure) to `admin_audit_log` (table already exists per `auditLog.ts`). Include IP, user agent, email tried, outcome.
2. **Password minimum:** Raise `loginSchema.password` from `min(5)` to `min(12)`. **Coordinate with admins first** — confirm via secure channel that no current admin uses a <12 char password, or stage password resets for affected admins before merging.
3. **Token revocation:** Add `admin_sessions` table with `id, admin_id, token_jti, created_at, revoked_at, expires_at`. Issue JWTs with `jti` claim. On `/logout`, set `revoked_at`. On every authenticated admin request, look up `jti` in `admin_sessions` and reject if revoked. (This adds 1 DB read per admin request — admin volume is low, acceptable.)
4. **Reduce token TTL:** Drop from 7d to 24h. Admin UI should refresh transparently.

**Files touched:**
- `src/routes/admin/auth.ts`
- `src/middleware/adminAuth.ts`
- `src/db/schema/<admin area>.ts` (new table `admin_sessions`)
- New migration via `bun run db:generate` workflow (per project rules: idempotent, committed with schema).

**Verify:**
- Unit test: revoked token returns 401.
- Unit test: expired token returns 401.
- Manual: log in, log out, attempt to reuse old token — must fail.

**Risk of regression:** Medium. Schema change + middleware change. Coordinate with admin team for the password reset window.

**Size:** ~150 LoC + migration.

---

### PR 3.2 — Audit + confirm-token for batch delete (Risk 4)

**Why:** `DELETE /api/admin/dev-tools/users/batch` hard-deletes up to 50 users with no audit trail, no confirmation, and only super-admin auth. The comment on line 32 ("Routes are now available in all environments") reads as a warning sign — this was widened from dev-only without adding guardrails.

**Approach:**
1. **Mandatory audit log:** Every call (regardless of success/failure) logs to `admin_audit_log` with: admin id, list of user ids targeted, IP, user agent, outcome (success / partial / failure), error details.
2. **Confirmation token:** Require a `confirmation` body field equal to a server-generated short-lived token from a separate `POST /api/admin/dev-tools/users/batch/confirm` call. Forces a two-step flow that can't be CSRF'd from a single replay.
3. **Reduce batch ceiling:** Drop max from 50 to 10. Real ops use is presumably 1-2 at a time; 50 was likely never used at full capacity. Make the cap reviewable.
4. **Enumerate cascade:** Replace the manual `delete from user_notes, subscription_offer_timers` block with a single `DELETE FROM user_profiles WHERE id IN (...)` and rely entirely on FK cascade. Validate the cascade is complete by running an `EXPLAIN` against the schema. Document this in `docs/admin/destructive-ops.md`. (If any tables lack `ON DELETE CASCADE`, add it in a separate schema PR — flag here, fix there.)

**Files touched:**
- `src/routes/admin/dev-tools.ts`
- `src/utils/auditLog.ts` — add new action constants.
- New migration if cascade gaps are found (deferred PR).

**Verify:**
- Unit test: batch delete without confirmation token → 400.
- Unit test: batch delete with valid token logs audit entry.
- Manual: in dev, delete a user; confirm cascade removed all related rows; confirm audit log row exists.

**Risk of regression:** Low. The endpoint is super-admin only and rarely used; the new flow is more friction but the same outcome on the happy path.

**Size:** ~80 LoC.

---

## Wave 4 — Operational visibility (Risks 8, 10, 9)

### PR 4.1 — Surface infrastructure failures in `optionalAuth` (Risk 8)

**Why:** `src/middleware/auth.ts:64-72` swallows *all* exceptions from `authenticateUser`. The intent is "if no token / bad token, proceed unauthenticated". The bug is that network failures, Supabase outages, or unexpected exceptions are treated identically — premium users silently get the unauthenticated experience and no one notices.

**Root cause (one sentence):** `optionalAuth` conflates "no auth provided" with "auth attempt failed", so infrastructure errors are indistinguishable from logged-out users.

**Approach:**
1. Inside `authenticateUser`, distinguish *credential errors* (invalid token shape, expired, bad signature) from *infrastructure errors* (network, timeout, unexpected). Throw a typed error (`AuthCredentialError` vs `AuthInfrastructureError`).
2. `optionalAuth` catches only `AuthCredentialError` and proceeds. `AuthInfrastructureError` propagates as 500.
3. Sentry capture on `AuthInfrastructureError` with tags.

**Files touched:**
- `src/middleware/auth.ts`
- `src/utils/jwt.ts` — throw typed errors instead of generic `Error`.
- `src/errors/index.ts` — define the two error classes.

**Verify:**
- Unit test: optionalAuth with no header → no user, no error. ✓
- Unit test: optionalAuth with invalid JWT → no user, no error. ✓
- Unit test: optionalAuth with network failure mocked → 500 + Sentry tag.

**Size:** ~50 LoC.

---

### PR 4.2 — Gate migration retries (Risk 10)

**Why:** `railway.toml` sets `preDeploy.command = bun run db:migrate:prod` with `restartPolicy.maxRetries = 3`. A migration that partially succeeds and then throws will be re-run on retry. If the failed statement is not idempotent (e.g., `ALTER COLUMN ... SET NOT NULL` on a table where the first run partially populated NULLs), retries compound the problem.

**Approach:**
1. **Wrap each migration file in a single transaction** if not already (Drizzle generates one BEGIN/COMMIT per file by default — verify this is the case for the last 5 migrations).
2. **Add a `db:migrate:safe` script** that calls `db:migrate:prod` with `restartPolicy.maxRetries = 0` for the preDeploy command, and a `restartPolicy.maxRetries = 3` for the app process only. This separates "migration retries" (dangerous) from "app process retries" (safe).
3. **Pre-flight check:** Before `db:migrate:prod`, run `db:validate` (already in place) AND a new `db:dry-run` that prints which migrations would apply. If the dry-run shows >1 pending migration, require an explicit env var `ALLOW_BULK_MIGRATION=true` to proceed. This catches the case where someone forgets to deploy for weeks and 12 migrations stack up.

**Files touched:**
- `railway.toml`
- `package.json` scripts
- New: `scripts/database/dry-run.ts`

**Verify:**
- Run `bun run db:dry-run` in dev with 0 pending → exits 0 cleanly.
- Run with 1 pending → prints filename, exits 0.
- Run with 3 pending without `ALLOW_BULK_MIGRATION` → exits non-zero.

**Risk of regression:** Low. Adds checks; does not change what migrations do.

**Size:** ~80 LoC.

---

### PR 4.3 — Add APM / request-level latency (Risk 9)

**Why:** Sentry captures exceptions but not latency. Without p50/p95 per route, we cannot answer "is the Supabase RPC actually the bottleneck?" — which gates the Risk 1 fix.

**Approach:** Decide between three options (each is a small PR):

| Option | Cost | Effort | Notes |
|--------|------|--------|-------|
| **Railway built-in metrics** | Included | Smallest | Per-process, no per-route breakdown. Insufficient. |
| **Sentry Performance** | Tiered, free up to limit | Small (already using Sentry) | Per-route, per-transaction. Easiest path. **Recommended.** |
| **OpenTelemetry + Honeycomb / Datadog** | Paid | Larger setup | Best long-term, overkill today. |

Recommended: enable Sentry Performance tracing via the existing Sentry SDK. Sample at 10% in production, 100% in dev/staging. Add custom spans around `verifySupabaseJWT`, Gemini calls, Bunny uploads.

**Files touched:**
- `src/index.ts` (Sentry init) — add `tracesSampleRate`.
- `src/utils/jwt.ts`, chat services, bunny utils — wrap with `Sentry.startSpan`.

**Verify:**
- Deploy to staging, send 100 requests, confirm transactions appear in Sentry Performance dashboard.
- Confirm `verifySupabaseJWT` shows up as a child span on authenticated requests.

**Size:** ~40 LoC.

---

## Wave 5 — Scale fixes (Risks 5, 7)

These two risks interact. The monthly offer trigger (R7) runs *inside* the in-process job runner (R5). Fix order:

> **Fix R5 first (distributed locking), then R7 (batching).** Reason: if we batch R7 first but leave R5 as-is, scaling to 2 replicas will run two parallel batched jobs — same bug at higher throughput. Fix the runner, then optimize what runs in it.

### PR 5.1 — Distributed leader election for jobs (Risk 5)

**Why:** Jobs in `src/jobs/*.ts` run via in-process `setInterval` / `node-cron`. Deduplication uses in-memory variables. Single-replica today; will break the day Railway scales.

**Approach:**
1. Add a `job_locks` table: `(job_name PRIMARY KEY, locked_by, locked_at, expires_at)`.
2. New util `acquireJobLock(jobName, ttlSeconds): Promise<boolean>` — inserts with `ON CONFLICT DO UPDATE WHERE expires_at < NOW()`. Returns true only if this caller is the leader.
3. Wrap each scheduled job entry point in `if (await acquireJobLock(...)) { ...run...; await releaseJobLock(...); }`.
4. Set TTL to `2 × expected_job_duration` so a crashed leader auto-releases.
5. Track `last_run_started_at`, `last_run_completed_at`, `last_run_status` in same table for ops visibility.

**Files touched:**
- `src/db/schema/jobs.ts` (new).
- `src/utils/jobLock.ts` (new).
- All files in `src/jobs/`.
- Migration.

**Verify:**
- Unit test: two concurrent `acquireJobLock` calls — only one returns true.
- Unit test: expired lock can be re-acquired.
- Integration in dev: temporarily run two instances of the backend, confirm only one runs the next scheduled job.

**Size:** ~120 LoC.

---

### PR 5.2 — Batched, resumable monthly offer trigger (Risk 7)

**Why:** `triggerMonthlyOffersForFreeTier` fetches all free users in one query and loops sequentially, each iteration opening a transaction with `FOR UPDATE`. At ~10K users this exceeds typical job timeouts and has no resume.

**Approach:**
1. **Paginate the source query** — fetch users 200 at a time, ordered by `id`, using cursor-based pagination (not OFFSET).
2. **Per-batch checkpoint:** After each batch, write `last_processed_user_id` and `batch_count` to a `monthly_offer_run` row (one row per run, keyed by `YYYY-MM`).
3. **Idempotent resume:** On job start, if a row exists for the current month with `completed_at IS NULL`, resume from `last_processed_user_id`. Otherwise start fresh.
4. **Per-user idempotency:** Each call to `offerService.trigger()` is already idempotent (per audit, it uses `FOR UPDATE` + check-and-insert). Resuming over already-processed users is safe.
5. **Soft timeout:** If batch loop exceeds 30 minutes, exit cleanly (checkpoint written), let next scheduled invocation continue.

**Files touched:**
- `src/services/scheduledOfferService.ts`
- `src/db/schema/jobs.ts` — add `monthly_offer_run` table.
- Migration.

**Verify:**
- Unit test: seed 1000 mock users, run with batch size 100 — confirm 10 batches, all users processed.
- Unit test: interrupt mid-run, restart, confirm resume from checkpoint, no double-processing.
- Staging dry-run with `--dry-run` flag (log offer creation, don't commit).

**Size:** ~180 LoC.

---

## Out of scope for this plan

The audit also flagged areas it didn't fully cover. Track these as a backlog, not in waves:

- pawjai-ios code-level review (submodule was dirty; only README seen).
- Chat page (`pawjai-fe`) streaming implementation correctness.
- Gemini prompt injection / output validation.
- Redis cache invalidation correctness on subscription changes.
- Drizzle queries for N+1 patterns and missing LIMITs.
- Push notification delivery reliability (APNs / FCM retry behavior).
- Helper link end-to-end security.
- pawjai-admin frontend CSRF / CSP.
- CI/CD pipeline existence (no GitHub Actions found — confirm whether absent or in a location not searched).
- DB connection pool sizing.

Recommend: separate audit pass on the FE/mobile codebases (this audit was BE-heavy), then merge findings into Wave 6+.

---

## Verification checklist before each PR ships

Per project CLAUDE.md, before any commit/PR in `pawjai-be`:

```bash
bun tsc --noEmit
bun run build:ts
bun run db:validate    # required if migration involved
bun test               # all unit + integration green
```

Manual checks per PR are documented above.

## Rollback strategy

- Wave 1 PRs: pure code changes, revert is `git revert <sha>` on staging, re-merge to prod via your existing flow.
- Wave 3+ PRs (with migrations): each migration includes its down direction. Document the rollback SQL in the PR description. Test the rollback in dev before merging to staging.

## Sign-off gates

- **Wave 1 → Wave 2:** Wave 1 PRs deployed to prod, Sentry quiet for 48h, no Stripe webhook errors in logs.
- **Wave 2 → Wave 3:** JWT decision doc reviewed by tech lead + signed off. If decision is "migrate to JWKS", an additional PR (2.5) ships first.
- **Wave 3 → Wave 4:** Admin team has rotated to ≥12 char passwords. Audit log entries verified for a sample of admin actions.
- **Wave 4 → Wave 5:** APM data confirms scale fix is actually needed (i.e., monthly offer job p95 is approaching timeout). If not, deprioritize Wave 5.
