# QuickLog - Business Logic

The quick logging feature on the dashboard.

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| 4 record types | ✅ Implemented | Activity, Symptom, Vet Visit, Medication |
| 30 records/pet/day limit | ✅ Implemented | Enforced at creation time |
| Pet selector (free: 1, premium: all) | ✅ Implemented | Based on access control |
| Date/time selection | ✅ Implemented | Defaults to now |
| Timezone-aware timestamps | ✅ Implemented | Shows user's local time |
| Notes field | ✅ Implemented | Text field |
| Photo upload | ⚠️ Partial | Available in timeline edit, not QuickLog |
| Voice input | ❌ Not implemented | Planned feature |
| Templates | ❌ Not implemented | Planned feature |

---

## Overview

**QuickLog** is a fast way to log pet activities directly from the dashboard without navigating to the timeline page.

**Key Features:**
- Always visible on dashboard
- One-click logging
- Minimal form fields
- Instant save (no page refresh)

---

## Where It Appears

### Dashboard Widget

**Location:** Top section of dashboard (above timeline preview)

**Layout:**
```
┌──────────────────────────────────────┐
│  Quick Log                           │
│  ────────────────────────────────    │
│  Pet: Luna ▼                         │
│  Type: Activity ▼                    │
│  Date: Today, 2:30 PM ▼              │
│  Notes: [                          ] │
│                                      │
│  [Save Log]                          │
└──────────────────────────────────────┘
```

---

## Form Fields

### 1. Pet Selector

**Free Users:**
- Shows only accessible pet
- Auto-selected (no dropdown if only 1 pet)
- Disabled (cannot change)

**Premium Users:**
- Dropdown with all pets (up to 10)
- Last selected pet remembered
- Can quickly switch between pets

### 2. Record Type

**Options:**
- 🐾 Activity
- 🤒 Symptom
- 🏥 Vet Visit
- 💊 Medication

**Default:** Activity (most common)
**Memory:** Last selected type remembered per session

### 3. Date & Time

**Options:**
- Today (default)
- Yesterday
- Custom date picker

