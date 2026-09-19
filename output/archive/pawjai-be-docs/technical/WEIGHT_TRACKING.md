# Weight Tracking - Technical Documentation

**For:** Developers, DevOps, technical maintainers
**Purpose:** Implementation details and system architecture

---

## System Architecture

### Overview

Weight tracking is implemented as a standalone feature that integrates with existing pet records. It follows the same patterns as other pet data features (timeline, health records). It has no subscription-tier gating -- the feature is free for all users.

**Key Components:**
- Database table: `pet_weight_records`
- Service layer: `src/services/petWeightService.ts`
- API routes: `src/routes/petWeight.ts`, mounted at `/api/pets/:petId/weight`
- Rate limiting: rolling-hour cap (service layer) + shared daily record cap

---

## Database Schema

### Table: `pet_weight_records`

Defined in `src/db/schema/pets.ts` (`petWeightRecords`). Actual shape:

```typescript
export const petWeightRecords = pgTable('pet_weight_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  petId: uuid('pet_id').notNull().references(() => pets.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => userProfiles.id),
  weightKg: numeric('weight_kg', { precision: 6, scale: 3 }).notNull(),
  measuredAt: timestamp('measured_at', { withTimezone: true }).notNull().defaultNow(),
  note: text('note'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdInChatId: uuid('created_in_chat_id'), // set when created via chat proposal card
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
});
```

**Design Decisions:**

1. **`weight_kg` as NUMERIC(6,3)**
   - 6 total digits, 3 decimal places
   - Range: 0.001 to 999.999 kg (enforced by Zod at the route boundary, not a DB CHECK constraint)
   - Covers tiny pets (0.01 kg hamster) to large dogs (200 kg mastiff)
   - Prevents floating-point precision issues

2. **`measured_at` separate from `created_at`**
   - Allows backfilling historical data
   - User can specify when weight was measured
   - Defaults to NOW() if not specified

3. **No unique DB constraint on hourly entries**
   - There is no `unique_pet_weight_per_hour` constraint. An earlier version had one, but it
     was removed to allow up to 3 entries per hour for corrections (see comment in
     `src/db/schema/pets.ts`). The 3-per-hour limit is enforced in the service layer instead
     (`petWeightService.checkHourlyLimit`).

4. **Soft delete pattern**
   - `deletedAt` is a nullable timestamp (not a separate boolean flag) -- `NULL` means active
   - Preserves data for audit trail

5. **Index:** `pet_weight_records_pet_id_measured_idx` on `(pet_id, measured_at DESC)` filtered
   to `deleted_at IS NULL`, plus an index on `created_in_chat_id` used by the chat context
   loader.

---

## API Endpoints

### Base URL Pattern
All weight endpoints follow: `/api/pets/:petId/weight`

### Authentication & Authorization
- **Middleware:** `requireAuth()` + `requirePetAccess`
- Validates JWT token
- Verifies user has access to specified pet
- Returns 401/403 if unauthorized

---

### POST `/api/pets/:petId/weight`
**Create new weight entry**

**Request Body** (see `createWeightRecordSchema` in `src/constants/schemas.ts` for the actual
Zod schema):
```typescript
{
  weightKg: number,          // Required: 0.001 - 999.999, max 3 decimal places
  measuredAt?: string,       // Optional: ISO 8601 datetime
  createdInChatId?: string   // Optional: UUID, set when created via a confirmed chat proposal card
}
```

**Response (201 Created):** wraps the inserted `pet_weight_records` row via
`ApiResponses.created()` -- see the repo's standard wire format in `CLAUDE.md`.

**Error Responses** use the standard `ApiResponses.error()` shape (`error` is a string, `code`
is at root -- see `CLAUDE.md`):
- `400` -- Zod validation error (`VALIDATION_ERROR`)
- `403` -- no pet access, or user is not the pet owner (`FORBIDDEN`)
- `429` -- more than 3 entries within the last rolling hour (`RATE_LIMIT_EXCEEDED`, with
  `details.nextAllowedAt`), or the pet's 30-records-per-day cap is hit
  (`DAILY_RECORD_LIMIT_REACHED`)

