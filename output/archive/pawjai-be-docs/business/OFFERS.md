# Offer System - Business Logic

How special offers work in Pawjai.

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Welcome Offer | ✅ Implemented | Triggered after onboarding (72-hour window from signup date) |
| Monthly Offer | ✅ Implemented | 28th of month for free users (72-hour window) |
| Win-back Offer | ❌ Not implemented | Trigger code exists but missing price IDs |
| Seasonal Offer | ❌ Not implemented | Planned feature |
| Offer Cooldown | ✅ Implemented | 30-day cooldown between offers |
| Offer Expiration | ✅ Implemented | Auto-expires after window |
| Offer Cleanup | ✅ Implemented | 90-day retention policy |
| Multi-currency | ✅ Implemented | THB and USD support |

---

## Overview

Offers provide **time-limited discounted pricing** to encourage upgrades and re-engagement.

**Key Features:**
- Auto-expire after set duration (3 days unified window)
- 30-day cooldown between offers (prevents abuse)
- Can be manually redeemed or expire unused
- Tracked in database for analytics

---

## Offer Types

### 1. Welcome Offer ✅
**When:** New user completes onboarding OR first visits /tier page (free users only)
**Duration:** 3 days (72 hours) from signup date (not trigger time)
**Trigger Event:** `welcome_new_user`
**Status:** Implemented

**Hybrid Trigger Approach:**
- **Primary:** `/api/users/onboarding/finalize` (after completing onboarding)
- **Fallback:** `/api/offers/active` (when free user visits /tier page)

**Key Behavior:**
- Offer window calculated from **account creation date**, not trigger time
- `user_config.welcome_offer_triggered` flag prevents duplicate triggers
- If signup was >3 days ago, no offer is created (window already passed)

### 2. Monthly Offer ✅
**When:** 28th of each month, for free-tier users
**Duration:** 3 days (72 hours)
**Trigger Event:** `monthly_scheduled_trigger`
**Status:** Implemented

### 3. Win-back Offer ❌
**When:** Premium user cancels subscription
**Trigger Event:** `winback_cancel`
**Status:** Not implemented - trigger code exists in `src/routes/subscriptions.ts` (`/cancel` route) but calls `offerService.trigger()` without the required price-ID fields, so the call throws and is silently swallowed (logged as `winback_trigger_failed`). This is a real bug in the trigger call, not just a missing feature -- it should either be wired up with real price IDs or removed.

### 4. Seasonal Offer ❌
**When:** Holiday promotions, special events
**Duration:** Variable
**Status:** Not implemented - see `/docs/future-improvement/SEASONAL_OFFERS.md`

---

## Offer Lifecycle

### 1. Creation (Triggered)
```
Event happens → Offer created → Status: active
```

**Triggers (Implemented):**
- User completes onboarding → Welcome Offer (primary trigger)
- Free user visits /tier page → Welcome Offer (fallback trigger)
- 28th of month (free users) → Monthly Offer

**Triggers (Not Yet Implemented):**
- Subscription cancellation → Win-back Offer (code exists, needs price IDs)
- Special promotion campaign → Seasonal Offer

**Data Stored:**
- Offer ID (UUID)
- User ID
- Offer type
- Pricing (discounted price IDs)
- Expiration date
- Cooldown end date

### 2. Active Period
```
Offer active → User sees banner → Can redeem anytime
```

**What User Sees:**
- Banner on dashboard or /tier page
- Countdown timer showing time remaining
- "Claim Offer" button
- Savings amount highlighted

**Example UI:**
```
⏰ Limited Offer: 50% off Premium!
   Ends in 2 days, 14 hours

   [Claim Offer] →
```

### 3. Redemption
```
User clicks "Claim Offer" → Checkout with offer price → Status: redeemed
```

**What Happens:**
- Offer marked as redeemed
- User redirected to Stripe Checkout with discounted price
- Offer price applied (instead of standard price)
- Cooldown period starts (`OFFER_COOLDOWN_DAYS`, default 30 days)

### 4. Expiration
```
Time runs out → Status: expired → Cooldown starts
```

**What Happens:**
- Offer automatically expires (backend cron job)
- Banner removed from UI
- Cooldown period starts (`OFFER_COOLDOWN_DAYS`, default 30 days, before next offer)
- Offer remains in database for analytics

---

## Cooldown System

### Purpose
Prevents users from abusing offers by:
- Signing up repeatedly
- Canceling and re-subscribing for offers
- Gaming the system

### Rules
- **30-day cooldown** after offer expires or is redeemed
- No new offers during cooldown period
- Cooldown tracked per user, not per offer type

**Example:**
```
Nov 1: User gets Welcome Offer (50% off)
Nov 3: User redeems offer → Cooldown starts
Dec 3: Cooldown ends → Eligible for next offer
```

**Note:** Users won't get another offer for 30 days, even if they cancel and re-sign up.

---

## Offer Pricing

### How Pricing Works

Offers use **Stripe price IDs** for discounted pricing:

**Standard Pricing:**
- Monthly THB: `price_xxx`
- Yearly THB: `price_yyy`

**Offer Pricing:**
- Monthly THB (50% off): `price_aaa`
- Yearly THB (50% off): `price_bbb`

**Stored in Offer Metadata:**
```json
{
  "discountedPremiumPriceIdTHB": "price_aaa",
  "discountedPremiumPriceIdUSD": "price_ccc",
  "defaultPremiumPriceIdTHB": "price_yyy",
  "defaultPremiumPriceIdUSD": "price_ddd",
  "campaign": "welcome_offer",
  "description": "50% off for first year"
}
```

