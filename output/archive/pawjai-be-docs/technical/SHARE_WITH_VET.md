# Share with Vet - Technical Specification

## Architecture Overview

The Share with Vet feature signs a JWT containing the pet and owner IDs, then maps it to a short
nanoid code stored in the `vet_share_tokens` table (this is NOT a stateless design — the token
row tracks `shortCode`, `expiresAt`, `viewCount`, and `lastViewedAt`). The backend fetches and
filters data at view time based on the owner's subscription plan.

## Backend Components

### ShareTokenService (`src/services/shareTokenService.ts`)

Handles JWT generation/verification (via `jose`) and short-code DB lookups.

```typescript
interface ShareTokenPayload {
  petId: string;
  ownerId: string;
  iat: number;
  exp: number;
}

class ShareTokenService {
  generateToken(petId: string, ownerId: string): Promise<{ token: string; shortCode: string; expiresAt: Date }>
  resolveShortCode(shortCode: string): Promise<string | null>  // short code -> full JWT, DB lookup
  verifyToken(token: string): Promise<ShareTokenPayload>
  isTokenExpired(token: string): boolean
  decodeTokenUnsafe(token: string): Partial<ShareTokenPayload> | null
  getExpiryInfo(): { durationDays: number; durationSeconds: number }
}
```

**Token Details:**
- Algorithm: HMAC-SHA256 (HS256)
- Expiry: 7 days
- Secret: `VET_SHARE_SECRET` environment variable
- Short code: 10-character nanoid, stored in `vet_share_tokens` alongside the full JWT

### API Endpoints

#### Generate Share Token
```
POST /api/pets/:petId/share-token
```

