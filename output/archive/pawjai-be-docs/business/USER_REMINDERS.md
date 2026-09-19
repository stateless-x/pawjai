# User Reminders - Business Documentation

**For**: Product Managers, UX Designers, Customer Support
**Last Updated**: 2025-12-14

---

## Overview

User Reminders are **personal notifications** that users create for themselves to remember important pet care tasks. Unlike admin notifications (sent to everyone), these are individual and fully user-controlled.

**Key Features:**
- One-time OR recurring (daily/weekly/monthly)
- Multi-pet support (up to 10 pets per reminder)
- Timezone-aware (fires at user's local time)
- User-controlled (edit/delete/pause anytime)
- Four reminder types: Medication, Vet, Grooming, Custom

---

## How It Works - User Perspective

### Example: Daily Medication Reminder

**User Creates**:
- **Title**: "Give heartworm medication to Max"
- **Type**: Medication
- **Time**: 8:00 AM
- **Repeat**: Daily
- **Pet**: Max (Golden Retriever)

**What Happens**:

**Day 1** (User creates reminder):
- Reminder saved for Jan 15, 8:00 AM
- Shows in user's reminder list

**Jan 15 at 8:00 AM** (User's local time):
- Push notification sent: "Give heartworm medication to Max"
- User taps → Opens app to Max's profile
- User can mark as done or snooze

**Jan 16 at 8:00 AM**:
- Notification sent again (recurring daily)
- Continues forever until user stops it

**Timezone Awareness**:
- Thai user traveling to USA: Still gets notification at 8 AM (now USA time)
- Automatically adjusts to device timezone
- No manual timezone changes needed

---

## Reminder Types

### 1. Medication
**Icon**: 💊
**Purpose**: Medicine schedules, supplements, treatments
**Common Use Cases**:
- "Give flea medication"
- "Apply ear drops"
- "Heartworm prevention pill"
- "Arthritis medication"

**Typical Schedule**: Daily or monthly

### 2. Vet Appointment
**Icon**: 🏥
**Purpose**: Veterinary visits, health checkups
**Common Use Cases**:
- "Annual vaccine appointment"
- "Follow-up checkup"
- "Dental cleaning"
- "Grooming appointment at vet"

**Typical Schedule**: One-time (specific date)

### 3. Grooming
**Icon**: ✂️
**Purpose**: Grooming tasks and appointments
**Common Use Cases**:
- "Brush teeth"
- "Nail trimming"
- "Bath time"
- "Professional grooming appointment"

**Typical Schedule**: Weekly or monthly

### 4. Custom
**Icon**: 📝
**Purpose**: Any other pet care task
**Common Use Cases**:
- "Change water bowl"
- "Clean litter box"
- "Training session"
- "Playtime in park"

**Typical Schedule**: Varies

---

## Multi-Pet Support

### How It Works

Users can assign **one reminder to multiple pets** for tasks they do together.

**Example**: User has 3 dogs (Max, Buddy, Luna)

**Single Reminder**:
- Title: "Give flea medication"
- Pets: Max, Buddy, Luna (all selected)
- Time: 8:00 AM, first day of month
- Repeat: Monthly

**Result**:
- **One notification** sent at 8:00 AM
- Notification shows: "Give flea medication to Max, Buddy, and Luna"
- User completes task for all 3 dogs at once

**Why This Matters**:
- Reduces notification spam (1 instead of 3)
- Mirrors real-world behavior (users do tasks together)
- Keeps reminder list clean

**Limit**: Maximum 10 pets per reminder

---

## Recurring Reminders

### How Recurring Works

**User Creates**: Daily medication reminder for Jan 15

**Behind the Scenes**:
1. System creates **first occurrence only** (Jan 15)
2. On Jan 15 at 8 AM → Notification sent
3. System automatically creates **next 2 occurrences** (Jan 16, Jan 17)
4. On Jan 16 at 8 AM → Notification sent
5. System creates Jan 18 occurrence (maintains 2 future occurrences)
6. **Continues forever** (or until `repeatUntil` date)

**Why This Design**:
- Database stays small (not 365 rows for daily reminder)
- User can edit/delete without affecting old occurrences
- Performance: Only query upcoming reminders

### Repeat Intervals

**Daily**:
- Every day at same time
- Example: "Give medication at 8 AM"

**Weekly**:
- Every 7 days at same time
- Example: "Brush teeth every Sunday 7 PM"

**Monthly**:
- Same day of month at same time
- Example: "Flea treatment on 1st of every month"
- **Edge Case**: If created on Jan 31, Feb occurrence will be Feb 28/29

**One-Time** (No repeat):
- Single notification
- Example: "Vet appointment on Jan 20"
- Reminder disappears after notification sent

### End Date (Optional)

**repeatUntil**: Stop recurring after specific date

**Example**:
- Start: Jan 1, 2026
- End: Dec 31, 2026
- Result: Reminder stops automatically after Dec 31

**Use Case**: Temporary medication (30-day treatment)

---

## User Actions

### Creating a Reminder

**Mobile App Flow**:
1. Tap "+" button in Reminders tab
2. Select reminder type (Medication/Vet/Grooming/Custom)
3. Fill form:
   - Title (required)
   - Description (optional)
   - Select pet(s) (up to 10)
   - Set date & time
   - Choose repeat: None/Daily/Weekly/Monthly
   - Set end date (optional)
4. Tap "Save"

**Result**: Reminder added to list, notification scheduled

### Editing a Reminder

**What Can Be Edited**:
- Title
- Description
- Time
- Selected pets
- Repeat interval
- End date

**Important**: Editing only affects **future occurrences**, not past

**Example**:
- User created: "Give medication at 8 AM"
- Today is Jan 10
- User edits to: "9 AM" on Jan 5
- Jan 5-9 occurrences: Already sent at 8 AM (unchanged)
- Jan 10+ occurrences: Will send at 9 AM (updated)

### Pausing a Reminder

**Toggle Switch**: ON/OFF in reminder detail view

**When Paused**:
- Reminder stays in list (visible but grayed out)
- No notifications sent
- Can be resumed anytime

**Use Case**:
- Pet is at boarding (don't need medication reminders)
- Vacation (pause all reminders temporarily)

### Deleting a Reminder

**Action**: Swipe left → Delete (or tap trash icon)

**Result**:
- Reminder removed from list
- No future notifications
- **Soft delete**: Data preserved in database (can be recovered)

---

## Notification Behavior

### Notification Content

**Title**: User's reminder title
**Body**: Description (if provided) + Pet names
**Sound**: Default notification sound
**Badge**: App icon badge count increases

**Example**:
```
Title: Give heartworm medication
Body: Monthly prevention for Max and Buddy

[Tap to open]
```

### Notification Actions (Future)

**Planned**:
- "Mark as Done" (completes without opening app)
- "Snooze 15 min"
- "Skip this time"

**Current**: Tap opens app to reminder detail

### Failed Notifications

**If User Has Notifications Disabled**:
- iOS: Notification not delivered
- Reminder still shows in app (in-app reminders work)
- User can check manually

**If App Deleted**:
- Notifications stop (APNs knows app is uninstalled)
- Reminders remain in database
- Resume if user reinstalls app

---

## Timezone Behavior

### Auto-Detection

**Default**: App detects device timezone automatically

**How**:
1. User creates reminder at "8:00 AM"
2. App reads: `Intl.DateTimeFormat().resolvedOptions().timeZone`
3. Result: "Asia/Bangkok" (for Thai users)
4. Sends to server: `2026-01-15T08:00:00+07:00` (ISO 8601 with timezone)
5. Server stores: `2026-01-15 01:00:00+00` (UTC)

**Display**:
- Server returns: `2026-01-15T01:00:00.000Z`
- App converts to local: 8:00 AM Bangkok time
- User sees: "8:00 AM" (their local time)

### Manual Timezone Setting (Optional)

**Use Case**: User wants reminders in different timezone (e.g., pet is at home while traveling)

**How**:
1. Go to: Settings → Timezone
2. Select timezone: "Asia/Bangkok"
3. Save

**Result**: All reminders fire at selected timezone, not device timezone

**Example**:
- User in USA (PST)
- Pet at home in Thailand
- Sets timezone to "Asia/Bangkok"
- Reminder at 8 AM Bangkok time = 5 PM PST

### Traveling Across Timezones

**Scenario**: User travels from Thailand to USA

**Before (Thailand)**:
- Reminder set: 8:00 AM
- Device timezone: Asia/Bangkok
- Notification fires: 8:00 AM Bangkok time

**After (USA)**:
- User lands in New York
- Device timezone auto-changes: America/New_York
- Notification fires: 8:00 AM **New York time** (automatic!)

**No manual change needed** - follows device timezone by default.

---

## Reminder List Display

### How Reminders Are Shown

**List View**:
```
Upcoming Reminders

Today, 8:00 AM
💊 Give heartworm medication
    Max, Buddy

Tomorrow, 7:00 PM
✂️ Nail trimming
    Luna

Jan 20, 3:00 PM
🏥 Vet checkup
    Max
```

**Sorting**: By scheduled time (soonest first)

**Recurring Indicators**:
- 🔁 Daily
- 🔁 Weekly
- 🔁 Monthly

**Completed Reminders**: Hidden (don't show past occurrences)

### Empty State

**No Reminders Created**:
```
No reminders yet

Stay on top of your pet's care by setting reminders for:
• Medication schedules
• Vet appointments
• Grooming tasks

[+ Create First Reminder]
```

---

## Best Practices (User Education)

### Good Reminder Times

**High Adherence**:
- Morning routine: 7-9 AM
- After work: 5-7 PM
- Before bed: 9-10 PM

**Low Adherence**:
- Middle of night: 1-5 AM (sleeping)
- Mid-day: 12-2 PM (busy, away from home)

### Clear Titles

**Good**:
- "Give heartworm pill to Max"
- "Apply ear drops (left ear)"
- "Brush teeth - all 3 dogs"

**Bad**:
- "Medication" (which one? which pet?)
- "Do the thing"
- "Remember"

### Use Descriptions

**Example**:
- Title: "Give arthritis medication"
- Description: "2 pills with food, morning dose"

**Helps**: User remembers exact dosage/instructions

### Multi-Pet Grouping

**Do Group**:
- Tasks done together: "Feed all dogs"
- Same medication: "Flea treatment (all cats)"

**Don't Group**:
- Different medications: Max needs heart pill, Buddy needs insulin (separate reminders)
- Different times: Max groomed 8 AM, Buddy groomed 2 PM

---

## Edge Cases & FAQs

### Q: Can I edit a recurring reminder's past occurrences?

**A**: No. Editing only affects future occurrences. Past occurrences are locked (already sent).

### Q: What happens if I delete a recurring reminder?

**A**: All future occurrences are canceled. No more notifications. Past occurrences remain in history.

### Q: Can I have multiple reminders with the same name?

**A**: Yes. Title doesn't need to be unique. Useful for: "Give medication" (morning) and "Give medication" (evening).

### Q: What's the maximum number of reminders I can create?

**A**: No hard limit currently. Recommended: Keep under 50 for performance.

### Q: Can I set reminders for pets I don't own?

**A**: No. You can only select from your own pets.

### Q: What happens if notification permission is denied?

**A**: Reminders still exist in app (you can check manually). No push notifications sent. In-app reminder list still works.

### Q: Can I export my reminders?

**A**: Not yet (planned feature).

### Q: Can I share reminders with other users?

**A**: Not yet (planned for multi-owner households).

---

## Analytics & Insights (Future)

### Planned Features

**Adherence Tracking**:
- "Mark as Done" button
- Completion rate: 85% adherence this month
- Streak tracking: 30 days medication streak

**Smart Reminders**:
- Suggest reminders based on pet breed/age
- "Golden Retrievers often need hip medication after age 8"

**Integration with Health Insights**:
- Link medication to health conditions
- Track effectiveness over time

---

## Troubleshooting (User-Facing)

### "I didn't receive a notification"

**Check**:
1. Is notification permission ON? (Settings → Notifications → Pawjai)
2. Is reminder active? (not paused/deleted)
3. Is Do Not Disturb ON? (iOS silences notifications)
4. Is time correct? (check timezone)

### "Notification came at wrong time"

**Possible Causes**:
- Device timezone incorrect (check Settings → General → Date & Time)
- Manually set timezone in app (check Pawjai Settings → Timezone)
- Daylight saving time change (automatic - may shift 1 hour)

### "I'm getting duplicate notifications"

**Check**:
- Do you have multiple devices logged in? (Each sends notification)
- Check if you created the same reminder twice
- Verify reminder isn't set to multiple times

### "Reminder disappeared after editing"

**Not a bug**: If you changed time to past, reminder already fired and completed.

**Fix**: Create new reminder with future time.

---

## Comparison: User Reminders vs Admin Notifications

| Feature | User Reminders | Admin Notifications |
|---------|----------------|---------------------|
| **Who creates** | Individual users | Admin/Marketing team |
| **Who receives** | Only that user | All tier-eligible users |
| **Frequency** | One-time or recurring | Recurring, specific dates, weekly, or monthly (4 schedule types) |
| **Edit/Delete** | User can edit/delete | Only admin can edit |
| **Pet-specific** | Yes (multi-pet support) | No (generic to all users) |
| **Timezone** | User's local time | User's local time |
| **Consent** | Always sent (user created it; no consent check in the send path) | Not enforced — the consent flags exist but the cron job does not check them. See `docs/technical/NOTIFICATIONS.md` → "Consent policy (current)". |
| **Language** | App language | User's `preferredLanguage` |

**Both systems respect user timezone!**

---

## Related Documentation

- **Technical**: `/docs/technical/NOTIFICATIONS.md`
- **Admin Notifications**: `/docs/business/ADMIN_NOTIFICATIONS.md`

---

**Last Reviewed**: 2025-12-14
**Status**: ✅ Production Ready
