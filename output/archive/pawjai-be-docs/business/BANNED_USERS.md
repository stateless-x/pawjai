# Banned/Disabled Users - Business Logic

How account banning and disabling works in Pawjai.

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| `is_active` field | ✅ Implemented | Tracked on user profiles |
| `/api/auth/guard` endpoint | ✅ Implemented | Returns `isActive` status |
| Account disabled page | ✅ Implemented | Frontend `/auth/account-disabled` |
| Admin activate/deactivate API | ✅ Implemented | `PATCH /api/admin/users/:userId/status` |
| Admin UI buttons | ✅ Implemented | pawjai-admin user detail page |
| Audit logging | ✅ Implemented | `USER_ACTIVATED` / `USER_DEACTIVATED` events |
| Data deletion (GDPR) | ❌ Not implemented | Planned feature |

---

## Overview

Admins can disable user accounts for policy violations, suspicious activity, or user requests.

**Key Points:**
- Disabled accounts cannot sign in
- All data preserved (not deleted)
- Reversible by admin
- User sees clear message

---

## Account States

### Active (Default)

**Status:** `is_active = true`

**User Can:**
- Sign in normally
- Access all features
- Manage subscription
- Use all app features

**Default State:**
- All new accounts start as active
- No restrictions

---

### Disabled (Banned)

**Status:** `is_active = false`

**User Cannot:**
- Sign in (blocked at callback/handoff)
- Access any protected routes
- Reset password
- Use OAuth to bypass

**User Sees:**
```
🚫 Account Disabled

Your account has been disabled.
Please contact support for assistance.

support@pawjai.com
```

**What's Preserved:**
- All user data (profile, pets, records, photos)
- Subscription history
- Payment methods
- Timeline records

**What Happens:**
- Any active subscription is **not** automatically cancelled (see "How Banning Works" below)
- Existing session is **not** proactively invalidated -- the block takes effect on the next `/api/auth/guard` check
- Cannot create new account with same email

---

## How Banning Works

### Admin Bans User

**Backend Process:**
```sql
UPDATE user_profiles
SET is_active = false, updated_at = NOW()
WHERE id = '<user_id>';
```

**What Actually Happens:**
`adminUserService.updateUserStatus()` only flips `is_active` (and sets `deletedAt`) on the user's profile row -- it does not touch the user's subscription, does not cancel Stripe, and does not explicitly invalidate an existing session token. The block takes effect the next time the client calls `GET /api/auth/guard` (see flow below), so an already-signed-in user isn't kicked out instantly -- they lose access on their next guarded request.

**Subscription Handling:**
- Disabling a user does **not** automatically cancel their Stripe subscription or end an active grace period. If a banned user still has an active or past-due subscription, it continues unless separately cancelled.

---

### User Tries to Sign In

**Flow:**
```
User enters credentials
  ↓
Supabase authenticates (email/password or OAuth)
  ↓
Redirect to /auth/callback or /auth/native-handoff
  ↓
Backend check: GET /api/auth/guard
  ↓
Response: { isActive: false }
  ↓
Frontend redirects to /auth/account-disabled
  ↓
User sees disabled message
```

**No Bypass:**
- OAuth doesn't bypass check
- New device doesn't bypass
- Password reset doesn't work
- Cannot create new account (email taken)

---

## Reasons for Banning

### Policy Violations

**Examples:**
- Spam or abuse
- Fraudulent activity
- Terms of Service violation
- Harmful content

**Process:**
1. Admin reviews violation report
2. Admin disables account
3. User notified via email
4. Support ticket created for appeals

### Suspicious Activity

**Examples:**
- Multiple failed login attempts
- Unusual payment patterns
- Account sharing detected
- Bot-like behavior

**Process:**
1. System flags suspicious activity
2. Admin investigates
3. If confirmed: Account disabled
4. User contacted for verification

### User Request

**Examples:**
- User wants to close account
- GDPR data deletion request (coming soon)
- Account compromise

**Process:**
1. User contacts support
2. Admin verifies identity
3. Account disabled
4. Data deletion scheduled (future feature)

---

## User Experience

### Disabled Account Page

**Route:** `/auth/account-disabled`

**UI:**
```
┌──────────────────────────────────┐
│                                  │
│    🚫                            │
│                                  │
│    Account Disabled              │
│                                  │
│    Your account has been         │
│    disabled. Please contact      │
│    support for assistance.       │
│                                  │
│    [Contact Support]             │
│                                  │
└──────────────────────────────────┘
```

**Contact Support Button:**
- Opens email client: `mailto:support@pawjai.com`
- Pre-filled subject: "Account Disabled - Help Needed"
- User can explain situation

---

### Email Notification -- Not Implemented

There is no email service in this backend, so no automated email is sent when an account is disabled or re-enabled. The `PATCH /api/admin/users/:userId/status` endpoint doesn't even accept a reason, so any user-facing notification about why an account was disabled has to happen manually (e.g. support replying to an inbound ticket).

---

## Re-enabling Accounts

### Admin Reviews Appeal

**Process:**
1. User emails support
2. Admin reviews case
3. If justified: Account re-enabled
4. User notified via email