**Authentication:** Required (requireAuth, requirePetAccess)

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGc...",
    "shortCode": "a1b2c3d4e5",
    "shareUrl": "https://www.pawjai.co/vet/share/a1b2c3d4e5",
    "expiresAt": "2024-01-08T00:00:00.000Z",
    "expiresInDays": 7
  }
}
```
`shareUrl` uses the short code, not the raw JWT.

#### Get Shared Pet Data
```
GET /api/vet/share/*
```
Registered as a wildcard route under the `/api/vet/share` prefix (`src/routes/share.ts`) so it
can accept either a 10-character short code or the full JWT (which contains dots) in the same
path segment.

**Authentication:** None (public endpoint)

**Rate Limiting:** 30 requests per minute per IP, via the shared Redis-backed limiter
(`src/lib/rate-limiter.ts`, `scope: 'share'`) — falls back to an in-memory store if Redis is
unavailable.

**Response:**
```json
{
  "success": true,
  "data": {
    "pet": {
      "id": "uuid",
      "name": "Buddy",
      "species": "dog",
      "breed": "Golden Retriever",
      "dateOfBirth": "2020-01-15",
      "age": "3 years 11 months",
      "gender": "male",
      "neutered": true,
      "notes": "...",
      "imageUrl": "...",
      "latestWeightKg": 12.5,
      "latestWeightMeasuredAt": "2024-01-01T00:00:00.000Z"
    },
    "records": {
      "symptoms": [...],
      "medications": [...],
      "vetVisits": [...]
    },
    "meta": {
      "generatedAt": "2024-01-01T12:00:00.000Z",
      "expiresAt": "2024-01-08T12:00:00.000Z",
      "historyLimit": "3 months",
      "totalRecords": 16,
      "recordCounts": {
        "symptoms": 5,
        "medications": 8,
        "vetVisits": 3
      },
      "withheldRecordCount": 0
    }
  }
}
```

Each record in `records.symptoms` / `records.medications` / `records.vetVisits` may also carry
an optional `display` projection (`{ label, iconUrl, resolvedLocale, ... }`, same shape as the
owner-facing and helper-link routes) alongside the legacy `typeNameEn` / `typeNameTh` /
`typeIconUrl` fields. See "Localization" and "Vet-visibility enforcement" below.

**Error Responses:**
- 400: Invalid share link (`INVALID_SHARE_LINK`)
- 404: Pet not found
- 410: Share link expired or short code not found (`SHARE_LINK_EXPIRED`)
- 429: Rate limit exceeded (`RATE_LIMIT_EXCEEDED`)
- 500: Internal error

## Vet-visibility enforcement (Phase 2.3E, additive)

`pet_record_type_concepts.isVetVisible` existed before Phase 2.3E but was never enforced on
this route -- every clinical record an owner could see, a vet could see too, regardless of the
flag. Phase 2.3E closes that gap in `src/routes/share.ts`.

**A full-table read-only check of staging and production, run before this phase shipped, found
zero currently-visible records that the new guard would have excluded.** This is preventive
hardening for a gap that existed but was never triggered by real data, not an incident
response.

### What is filtered, and how

A clinical record (`recordType` is `symptom`, `medication`, or `vet_visit`) is included in the
vet-share response only if its `conceptId` snapshot resolves, live, to a
`pet_record_type_concepts` row with `isVetVisible = true`. `activity` records are unaffected by
this guard -- they are excluded from the vet-share response entirely, by category, as before
this phase (see the `groupedRecords` mapping, which only ever produces `symptoms` /
`medications` / `vetVisits` keys).

```typescript
const vetVisibleOrActivity = or(
  eq(petRecords.recordType, 'activity'),
  eq(petRecordTypeConcepts.isVetVisible, true)
);
```

### Live registry join, not a snapshot column

The join to `petRecordTypeConcepts` reads the concept's *current* `isVetVisible` value at
request time, not a value captured when the record was written. This means an admin toggling a
concept's visibility takes effect immediately on every existing share link for every pet with
that concept, including links generated before the toggle -- there is no snapshot column to
keep in sync and no backfill required when the flag changes. The tradeoff is that the same
share link can show a different record set on two different views if visibility changes between
them; this was an explicit decision, not an oversight, because a stale visibility snapshot would
mean a vet-share link could keep exposing a record an admin had just hidden.

### Fail-closed for unresolvable concepts

A clinical record whose `conceptId` is `NULL`, or whose linked concept row no longer exists, is
treated as **not** vet-visible -- it fails closed rather than defaulting to visible:

```typescript
const clinicalAndHidden = and(
  sql`${petRecords.recordType} != 'activity'`,
  or(
    isNull(petRecordTypeConcepts.isVetVisible),
    eq(petRecordTypeConcepts.isVetVisible, false)
  )
);
```

This is written as a direct positive condition, not `NOT(vetVisibleOrActivity)`. SQL's
three-valued logic makes `NOT(NULL)` evaluate to `NULL` (falsy in a `WHERE` clause), which would
silently exclude unresolvable rows from the omission count below instead of counting them as
withheld -- `isNull(...)` on the joined column handles that case explicitly. **As of the
pre-ship check above, zero clinical records currently visible to vets have an unresolvable
concept**, so this rule has not changed what any vet currently sees; it only determines behavior
for future data that reaches this state.

### Withheld-record count: a non-specific omission signal

`meta.withheldRecordCount` is a count of clinical records, in the same pet/date-range scope as
the main query, that the guard above excluded. It is computed by a second, independent query
(`baseScopeConditions` + `clinicalAndHidden`) scoped to the same history window but not the
100-record cap, so it reflects the guard's true effect on the full window rather than only the
fetched page.

The count exists so a vet cannot mistake an incomplete summary for a complete one -- without it,
withheld records are indistinguishable from records that simply don't exist. It is deliberately
**non-specific**: it reveals only a number, never which records, their type, or their date.
Revealing more would defeat the purpose of the visibility guard itself, since a vet could infer
the withheld content from timing, count deltas across repeat views, or type-of-record process of
elimination if given anything more granular than a bare count.

### Localization

Records returned by this route carry the same optional `display` projection as the owner-facing
and helper-link routes (`enrichRecordsWithDisplay`, `src/services/petRecordDisplay/`), resolved
against the display locale below. Legacy `typeNameEn` / `typeNameTh` / `typeIconUrl` remain
present as a fallback tier.

**Locale chain**: `?lang=` query param -> `Accept-Language` header -> the pet owner's stored
`preferredLanguage` -> `'th'` (`resolveVetShareDisplayLocale` in `src/routes/share.ts`). This
mirrors `resolveHelperDisplayLocale` in `src/routes/helper.ts` (Phase 2.3C) -- a vet, like a
helper, has no session locale of their own, so the owner's preference is the best available
fallback. The function is copied rather than imported, consistent with `petRecord.ts` and
`helper.ts` already keeping independent locale chains per route context.

### Test coverage

This route had zero test coverage before Phase 2.3E. `src/__tests__/integration/vet-share-privacy.test.ts`
(12 tests) now covers: not-vet-visible exclusion, vet-visible inclusion, mixed batches,
unresolvable-concept fail-closed behavior and its count, the omission count leaking nothing
beyond a number, the zero-withheld case, activity exclusion regardless of `isVetVisible`,
activity records never counted as withheld, and the `?lang=`/owner-preference/default locale
resolution chain including the `?lang=fr` 400 case.

## Rate Limiting

Shared Redis-backed limiter (`createRateLimiter` in `src/lib/rate-limiter.ts`), applied in
`src/routes/share.ts` with `scope: 'share'`:
- 30 requests per minute, keyed by client IP (`request.ip`)
- Falls back to an in-memory per-scope store (cleaned every 30 seconds) if Redis is unavailable
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Frontend Components

### ShareWithVetModal (`components/share/ShareWithVetModal.tsx`)
- Triggered from pet page "Share" button
- Generates token on modal open
- Displays QR code using `qrcode.react`
- Copy to clipboard and native share functionality

### VetShareView (`components/share/VetShareView.tsx`)
- Public view component for veterinarians
- Organized sections for symptoms, medications, and vet visits. Activities are
  never included -- see "Vet-visibility enforcement" below.
- PDF export using `html2pdf.js`
- Summary statistics cards

### VetSharePage (`app/vet/share/[token]/page.tsx`)
- Next.js page component
- Handles loading, success, expired, and error states
- No authentication required

## Database Queries

The share endpoint fetches:
1. Pet data with breed info (LEFT JOIN breeds)
2. Owner's subscription plan (user_subscriptions, plan_rules)
3. Pet records with type info (pet_records, pet_record_types)

**History Filtering:**
- Free plan: Last 3 months (`timelineHistoryMonths` from plan_rules)
- Premium plan: Unlimited

**Record Limit:** 100 records max per request

## Environment Variables

| Variable | Description | Required | Location |
|----------|-------------|----------|----------|
| `VET_SHARE_SECRET` | JWT signing secret (min 32 chars) | Yes | Backend only |
| `FRONTEND_URL` | Base URL for share links | Yes | Backend only |

### Generating VET_SHARE_SECRET

Generate a secure random secret using one of these methods:

```bash
# Using OpenSSL (recommended)
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add to your backend `.env.local`:
```
VET_SHARE_SECRET=your-generated-secret-here
FRONTEND_URL=https://www.pawjai.co
```

**Important:**
- Never expose `VET_SHARE_SECRET` to the frontend
- Use different secrets for development and production
- Add to production environment variables (Railway, Vercel, etc.)

## Security Considerations

1. **Token Security**
   - Signed with HMAC-SHA256
   - Short expiry (7 days)
   - Contains minimal claims

2. **Data Protection**
   - No owner contact info exposed
   - Plan-based data filtering at view time
   - Rate limiting prevents abuse

3. **Rate Limiting**
   - Prevents scraping/enumeration attacks
   - Per-IP tracking
   - Automatic cleanup of old entries

## Dependencies

### Backend
- `jose`: JWT handling

### Frontend
- `qrcode.react`: QR code generation
- `html2pdf.js`: PDF export

## Files Modified/Created

### Backend (pawjai-be)
- `src/services/shareTokenService.ts` (new)
- `src/services/index.ts` (updated export)
- `src/routes/share.ts` (new)
- `src/routes/pets.ts` (added share-token endpoint)
- `src/index.ts` (registered share routes)

### Frontend (pawjai-client)
- `lib/api/shareService.ts` (new)
- `components/share/ShareWithVetModal.tsx` (new)
- `components/share/VetShareView.tsx` (new)
- `components/share/index.ts` (new)
- `components/regularPetView.tsx` (added Share button)
- `app/vet/share/[token]/page.tsx` (new)