### Multi-Currency Support
- Offers include prices for both THB and USD
- User's selected currency determines which price is used
- Prices must be configured in Stripe before creating offer

---

## Cleanup Policy

### Why Cleanup?
- Old offers clutter database
- Analytics only need recent data
- Performance optimization

### Retention Policy
- **90-day retention** for expired/redeemed offers
- Offers older than 90 days automatically deleted
- Monthly cleanup job (runs on 1st of each month)

### What Gets Deleted
- Expired offers > 90 days old
- Redeemed offers > 90 days old

### What Never Gets Deleted
- Active offers (not yet expired)
- Offers in cooldown period
- Offers < 90 days old

**Manual Cleanup:**
Cleanup runs automatically as a scheduled job (`src/jobs/offerJobs.ts`, 1st of each month). There is no standalone script to run it manually; `offerService.cleanupOldOffers()` is the underlying method if a one-off run is needed.

---

## User Experience

### Seeing an Offer

**Dashboard Banner:**
```
┌─────────────────────────────────────────┐
│ 🎉 Special Offer Just for You!         │
│ Get 50% off Premium for your first year│
│                                         │
│ Offer ends in: 1 day, 18 hours         │
│                                         │
│ [Claim Offer] →                         │
└─────────────────────────────────────────┘
```

### Claiming an Offer

1. User clicks "Claim Offer"
2. Redirected to Stripe Checkout
3. Offer price shown (e.g., ฿599 instead of ฿1,199)
4. User completes payment
5. Subscription created with offer price
6. Offer marked as redeemed

### After Redemption

**What User Sees:**
- Premium access activated
- No more offer banner
- Subscription in settings shows discounted price

**Future Renewals:**
- Yearly: After 1 year, renews at **full price** (not offer price)
- Monthly: After 1 month, renews at **full price**

**Note:** Offer price applies to first billing cycle only.

---

## Analytics & Tracking

### Metrics Tracked
- Offer redemption rate (redeemed / created)
- Time to redemption (created → redeemed)
- Revenue from offers
- Cooldown effectiveness

### Database Queries
```sql
-- Redemption rate
SELECT
  offer_type,
  COUNT(*) FILTER (WHERE status = 'redeemed') / COUNT(*)::float AS redemption_rate
FROM subscription_offer_timers
GROUP BY offer_type;

-- Average time to redemption
SELECT
  offer_type,
  AVG(redeemed_at - created_at) AS avg_time_to_redeem
FROM subscription_offer_timers
WHERE status = 'redeemed'
GROUP BY offer_type;
```

---

## Business Rules

### Offer Eligibility

| Scenario | Eligible? | Reason |
|----------|-----------|--------|
| New user completes onboarding | ✅ Yes | Welcome offer |
| Free user on 28th of month | ✅ Yes | Monthly offer |
| Premium user cancels | ❌ Not yet | Win-back offer (not implemented) |
| User in cooldown period | ❌ No | Must wait 30 days |
| User already has active offer | ❌ No | One offer at a time |
| User just redeemed offer | ❌ No | Cooldown active |

### Offer Stacking
- **Not allowed:** Users cannot have multiple offers at once
- If new offer triggered while one is active → Skip new offer
- Exception: Admin can manually override

---

## Common Questions

**Q: What happens if I don't use my offer?**
A: It expires automatically. You'll be eligible for another offer after 30-day cooldown.

**Q: Can I get the same offer twice?**
A: Not immediately. 30-day cooldown applies between offers.

**Q: Does the offer price apply forever?**
A: No. Offer price applies to first billing cycle only. Renewals at standard price.

**Q: Can I combine an offer with a promo code?**
A: No. Offers and promo codes cannot be stacked.

**Q: What if my offer expires while I'm checking out?**
A: Checkout will fail. You'll need to subscribe at standard price.

---

## Environment Variables

**Unified Configuration (Simplified):**

| Variable | Default | Description |
|----------|---------|-------------|
| `OFFER_WINDOW_HOURS` | `72` | Unified offer duration for all offers (3 days) |
| `OFFER_COOLDOWN_DAYS` | `30` | Days between offers per user |
| `OFFER_CLEANUP_DAYS` | `90` | Days to retain expired offers |
| `WELCOME_OFFER_ENABLED` | `true` | Enable welcome offers |
| `MONTHLY_OFFER_ENABLED` | `true` | Enable monthly offers |

**Deprecated (Removed):**
- `WELCOME_OFFER_WINDOW_HOURS` → Use `OFFER_WINDOW_HOURS`
- `MONTHLY_OFFER_WINDOW_HOURS` → Use `OFFER_WINDOW_HOURS`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/services/offerService.ts` | Core offer logic (CRUD, cooldown, expiration) |
| `src/services/scheduledOfferService.ts` | Welcome and monthly offer triggers (hybrid approach) |
| `src/services/userConfigService.ts` | User config flags (welcome_offer_triggered tracking) |
| `src/routes/offers.ts` | Offer API endpoints (includes fallback trigger in /active) |
| `src/routes/scheduled-offers.ts` | Scheduled offer API endpoints |

## Database Tables

| Table | Purpose |
|-------|---------|
| `subscription_offer_timers` | Active/expired offers with pricing metadata |
| `user_config` | User-level flags (welcome_offer_triggered, etc.) |

---

**For technical details, see:**
- `src/services/offerService.ts` - Offer creation logic
- `/docs/technical/ops/OFFER_CLEANUP.md` - Cleanup job details
- `/docs/technical/api/SUBSCRIPTION_API.md` - Checkout with offers
