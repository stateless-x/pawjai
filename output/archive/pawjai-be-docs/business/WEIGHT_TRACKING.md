# Weight Tracking Feature

**For:** Product managers, business stakeholders
**Purpose:** How weight tracking works from a user and business perspective

---

## Overview

Weight tracking allows pet owners to monitor their pet's weight changes over time. This feature helps owners detect health issues early and provides valuable data for veterinary consultations.

**Location:** `/pet/[id]` page (integrated into pet detail view)

---

## User Experience

Weight tracking is **free for every user** -- there is no free/premium split for this feature.
Any signed-in pet owner can add, view, edit, and delete weight entries and see the full
history. See `src/services/petWeightService.ts` (`getWeightHistory`) for the source of truth.

**What Users Can Do:**
- Add new weight entries (up to 3 per hour per pet, to allow correcting mistakes)
- View complete weight history (paginated)
- Edit past weight entries
- Delete weight entries (soft delete)
- Track weight trends over months/years

---

## Feature Rules

### Adding Weight Entries

**Rate Limiting:**
- Maximum 3 weight entries per hour per pet (allows correcting a mistaken entry)
- Daily limit: Inherits existing 30 records per pet per day limit
- Enforced in the application layer (`petWeightService.checkHourlyLimit`)

**Validation:**
- Weight must be between 0.001 kg and 999.999 kg
- Covers tiny pets (birds, hamsters) to large dogs
- Optional note field (max 500 characters)
- Optional date/time (defaults to "now" if not specified)

**Who Can Add:**
- Pet owner (current implementation verifies pet ownership directly; see
  `src/services/petWeightService.ts`)

### Viewing Weight Data

Full history is available to all users -- there is no free/premium restriction on viewing
weight data.

---

## Business Value

### User Benefits

1. **Early Health Detection**
   - Spot sudden weight changes
   - Monitor weight loss/gain trends
   - Track recovery progress after illness

2. **Veterinary Communication**
   - Share weight data with vets
   - Provide accurate historical records
   - Support diagnostic discussions

3. **Peace of Mind**
   - Track pet's health over time
   - Monitor weight goals
   - Document growth for young pets

## Use Cases

### Example 1: Weight Loss Program
**Scenario:** Owner puts overweight dog on diet -- tracks full trend, measures progress over months

### Example 2: Puppy Growth Tracking
**Scenario:** Owner monitors puppy's development -- sees growth curve over time

### Example 3: Post-Surgery Recovery
**Scenario:** Pet recovering from surgery, needs weight monitoring -- can show full recovery trend to vet

### Example 4: Senior Pet Health Monitoring
**Scenario:** Elderly pet needs close health monitoring -- early detection of weight loss (potential illness indicator)

---

## Future Enhancements

### Phase 2 (Planned)
- Weight goal setting with progress tracking
- Automatic alerts for sudden weight changes
- Export weight report to PDF for vet visits
- Multi-unit support (kg/lbs based on locale)

### Phase 3 (Future)
- AI-powered weight insights
  - "Your dog's weight is trending upward"
  - "Consider consulting your vet about recent weight loss"
- Integration with activity logs
  - Correlate weight with exercise frequency
- Breed-specific weight percentiles
  - "Your Golden Retriever is in the 60th percentile for weight"
- Vet portal integration
  - Vets can view weight trends directly
  - Share weight data securely with vet clinics

### Long-Term Vision
- Predictive health analytics using weight data
- Integration with smart scales (auto-sync weight)
- Nutrition recommendations based on weight trends
- Community features (compare with similar pets anonymously)

---

## Anti-Spam Measures

**Why Needed:**
- Protect database from spam/mistaken duplicate entries
- Maintain data quality

**How Implemented:**
1. **3 entries per hour per pet** limit, enforced in the service layer (allows correcting a
   mistaken entry without hitting a hard wall)
2. **Daily limit** of 30 records per pet (reuses existing system)
3. **Authentication required** for all operations

**User-Facing Behavior:**
- If a user exceeds 3 entries within the rolling hour, the request is rejected with a rate-limit
  error until the oldest of those entries ages out of the window.

---

## Privacy & Data Handling

**Data Storage:**
- Weight data stored in user's account
- Only accessible by the pet owner
- Soft delete (data preserved for audit trail; see `deletedAt` on `pet_weight_records`)

**Data Sharing:**
- No automatic sharing with third parties
- Vet sharing requires explicit user action (future feature)

**Data Retention:**
- All users get full access to historical data
- Deleted entries marked as deleted (soft delete) but preserved

---

## Metrics to Track

**Adoption Metrics:**
- % of users who add at least one weight entry
- Average weight entries per active user per month
- % of pets with weight data

**Engagement Metrics:**
- Frequency of weight updates
- Time between weight entries (median)
- % of users who return to update weight

**Quality Metrics:**
- % of weight entries with notes
- % of entries with custom dates
- Average weight change per entry (data quality check)

---

## Success Criteria

**MVP Success (3 months post-launch):**
- 30% of active users have added weight data
- < 1% spam/abuse rate
- Average 2+ weight entries per engaged user per month

**Long-Term Success (12 months):**
- 50% of active users have weight tracking data
- Weight data used in 20% of vet consultations
- AI insights enabled for 10,000+ pets

---

## Support & FAQs

**Common User Questions:**

**Q: Why can I only add up to 3 weight entries per hour?**
A: To maintain data quality and prevent accidental duplicates, while still allowing you to correct a mistaken entry without waiting.

**Q: Can I backfill historical weight data?**
A: Yes, when adding weight, you can specify a past date.

**Q: How accurate should weight measurements be?**
A: We support up to 3 decimal places (0.001 kg). For most pets, whole numbers or 1 decimal place (e.g., 25.3 kg) is sufficient.

**Q: Can I export weight data?**
A: Currently, weight data is viewable in the app. Export to PDF for vet visits is a future enhancement (not yet available).

---

## Related Features

- **Pet Health Records:** Weight is part of overall health tracking
- **Timeline/Activity Logs:** Weight entries appear in pet timeline
- **Vet Sharing:** Future integration for sharing weight data with vets

---

**Last Updated:** 2026-08-07
**Status:** Implemented
**Owner:** Product Team