**Business Logic** (`petWeightService.createWeightRecord`):
1. Validate request body (Zod schema)
2. Verify the requesting user owns the pet
3. Check the rolling-hour limit (max 3 entries; see `checkHourlyLimit`)
4. Check the daily record limit (30/pet/day, shared with other record types)
5. Insert into database and return the created record

---

### GET `/api/pets/:petId/weight`
**Get weight history -- same behavior for every user; there is no plan-based restriction.**

**Query Parameters** (`weightRecordQuerySchema`):
```typescript
{
  limit?: number,    // Default: 20, Max: 100
  offset?: number,   // Default: 0, for pagination
  from?: string,     // ISO datetime: filter entries >= this date
  to?: string        // ISO datetime: filter entries <= this date
}
```

**Response (200 OK):**
```typescript
{
  success: true,
  data: {
    records: Array<{ id, petId, weightKg, measuredAt, note, createdAt, updatedAt, ... }>,
    pagination: { total, limit, offset, hasMore },
    restrictions: { plan: 'free', hasLimit: false, limitMonths: null }, // constant for all users
    latest: {
      weightKg: number,
      measuredAt: string,
      changeKg: number | null,        // vs previous entry
      changePercentage: number | null
    } | null
  }
}
```

Note: the response still includes a `restrictions` object for backward compatibility with
older clients, but it is hardcoded (`plan: 'free', hasLimit: false`) -- it no longer reflects an
actual plan check. See `petWeightService.getWeightHistory` in
`src/services/petWeightService.ts` for the exact logic, including how `latest.changeKg` is
computed by fetching one extra row as a comparison baseline.

---

### PATCH `/api/pets/:petId/weight/:weightId`
**Update existing weight entry**

**Request Body:** `weightKg?`, `measuredAt?`, `note?`, plus an optional `viaChatConversationId`
used only for the chat-write amendable-window check (see `src/routes/petWeight.ts`).

**Authorization:**
- Verify user owns the pet (not just has access)
- Verify weight record belongs to this pet
- Return 404 if not found or unauthorized

---

### DELETE `/api/pets/:petId/weight/:weightId`
**Soft delete weight entry** -- sets `deletedAt` to the current time via
`petWeightService.deleteWeightRecord`.

---

## Service Layer

### File: `src/services/petWeightService.ts`

**Core Methods** (`PetWeightService`):
- `createWeightRecord(petId, userId, data)` -- validates weight, verifies ownership, checks the
  rolling-hour and daily limits, inserts the record
- `getWeightHistory(petId, userId, query)` -- returns paginated history plus a `latest` summary
  with weight-change calculation; identical behavior for all users, no plan branching
- `updateWeightRecord(weightId, userId, data)` -- validates ownership, updates fields
- `deleteWeightRecord(weightId, userId)` -- soft delete (`deletedAt = now()`)
- `checkHourlyLimit(petId)` (private) -- counts non-deleted entries in the last rolling hour;
  rejects once the count reaches 3

---

## Rate Limiting Strategy

**Rolling-hour limit (primary defense):** enforced entirely in the service layer
(`checkHourlyLimit`), not a database constraint. Up to 3 entries per pet are allowed within any
rolling 60-minute window, so a user can correct a mistaken entry without waiting a full hour.
Exceeding it throws `rateLimitExceeded` (`RATE_LIMIT_EXCEEDED`, HTTP 429).

**Daily record limit (inherited):** reuses the existing `MAX_RECORDS_PER_PET_PER_DAY = 30`
cap shared with other pet record types (`checkDailyRecordLimit`), throwing
`dailyRecordLimitReached` (`DAILY_RECORD_LIMIT_REACHED`, HTTP 429) when hit.

There is no database-level uniqueness constraint on `pet_weight_records`. An earlier version of
the schema had one restricting entries to 1/hour, but it was removed specifically to allow the
3/hour correction window -- see the comment next to `petWeightRecords` in
`src/db/schema/pets.ts`.

---

## Data Migration

