# Timeline - Business Logic

How activity logging and timeline viewing works in Pawjai.

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| 4 record types | ✅ Implemented | Activity, Symptom, Vet Visit, Medication |
| Free: 3-month history | ✅ Implemented | `petRecordServices.ts` filters by `plan_rules.timelineHistoryMonths` |
| Premium: Unlimited history | ✅ Implemented | No date filter applied |
| Filter by pet | ✅ Implemented | Premium users can filter |
| Filter by record type | ✅ Implemented | All users |
| Photo attachments | ✅ Implemented | Multiple photos per record supported (`pet_records.image_url` is an array) |
| Edit records | ✅ Implemented | CRUD operations |
| Delete records | ✅ Implemented | Soft delete |
| Search by keyword | ❌ Not implemented | Planned feature |
| Export to PDF/CSV | ❌ Not implemented | Planned feature |

---

## Overview

**Timeline** is the central feature for viewing your pet's health history in chronological order.

**What It Shows:**
- All logged activities, symptoms, vet visits, and medications
- Organized by date (newest first)
- Filterable by pet and record type
- Includes photos, notes, and timestamps

---

## Record Types

### 1. Activity
**Examples:**
- Walks, playtime, exercise
- Training sessions
- Social interactions
- Behavior observations

**Typical Use:**
```
🐾 Activity - Nov 9, 2025 2:30 PM
   Played fetch in the park for 30 minutes

   Luna seemed very energetic today!
```

### 2. Symptom
**Examples:**
- Coughing, sneezing, vomiting
- Limping, lethargy
- Skin issues, allergies
- Behavioral changes

**Typical Use:**
```
🤒 Symptom - Nov 8, 2025 10:15 AM
   Scratching ears frequently

   Started yesterday. Left ear looks red.
   Photo: [ear-closeup.jpg]
```

### 3. Vet Visit
**Examples:**
- Checkups, vaccinations
- Treatments, surgeries
- Lab tests, diagnoses
- Medication prescriptions

**Typical Use:**
```
🏥 Vet Visit - Nov 5, 2025 9:00 AM
   Annual checkup at Paw Clinic

   Dr. Smith says Luna is healthy. Vaccinations updated.
   Weight: 4.2 kg
```

### 4. Medication
**Examples:**
- Pills, tablets, liquid medicine
- Flea/tick treatments
- Supplements, vitamins
- Topical treatments

**Typical Use:**
```
💊 Medication - Nov 3, 2025 8:00 AM
   Heartworm prevention (Heartgard)

   Monthly dose. Next dose: Dec 3, 2025
```

---

## Timeline Views

### Default View (All Records)

**What You See:**
```
┌─────────────────────────────────────┐
│  Timeline - Luna                    │
│  ────────────────────────────────   │
│  Filter: All Types ▼  All Time ▼    │
│  ────────────────────────────────   │
│                                     │
│  📅 Nov 9, 2025                     │
│  ─────────────────────              │
│  🐾 Activity  2:30 PM               │
│  Played fetch in the park           │
│  [Photo] [Edit] [Delete]            │
│                                     │
│  🤒 Symptom  10:15 AM               │
│  Scratching ears frequently         │
│  [Photo] [Edit] [Delete]            │
│                                     │
│  📅 Nov 8, 2025                     │
│  ─────────────────────              │
│  🏥 Vet Visit  9:00 AM              │
│  Annual checkup                     │
│  [Photo] [Edit] [Delete]            │
│                                     │
│  [Load More] ↓                      │
└─────────────────────────────────────┘
```

### Filtered View (By Type)

**User Actions:**
1. Click "Filter" dropdown
2. Select record type (Activity, Symptom, etc.)
3. Timeline shows only selected type

**Example (Symptoms Only):**
```
Filter: Symptoms ▼

📅 Nov 9, 2025
🤒 Scratching ears
🤒 Sneezing

📅 Nov 5, 2025
🤒 Vomiting after breakfast
```

### Filtered View (By Pet)

**For Multi-Pet Users (Premium):**
```
Filter: Luna ▼  (or: Max, Mochi)

Shows only Luna's records
```

**For Free Users:**
- Only accessible pet shown (auto-filtered)
- No pet filter dropdown (only 1 pet accessible)

---

## Timeline Access Limits

### Free Plan
- **History:** Last 3 months only
- **Pets:** Only accessible pet (most recently logged)
- **Records:** All types included

**Example:**
```
Today: Nov 9, 2025
Visible: Aug 9 - Nov 9 (3 months)
Hidden: Everything before Aug 9
```