**Backend Process:**
```sql
UPDATE user_profiles
SET is_active = true, updated_at = NOW()
WHERE id = '<user_id>';
```

**User Can:**
- Sign in immediately
- Access all previous data
- Subscription NOT restored (must re-subscribe)

---

### Subscription After Re-enable

**Status:** Cancelled

**User Must:**
1. Sign in
2. Go to `/tier` page
3. Subscribe to Premium again (if desired)
4. New subscription created

**Previous Subscription:**
- Marked as cancelled
- Not restored automatically
- History preserved for records

---

## Admin Actions

### Disable / Enable Account

Both actions use the same endpoint -- there is no separate `/disable` or `/enable` route.

**Admin Panel:**
1. Navigate to user profile
2. Click "Deactivate User" (or "Activate User" if currently inactive)
3. Confirm action

**API Call:**
```bash
PATCH /api/admin/users/:userId/status
{
  "isActive": false
}
```

Set `isActive: true` to re-enable. The audit log records `USER_DEACTIVATED` or `USER_ACTIVATED` accordingly (see `src/utils/auditLog.ts`). There is no `reason`/`note` field in the request body today.

---

## Edge Cases

### User Disabled Mid-Session

**Scenario:** User signed in, admin disables account.

**What Happens:**
1. User continues current session (until next request)
2. Next API request checks `/api/auth/guard`
3. Returns `{ isActive: false }`
4. Frontend redirects to `/auth/account-disabled`

**Session Behavior:**
- The backend does not proactively invalidate the user's existing session token on disable
- The user is blocked as soon as their client next calls `/api/auth/guard` (typically on the next navigation or API request), not instantly

---

### OAuth User with Disabled Account

**Scenario:** User tries to sign in via OAuth (Google/Apple).

**Flow:**
```
OAuth succeeds with provider
  ↓
Redirect to /auth/callback
  ↓
Backend check: /api/auth/guard
  ↓
Response: { isActive: false }
  ↓
Redirect to /auth/account-disabled
```

**Cannot Bypass:** OAuth doesn't bypass account status check.

---

### User with Active Subscription Banned

**Scenario:** Premium user gets banned.

**What Happens:**
1. Account disabled (`is_active = false`)
2. The Stripe subscription itself is **not** automatically cancelled by `updateUserStatus()` -- it keeps billing unless an admin separately cancels it in Stripe
3. Access to premium features is revoked because the user can no longer sign in, not because the subscription was cancelled

**Refund Policy:**
- No automatic refunds
- User can appeal
- Admin can issue manual refund and/or manually cancel the subscription (rare cases)

---

## Data Retention

### While Disabled

**Data Preserved:**
- User profile
- All pets and records
- Photos and attachments
- Subscription history
- Payment methods (in Stripe)

**Not Deleted:**
- Account exists in database
- All data intact
- Can be re-enabled later

---

### Permanent Deletion (Future)

**Planned Feature:**
- User requests data deletion (GDPR)
- Admin schedules deletion
- 30-day grace period
- After 30 days: All data deleted

**Current:** No automatic deletion. Disabled accounts remain indefinitely.

---

## Monitoring & Reporting

### Metrics to Track

**Dashboard:**
- Total disabled accounts
- Disable rate (per week/month)
- Re-enable rate
- Appeals resolved

**Reports:**
- Disabled users by reason
- Time to resolution (appeal → decision)
- False positive rate

---

## Common Questions

**Q: Can disabled users access their data?**
A: No. They cannot sign in at all. Must contact support.

**Q: What happens to their subscription?**
A: Cancelled immediately. No refund unless appealed.

**Q: Can they create a new account?**
A: No. Email is already registered. Cannot bypass.

**Q: How long until re-enabled?**
A: Depends on appeal review. Usually 24-48 hours.

**Q: What if user deletes and re-signs up?**
A: Cannot. Email is taken. Supabase prevents duplicate emails.

**Q: Can admin delete their data?**
A: Not currently. Future feature (GDPR compliance).

---

## Key Files

| File | Purpose |
|------|---------|
| `src/routes/auth.ts` | `/api/auth/guard` endpoint |
| `src/routes/admin/users.ts` | Admin user management API |
| `src/services/adminUserService.ts` | `updateUserStatus()` method |
| `src/db/schema/users.ts` | `is_active` field on user profiles |

---

## Admin API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PATCH` | `/api/admin/users/:userId/status` | Activate/deactivate user |

**Request Body:**
```json
{
  "isActive": false
}
```

---

## Admin UI (pawjai-admin)

The user detail page (`/admin/users/[userId]`) includes:
- **Status badge** showing Active/Inactive
- **"Deactivate User"** button (when active)
- **"Activate User"** button (when inactive)

**Location:** `pawjai-admin/app/admin/users/[userId]/page.tsx`

---

**For technical implementation, see:**
- `src/routes/auth.ts` - Auth guard endpoint
- `src/routes/admin/users.ts` - Admin user status endpoint
- `src/services/adminUserService.ts` - User status update logic
- Frontend: `app/auth/account-disabled/page.tsx`
