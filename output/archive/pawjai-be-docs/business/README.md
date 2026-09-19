# Business Logic Documentation

**Purpose:** Explains how Pawjai features work from a business/product perspective.
**Audience:** Product managers, business analysts, non-technical stakeholders, new team members

---

## Implementation Overview

All business docs now include **Implementation Status** tables showing what's built vs planned.

| Document | Status |
|----------|--------|
| SUBSCRIPTIONS | ✅ Fully implemented |
| PET_ACCESS | ✅ Fully implemented |
| OFFERS | ⚠️ Partial (welcome + monthly offers, win-back not yet) |
| ONBOARDING | ✅ Fully implemented |
| GRACE_PERIOD | ✅ Fully implemented |
| QUICKLOG | ✅ Fully implemented |
| TIMELINE | ✅ Fully implemented |
| WEIGHT_TRACKING | ✅ Fully implemented |
| USER_REMINDERS | ✅ Fully implemented |
| ADMIN_NOTIFICATIONS | ✅ Fully implemented |
| BANNED_USERS | ✅ Fully implemented (admin API + UI in pawjai-admin) |
| SHARE_WITH_VET | ✅ Fully implemented |
| FAMILY_SHARING | ✅ Fully implemented |
| HEALTH_INSIGHT_DATA_FLOW | ✅ Fully implemented (architecture accurate; doc was corrected 2026-08-07 -- several counts and the model name had drifted from code) |

---

## Available Guides

### Core Features

- **[SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md)** - Plans, billing cycles, trials, currencies
- **[PET_ACCESS.md](./PET_ACCESS.md)** - Free (1 pet) vs Premium (10 pets) access rules
- **[OFFERS.md](./OFFERS.md)** - Welcome, monthly offers (win-back not yet implemented)

### User Flows

- **[ONBOARDING.md](./ONBOARDING.md)** - New user signup and profile setup
- **[GRACE_PERIOD.md](./GRACE_PERIOD.md)** - 7-day grace period for failed payments

### Account Management

- **[BANNED_USERS.md](./BANNED_USERS.md)** - Account activation/deactivation via admin

### Feature Behavior

- **[TIMELINE.md](./TIMELINE.md)** - Pet health records and history
- **[QUICKLOG.md](./QUICKLOG.md)** - Quick logging from dashboard
- **[WEIGHT_TRACKING.md](./WEIGHT_TRACKING.md)** - Pet weight tracking feature
- **[USER_REMINDERS.md](./USER_REMINDERS.md)** - Personal pet-care reminders
- **[ADMIN_NOTIFICATIONS.md](./ADMIN_NOTIFICATIONS.md)** - Admin-scheduled push notifications
- **[HEALTH_INSIGHT_DATA_FLOW.md](./HEALTH_INSIGHT_DATA_FLOW.md)** - Health insights generation architecture and data flow

### AI

- **[PEPE_AI_ASSISTANT.md](./PEPE_AI_ASSISTANT.md)** - PePe persona, response style, and safety rules

### Sharing Features

- **[SHARE_WITH_VET.md](./SHARE_WITH_VET.md)** - Share pet health records with veterinarians
- **[FAMILY_SHARING.md](./FAMILY_SHARING.md)** - Share logging access with family/helpers

---

## How to Use

1. **For product questions:** Start with the relevant guide above
2. **For technical implementation:** See `/docs/technical/` folder
3. **For API details:** See `/docs/technical/api/` folder
4. **For future features:** See `/docs/future-improvement/` folder

---

**Last Updated:** 2025-11-24
