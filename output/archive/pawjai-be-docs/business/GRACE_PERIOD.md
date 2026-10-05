# Grace Period - Business Logic

What happens when a Premium user's payment fails.

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| 7-day grace period | ✅ Implemented | `graceUntil` timestamp in DB |
| Premium access during grace | ✅ Implemented | `accessControlService.checkAccess()` |
| Auto-downgrade after grace | ✅ Implemented | `fixExpiredGracePeriods()` runs hourly |
| Grace period banner | ✅ Implemented | Frontend shows days remaining |
| Email notifications | ⚠️ Partial | Stripe sends, custom emails not implemented |

---

## Overview

**Grace Period** gives users **7 days** to fix payment issues before losing Premium access.

**Benefits:**
- Prevents accidental downgrade from temporary payment failures
- User keeps Premium access during grace period
- Reduces involuntary churn
- Better user experience

---

## When Grace Period Starts

### Payment Failure Triggers

1. **Card Declined**
   - Insufficient funds
   - Card expired
   - Card cancelled by bank
   - Fraud prevention block

2. **Payment Method Issues**
   - No payment method on file
   - Primary card removed
   - Card details outdated

3. **Stripe Retry Failures**
   - Stripe attempts automatic retry
   - All retry attempts fail
   - Status changes to `past_due`

---

## Grace Period Timeline

```
Payment Due → Payment Fails → Grace Period Starts (7 days) → Grace Expires → Downgrade
```

**Example:**
```
Dec 1: Payment due (renewal date)
Dec 1: Payment fails → Status: past_due → Grace starts
Dec 8: Grace expires → Downgraded to Free (if not resolved)
```

---

## What Users See

### Dashboard Banner (During Grace Period)

```
┌──────────────────────────────────────────────┐
│ ⚠️ Payment Failed - Update Required          │
│                                              │
│ Your payment could not be processed.         │
│ Update your payment method to keep Premium.  │
│                                              │
│ Grace period: 5 days remaining               │
│                                              │
│ [Update Payment Method] →                    │
└──────────────────────────────────────────────┘
```

**Banner Color:** Orange/amber (warning, not error)
**Dismissable:** No (stays until resolved)
**Position:** Top of dashboard

### Email Notification

**Not implemented in Pawjai's backend.** No custom email service exists in this repo (no send-email utility or route). Stripe sends its own payment-failure and dunning emails directly to the cardholder as part of its retry schedule; Pawjai does not send a custom notification on top of that today.

---

## During Grace Period

### User Access
- ✅ **Full Premium access maintained**
- ✅ Can access all pets (up to 10)
- ✅ Unlimited timeline history
- ✅ All Premium features work normally

### User Actions Available
1. **Update payment method** (recommended)
2. **Add new payment method**
3. **Wait for automatic retry** (Stripe retries automatically)
4. **Cancel subscription** (downgrade immediately)

### Automatic Payment Retries

**Stripe Retry Schedule:**
- Day 1: Immediate retry after initial failure
- Day 3: Second retry attempt
- Day 5: Third retry attempt
- Day 7: Final retry attempt

**If Any Retry Succeeds:**
- Status changes back to `active`
- Grace period cleared
- User notified via email
- Banner removed from dashboard

---

## After Grace Period Expires

### If Payment Still Fails

**Day 8 (Grace Expired):**
1. Status changes to `canceled`
2. User downgraded to Free plan
3. Access restricted to 1 pet
4. Email sent: "Premium subscription canceled"

### What Happens to User's Account

**Immediate Changes:**
- ❌ Can only access 1 pet (most recently logged)
- ❌ Timeline limited to 3 months
- ❌ Lock overlays appear on inaccessible pets

**Data Preservation:**
- ✅ All pets preserved (including locked ones)
- ✅ All records kept (including locked pets' history)
- ✅ All photos preserved
- ✅ No data loss

---

## Resolving Payment Issues

### Method 1: Update Existing Card

**User Actions:**
1. Go to Settings → Subscriptions
2. Click "Update Payment Method"
3. Enter new card details
4. Stripe validates card
5. Payment processed immediately

**Result:**
- Overdue payment charged
- Status: `active`
- Grace period cleared
- Premium access continues

### Method 2: Add New Card

**User Actions:**
1. Go to Settings → Payment Methods
2. Click "Add Payment Method"
3. Enter new card details
4. Set as default payment method
5. Stripe retries payment automatically

**Result:**
- Overdue payment charged
- Status: `active`
- Grace period cleared
- Old failed card can be removed

### Method 3: Wait for Automatic Retry

**If User Does Nothing:**
- Stripe automatically retries payment
- If retry succeeds → Grace cleared
- If all retries fail → Downgraded after 7 days

**Risk:** User might forget and lose Premium access

---

## Email Notifications

**Not implemented.** Pawjai's backend does not send custom emails at any point in the grace-period lifecycle (payment failed, reminder, final warning, or downgrade). The dashboard banner is the only in-app notification. Stripe sends its own dunning emails independently as part of its retry schedule -- their timing and content are controlled by Stripe, not by this codebase.

---

## Re-subscribing After Downgrade

### If User Was Downgraded

**User Can:**
1. Go to /tier page
2. Click "Upgrade to Premium"
3. Enter payment method
4. Subscribe again

**What Happens:**
- New subscription created
- All locked pets become accessible immediately
- Full Premium access restored
- No penalty or waiting period

**Pricing:**
- Standard pricing applies (no grace period discount)
- May see win-back offer (if eligible)

---

## Business Rules

### Grace Period Eligibility

| Scenario | Grace Period? | Duration |
|----------|--------------|----------|
| First payment failure | ✅ Yes | 7 days |
| Payment fails during grace | ❌ No (extends existing grace) | - |
| User cancels during grace | ❌ No | Immediate downgrade |
| Card expired | ✅ Yes | 7 days |
| Insufficient funds | ✅ Yes | 7 days |

### Grace Period Extensions
- **Not allowed:** Grace period is fixed at 7 days
- **No extensions:** Even if user requests
- **Exception:** Manual admin override (rare cases only)

---

## Common Questions

**Q: Do I get charged twice if payment fails during grace?**
A: No. You're only charged the overdue amount once payment succeeds.

**Q: Can I extend the grace period?**
A: No. Grace period is fixed at 7 days. Update your payment method promptly.

**Q: What happens if I cancel during grace period?**
A: You're immediately downgraded to Free (no refund for unused time).

**Q: Will my data be deleted if I'm downgraded?**
A: No. All data is preserved. Locked pets remain accessible upon re-subscription.

**Q: How do I know when grace period ends?**
A: Check the dashboard banner (shows days remaining) or your email notifications.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/services/accessControlService.ts` | Grace period logic, access checks |
| `src/services/startupService.ts` | Hourly job to fix expired grace periods |
| `src/services/stripeWebhookService.ts` | Payment failure webhook handling, sets `graceUntil` |
| `src/routes/stripe.ts` | Stripe webhook endpoint (`POST /webhook`) |

---

## Grace Period Duration

The 7-day grace period is a hardcoded value in `src/services/stripeWebhookService.ts` (`invoice.payment_failed` handler) -- there is no environment variable controlling it.

---

**For technical details, see:**
- `src/services/accessControlService.ts` - Grace period logic
- `src/services/stripeWebhookService.ts` - Payment failure handling
- `/docs/technical/api/SUBSCRIPTION_API.md` - Subscription status
