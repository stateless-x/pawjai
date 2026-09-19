# Family Sharing (Helper Access) Feature

## Overview
The "Family Sharing" feature allows pet owners to share access to their pet with family members, pet sitters, daycare staff, or other caregivers. Helpers can add activity logs for the pet without creating a full Pawjai account, making collaborative pet care simple and accessible.

## User Story
As a pet owner, I want to give my family members or pet sitter the ability to log activities for my pet so that I have a complete record of my pet's care even when I'm not the one caring for them.

## Feature Access
- **Entry Point**: Pet detail page or dashboard via "Share" action
- **Available to**: All users (free and premium)

## User Flow

### 1. Generate Helper Link
1. Owner navigates to their pet's profile
2. Owner clicks "Share" button and selects "Add a Helper"
3. Modal appears with helper type selection:
   - **Family** - For household members
   - **Sitter** - For pet sitters
   - **Daycare** - For daycare staff
   - **Other** - Custom label (user provides name)
4. Owner generates shareable link with chosen label
5. Modal displays:
   - QR code for easy scanning
   - Shareable URL that can be copied
   - Native share button (mobile)
   - Expiry information (7 days)
   - Helper label (e.g., "Family", "Sarah the Sitter")

### 2. Helper Accesses Pet
1. Helper receives link from owner
2. Helper opens link (no login required)
3. Landing page displays:
   - Pet photo, name, and basic info
   - Helper label (e.g., "You're helping as Family")
   - Link expiry countdown
   - "Start Logging" button

### 3. Helper Logs Activities
1. Helper clicks "Start Logging"
2. QuickLog interface appears with:
   - Pre-filled pet information
   - Activity type selector (Food, Water, Walk, Play, etc.)
   - Time picker (defaults to now)
   - Notes field
   - Photo upload option
3. Helper submits log
4. Success confirmation shown
5. Helper can add more logs or share with others

### 4. Owner Views Helper Logs
1. Owner sees all logs in pet's timeline
2. Logs show:
   - Activity details (type, time, notes)
   - Helper attribution badge (e.g., "🏠 Family", "🐾 Pet Sitter")
   - Same visual style as owner-created logs
3. Owner can edit or delete helper logs
4. Timeline filters include helper-created logs

## Helper Label Types

| Label | Icon | Use Case | Example |
|-------|------|----------|---------|
| Family | 🏠 | Household members | Spouse, children, parents |
| Sitter | 🐾 | Professional pet sitters | Hired caregiver |
| Daycare | 🏢 | Daycare/boarding facilities | Dog daycare, cat hotel |
| Other | 📝 | Custom caregivers | Neighbor, friend, walker |

## Subscription Tiers

### Free Plan
- ✅ Unlimited helper links
- ✅ All helper types available
- ✅ 7-day link expiry
- ✅ Full logging capabilities

### Premium Plan
- ✅ All free features
- ✅ Unlimited helper links
- ✅ Extended activity history (helpers see more history)

**Note:** This feature is available to all users to encourage collaborative pet care.

## Privacy & Security

### Data Protection
- Helpers don't see owner information
- Helpers can't delete owner-created logs
- Helpers can't edit pet profile information
- Helpers can't access other pets
- Share links expire after 7 days
- No account required (reduces friction)

### Token Security
- JWT tokens with HMAC-SHA256 signing (reuses `VET_SHARE_SECRET`)
- Token contains:
  - Pet ID
  - Owner ID
  - Helper label
  - Pet name (for display)
  - Pet photo URL (for display)
- Stored in database with short code mapping
- Automatic expiry enforcement (7 days)
- Rate limiting: 30 requests per hour, keyed by client IP (Redis-backed, `scope: 'helper'`) —
  see `docs/technical/SHARE_WITH_VET.md` for the shared rate-limiter implementation

### Link Security
- Short codes (10 characters) using nanoid
- Database storage for token → shortCode mapping
- Schema: `helper_tokens` table
  ```sql
  - id (uuid)
  - shortCode (varchar, unique)
  - token (text, JWT)
  - petId (uuid)
  - ownerId (uuid)
  - helperLabel (varchar)
  - expiresAt (timestamp)
  - createdAt (timestamp)
  - viewCount (integer)
  - lastViewedAt (timestamp)
  ```

