# Subscription System - Business Logic

How subscriptions work in Pawjai from a user perspective.

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Free Plan (1 pet, limited features) | ✅ Implemented | `subscriptionService.ts`, `accessControlService.ts` |
| Premium Plan (10 pets, full features) | ✅ Implemented | Plan rules in DB + fallback defaults |
| AI Health Insights (tiered) | ✅ Implemented | Limited for free, advanced for premium |
| Instant upgrade activation | ✅ Implemented | Background processing for seamless UX |
| Ad-free experience (premium) | ✅ Implemented | Frontend: `AdsCarousel.tsx` |
| Monthly/Yearly billing | ✅ Implemented | Stripe integration |
| Multi-currency support (THB/USD) | ✅ Implemented | Dual price IDs |
| Trial (yearly plans) | ✅ Implemented | Duration set by `STRIPE_TRIAL_PERIOD_DAYS` env var, see `src/config/env.ts` |
| Trial eligibility | ✅ Implemented | One-time benefit per user |
| Flexible cancellation | ✅ Implemented | `stripeService.cancelAtPeriodEnd()` |
| Grace period (payment failures) | ✅ Implemented | See `GRACE_PERIOD.md` |
| Fair upgrade pricing | ✅ Implemented | `stripeService.previewUpgrade()` |
| Self-service billing portal | ✅ Implemented | Stripe Customer Portal |

---

## Plans

### Free Plan
- **Access:** 1 pet (most recently logged)
- **Pet Limit:** 1 accessible pet
- **Timeline History:** Recent activity
- **Health Insights:** Limited AI health insights
- **Experience:** Ad-supported
- **Daily Tracking:** Daily activity tracking
- **Cost:** Free forever

### Premium Plan
- **Access:** Up to 10 pets
- **Pet Limit:** 10 pets maximum
- **Timeline History:** Full history
- **Health Insights:** Advanced AI health insights
- **Experience:** Ad-free
- **Daily Tracking:** Extended activity tracking
- **Cost:** Paid subscription (monthly or yearly)

---

## Subscription Cycles

### Monthly
- Billed every month
- No commitment
- Can cancel anytime
- Access until current period ends

### Yearly
- Billed once per year
- **Discounted price** for first year (introductory offer)
- **Full price** for renewals after first year
- Free trial included (duration set by `STRIPE_TRIAL_PERIOD_DAYS`, see `src/config/env.ts`)
- Bigger savings vs monthly

---

## User Journeys

### New User → Premium

1. **Sign up** (Free account created)
2. **Browse /tier page** (See pricing options)
3. **Click "Upgrade"** (Redirected to Stripe Checkout)
4. **Enter payment info** (Stripe handles payment)
5. **Checkout complete** → Redirected back to app
6. **Account upgraded** (Premium access activated)

**Timeline:** The Stripe webhook invalidates the cached subscription status as soon as payment is confirmed (see `accessControlService.invalidateCache()`), so activation is effectively instant.

---

### Premium → Downgrade Scenarios

#### Scenario 1: User Cancels Subscription

**What Happens:**
1. User clicks "Cancel Subscription" in settings
2. Status changes to `cancelling` (not `canceled` yet)
3. **User keeps premium access until current period ends**
4. On period end date → Status changes to `canceled`
5. User downgraded to Free (access restricted to 1 pet)

**Example:**
- User subscribed on Jan 1, billed monthly
- User cancels on Jan 15
- User keeps premium until Jan 31 (end of paid period)
- Feb 1 → Downgraded to Free

#### Scenario 2: Payment Fails (Past Due)

**What Happens:**
1. Payment fails (card declined, expired, insufficient funds)
2. Status changes to `past_due`
3. **7-day grace period starts** (user keeps premium access)
4. Stripe retries payment automatically (multiple attempts)
5. Two possible outcomes:
   - ✅ **Payment succeeds** → Status back to `active`, grace period cleared
   - ❌ **Grace period expires** → Downgraded to Free (access restricted to 1 pet)

**Grace Period Benefits:**
- User has 7 days to fix payment issue
- No data loss during grace period
- Dashboard shows warning banner with days remaining
- Prevents accidental downgrade from temporary payment issues

#### Scenario 3: Subscription Expires (Not Renewed)

**What Happens:**
1. User's subscription reaches end of period
2. Payment renewal fails (or auto-renew disabled)
3. Status changes to `canceled`
4. User immediately downgraded to Free

---

### Premium → Free Edge Case: Multiple Pets

**Scenario:** User had 5 pets while premium, subscription expires.

