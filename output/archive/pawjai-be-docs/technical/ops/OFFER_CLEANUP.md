# Offer Cleanup Strategy

## Overview

To prevent database bloat from accumulating offer records, we implement a **90-day retention policy** for expired and redeemed offers. Active offers are never deleted.

---

## Implementation

### 1. Service Method

**File:** `src/services/offerService.ts`

```typescript
async cleanupOldOffers(daysToKeep: number = 90): Promise<number>
```

**Behavior:**
- Deletes offers with status `expired` or `redeemed`
- Only deletes offers where `updatedAt < (now - daysToKeep)`
- Returns count of deleted offers
- **Never** deletes `active` offers

**Environment Variable:**
```bash
OFFER_CLEANUP_DAYS=90  # Default: 90 days
```

---

### 2. Automated Cleanup Job

**File:** `src/jobs/offerJobs.ts` (started unconditionally at server startup, independent of
migration/startup service success -- see `startOfferJobs()`)

**Schedule:** Runs on the **1st of each month**, checked every hour alongside the monthly
offer-trigger job (28th) and the hourly offer-expiry job.

**How it works:**
1. An hourly interval checks if today is the 1st and cleanup hasn't already run today (tracked
   in-memory via `lastCleanupDate`)
2. Acquires a cross-replica lock (`withJobLock('offer-cleanup', ...)`) before running, so only
   one instance runs the cleanup even with multiple replicas
3. Calls `offerService.cleanupOldOffers()` and logs the deleted count
4. Also purges `offer_events` older than 6 months in the same hourly check
   (`offerService.purgeOldOfferEvents()`, its own `offer-events-purge` lock)
5. Runs immediately on startup too, so a restart on the 1st still triggers cleanup that day

**Log messages (see `src/jobs/offerJobs.ts`):**
```
[OFFER_JOBS] 1st of month — cleaning up old offers...
[OFFER_JOBS] Cleaned up N old offer(s)
[OFFER_JOBS] 1st of month — purging offer_events older than 6 months...
[OFFER_JOBS] Purged N old offer event(s)
```

---

## Retention Policy

| Offer Status | Retention | Reason |
|--------------|-----------|--------|
| `active` | ♾️ Forever | User might still redeem |
| `expired` | 90 days | Analytics & debugging |
| `redeemed` | 90 days | Analytics & debugging |

**Why 90 days?**
- Covers 3 full monthly cycles (21-day cooldown + buffer)
- Sufficient for analytics and debugging
- Prevents indefinite growth

---

## Testing

**File:** `src/__tests__/integration/offer-timer.test.ts`

**Test Coverage (8 tests):**
- ✅ Delete expired offers older than retention period
- ✅ Delete redeemed offers older than retention period
- ✅ Preserve active offers (never delete)
- ✅ Preserve offers within retention period
- ✅ Handle empty cleanup (no old offers)
- ✅ Batch cleanup (multiple offers at once)
- ✅ Default 90-day retention
- ✅ Custom retention periods

**Run tests:**
```bash
bun test src/__tests__/integration/offer-timer.test.ts
```

---

## Manual Cleanup

If you need to run cleanup manually:

```typescript
import { offerService } from '@/services/offerService';

// Use default 90-day retention
const deletedCount = await offerService.cleanupOldOffers();
console.log(`Deleted ${deletedCount} offers`);

// Use custom retention (e.g., 30 days)
const deletedCount = await offerService.cleanupOldOffers(30);
```

---

## Database Impact

**Before cleanup:**
- 1000 users × 12 offers/year = 12,000 rows/year
- After 3 years: ~36,000 rows

**With 90-day cleanup:**
- Active offers: ~1,000 rows (1 per user max)
- Recent expired/redeemed: ~3,000 rows (90 days worth)
- **Total: ~4,000 rows** (89% reduction)

---

## Monitoring

**Metrics to track:**
- Cleanup execution frequency (should be monthly)
- Number of offers deleted per cleanup
- Total offer count over time
- Cleanup errors/failures

**Logs to watch:**
```
[OFFER_JOBS] Offer jobs started (expiry: 60min, monthly trigger: 28th, cleanup: 1st)
[OFFER_JOBS] 1st of month — cleaning up old offers...
[OFFER_JOBS] Cleaned up N old offer(s)
[OFFER_JOBS] Offer cleanup failed: [error]
```

---

## Alternative Approaches Considered

### ❌ Cron-only (no DB tracking)
- **Pros:** Zero database bloat
- **Cons:** No event-based offers, no analytics, inflexible

### ❌ No cleanup (keep all offers)
- **Pros:** Complete history
- **Cons:** Unbounded growth, performance degradation

### ✅ 90-day retention (chosen)
- **Pros:** Balance between analytics and performance
- **Cons:** None significant

---

## Future Enhancements

1. **Analytics Dashboard**
   - Offer redemption rates
   - Most effective offer types
   - User engagement metrics

2. **Configurable Retention**
   - Per-offer-type retention policies
   - Premium users: longer retention

3. **Archive to Cold Storage**
   - Move old offers to S3/archive DB
   - Keep primary DB lean

---

## Summary

✅ **Automated monthly cleanup on the 1st**  
✅ **90-day retention for analytics**  
✅ **Active offers never deleted**  
✅ **Fully tested (8 test cases)**  
✅ **Production-ready**

The cleanup strategy keeps your database lean while preserving recent data for analytics and debugging.