## Technical Implementation

### API Endpoints

See `src/routes/helper.ts` for the exact request/response shapes — the routes below are
wildcard-based (`GET/POST/PUT/DELETE /api/helper/*`) so a single token-or-short-code segment can
carry a JWT (which contains dots) or a 10-character short code.

#### Generate Helper Token
```
POST /api/pets/:petId/helper-token
Authorization: Bearer {user-token}

Request Body:
{
  "helperLabel": "Family" | "Sitter" | "Daycare" | "Other" | string
}

Response:
{
  "success": true,
  "data": {
    "token": "eyJhbGc...",
    "shortCode": "a1b2c3d4e5",
    "shareUrl": "https://pawjai.co/helper/a1b2c3d4e5",
    "expiresAt": "2024-12-01T00:00:00Z",
    "expiresInDays": 7,
    "helperLabel": "Family"
  }
}
```

#### Get Helper Landing Data (resolve + verify + pet info + own logs, in one call)
```
GET /api/helper/{token-or-shortCode}

Response:
{
  "success": true,
  "data": {
    "pet": { "name": "Max", "photoUrl": "https://...", "species": "dog" },
    "helperLabel": "Family",
    "expiresAt": "2024-12-01T00:00:00Z",
    "ownerLocale": "th",
    "logs": [ /* this helper's own logs created within the token's validity window */ ]
  }
}
```
There is no separate "resolve short code" or "verify token" endpoint — a single GET does both
and returns the landing page data plus the helper's own log history in one response.

#### Create Log as Helper
```
POST /api/helper/{token-or-shortCode}/logs

Request Body:
{
  "typeId": "uuid",          // pet_record_types.id — must be active
  "recordType": "activity" | "feeding" | "medication" | "symptom" | "vet_visit" | "weight" | "vaccination" | "grooming",
  "note": "Fed breakfast, seemed hungry",
  "occurredAt": "2024-11-24T12:00:00Z"
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "recordType": "activity",
    "typeId": "uuid",
    "note": "Fed breakfast, seemed hungry",
    "occurredAt": "2024-11-24T12:00:00Z",
    "createdAt": "2024-11-24T12:00:00Z",
    "type": { "nameEn": "...", "nameTh": "...", "iconUrl": "..." }
  }
}
```
Field names differ from earlier drafts of this doc: it's `typeId` + `recordType` + `note` +
`occurredAt`, not `recordTypeId` / `recordedAt` / `notes` / `amount` / `unit`.

#### Update / Delete a Helper's Own Log
```
PUT /api/helper/{token-or-shortCode}/logs/{logId}     -- update note (helper's own log only)
DELETE /api/helper/{token-or-shortCode}/logs/{logId}  -- soft delete (helper's own log only)
```
These two endpoints are not covered elsewhere in this doc's Phase 2 "Future Enhancements"
list — helpers can already edit and soft-delete logs they created themselves, scoped to the
same pet, same `helperLabel`, and within the token's issued/expiry window.

### Database Schema

#### helper_tokens Table
```sql
CREATE TABLE helper_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code TEXT UNIQUE NOT NULL,
  token TEXT NOT NULL,
  pet_id UUID NOT NULL,
  owner_id UUID NOT NULL REFERENCES user_profiles(id),
  helper_label TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  view_count INTEGER DEFAULT 0 NOT NULL,
  last_viewed_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX helper_tokens_short_code_idx ON helper_tokens(short_code);
CREATE INDEX helper_tokens_owner_id_idx ON helper_tokens(owner_id);
CREATE INDEX helper_tokens_expires_at_idx ON helper_tokens(expires_at);
```

#### pet_records Enhancement
```sql
ALTER TABLE pet_records ADD COLUMN helper_label TEXT;

-- helper_label: NULL = logged by the owner, otherwise the helper's label (e.g. "Family", "Sitter")
```
There is no separate `created_by` column on `pet_records` — `helper_label IS NULL` is how
owner-created vs. helper-created is distinguished (see `src/db/schema/pets.ts`).