**What Happens:**
- All 5 pets remain in database (never deleted)
- User sees all 5 pets in My Pets page
- **4 pets show lock overlay** (inaccessible)
- **1 pet accessible** (most recently logged)
- Timeline shows only accessible pet's history
- Cannot create new pets (Free plan's pet cap is 1 total pet, and this user already has 5 -- see `src/services/petLimitService.ts`)

**Re-upgrade Behavior:**
- User subscribes to Premium again
- All 5 pets instantly accessible (locks removed)
- Full access restored immediately

**Data Retention:** Locked pets preserved forever, never auto-deleted.

---

### Free → Premium (Upgrade)

**What Happens:**
1. User clicks "Upgrade" anywhere in app
2. Redirected to /tier page or directly to Stripe Checkout
3. After successful payment → Status changes to `active`
4. **Backend processes upgrade automatically:**
   - Stripe webhook receives payment confirmation
   - Cache invalidated (subscription, access control)
   - Background regeneration of health insights starts (non-blocking)
   - Premium insights generated for all user's pets (~5-30s depending on # of pets)
5. **Premium access activated immediately:**
   - All previously locked pets become accessible
   - Can add up to 9 more pets (10 total)
   - Full timeline history unlocked
   - Ad-free experience across the app
6. **Advanced health insights:**
   - Enhanced AI insights prepared in background
   - Typically ready within moments
   - Seamless experience with loading indicators

**Timeline:**
- Most features: Instant activation
- Advanced insights: Regenerated on first visit with premium content/tone
- Health summary: Regenerated on first visit with reassuring premium tone

---

## Trials

### Who Gets Trials?
- **Yearly subscriptions only** (duration set by `STRIPE_TRIAL_PERIOD_DAYS`, see `src/config/env.ts`)
- **First-time subscribers** (never had premium before)
- No trial for monthly subscriptions

### Trial Behavior
- Full premium access during trial
- Can cancel anytime during trial (no charge)
- After the trial period → Auto-converts to paid subscription
- Stripe sends email reminder before trial ends

---

## Special Offers

### How Offers Work
- **Time-limited pricing** (e.g., 50% off for first year)
- **Triggered by events:** signup, cancellation, re-engagement
- **Cooldown** between offers (prevents abuse) -- see `OFFER_COOLDOWN_DAYS` in `docs/business/OFFERS.md`
- **Auto-expires** after set duration -- see `OFFER_WINDOW_HOURS` in `docs/business/OFFERS.md`

### Offer Types
1. **Welcome Offer** - New users get special pricing (implemented)
2. **Win-back Offer** - Downgraded users get re-engagement offer (not functional -- see `docs/business/OFFERS.md`)
3. **Seasonal Offers** - Holiday promotions, special events (not implemented -- see `docs/business/OFFERS.md`)

### Offer Expiration
- Shows countdown timer in UI
- After expiration → Standard pricing applies
- Cooldown period starts (see `OFFER_COOLDOWN_DAYS` in `docs/business/OFFERS.md`)

---

## Currency Support

### Supported Currencies
- **THB** (Thai Baht) - For users in Thailand
- **USD** (US Dollar) - For international users

### How Currency is Determined

**Priority Order:**
1. **Logged-in users with saved location** → Use `detectedCountry` from DB
2. **Guests or new users** → IP geolocation via Cloudflare trace
3. **Fallback** → Browser timezone/language detection

### Geolocation Detection

**For Guests (not logged in):**
- IP detected via Cloudflare trace (free, fast ~50ms)
- Result cached in browser localStorage for 24 hours
- Thailand (TH) → THB, all others → USD

**For Logged-in Users:**
- Country synced to DB on sign-in/sign-up
- DB value takes priority over IP detection
- Updated once per month (not on every login)
- Stored in `user_profiles.detected_country`

### Why This Matters
- Thai users see prices in THB (local currency)
- International users see prices in USD
- Checkout currency cannot be changed mid-subscription
- Prevents currency arbitrage

---

## Payment Methods

### Adding Payment Methods
- Users can add multiple cards
- One card marked as **default** (used for renewals)
- Duplicate cards prevented (same card fingerprint)

### Changing Payment Methods
- Can change default card anytime
- Takes effect on next billing cycle
- Cannot delete last payment method (prevents subscription failure)
- Cannot delete default payment method (must set another as default first)

---

## What Users See

### Dashboard
- **Free users:** Upgrade prompts and sponsored content
- **Premium users:** Clean, ad-free experience with full access
- **Grace period users:** "Payment failed - Update payment method" banner with countdown

### My Pets Page
- **Free users:** Access to 1 pet, upgrade prompts for additional pets
- **Premium users:** Access to all pets, ability to add up to 10 total

### Timeline Page
- **Free users:** Recent activity with upgrade prompts
- **Premium users:** Full activity history, ad-free experience

### Health Insights Page
- **Free users:**
  - AI health summary with cautionary tone
  - 3 unlocked insights (1 per risk level)
  - 6-7 locked preview cards with upgrade prompts
- **Premium users:**
  - AI health summary with reassuring tone
  - 10-15 unlocked insights across all risk levels
  - No locked cards, full access to all insights

---

## Common Questions

**Q: What happens to my pets if I cancel?**
A: All pets remain in database. You'll only access 1 pet (most recently logged). Locked pets become accessible again when you re-subscribe.

**Q: Do I get a refund if I cancel?**
A: No refunds. You keep access until current period ends.

**Q: Can I switch from monthly to yearly?**
A: Yes. Prorate current monthly period, then start yearly subscription.

**Q: What if my payment fails?**
A: You get 7 days grace period to fix payment issue. Update payment method in settings.

**Q: How long does upgrade take?**
A: Premium features activate instantly. You'll have immediate access to all your pets, full timeline history, and an ad-free experience. Advanced health insights are prepared in the background and typically ready within moments.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/services/subscriptionService.ts` | Plan rules, subscription CRUD |
| `src/services/stripeService.ts` | Stripe integration, checkout, portal |
| `src/services/accessControlService.ts` | Access control, grace period |
| `src/services/insights/orchestrator.service.ts` | Health insights generation orchestrator |
| `src/services/insights/post-processor.service.ts` | Insights storage with tier marker |
| `src/routes/subscriptions.ts` | Subscription API endpoints |
| `src/routes/stripe.ts` | Stripe webhook handlers (includes background regeneration) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | - | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | - | Webhook signature verification |
| `STRIPE_TRIAL_PERIOD_DAYS` | `7` | Trial duration for yearly plans |
| `STRIPE_PRICE_PREMIUM_*` | - | Price IDs for all plans/currencies |

---

**For technical details, see:**
- `/docs/technical/api/SUBSCRIPTION_API.md` - API endpoints
- `/docs/technical/ops/PRODUCTION_READINESS.md` - Operations guide
