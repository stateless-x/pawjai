# Admin Notifications - Business Documentation

**For**: Product Managers, Marketing Team, Admins
**Last Updated**: 2025-12-19
**Status**: ✅ Production Ready

---

## Overview

Admin Notifications are **scheduled notifications sent to users** based on flexible schedules. Used for marketing, engagement campaigns, and recurring reminders.

**Key Features:**
- 4 schedule types (recurring frequency, specific dates, weekly pattern, monthly pattern)
- Multi-language (Thai/English) support
- Timezone-aware (each user gets it at their local time)
- Tier-based targeting (All/Free/Premium users)
- Global on/off toggle
- Soft delete (archive instead of delete)

**Does NOT honor per-category consent** (Reminder vs Marketing opt-out). Admin/scheduled
notifications are for operational content (pet care reminders, feature tips), so every
tier-eligible user receives them regardless of category preference. This differs from User
Reminders, which do respect consent. See `docs/technical/NOTIFICATIONS.md` for the full
scheduled-vs-broadcast distinction.

---

## How It Works - Technical Overview

### Real-Time Checking (NOT Pre-Scheduling)

Admin notifications use **real-time checking**:
- Cron runs periodically with a grace window on the scheduled time, so a tick can be late
  without missing a user (see the `CronJob` schedule and `DEFAULT_GRACE_MINUTES` in
  `src/jobs/unifiedNotificationJob.ts` / `src/services/notificationSchedulingService.ts`)
- Checks each user individually
- Evaluates if notification should send at user's current local time
- Sends immediately if conditions met
- NO database records created until sent

This is different from User Reminders which pre-create future occurrences in the database.

---

## 4 Schedule Types

### 1. RECURRING (Frequency-Based)

**Best For**: Daily tips, periodic reminders

**Settings**:
- **Frequency**: `1d`, `3d`, `7d`, `30d`
- **Start Date** (Optional): When to begin sending

**How It Works**:
- Tracks `lastSentAt` timestamp
- Calculates days since last send
- Sends when `daysSince >= frequency`

**Example 1 - Daily Care Reminder**:
```
Schedule Type: recurring
Frequency: 1d (every day)
Time: 21:21
Start Date: 2025-12-19
```
→ Sends every day at 21:21 starting Dec 19

**Example 2 - Weekly Wellness Tip**:
```
Schedule Type: recurring
Frequency: 7d (every week)
Time: 09:00
Start Date: 2025-12-20
```
→ Sends every 7 days at 09:00 starting Dec 20

**✅ STARTDATE OVERRIDE**: Changing `startDate` resets the schedule (explained below)

---

### 2. SPECIFIC_DATES (Calendar-Based)

**Best For**: Holiday messages, special events, one-time announcements

**Settings**:
- **Specific Dates**: Array of dates in YYYY-MM-DD format
- **Start Date** (Optional): Don't send before this date

**How It Works**:
- Checks if today matches any date in list
- Sends only once per date (prevents duplicates)
- Start date acts as "enable date" only

**Example - Holiday Messages**:
```
Schedule Type: specific_dates
Dates: ["2025-12-25", "2026-01-01", "2026-04-13"]
Time: 09:00
Start Date: 2025-12-20
```
→ Sends on Christmas, New Year, and Songkran at 09:00
→ Won't send on Dec 25 if start date is after Dec 25

**❌ NO OVERRIDE**: Changing `startDate` doesn't reset, just blocks sending before date

---

### 3. DAYS_OF_WEEK (Weekly Pattern)

**Best For**: Weekly tips, "Monday Motivation", recurring weekly events

**Settings**:
- **Days of Week**: Array of day numbers (0=Sunday, 6=Saturday)
- **Start Date** (Optional): Don't send before this date

**How It Works**:
- Checks if today's day-of-week matches selected days
- Sends once per day (prevents duplicates)
- Start date acts as "enable date" only

**Example - Monday/Wednesday/Friday Reminders**:
```
Schedule Type: days_of_week
Days: [1, 3, 5] (Mon, Wed, Fri)
Time: 08:30
Start Date: 2025-12-19
```
→ Sends every Mon/Wed/Fri at 08:30 starting Dec 19
→ If Dec 19 is Thursday, first send is Dec 20 (Friday)

**❌ NO OVERRIDE**: Changing `startDate` doesn't reset, just blocks sending before date

---

### 4. DAYS_OF_MONTH (Monthly Pattern)

**Best For**: Monthly reminders, billing reminders, monthly events

**Settings**:
- **Days of Month**: Array of day numbers (1-31)
- **Start Date** (Optional): Don't send before this date

**How It Works**:
- Checks if today's day-of-month matches selected days
- Sends once per day (prevents duplicates)
- Automatically skips invalid days (e.g., day 31 in February)
- Start date acts as "enable date" only

**Example - First and 15th of Every Month**:
```
Schedule Type: days_of_month
Days: [1, 15]
Time: 12:00
Start Date: 2025-12-19
```
→ Sends on 1st and 15th of every month at 12:00
→ If today is Dec 19, next send is Jan 1