### Frontend Routes

| Route | Description | Auth Required |
|-------|-------------|---------------|
| `/helper/:shortCode` | Helper landing page | No |
| `/helper/:shortCode/log` | QuickLog for helpers | Helper token |
| `/helper/:shortCode/success` | Success confirmation | No |

### Service Layer

**File:** `/src/services/helperTokenService.ts`

Key methods:
- `generateToken(petId, ownerId, helperLabel, petName, petPhotoUrl)` - Creates JWT and stores in DB
- `resolveShortCode(shortCode)` - Converts short code to JWT token
- `verifyToken(token)` - Validates JWT and returns payload
- `isTokenExpired(token)` - Checks expiry without throwing
- `decodeTokenUnsafe(token)` - Debug helper (unsafe)

## User Interface

### Owner View - Share Modal
```
┌──────────────────────────────────────┐
│  Share Max                      [×]  │
├──────────────────────────────────────┤
│                                      │
│  Choose how you want to share access │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ 🏥 Share with Vet              │ │
│  │ Vet can view health records    │ │
│  └────────────────────────────────┘ │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ 🏠 Add a Helper                │ │
│  │ Let someone log for this pet   │ │
│  └────────────────────────────────┘ │
│                                      │
└──────────────────────────────────────┘
```

### Owner View - Helper Type Selection
```
┌──────────────────────────────────────┐
│  Who will help?                 [×]  │
├──────────────────────────────────────┤
│                                      │
│  ○ 🏠 Family                         │
│  ○ 🐾 Sitter                         │
│  ○ 🏢 Daycare                        │
│  ○ 📝 Other: [_______________]       │
│                                      │
│           [Get Link]                 │
│                                      │
└──────────────────────────────────────┘
```

### Owner View - Generated Link
```
┌──────────────────────────────────────┐
│  Share Max with Family          [×]  │
├──────────────────────────────────────┤
│                                      │
│  Family members can log activities   │
│  for Max using this link.            │
│                                      │
│  ┌────────────────────────────────┐ │
│  │                                │ │
│  │      [QR CODE HERE]            │ │
│  │                                │ │
│  └────────────────────────────────┘ │
│                                      │
│  https://pawjai.co/helper/a1b2c3... │
│              [Copy Link] [Share]     │
│                                      │
│  ⏱️ Expires in 7 days                │
│                                      │
└──────────────────────────────────────┘
```

### Helper View - Landing Page
```
┌──────────────────────────────────────┐
│          [Pawjai Logo]               │
├──────────────────────────────────────┤
│                                      │
│          [Pet Photo]                 │
│                                      │
│     You're helping with Max          │
│        as Family                     │
│                                      │
│     Help log Max's daily activities  │
│                                      │
│        [Start Logging]               │
│                                      │
│  ⏱️ This link expires in 6 days       │
│                                      │
└──────────────────────────────────────┘
```

### Helper View - QuickLog
```
┌──────────────────────────────────────┐
│  Log Activity for Max           [×]  │
├──────────────────────────────────────┤
│                                      │
│  Activity Type                       │
│  [🍖 Food         ▼]                 │
│                                      │
│  Time                                │
│  [Nov 24, 2024    12:00 PM]          │
│                                      │
│  Notes (optional)                    │
│  ┌────────────────────────────────┐ │
│  │ Fed breakfast kibble with...   │ │
│  └────────────────────────────────┘ │
│                                      │
│  Amount (optional)                   │
│  [1] [cup ▼]                         │
│                                      │
│  Photo (optional)                    │
│  [📷 Add Photo]                      │
│                                      │
│          [Log Activity]              │
│                                      │
└──────────────────────────────────────┘
```

## Localization

Helper views support both English and Thai:
- Landing page
- QuickLog interface
- Success messages
- Error messages

Language detection:
1. URL parameter (`?lang=th`)
2. Browser language preference
3. Default: English

## Analytics & Tracking

