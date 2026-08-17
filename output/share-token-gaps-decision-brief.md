# Decision brief: share-token revocation and JWT authority

**Status: no code written, no packet issued. This needs a product decision first.**

Found during Phase 2.3E scouting (2026-08-14/15) and deliberately left alone. These are **pre-existing design characteristics of the share-token system, not defects introduced by 2.3E**. Both apply to vet-share links AND helper links.

## Gap 1: no revocation

Neither `vetShareTokens` nor `helperTokens` has a revocation column (`src/db/schema/sharing.ts:34-46`). An owner who shares a link with the wrong person, or whose relationship with a vet or sitter ends, **cannot invalidate it** -- they wait out the expiry (7 days for vet share).

## Gap 2: raw JWTs bypass the database

`shareTokenService.verifyToken` (`src/services/shareTokenService.ts:97-121`) validates only the JWT's own signature and `exp` claim. It never queries `vetShareTokens`. The short-code path that users actually receive *does* hit the DB (and increments `viewCount`), but a raw JWT would keep working even if its row were deleted.

Practical severity is lower than it sounds, because the product never surfaces raw JWTs. But it means **the database is not authoritative for token validity**, which is precisely what makes gap 1 hard to fix: adding a `revokedAt` column achieves nothing on a path that never reads the table.

The two gaps are therefore one problem, and fixing gap 1 without gap 2 would be security theater.

## The decision to make first

What should revocation mean here? The options are not equivalent in cost:

1. **Short TTL only.** Shrink the 7-day window. No schema change, no new code paths. Reduces exposure without ever truly revoking, and makes links more annoying for legitimate vets.
2. **DB-authoritative lookup on every verify.** Make `verifyToken` query the row and honor a `revokedAt`. Genuinely fixes both gaps. Costs a DB read on every share-page load (a public, rate-limited endpoint), and needs care so a DB blip does not lock out valid links.
3. **Invalidation list.** Check revoked token ids against a cached/Redis set. Cheaper per request than option 2, but adds a cache-coherence problem and a new failure mode to reason about.

Secondary questions once the shape is chosen: does revocation belong to the owner (a "revoke link" button, which is UI work in `PetShareModal`), or only to support/admin? Does revoking one link revoke all of a pet's links? Should helper links behave identically to vet links, given a helper actively *writes* records?

## Recommendation on sequencing

Not urgent enough to jump the roadmap, and not something to hand a worker without the above settled. Two reasonable placements: alongside the **admin concept editor** (roadmap item 4), since that is when admin-side controls get built anyway, or as its own small hardening phase if the "wrong person has my pet's medical history" scenario feels pressing.

Worth noting the asymmetry: helper links let a third party **write** records, so a compromised helper link is arguably worse than a compromised vet link, yet it has the same non-revocability.

**Owner: user (and Codex on return). Nothing will be implemented until a decision is recorded here.**