**❌ NO OVERRIDE**: Changing `startDate` doesn't reset, just blocks sending before date

---

## StartDate Override Behavior (IMPORTANT!)

### RECURRING Type: StartDate is a "RESET BUTTON" ✅

When you change `startDate` on a **RECURRING** notification:
1. System ignores old `lastSentAt` if it's before new `startDate`
2. Treats as fresh start from new date
3. Counter resets from new `startDate`

**Use Case - Resetting a Schedule**:
```
Current state:
  Last sent: Dec 18
  Frequency: 3d
  Next scheduled: Dec 21

Admin changes startDate to Dec 19:
  ✅ Dec 19 at 21:21 → Sends (fresh start)
  ❌ Dec 20 → Skips (need 3 days)
  ❌ Dec 21 → Skips (need 3 days)
  ✅ Dec 22 → Sends (3 days passed from Dec 19)
```

**When to Use**:
- Re-enabling a disabled notification
- Fixing a scheduling error
- Starting fresh after content update

---

### Other 3 Types: StartDate is an "ENABLE DATE" ⚠️

For **SPECIFIC_DATES**, **DAYS_OF_WEEK**, **DAYS_OF_MONTH**:
- StartDate only prevents sending before that date
- Does NOT reset any counters or history
- Sends on every matching day after startDate

**To Reset These Types**:
1. Toggle `isActive` OFF then ON
2. Or change the pattern itself (different dates/days)

---

## Notification Categories

**Category no longer gates delivery.** `notificationReminderConsent` and
`notificationMarketingConsent` still exist on the user's profile and the Settings toggles still
write to them, but the cron job does not read either flag when deciding who receives a
scheduled notification (see the "Does NOT honor per-category consent" note above and
`docs/technical/NOTIFICATIONS.md` → "Consent policy (current)"). Category is still used to
label and organize notifications in the admin panel.

### 1. Reminder Notifications
**Category**: `reminder`

**Purpose**:
- Pet care reminders
- Health tips
- Important alerts

**Examples**:
- "Time to log your pet's daily activity!"
- "Don't forget monthly flea treatment"
- "Vaccine reminder: Check your pet's records"

**User Control**: The Settings → Notifications → Reminders toggle exists but does not currently
suppress scheduled sends.

---

### 2. Marketing Notifications
**Category**: `marketing`

**Purpose**:
- Promotions
- New features
- Engagement messages
- General tips

**Examples**:
- "New feature: AI Health Insights now available!"
- "Limited offer: 50% off Premium this weekend"
- "Pet care tip: How to brush your dog's teeth"

**User Control**: The Settings → Notifications → Marketing toggle exists but does not currently
suppress scheduled sends.

---

## Target Tier Filtering

Control which users receive notifications based on subscription status.

### All Users (Default)
```
targetTier: "all"
```
- Sends to everyone (free + premium)
- Best for: General content, pet care tips, feature updates

**Example**:
```
Title (EN): "Don't forget to log your pet's activities!"
Body (EN): "Your pet can't take care of themselves 🧡"
Target Tier: all
```

---

### Free Users Only
```
targetTier: "free"
```
- Sends ONLY to free tier users
- Skips premium subscribers
- Best for: Upgrade prompts, premium feature highlights

**Example**:
```
Title (EN): "Unlock Premium Health Insights! ⭐"
Body (EN): "Get AI-powered health analysis for your pet"
Target Tier: free
```

---

### Premium Users Only
```
targetTier: "premium"
```
- Sends ONLY to premium subscribers
- Skips free users
- Best for: Exclusive content, thank you messages

**Example**:
```
Title (EN): "Thank you for being Premium! 💎"
Body (EN): "Your support helps us build better features"
Target Tier: premium
```

---

## Timezone Behavior

### How It Works

Admin sets time in "local meaning" (e.g., "21:21")
System sends to each user at **21:21 in THEIR timezone**

**Example**:
```
Admin sets: 21:21 (9:21 PM)

Thailand user → 21:21 Bangkok time (UTC+7)
USA NY user   → 21:21 EST (UTC-5)
UK user       → 21:21 GMT (UTC+0)
Australia user → 21:21 Sydney time (UTC+11)
```

**Everyone gets it at 9:21 PM their local time!**

---

### User Timezone Source

1. Check user's `timezone` field in `user_config` table
2. If not set → Default to `Asia/Bangkok`
3. Invalid timezones → Fall back to `Asia/Bangkok`

**Best Practice**: Ensure users set timezone in app settings

---

## Language Selection

Notification language is determined by user's `preferredLanguage` setting:

```
if (user.preferredLanguage === 'th') {
  → Send Thai title + Thai body
} else {
  → Send English title + English body (default)
}
```

**Requirements**:
- BOTH Thai and English fields are required when creating notification
- Cannot create notification with only one language

---

## Admin Workflow

### Creating a New Notification

**Step 1**: Navigate to Admin Panel
```
https://admin.pawjai.co/settings/notifications
```

**Step 2**: Click "Create Notification"