Schema changes to `pet_weight_records` have shipped across several migrations in `db/drizzle/`
as the table evolved (including the removal of the old hourly-uniqueness constraint) -- follow
`docs/technical/database/MIGRATIONS.md` for the workflow when adding new ones. Don't rely on a
single migration file name; `src/db/schema/pets.ts` is the current source of truth for the
table shape.

---

## Monitoring & Logging

The service currently logs via `logger.debug`/`logger.error` on create/update/delete (see
`src/services/petWeightService.ts`) -- there is no custom metrics emission (no `metrics.*` calls)
today. Per `CLAUDE.md`, CRUD ops are not expected to be logged at info level; weight creation
uses `debug`, and failures use `error`.

Candidate metrics to track if this becomes worth instrumenting: creation rate, hourly-limit hit
rate, and query duration. None of these are implemented yet -- don't treat this as a description
of current behavior.

---

## Testing Strategy

### Unit Tests
**File:** `src/__tests__/unit/utils/weight-validation.test.ts`

**Actual coverage today:** `src/__tests__/unit/utils/weight-validation.test.ts` covers
`validatePetWeight` (the breed-aware weight-severity heuristic in
`src/utils/weight-validation.util.ts`), not the CRUD service. There is currently no dedicated
unit or integration test file for `PetWeightService` or the `/api/pets/:petId/weight` routes.
Per `CLAUDE.md`, new tests belong in `src/__tests__/unit/` (pure logic, no I/O) or
`src/__tests__/integration/` (mocked services/DB, no `TestDataFactory`).

---

## Security Considerations

### Input Validation
- **Weight value:** 0.001 - 999.999 kg (prevents negative/absurd values)
- **Note field:** Max 500 chars (prevents text spam)
- **Measured date:** Must be <= NOW (prevents future dates)
- **SQL injection:** Using parameterized queries (Drizzle ORM)

### Authorization
- **Pet ownership:** Verified via `requirePetAccess` middleware, then re-verified directly in
  `petWeightService` (`verifyPetOwnership`)
- **Weight record ownership:** Only pet owner can edit/delete

### Rate Limiting
- **Per-pet hourly limit:** 3 weight entries, enforced in the service layer (not a DB constraint)
- **Per-pet daily limit:** 30 records (shared with other pet record types)

### Data Privacy
- Weight data never shared without user consent
- No third-party analytics on health data
- Soft delete preserves audit trail

---

## Performance Targets

**API Response Times (p95):**
- POST create weight: < 150ms
- GET latest weight: < 100ms
- GET weight history: < 200ms

**Database Query Times:**
- Latest weight query: < 5ms
- Weight history query: < 20ms (with pagination)
- Hourly limit check: < 10ms

**Throughput:**
- Sustained: 50 req/s
- Peak: 200 req/s
- 99.9% uptime

---

## Future Technical Enhancements

### Phase 2
- **Caching:** Redis cache for latest weight (reduce DB load)
- **Batch operations:** Bulk import historical data
- **Export:** Generate PDF weight reports

### Phase 3
- **Real-time updates:** WebSocket for live weight sync
- **AI integration:** Weight trend analysis and predictions
- **Data aggregation:** Daily/weekly/monthly weight averages
- **Smart scale integration:** Auto-sync from IoT devices

---

## Dependencies

**Backend:**
- `drizzle-orm` - Database ORM
- `zod` - Schema validation
- `pino` (via `@/utils/logger`) - Logging

**Services:**
- `petWeightService` itself performs pet-ownership verification directly (no separate
  `accessControlService` plan check -- weight tracking has no plan restrictions)

---

## Troubleshooting

### Issue: "Too many weight entries" errors
**Cause:** More than 3 entries for the same pet within a rolling hour
**Fix:** Expected behavior -- wait for the oldest entry in the window to age out, or edit an
existing entry instead of creating a new one

### Issue: Slow queries
**Cause:** Missing indexes or large dataset
**Fix:** Verify `pet_weight_records_pet_id_measured_idx` exists, consider pagination

---

**Last Updated:** 2026-08-07
**Status:** Implemented
**Owner:** Engineering Team
