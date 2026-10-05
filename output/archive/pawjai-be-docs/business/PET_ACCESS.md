# Pet Access - Business Logic

How pet access restrictions work for free and premium users.

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Free: 1 accessible pet | ✅ Implemented | `accessControlService.ts` |
| Premium: All pets (up to 10) | ✅ Implemented | `petService.ts` |
| Most recently logged = accessible | ✅ Implemented | `ORDER BY MAX(occurredAt) DESC` |
| Fallback to newest pet | ✅ Implemented | If no records exist |
| Timeline limit (3mo free) | ✅ Implemented | `petRecordServices.ts` enforces `plan_rules.timelineHistoryMonths` |
| Lock overlay on UI | ✅ Implemented | Frontend component |

---

## Access Rules

### Free Plan
- **Accessible Pets:** 1 pet only
- **Which Pet:** Most recently logged (last activity)
- **Pet Creation Cap:** `plan_rules.maxPets` for free is 1, and pet creation (`src/services/petLimitService.ts`) checks it against the user's **total** pet count, not just accessible pets. A free user can only create a 2nd, 3rd, etc. pet if their total count is below 1 -- in practice this means a free user who already owns any pet cannot create another, even if some of their pets are locked. Free users can end up with more than 1 pet only via downgrading from Premium (existing pets are never deleted), not by creating them while on Free.
- **Timeline:** 3 months history for accessible pet

### Premium Plan
- **Accessible Pets:** All pets (up to 10)
- **Total Pets Allowed:** 10 maximum
- **Timeline:** Unlimited history for all pets

---

## How "Most Recently Logged" Works

**Logic:** The accessible pet for free users is determined by the pet with the most recent activity.

**Activity = Latest record in `pet_records.occurredAt`**

**Example:**
```
User has 3 pets:
- Cat Luna: Last activity = Nov 5, 2025
- Dog Max: Last activity = Nov 8, 2025 ← Accessible
- Rabbit Mochi: Last activity = Nov 1, 2025

Free user can only access "Dog Max"
```

**Fallback:** If no records exist, newest pet by creation date becomes accessible.

---

## User Experience

### Free Users - My Pets Page

**What They See:**
- All their pets listed (even if > 1)
- Lock overlay on inaccessible pets
- "Upgrade to Premium" button
- Cannot click locked pets (opens upgrade dialog)

**What They Can Do:**
- View accessible pet details
- Add records to accessible pet
- View timeline for accessible pet only
- Delete any pet (accessible or locked)

**What They Cannot Do:**
- Add another pet once total pet count reaches the Free cap of 1 (see Access Rules above)
- Access locked pet details
- See locked pets in timeline

### Premium Users - My Pets Page

**What They See:**
- All their pets listed (up to 10)
- No locks
- "Add Pet" button (if < 10 pets)

**What They Can Do:**
- Access all pet details
- Add records to any pet
- View timeline for all pets
- Create up to 10 pets total

---

## Downgrade Scenarios

### Premium User with 5 Pets → Downgrades to Free

**What Happens:**

1. **All 5 pets preserved** (never deleted)
2. **My Pets page shows all 5 pets:**
   - 1 pet accessible (most recently logged)
   - 4 pets with lock overlay
3. **Timeline shows only accessible pet** (4 locked pets hidden)
4. **Cannot create new pet** (total pet count is already above the Free plan's `maxPets` of 1)

**Pet Creation Rule:**

Pet creation (`src/services/petLimitService.ts`, `createPetWithLimitCheck`) checks the user's **total** pet count (locked + accessible) against `plan_rules.maxPets`, which is 1 for Free. It does not check accessible-pet count separately. So:

| Scenario | Can Create Pet? |
|----------|----------------|
| 0 total pets | Yes (0 < 1) |
| 1 or more total pets (any mix of accessible/locked) | No (already at or above the cap of 1) |

**Key Point:** The Free plan's pet cap is 1 pet **total**. A user who downgrades from Premium with several pets keeps all of them (locked or accessible) but cannot create a new one until their total count drops back below the cap.

---

### What If User Deletes Accessible Pet?

**Scenario:** User has 1 accessible + 4 locked pets, deletes the accessible one.

**What Happens:**
1. Accessible pet deleted
2. 4 locked pets remain (total pet count: 4)
3. **Still cannot create a new pet** -- total count (4) remains above the Free cap of 1
4. One of the remaining locked pets becomes accessible (most recently logged)

---

### Re-upgrade Behavior

**When downgraded user subscribes to Premium:**
- All locked pets become accessible **immediately**
- Lock overlays removed
- Full access restored to all pet details
- Timeline shows all pets' history
- Can create more pets (up to 10 total)

**Timeline:** The Stripe webhook invalidates the cached subscription status as soon as the upgrade is confirmed (see `accessControlService.invalidateCache()`), so access is effectively restored immediately.

---

## Data Retention

### Locked Pets
- **Never automatically deleted**
- Full data preserved (records, photos, notes)
- Accessible again immediately upon upgrade
- Encourages re-subscription

**Rationale:** Deleting user data creates bad UX and destroys trust. Keeping locked pets incentivizes re-upgrade.

---

## Timeline Behavior

### Free Users
- **Shows:** Only accessible pet's records
- **History:** Last 3 months
- **Locked pets:** Completely hidden (records not shown)

### Premium Users
- **Shows:** All pets' records
- **History:** Unlimited
- **Filter:** Can filter by pet (all pets available)

---

## QuickLog (Dashboard)

### Free Users
- **Shows:** Only accessible pet in dropdown
- **Can Log:** Records for accessible pet only

### Premium Users
- **Shows:** All pets in dropdown
- **Can Log:** Records for any pet

---

## Lock UI Components

### LockedPetCard
- Shows lock icon overlay on pet card
- Dims the card (opacity reduced)
- Click opens upgrade dialog

### LockedPetView
- Full-page locked state for pet detail pages
- Explains restriction
- Shows upgrade button
- Displays special offer (if available)

### PetAccessUpgradeDialog
- Modal dialog with upgrade prompt
- Links to /tier page
- Shows pricing options
- Highlights benefits of Premium

---

## Common Questions

**Q: Can I choose which pet to access as a free user?**
A: Not currently. The most recently logged pet is automatically accessible. (Future enhancement: manual selection)

**Q: What happens if I delete all my pets?**
A: You can create 1 new pet (free limit). If you're premium, you can create up to 10.

**Q: Do locked pets' records get deleted?**
A: No. All records preserved. They're just hidden from timeline until you upgrade.

**Q: How long does it take for locks to disappear after upgrade?**
A: Usually instant -- the cached subscription status is invalidated as soon as the webhook confirms payment. If locks still show, try refreshing the page.

**Q: Can I have more than 10 pets?**
A: No. 10 is the maximum for all users (free and premium).

---

## Key Files

| File | Purpose |
|------|---------|
| `src/services/accessControlService.ts` | Access control, active pet selection |
| `src/services/petService.ts` | Pet CRUD, accessible pets query |
| `src/routes/pets.ts` | Pet API endpoints |

---

**For technical details, see:**
- `src/services/accessControlService.ts` - Access control logic
- `src/services/petService.ts` - Pet access methods
- `/docs/technical/api/PET_API.md` - API endpoints