### Key Metrics
- Helper links generated (by label type)
- Helper link views
- Helper link conversion rate (view → log)
- Logs created by helpers (by label type)
- Average logs per helper session
- Link expiry rate (unused links)
- Helper type distribution

### Database Tracking
```sql
-- Track in helper_tokens table
view_count INTEGER DEFAULT 0
last_viewed_at TIMESTAMP

-- Track in pet_records table
helper_label TEXT -- NULL = owner-created, otherwise the helper's label
```

## Error Handling

### Common Errors

| Error | HTTP Code | Message | User Action |
|-------|-----------|---------|-------------|
| Link expired | 410 | "This helper link has expired" | Request new link from owner |
| Invalid token | 401 | "Invalid helper link" | Check link or request new one |
| Pet not found | 404 | "Pet not found" | Contact owner |
| Rate limit | 429 | "Too many requests" | Wait and try again |
| Server error | 500 | "Failed to create log" | Try again later |

### Error UI
```
┌──────────────────────────────────────┐
│                                      │
│          ⚠️                          │
│                                      │
│    This Helper Link Has Expired      │
│                                      │
│  Please ask the pet owner to send    │
│  you a new link to continue helping. │
│                                      │
│        [Close]                       │
│                                      │
└──────────────────────────────────────┘
```

## Testing Scenarios

### Test Cases

1. **Generate Link (Owner)**
   - [ ] Can generate link for each helper type
   - [ ] Can copy link to clipboard
   - [ ] QR code displays correctly
   - [ ] Native share works on mobile
   - [ ] Link includes correct shortCode

2. **Access Link (Helper)**
   - [ ] Landing page shows pet info
   - [ ] Helper label displays correctly
   - [ ] Expiry countdown accurate
   - [ ] "Start Logging" navigates correctly

3. **Create Log (Helper)**
   - [ ] All activity types available
   - [ ] Time picker works
   - [ ] Notes field accepts text
   - [ ] Photo upload works
   - [ ] Submit creates log successfully
   - [ ] Success message displays

4. **View Logs (Owner)**
   - [ ] Helper logs appear in timeline
   - [ ] Helper badge shows correct label
   - [ ] Logs sorted correctly by time
   - [ ] Owner can edit helper logs
   - [ ] Owner can delete helper logs

5. **Expiry & Security**
   - [ ] Expired links show error
   - [ ] Invalid tokens rejected
   - [ ] Rate limiting works
   - [ ] Helper can't edit pet profile
   - [ ] Helper can't see other pets

## Future Enhancements

### Phase 2
- [ ] Link revocation (owner can deactivate before expiry)
- [ ] Helper history (owner sees who created which logs)
- [ ] Custom link duration (1 day, 7 days, 30 days)
- [ ] Helper permissions (read-only vs. log-only vs. full)
- [ ] Multiple pets in one link
- [ ] Helper notifications (owner gets notified of new logs)

### Phase 3
- [ ] Helper accounts (optional login for frequent helpers)
- [ ] Helper stats (how many logs, when active)
- [ ] Recurring helper links (auto-renew)
- [ ] Helper templates (save frequent helpers)
- [ ] Batch log creation (multiple activities at once)

## Related Documentation

- [Share with Vet](./SHARE_WITH_VET.md) - Similar sharing feature for vets
- [QuickLog](./QUICKLOG.md) - Activity logging system
- [Timeline](./TIMELINE.md) - Activity history display
- [Pet Access](./PET_ACCESS.md) - Owner access controls

## Technical References

**Backend:**
- `/src/services/helperTokenService.ts` - Token generation & verification
- `/src/routes/helper.ts` - Helper API endpoints
- `/src/routes/pets.ts` - Generate helper token endpoint
- `/src/db/schema/sharing.ts` - Database schema (helper_tokens table)

**Frontend:**
- `/components/petAccess/PetShareModal.tsx` - Share modal
- `/app/helper/[shortCode]/page.tsx` - Helper landing page
- `/app/helper/[shortCode]/log/page.tsx` - Helper QuickLog

---

**Last updated:** 2025-11-24
**Version:** 1.0
**Status:** ✅ Implemented & Deployed
