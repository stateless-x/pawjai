# Notification System - Technical Architecture

**For**: Backend Engineers, DevOps, System Architects
**Last Updated**: 2025-12-15
**Status**: ✅ **PRODUCTION READY**

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Admin Notification Scheduling Types](#admin-notification-scheduling-types)
5. [Cron Job Implementation](#cron-job-implementation)
6. [Timezone Handling](#timezone-handling)
7. [User Tier Filtering](#user-tier-filtering)
8. [Push Notification Delivery](#push-notification-delivery)
9. [API Endpoints](#api-endpoints)
10. [Race Condition Prevention](#race-condition-prevention)
11. [Performance Considerations](#performance-considerations)
12. [Deployment](#deployment)

---

## System Overview

### Two Notification Systems

Pawjai has **two independent but unified** notification systems:

| System | Purpose | Who Creates | Frequency Options | Database Table |
|--------|---------|-------------|-------------------|----------------|
| **Admin Notifications** | Marketing, tips, reminders | Admin panel | Recurring, specific dates, weekly, monthly | `notification_settings` |
| **User Reminders** | Personal pet care reminders | Individual users | One-time or recurring (daily/weekly/monthly) | `user_reminders` |

**Both systems**:
- Run in single unified cron job (`unifiedNotificationJob.ts`)
- Use APNs for iOS push notifications
- Respect user timezone preferences
- Support multi-language (Thai/English)
- Appear as real push notifications on users' phones

---

## Scheduled vs Broadcast

The admin panel exposes two separate flows that share the same push pipeline and templating but differ in when/how they fire. Pick the one that matches the intent.

### Scheduled notifications (`notification_settings`)

**Use for**: recurring daily/weekly/monthly reminders, tips, nudges. Fire-and-forget. Admin creates once, cron delivers forever.

**Behavior**:
- Fires via the cron job (`unifiedNotificationJob.ts`) at a configured `hour:minute`, interpreted in each recipient's own local timezone.
- Supports recurring (1d/3d/7d/30d), specific dates, days-of-week, days-of-month schedule types.
- Has a 10-minute grace window after the scheduled minute: slow or restarted cron ticks still deliver that day.
- Per-user-per-day dedup via `notifications` table (silent or logged).
- Honors **tier filter** and **global kill switch**. **Does NOT** honor user category consent anymore — admins use scheduled for operational content (pet care reminders, feature tips) so every eligible user receives it.
- Source of truth for text + timing is the `notification_settings` row. Edits take effect on the next tick.
- Admin actions: create, edit, toggle active, archive, restore, delete, and optionally "Send Now" (routes through the broadcast pipeline with `kind='send_now'`).

### Broadcasts (`notification_broadcasts`)

**Use for**: one-off messages. Product announcements, outage alerts, time-sensitive promos, targeted campaigns. Fires immediately, never repeats.

**Behavior**:
- Fires via `notificationBroadcastService.broadcast(...)` immediately, in batches of 50 with `Promise.allSettled`.
- No schedule. Admin hits "Send now to N users" and it goes out within seconds.
- Writes a summary row to `notification_broadcasts` (targeted / sent / failed counts) and per-user rows to `notifications` with `sourceType='admin_broadcast'`.
- Three kinds: `ad_hoc` (POST `/api/admin/broadcasts`), `send_now` (from existing scheduled setting), `test_send` (single explicit userId for admin QA).
- Honors **tier filter** + **audience filters** (country, activity) + **global kill switch**. Does NOT honor user category consent. `test_send` additionally bypasses the global kill switch so admins can smoke-test during a pause.
- Audience count preview (`GET /api/admin/broadcasts/audience-count`) shares the same filter pipeline as the real send, so the number the admin sees equals what actually receives.

### Audience filters (broadcasts only)

| Filter | Source | Notes |
|---|---|---|
| `targetTier` | `user_subscriptions.plan` defaulting to `'free'` | `all` / `free` / `premium` |
| `countries` | `user_profiles.detected_country` | ISO 3166-1 alpha-2 list, case-insensitive. Empty or omitted = no country filter. |
| `activeWithinDays` | `user_profiles.last_login` | Only users who logged in within the last N days. `0` or omitted = no activity filter. Range 0-365. |

Filters are ANDed: a user passes only if they pass every active filter. Users missing a detected country are excluded when a country filter is set; users without a `last_login` are excluded when an activity filter is set.

### Templating (applies to both)

`{{petName}}`, `{{petNames}}`, `{{ownerName}}` resolve per-user at send time. `{{petName}}` picks the most recently engaged pet. Fallbacks per language: pet tokens -> `your pet` / `น้อง`; owner -> `there` / `คุณ`. Unknown tokens stay literal so admins catch typos in their own copy.

### Quick decision guide

- **"I want this message to keep firing every morning"** -> Scheduled (daily recurring).
- **"I want users to get a tip every Monday"** -> Scheduled (days_of_week).
- **"We shipped a new feature, tell everyone once"** -> Broadcast (ad_hoc).
- **"Run tonight's scheduled message now for the people who missed it"** -> Send Now on the existing scheduled setting.
- **"Only Thailand users, and only active-last-30-days"** -> Broadcast with `countries=['TH']` + `activeWithinDays=30`.
- **"Just deliver this to me so I can eyeball it"** -> Test Send.

### Consent policy (current)

- `user_config.notification_reminder_consent` and `notification_marketing_consent` columns remain in the schema.
- Neither scheduled nor broadcast checks them anymore. They persist so a future UX change can reintroduce consent-based filtering per-surface without a migration.
- Only controls that still apply to every push: **global kill switch** (`notification_config.notifications_enabled`) and **targeting** (tier + broadcast audience filters).

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     UNIFIED CRON JOB                        │
│      (runs every 5 minutes — see CronJob expression in      │
│           src/jobs/unifiedNotificationJob.ts)                │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌───────────────┐       ┌──────────────┐
│ Admin         │       │ User         │
│ Notifications │       │ Reminders    │
└───────┬───────┘       └──────┬───────┘
        │                      │
        │  ┌───────────────────┘
        │  │
        ▼  ▼
┌─────────────────────┐
│ Get User Timezone   │
│ & Preferences       │
│ & Subscription Tier │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Check if notification│
│ should fire now     │
│ (timezone-aware +   │
│  schedule-aware +   │
│  grace window)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Check Target Tier   │
│ (free/premium/all)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Per-user-per-day    │
│ dedup check         │
│ (hasUserReceivedToday)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Fan out via         │
│ broadcastFromSchedule│
│ (APNs / FCM push)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Create Next         │
│ (if recurring)      │
└─────────────────────┘
```

Note: category-based consent is **not** checked in this flow — see "Consent policy (current)"
above.

---

## Database Schema

### `notification_settings` (Admin Notifications)

```sql
CREATE TABLE notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT UNIQUE NOT NULL, -- Unique slug (e.g., "daily-morning-tip")
  category notification_category NOT NULL DEFAULT 'reminder', -- 'reminder' | 'marketing'
  target_tier target_tier NOT NULL DEFAULT 'all', -- 'all' | 'free' | 'premium'

  -- Multi-language content
  title_th TEXT NOT NULL,
  body_th TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_en TEXT NOT NULL,

  -- Send time (local time interpreted per-user)
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  minute INTEGER NOT NULL CHECK (minute >= 0 AND hour <= 59),

  -- Schedule configuration
  schedule_type schedule_type NOT NULL DEFAULT 'recurring',

  -- For 'recurring' type
  frequency notification_frequency NOT NULL DEFAULT '1d', -- '1d'|'3d'|'7d'|'30d'
  start_date DATE, -- Optional start date (null = start immediately)

  -- For 'specific_dates' type
  specific_dates JSONB, -- ["2025-12-24", "2025-12-25"]

  -- For 'days_of_week' type
  days_of_week JSONB, -- [1, 3, 5] = Mon, Wed, Fri (0=Sun, 6=Sat)

  -- For 'days_of_month' type
  days_of_month JSONB, -- [1, 15] = 1st and 15th of each month

  -- Tracking when notification was last sent
  last_sent_at TIMESTAMP WITH TIME ZONE,

  -- Control flags
  is_active BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMP WITH TIME ZONE, -- Soft delete

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES admins(id)
);

CREATE INDEX idx_notification_settings_identifier ON notification_settings (identifier);
CREATE INDEX idx_notification_settings_is_active ON notification_settings (is_active);
CREATE INDEX idx_notification_settings_archived_at ON notification_settings (archived_at);
CREATE INDEX idx_notification_settings_category ON notification_settings (category);

CREATE TYPE notification_category AS ENUM ('reminder', 'marketing');
CREATE TYPE target_tier AS ENUM ('all', 'free', 'premium');
CREATE TYPE schedule_type AS ENUM ('recurring', 'specific_dates', 'days_of_week', 'days_of_month');
CREATE TYPE notification_frequency AS ENUM ('1d', '3d', '7d', '30d');
```

**Key Fields**:
- `identifier`: Unique ID for tracking (e.g., "daily-pet-tip")
- `category`: 'reminder' or 'marketing' — used to label/organize notifications in the admin
  panel. Does NOT gate delivery; see "Consent policy (current)" above.
- `target_tier`: Filter by user subscription ('all', 'free', or 'premium')
- `title_th/body_th`: Thai language content
- `title_en/body_en`: English language content (default)
- `hour/minute`: Time to send (interpreted in each user's timezone!)
- `schedule_type`: How often to send (recurring, specific_dates, days_of_week, days_of_month)
- `frequency`: For recurring notifications (1d, 3d, 7d, 30d) - REQUIRED NOT NULL
- `start_date`: Optional start date for recurring notifications
- `last_sent_at`: Timestamp of last send (used for frequency calculation and duplicate prevention)
- `is_active`: Can pause without deleting
- `archived_at`: Soft delete (NULL = active)

### `user_reminders` (User Reminders)

```sql
CREATE TABLE user_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Deprecated (use reminder_pets instead)
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,

  -- Content
  title TEXT NOT NULL,
  description TEXT,
  reminder_type TEXT NOT NULL, -- 'medication'|'vet_appointment'|'grooming'|'custom'

  -- Schedule (stored as UTC!)
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,

  -- Recurring config
  repeat_interval TEXT, -- 'daily'|'weekly'|'monthly'|NULL
  repeat_until TIMESTAMP WITH TIME ZONE,

  -- State
  is_completed BOOLEAN NOT NULL DEFAULT false,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_reminders_scheduled
  ON user_reminders (user_id, scheduled_at)
  WHERE is_completed = false;

CREATE INDEX idx_user_reminders_pending
  ON user_reminders (scheduled_at, sent_at)
  WHERE is_completed = false AND sent_at IS NULL;
```

**Important**:
- `scheduled_at`: **Stored in UTC**, converted to user timezone for display
- `sent_at`: When notification was delivered (NULL = not sent yet)
- `repeat_interval`: NULL for one-time, 'daily'/'weekly'/'monthly' for recurring
- `is_completed`: true = soft deleted or paused

### `user_subscriptions` (User Subscription Status)

```sql
CREATE TABLE user_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  plan subscription_plan DEFAULT 'free', -- 'free' | 'premium'
  status subscription_status DEFAULT 'active',
  ...
);

CREATE TYPE subscription_plan AS ENUM ('free', 'premium');
```

**Used for**: Filtering admin notifications by target tier

---

## Admin Notification Scheduling Types

### 1. Recurring Notifications

**Use Case**: Daily/periodic notifications (tips, reminders)

**Required Fields**:
- `schedule_type`: 'recurring'
- `frequency`: '1d' | '3d' | '7d' | '30d' (REQUIRED - NOT NULL in database)
- `start_date`: Optional start date (YYYY-MM-DD format, null = start immediately)

**How it Works**:
1. Checks if current date >= start_date (if specified)
2. Checks days-since-anchor `% frequency days == 0`, where the anchor is `start_date` (or
   `created_at` if no start_date) — see `isRecurringScheduledToday()` in
   `notificationSchedulingService.ts`
3. Sends at specified hour:minute in user's timezone, within the grace window
4. Per-user-per-day dedup happens via the `notifications` table, not via `last_sent_at`

**Example**:
```json
{
  "schedule_type": "recurring",
  "frequency": "1d",
  "start_date": "2025-12-20",
  "hour": 10,
  "minute": 0
}
```
→ Sends every day at 10:00 AM starting Dec 20, 2025

### 2. Specific Dates Notifications

**Use Case**: Holiday messages, special events

**Required Fields**:
- `schedule_type`: 'specific_dates'
- `specific_dates`: Array of ISO date strings

**How it Works**:
1. Checks if today's date is in specific_dates array
2. Checks if already sent today (prevents duplicates)
3. Sends at specified hour:minute in user's timezone
4. Only sends ONCE per date

**Example**:
```json
{
  "schedule_type": "specific_dates",
  "specific_dates": ["2025-12-24", "2025-12-25", "2025-12-31"],
  "hour": 9,
  "minute": 0
}
```
→ Sends on Dec 24, 25, and 31 at 9:00 AM

### 3. Days of Week Notifications

**Use Case**: Weekly tips (e.g., "Meditation Mondays")

**Required Fields**:
- `schedule_type`: 'days_of_week'
- `days_of_week`: Array of day numbers (0=Sunday, 6=Saturday)

**How it Works**:
1. Checks if today's day of week is in days_of_week array
2. Checks if already sent today (prevents duplicates)
3. Sends at specified hour:minute in user's timezone
4. Repeats every week on selected days

**Example**:
```json
{
  "schedule_type": "days_of_week",
  "days_of_week": [1, 3, 5],
  "hour": 8,
  "minute": 30
}
```
→ Sends every Monday, Wednesday, Friday at 8:30 AM

### 4. Days of Month Notifications

**Use Case**: Monthly reminders (e.g., "First of the month")

**Required Fields**:
- `schedule_type`: 'days_of_month'
- `days_of_month`: Array of day numbers (1-31)

**How it Works**:
1. Checks if today's day of month is in days_of_month array
2. Checks if already sent today (prevents duplicates)
3. Sends at specified hour:minute in user's timezone
4. Repeats every month on selected days
5. Automatically skips invalid days (e.g., day 31 in February)

**Example**:
```json
{
  "schedule_type": "days_of_month",
  "days_of_month": [1, 15],
  "hour": 12,
  "minute": 0
}
```
→ Sends on 1st and 15th of each month at 12:00 PM

---

## Cron Job Implementation

### File: `src/jobs/unifiedNotificationJob.ts`

**Execution**: Periodic, via the `CronJob` schedule expression in `startUnifiedNotificationJob()`.
The interval is deliberately kept well below `DEFAULT_GRACE_MINUTES` (in
`notificationSchedulingService.ts`) so a slow or late tick still delivers inside the grace
window — read the comment above the `CronJob(...)` call for the exact coupling before changing
either value.

### Key Function: `isDueForUserNow()`

Defined in `src/services/notificationSchedulingService.ts`. Determines if an admin notification
should fire for a given user at this moment — the user's local time must be at or after the
setting's scheduled minute-of-day and within the grace window, AND today must be a scheduled
day per `isScheduledForUserToday()`.

**Signature**:
```typescript
function isDueForUserNow(
  setting: NotificationSetting,
  userTime: Date,              // current time converted to user's timezone
  graceMinutes?: number        // defaults to DEFAULT_GRACE_MINUTES
): boolean
```

Note: `shouldSkipByConsent()` also exists in the same file and is exported, but it is **not
called** from `unifiedNotificationJob.ts`. It is dead code from the caller's perspective — kept
in case a future UX change reintroduces per-category consent filtering.

### Admin Notification Flow

**File**: `src/jobs/unifiedNotificationJob.ts` — `sendAdminScheduledNotifications()`

Key steps per run:
1. Check global `notificationsEnabled` toggle — bail early if off
2. Overlap guard: if a prior tick started recently and hasn't completed, skip this tick
   (`OVERLAP_GUARD_MS`, tracked via `notification_config.lastRunStartedAt` /
   `lastRunCompletedAt`)
3. Optimistically claim the tick by updating `lastRunStartedAt` — only one worker proceeds
4. Fetch all active, non-archived settings + all users with active device tokens in batch
5. For each user × setting: resolve user timezone → `isDueForUserNow` → `shouldSkipByTier` →
   per-user-per-local-day dedup via `notificationService.hasUserReceivedToday`
6. Accumulate due user IDs per setting, then fan out once per setting via
   `notificationBroadcastService.broadcastFromSchedule(...)`, which writes a
   `notification_broadcasts` row (`kind='scheduled'`) and sends push in batches
7. Mark tick completion (`lastRunCompletedAt`) in a `finally` block

---

## Timezone Handling

### Golden Rule: Store UTC, Display Local

**All timestamps in database**:
- Stored as `TIMESTAMP WITH TIME ZONE` (UTC)
- PostgreSQL internally stores as UTC
- API returns ISO 8601 with 'Z' suffix (UTC)

### Admin Notification Timezone Logic

**Admin sets**: "Send at 10:00 AM"

**What happens**:
1. Admin notification stored with `hour=10, minute=0`
2. Cron job runs periodically (see the `CronJob` expression in `unifiedNotificationJob.ts`)
3. For each user:
   - Get user timezone (from `user_config.timezone` or default to `Asia/Bangkok`)
   - Convert current tick time to user's timezone using `toZonedTime(tickStart, userTz)`
   - If user's local time is at or after `10:00` and within the grace window
     (`isDueForUserNow`) → Send notification

**Example**:

| User Location | Timezone | UTC Time When Fired | Local Time |
|---------------|----------|---------------------|------------|
| Thailand | Asia/Bangkok (UTC+7) | 03:00 UTC | 10:00 AM |
| USA (NY) | America/New_York (UTC-5) | 15:00 UTC | 10:00 AM |
| Australia | Australia/Sydney (UTC+11) | 23:00 UTC (previous day) | 10:00 AM |

**All users receive at 10 AM their local time!**

### Timezone Conversion (Implementation)

```typescript
// src/services/notificationSchedulingService.ts — validateTimezone()
// src/jobs/unifiedNotificationJob.ts — per-user timezone resolution

const userTz = validateTimezone(prefs?.timezone || DEFAULT_TIMEZONE, userId);
const userTime = toZonedTime(now, userTz); // date-fns-tz
const userHour = userTime.getHours();
const userMinute = userTime.getMinutes();
```

**Features**:
- Uses `date-fns-tz` library for reliable timezone conversion
- Validates timezone before use
- Falls back to Asia/Bangkok if invalid
- Handles DST transitions automatically

---

## User Tier Filtering

**Feature**: Admin notifications can target specific user subscription tiers

**Location**: `src/services/notificationSchedulingService.ts` — `shouldSkipByTier()`

### How It Works

```typescript
// Get user subscription data
const userSub = userSubsMap.get(userId);
const userPlan = userSub?.plan || 'free'; // Default to free if no subscription record

// Filter based on targetTier setting
const targetTier = setting.targetTier || 'all'; // Default to 'all' for legacy notifications

if (targetTier === 'free' && userPlan === 'premium') {
  continue; // Skip premium users when targeting only free users
}

if (targetTier === 'premium' && userPlan === 'free') {
  continue; // Skip free users when targeting only premium users
}

// If targetTier is 'all', send to everyone (no filter needed)
```

### Target Tier Options

| Target Tier | Sends To | Use Case |
|-------------|----------|----------|
| `all` | Free + Premium users | General announcements, tips |
| `free` | Only free users | Upgrade prompts, premium features |
| `premium` | Only premium users | Exclusive content, thank you messages |

**Default**: 'all' (backward compatible)

**Fallback**: Users without subscription records are treated as 'free'

---

## Push Notification Delivery

### APNs (iOS) + FCM (Android)

**File**: `src/services/pushService.ts`

**Providers**: `@parse/node-apn` for iOS, `fcmService` (Firebase) for Android. `sendToUser`
fans out to both platforms concurrently per user — see `sendIosBatch` / `sendAndroidBatch` in
`pushService.ts`. If one provider is down, the other still delivers.

APNs key material comes from `env.apnsKeyBase64` or `env.apnsKeyPath` (see
`src/config/env.ts`), not a raw `process.env` read — `pushService.initializeAPNs()` is the
source of truth for exact config resolution.

### Sending Notifications

**Function**: `pushService.sendToUser(userId, payload, options)`

Admin scheduled notifications do not call this directly from the cron job — they go through
`notificationBroadcastService.broadcastFromSchedule()`, which calls `sendToUser` once per
recipient with `type: 'admin_schedule'` and `sourceType: 'admin_broadcast'`. User reminders call
`sendToUser` directly from `unifiedNotificationJob.ts` with `type: 'user_reminder'`.

**What Happens**:
1. Creates notification record in `notifications` table (marked `isSilent` when the source
   setting has `writeToLog: false`)
2. Sends push notification via APNs and/or FCM depending on the user's registered devices
3. User sees notification on their phone
4. User can tap to open app (deep link support — defaults to
   `/notifications?highlight=<notificationId>` when not overridden)
5. Notification history stored in-app for later viewing (unless silent)

---

## Race Condition Prevention

**Problem**: Multiple backend server instances running the same cron simultaneously could send
duplicate notifications, or double-process a tick.

**Solution**: Two separate optimistic-lock / dedup layers, not one:

1. **Tick-level overlap guard** (`sendAdminScheduledNotifications()` in
   `unifiedNotificationJob.ts`): before doing any work, the job checks
   `notification_config.lastRunStartedAt` / `lastRunCompletedAt`. If a prior tick started
   recently and hasn't completed (within `OVERLAP_GUARD_MS`), the new tick skips entirely. The
   job then optimistically claims the tick with a conditional `UPDATE ... WHERE
   lastRunStartedAt = <previous value>` — only one instance wins per tick.
2. **Per-user-per-day dedup** (`notificationService.hasUserReceivedToday`): before a user is
   added to a setting's recipient list, the job checks whether a `notifications` row already
   exists for that user + setting + local day (silent sends count too). This is what actually
   prevents the same user from getting the same scheduled notification twice, including across
   restarts.

There is no per-setting `lastSentAt` optimistic lock on `notification_settings` in the current
implementation. The `lastSentAt` column still exists on the table, but
`isRecurringScheduledToday()` in `notificationSchedulingService.ts` computes the RECURRING
schedule type's day count from `startDate` (or `createdAt` as a fallback anchor), not from
`lastSentAt` — and nothing in `unifiedNotificationJob.ts` writes to it. Treat it as unused
unless you find a write site.

---

## API Endpoints

### Admin Notification Endpoints

**List Notifications**:
```
GET /api/admin/settings/notifications
Authorization: Bearer {admin_jwt}
Response: {
  settings: [{ id, identifier, titleTh, titleEn, scheduleType, frequency, targetTier, ... }],
  config: { notificationsEnabled: true }
}
```

**Create Notification**:
```
POST /api/admin/settings/notifications
Authorization: Bearer {admin_jwt}
Body: {
  identifier: "daily-morning-tip",
  category: "reminder",
  targetTier: "all",
  titleTh: "เคล็ดลับ",
  bodyTh: "อย่าลืม...",
  titleEn: "Tip",
  bodyEn: "Don't forget...",
  hour: 8,
  minute: 0,
  scheduleType: "recurring",
  frequency: "1d",
  startDate: "2025-12-20",
  isActive: true
}
Response: { setting: { id, ...fields } }
```

**Validation**:
- `scheduleType: 'recurring'` requires `frequency`
- `scheduleType: 'specific_dates'` requires `specificDates` array
- `scheduleType: 'days_of_week'` requires `daysOfWeek` array
- `scheduleType: 'days_of_month'` requires `daysOfMonth` array
- Frontend validation at `/Users/purin/dev/pawjai/pawjai-admin/app/admin/settings/notifications/page.tsx:156-196`
- Backend validation at `/Users/purin/dev/pawjai/pawjai-be/src/routes/admin/settings.ts:325-342`

**Update Notification**:
```
PUT /api/admin/settings/notifications/:identifier
Authorization: Bearer {admin_jwt}
Body: { titleTh?, bodyTh?, isActive?, frequency?, targetTier?, ... }
Response: { setting: { id, ...updated_fields } }
```

**Toggle Active**:
```
PATCH /api/admin/settings/notifications/:identifier/toggle
Authorization: Bearer {admin_jwt}
Response: { setting: { id, isActive: boolean } }
```

**Archive Notification**:
```
PATCH /api/admin/settings/notifications/:identifier/archive
Authorization: Bearer {admin_jwt}
Response: { success: true }
Note: Soft delete (sets archived_at)
```

---

## Performance Considerations

### Database Queries

**Optimized Batch Fetching**:

```typescript
// GOOD: Fetch all users, prefs, and subscriptions in 3 queries
const activeUsers = await db.select({ userId: deviceTokens.userId })
  .from(deviceTokens)
  .where(eq(deviceTokens.isActive, true))
  .groupBy(deviceTokens.userId);

const userPrefs = await db.select().from(userConfig)
  .where(inArray(userConfig.userId, userIds));

const userSubs = await db.select().from(userSubscriptions)
  .where(inArray(userSubscriptions.userId, userIds));

// Create maps for O(1) lookup
const userPrefsMap = new Map(userPrefs.map(p => [p.userId, p]));
const userSubsMap = new Map(userSubs.map(s => [s.userId, s]));
```

### Cron Job Optimization

**Index Usage**:

```sql
-- Ensure indexes for common queries
CREATE INDEX idx_notification_settings_is_active
  ON notification_settings (is_active);

CREATE INDEX idx_notification_settings_archived_at
  ON notification_settings (archived_at);

CREATE INDEX idx_user_reminders_pending
  ON user_reminders (scheduled_at)
  WHERE sent_at IS NULL AND is_completed = false;
```

---

## Deployment

### Environment Variables

```bash
# APNs Configuration
APNS_KEY_ID=ABC1234567
APNS_TEAM_ID=DEF1234567
APNS_KEY_CONTENT=<base64_encoded_p8_file>
APNS_TOPIC=com.pawjai.app

# Database
DATABASE_URL=postgresql://user:pass@host:port/db
```

Note: The cron schedule (`* * * * *`) is hardcoded in `src/jobs/unifiedNotificationJob.ts` and is not configurable via env var.

### Database Migrations

**Required Migrations**:
1. `0057_bent_squadron_sinister.sql` - Adds frequency enum and column
2. `0058_motionless_fantastic_four.sql` - Adds flexible scheduling fields
3. `0059_lumpy_slayback.sql` - Adds targetTier field
4. `0060_curved_firestar.sql` - Makes frequency NOT NULL with safe UPDATE

**Run migrations**:
```bash
bun run db:migrate
```

### Monitoring

**Metrics to Track**:
- Notification send rate
- Notification delivery rate (sent / delivered)
- APNs and FCM failure rate
- Cron job execution time
- Overlap-guard skips (tick claimed by another worker or still in flight)

**Alerts**:
- Cron job hasn't run recently (compare against the configured interval — see
  `unifiedNotificationJob.ts`)
- APNs/FCM delivery failure > 10%
- Database connection lost
- Cron job execution time approaching the tick interval

---

## Related Documentation

**Code**:
- `/src/jobs/unifiedNotificationJob.ts` - Cron job implementation
- `/src/services/pushService.ts` - APNs + FCM delivery
- `/src/services/notificationBroadcastService.ts` - Fan-out, audience filters, broadcast history
- `/src/routes/admin/settings.ts` - Admin notification API
- `/src/routes/reminders.ts` - User reminder API

---

**Last Updated**: 2025-12-15