**Time:**
- Current time (auto-filled in **user's local timezone**)
- Can adjust manually
- **Timezone-aware**: Times automatically adjust based on user's location

**Quick Picks:**
```
Today, 2:30 PM   ← Default (shows YOUR local time)
Yesterday
Custom date...
```

**Important**: All times display in YOUR timezone:
- Thailand user sees: "2:30 PM" Bangkok time
- USA user sees: "2:30 PM" EST/PST (depending on location)
- Traveling? Times automatically adjust to new timezone

### 4. Notes

**Field Type:** Text area (multi-line)
**Max Length:** 500 characters
**Optional:** Yes (can be empty)
**Placeholder:** "E.g., Played fetch in the park"

### 5. Photo (Future)

**Planned Feature:**
- Quick photo upload
- Camera capture (mobile)
- Drag-and-drop support

**Current:** Add photos via timeline edit

---

## User Flow

### Happy Path (Fastest)

```
1. User opens dashboard
2. QuickLog already visible (no navigation)
3. Pet auto-selected (only 1 accessible)
4. Type: Keep default (Activity)
5. Date: Keep default (Today)
6. Type notes: "Walked 30 minutes"
7. Click "Save Log"
8. ✅ Saved! Form resets.
```

**Time:** ~5 seconds from dashboard load to saved

### Multi-Pet User (Premium)

```
1. User opens dashboard
2. QuickLog shows last-used pet
3. Click pet dropdown → Select "Max"
4. Select type: "Vet Visit"
5. Date: Keep default (Today)
6. Type notes: "Annual checkup"
7. Click "Save Log"
8. ✅ Saved! Form resets.
```

---

## Behavior After Save

### Successful Save

**What Happens:**
1. Record saved to database
2. Timeline preview updates (new record appears)
3. Success toast: "Activity logged! 🎉"
4. Form resets to defaults:
   - Pet: Same pet (remembered)
   - Type: Activity (reset to default)
   - Date: Today (current time)
   - Notes: Empty (cleared)
5. Ready for next log immediately

### Failed Save (Error)

**Common Errors:**
- Network error (offline)
- Server error (500)
- Validation error (notes too long)

**What User Sees:**
```
❌ Failed to save record
   Please check your connection and try again.

   [Retry]
```

**Form Behavior:**
- Form data preserved (not cleared)
- User can fix issue and retry
- Error toast shown with details

---

## Validation

### Required Fields
- Pet (must be selected)
- Type (must be selected)
- Date (must be valid date)

**Notes are optional** (can be empty)

### Field Constraints

| Field | Constraint |
|-------|-----------|
| Pet | Must be accessible (for free users) |
| Type | Must be one of 4 types |
| Date | Cannot be future date |
| Notes | Max 500 characters |

### Error Messages

```
Pet: "Please select a pet"
Type: "Please select a record type"
Date: "Date cannot be in the future"
Notes: "Notes too long (max 500 characters)"
```

---

## QuickLog vs Timeline Add

| Feature | QuickLog | Timeline Add |
|---------|----------|--------------|
| **Location** | Dashboard (always visible) | Timeline page (must navigate) |
| **Speed** | ⚡ Very fast (minimal fields) | Slower (more options) |
| **Fields** | Essential only | All fields available |
| **Photos** | Not yet supported | ✅ Supported |
| **Best For** | Quick daily logs | Detailed records with photos |

**Use QuickLog for:** Daily activities, quick notes
**Use Timeline Add for:** Vet visits with photos, detailed symptom logs

---

## Free vs Premium QuickLog

### Free Users

**Behavior:**
- Shows only accessible pet (auto-selected)
- No pet dropdown (disabled)
- All record types available
- No lower bound on record date at creation time (the 3-month limit only affects which *existing* records are visible in Timeline, not what date you can log a new record for)

**Example:**
```
Pet: Luna (auto-selected, no dropdown)
Type: Activity ▼
Date: Today ▼
Notes: [                          ]

[Save Log]
```

### Premium Users

**Behavior:**
- Pet dropdown with all pets (up to 10)
- Last selected pet remembered
- All record types available
- No date restrictions

**Example:**
```
Pet: Luna ▼ (or: Max, Mochi, ...)
Type: Activity ▼
Date: Today ▼
Notes: [                          ]

[Save Log]
```

---

## Mobile Experience

### Mobile Layout

**Optimized for:**
- Touch targets (larger buttons)
- Single column layout
- Easy thumb access

**QuickLog on Mobile:**
```
┌────────────────────────┐
│  Quick Log             │
│  ──────────────────    │
│  Pet: Luna ▼           │
│  Type: Activity ▼      │
│  Date: Today ▼         │
│  Notes:                │
│  [                   ] │
│  [                   ] │
│  [                   ] │
│                        │
│  [Save Log]            │
└────────────────────────┘
```

**Keyboard:**
- Shows automatically when tapping notes field
- Hides when saving (improves UX)

---

## Performance

### Loading Time
- **Initial Load:** < 100ms (no API call needed)
- **Save Action:** < 500ms (API call + UI update)
- **Form Reset:** Instant (client-side)

### Caching
- Pet list cached (5 minutes)
- Record types cached (never expires, static data)
- No caching for notes (always fresh)

---

## Timezone Handling

### How Timezones Work in QuickLog

**Golden Rule**: Store UTC, Display Local

**User Creates Record**:
```
1. User in Thailand logs activity at 3:00 PM
2. App detects timezone: Asia/Bangkok (UTC+7)
3. Client sends to server: 2026-01-15T15:00:00+07:00 (ISO 8601)
4. Server stores in database: 2026-01-15 08:00:00+00 (UTC)
5. API returns: 2026-01-15T08:00:00.000Z (UTC)
6. App displays: "3:00 PM" (converts UTC → Bangkok time)
```

**User Views Record in Different Timezone**:
```
Same record viewed by:
- Thailand user: "3:00 PM" (Bangkok time)
- USA user: "3:00 AM" (EST - same moment, different clock)
- Australia user: "7:00 PM" (Sydney time)
```

**All correct - same moment in time, different local representations!**

### Auto-Detection (Default Behavior)

**How It Works**:
1. App detects device timezone automatically using browser/device API
2. No manual setting needed from user
3. Updates automatically when user travels

**Example - Traveling**:
```
Before (in Thailand):
- Device timezone: Asia/Bangkok
- QuickLog shows: "3:00 PM" for activity created at 3 PM Bangkok

After (travels to USA):
- Device timezone changes: America/New_York
- QuickLog STILL shows: "3:00 PM" for SAME activity
  (because it was created at 3 PM Bangkok = 3 AM EST)
- NEW records: Show current EST time
```

### Manual Timezone Setting -- Not Exposed to Users

A `timezone` column exists on the user config table (`src/db/schema/users.ts`) and is read internally by push-notification scheduling (`notificationSchedulingService.ts`) to send reminders at the right local time. However, there is no route that lets a user set it themselves -- it's not a QuickLog/Settings feature today. Auto-detection from the client (device/browser timezone) is the only mechanism that affects what QuickLog displays.

### Technical Implementation

**Server Side**:
- All timestamps stored as `TIMESTAMP WITH TIMEZONE` (UTC)
- Database: PostgreSQL (native timezone support)
- ISO 8601 format for API requests/responses

**Client Side** (Recommended):
```typescript
// Detect user timezone
const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
// Result: "Asia/Bangkok", "America/New_York", etc.

// Send to server (ISO 8601 with timezone)
const timestamp = new Date().toISOString();
// Result: "2026-01-15T08:00:00.000Z"

// Display to user (convert to local)
const displayTime = new Date(utcTimestamp).toLocaleString('en-US', {
  timeZone: userTz,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
});
// Result: "3:00 PM" (in user's timezone)
```

### Common Timezone Scenarios

**Scenario 1: Multi-User Household**
```
Problem: Owner in Thailand, pet sitter in USA views same record
Solution: Each user sees time in their own timezone
- Owner sees: "3:00 PM" Bangkok
- Sitter sees: "3:00 AM" EST
```

**Scenario 2: Traveling Owner**
```
Problem: User travels from Thailand to USA
Solution:
- Old records: Show time relative to when they were created
- New records: Use current device timezone (USA)
- No manual changes needed
```

**Scenario 3: Daylight Saving Time**
```
Problem: USA switches to DST
Solution: Automatic! Device timezone updates, times adjust
- Spring forward: 2:00 AM → 3:00 AM (no user action)
- Fall back: 2:00 AM → 1:00 AM (no user action)
```

---

## Future Enhancements

### Planned Features

1. **Voice Input**
   - Speak notes instead of typing
   - Mobile-friendly

2. **Quick Photo**
   - Add photo directly in QuickLog
   - Camera capture support

3. **Templates**
   - Save common logs as templates
   - One-click logging: "Daily walk", "Morning medication"

4. **Reminders**
   - Set recurring reminders to log
   - Notification: "Don't forget to log Max's medication!"

5. **Batch Logging**
   - Log same activity for multiple pets at once
   - Useful for multi-pet households

---

## Common Questions

**Q: Can I add photos in QuickLog?**
A: Not yet. Add photos by editing the record in timeline.

**Q: Why does QuickLog reset after saving?**
A: To be ready for the next log immediately. It assumes you're logging multiple activities in a row.

**Q: Can I edit a record from QuickLog?**
A: No. Edit records in timeline page. QuickLog is for creating only.

**Q: What happens if I'm offline?**
A: QuickLog fails to save. Form data preserved. Try again when online.

**Q: Can I log for yesterday?**
A: Yes. Select "Yesterday" or "Custom date" in date picker.

**Q: Why can't I see records older than 3 months on Free plan?**
A: The Free plan's Timeline view only shows the last 3 months of history. You can still log a record for any past date -- the limit is on what's visible later, not on what you can create. Upgrade to Premium for unlimited history.

**Q: Why do my QuickLog times look different when I travel?**
A: Times are **timezone-aware**! They automatically adjust to your device's timezone. A record created at "3:00 PM" Bangkok time will show as "3:00 AM" EST when viewed from USA. This is correct - same moment in time, different clock displays.

**Q: Can I force QuickLog to always show times in one timezone?**
A: Not currently. Times follow your device's detected timezone automatically; there is no setting yet to pin a specific timezone regardless of location.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/services/petRecordServices.ts` | Record creation, daily limit enforcement |
| `src/routes/petRecord.ts` | Record API endpoints |
| `src/constants/enums/pet.ts` | Record type enum (`RECORD_TYPE_ENUM`) |

---

**For technical details, see:**
- `src/services/petRecordServices.ts` - Record CRUD operations
- `src/routes/petRecord.ts` - Record API endpoints