### Premium Plan
- **History:** Unlimited (all time)
- **Pets:** All pets (up to 10)
- **Records:** All types included

---

## Adding Records

### From Timeline Page

**User Actions:**
1. Click "Add Record" button (top-right)
2. Select pet (if multiple)
3. Select record type
4. Enter details:
   - Date/time (defaults to now)
   - Notes
   - Photo (optional)
5. Click "Save"

**What Happens:**
- Record saved to database
- Timeline refreshes (new record appears)
- Success toast: "Record saved! ✅"

### From QuickLog (Dashboard)

**User Actions:**
1. Use QuickLog widget on dashboard
2. Fill form (pet, type, date, notes)
3. Click "Save Log"

**What Happens:**
- Record saved
- Visible in timeline immediately
- QuickLog form resets

---

## Editing Records

### Edit Flow

**User Actions:**
1. Click "Edit" button on record
2. Edit form appears (pre-filled with existing data)
3. Modify fields
4. Click "Save Changes"

**What Can Be Edited:**
- Record type
- Date/time
- Notes
- Photo (add/replace/remove)

**What Cannot Be Edited:**
- Pet (cannot move record to different pet)
- Created timestamp (audit trail)

---

## Deleting Records

### Delete Flow

**User Actions:**
1. Click "Delete" button on record
2. Confirmation dialog appears:
   ```
   Delete this record?
   This action cannot be undone.

   [Cancel] [Delete]
   ```
3. Click "Delete" to confirm

**What Happens:**
- Record soft-deleted (marked with a `deletedAt` timestamp, not removed from the database)
- Timeline refreshes (record removed from view)
- Success toast: "Record deleted"

**Note:** Deleted records are hidden from the app but not physically removed from the database. There is currently no user-facing way to restore one.

---

## Photos in Timeline

### Adding Photos to Records

**Methods:**
1. **During Creation:**
   - Click "Add Photo" in record form
   - Select file (max 5MB, JPEG/PNG)
   - Photo uploads and attaches to record

2. **After Creation:**
   - Click "Edit" on existing record
   - Add photo in edit form
   - Save changes

### Viewing Photos

**In Timeline:**
- Thumbnail shown in record card
- Click thumbnail → Full-size view (modal)
- Swipe/arrow keys to view multiple photos (if record has several)

### Deleting Photos

**User Actions:**
1. Edit record
2. Click "Remove Photo" (X button)
3. Save changes

**Note:** Photos are permanently deleted (not recoverable).

---

## Timeline Search (Future Feature)

**Planned:**
- Search by keywords in notes
- Search by date range
- Search by record type
- Export timeline to PDF

**Current:** Use filters (type, pet, date range)

---

## Timeline Export (Future Feature)

**Planned:**
- Export to PDF (for vet visits)
- Export to CSV (for data analysis)
- Date range selection

**Use Case:** Bring printed timeline to vet appointments

---

## Timeline Performance

### Pagination
- **Default:** Load 20 records per page
- **Load More:** Click button to load next 20
- **Infinite Scroll:** Not currently implemented

### Loading States
- **Initial Load:** Skeleton loaders shown
- **Load More:** Spinner shown while fetching
- **Empty State:** "No records yet. Start logging!" message

---

## Common Questions

**Q: Can I see records older than 3 months on Free plan?**
A: No. Upgrade to Premium for unlimited history. Old records preserved (accessible after upgrade).

**Q: How far back does timeline go?**
A: Premium: All time. Free: Last 3 months.

**Q: Can I add records for past dates?**
A: Yes. Select custom date when creating record.

**Q: Can I add multiple photos to one record?**
A: Yes. Records support multiple photos (the API accepts an array of image URLs per record).

**Q: What happens to timeline when I downgrade from Premium?**
A: Last 3 months shown. Older records hidden (not deleted). Accessible again upon re-upgrade.

**Q: Can I move a record from one pet to another?**
A: No. Delete and recreate record for different pet.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/services/petRecordServices.ts` | Record CRUD, history limits |
| `src/services/accessControlService.ts` | Plan-based access control |
| `src/routes/petRecord.ts` | Record API endpoints |
| `src/constants/enums/pet.ts` | Record type enum (`RECORD_TYPE_ENUM`) |

---

**For technical details, see:**
- `src/services/petRecordServices.ts` - Record CRUD operations
- `/docs/technical/api/RECORD_API.md` - Record API endpoints