**Step 3**: Fill Required Fields
- **Identifier**: Unique ID (lowercase, hyphens, e.g., `daily-care-tip`)
- **Category**: Reminder OR Marketing
- **Target Tier**: All / Free / Premium
- **Thai Title & Body**: (required)
- **English Title & Body**: (required)
- **Time**: Hour (0-23) and Minute (0-59)
- **Schedule Type**: Choose one of 4 types
- **Schedule Settings**: Based on type selected
- **Active**: ON to start sending immediately

**Step 4**: Save
- Notification becomes active
- Sends at next matching time for each user

---

### Editing Notifications

**To Edit Content/Time**:
1. Find notification in list
2. Click "Edit"
3. Modify fields
4. Save

**Important**:
- Changes apply to NEXT scheduled send
- Already-sent notifications unaffected
- For RECURRING: Can change `startDate` to reset schedule
- For others: Changing `startDate` only blocks before date

**To Pause**:
- Toggle "Active" to OFF
- Stops sending immediately
- No notifications sent while inactive

**To Resume**:
- Toggle "Active" to ON
- For RECURRING: Consider updating `startDate` to today for fresh start
- For others: Resumes on next matching day/date

**To Archive**:
- Click "Archive" button
- Soft delete (data preserved)
- Moves to "Archived" tab
- Can be restored later

**To Delete Permanently**:
- Go to "Archived" tab
- Click "Delete"
- Permanent deletion (cannot be undone)

---

## Scheduling Rules

### Time Format
- 24-hour format: 0-23 for hours, 0-59 for minutes
- Examples:
  - `09:00` = 9 AM
  - `14:30` = 2:30 PM
  - `21:21` = 9:21 PM
  - `00:00` = Midnight

### Frequency Options (Recurring Type Only)
- `1d` = Every day (daily)
- `3d` = Every 3 days
- `7d` = Every week (weekly)
- `30d` = Every month (roughly monthly)

### Send Conditions

For notification to send, ALL must be true:
1. ✅ Global toggle is ON (`notificationsEnabled = true`)
2. ✅ Notification is Active (`isActive = true`)
3. ✅ Not archived (`archivedAt = null`)
4. ✅ Current time is within the grace window of the schedule time (not an exact hour:minute match)
5. ✅ User has active device token
6. ✅ User's tier matches targetTier
7. ✅ Schedule conditions met (frequency passed / date matches / etc.)
8. ✅ User hasn't already received this notification today (per-user, per-local-day dedup)

Category-based consent is **not** checked (see "Notification Categories" above).

---

## Best Practices

### Time Selection

**High Engagement Times**:
- 08:00 - Morning routine
- 12:00 - Lunch break
- 18:00 - Evening routine
- 21:00 - Before bedtime

**Avoid**:
- 02:00-06:00 - Sleeping hours
- 23:00-01:00 - Too late

### Frequency

**Recommended**:
- Max 2-3 admin notifications per day
- Space them out (at least 4 hours apart)
- Don't compete with user's own reminders

**Avoid**:
- Hourly notifications (spam)
- Back-to-back notifications
- Too many marketing messages

### Content

**Good Content**:
- Clear and actionable
- Provides value (tips, reminders, useful info)
- Respectful of user's time
- Appropriate for category (reminder vs marketing)

**Bad Content**:
- Too salesy without value
- Generic copy-paste content
- Misleading or clickbait

### Category Selection

**Use "Reminder" for**:
- Health-related content
- Pet care tasks
- Time-sensitive information
- Important alerts

**Use "Marketing" for**:
- Promotions and offers
- New feature announcements
- General tips and advice
- Engagement messages

### Target Tier Strategy

**Target All Users for**:
- General pet care tips
- Important announcements
- Feature updates that apply to everyone

**Target Free Users for**:
- Upgrade prompts (max 1-2 per week)
- Premium feature highlights
- Special offers

**Target Premium Users for**:
- Thank you messages
- Exclusive tips/content
- Premium-only feature updates

---

## Troubleshooting

### "Notification not sending"

**Check**:
1. Is notification Active? (must be ON)
2. Is Global Toggle ON? (Admin Panel → Notification Config)
3. Is it the right time? (check current time vs scheduled time, allowing for the grace window)
4. Does the user have an active device token?
5. For RECURRING: Has enough time passed since last send?
6. For others: Is today a matching day/date?

### "Users receiving at wrong time"

**Check**:
- Verify user's timezone in database (`user_config.timezone`)
- Check if user recently traveled (timezone might be outdated)
- Verify scheduled hour/minute are correct

### "Wrong language sent"

**Check**:
- User's `preferredLanguage` field in database
- Default is English if not set
- Verify both Thai and English content exist in notification

### "Want to reset recurring notification"

**Solution**:
- Edit notification
- Change `startDate` to today or desired start date
- Save
- System will treat as fresh start and ignore old `lastSentAt`

---

## Related Documentation

- **User Reminders**: `/docs/business/USER_REMINDERS.md`
- **Technical Architecture**: `/docs/technical/NOTIFICATIONS.md`

---

**Last Reviewed**: 2025-12-19
