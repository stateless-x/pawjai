# Subscription API - Technical Reference

API endpoints for subscription management.

---

## Endpoints

### POST /api/subscriptions/checkout

Create a Stripe Checkout session for subscription. Rate-limited (see `rateLimitConfig.checkout`).

**Request:**
```json
{
  "plan": "premium",
  "cycle": "monthly" | "yearly",
  "currency": "THB" | "USD",  // Optional, default: "THB"
  "useCooldown": false,        // Optional, default: false
  "offerId": "uuid",           // Optional
  "promoCode": "CODE",         // Optional
  "customerEmail": "user@example.com",  // Optional
  "isMobileApp": false         // Optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://checkout.stripe.com/..."
  }
}
```

---

### GET /api/subscriptions/me

Get the current user's effective subscription (plan, status, access control fields, and plan limits) for the authenticated user. Always returns a subscription object -- defaults to the free tier if the user has none.

**Response:**
```json
{
  "success": true,
  "data": {
    "plan": "premium" | "free",
    "status": "active" | "cancelling" | "canceled" | "past_due",
    "currentPeriodEnd": "2025-12-01T00:00:00Z",
    "graceUntil": "2025-11-08T00:00:00Z" | null,
    "trialEndsAt": "2025-11-23T00:00:00Z" | null,
    "limits": { "maxPets": 3 },
    "offerPolicy": "...",
    "hasAccess": true,
    "accessReason": "..."
  }
}
```

---

### GET /api/subscriptions/access

Check the authenticated user's access control status. Returns whatever `accessControlService.checkAccess()` produces.

---

### POST /api/subscriptions/cancel

Cancel current subscription (user keeps access until period end).

**Request:**
```json
{
  "atPeriodEnd": true  // Optional, default: true
}
```

**Response:**
```json
{
  "success": true,
  "data": { "atPeriodEnd": true },
  "message": "Subscription set to cancel at period end"
}
```

---

### POST /api/subscriptions/resume

Resume a subscription that was set to cancel at period end (unsets cancel-at-period-end and restores `active` status).

**Response:**
```json
{
  "success": true,
  "data": {},
  "message": "Subscription resumed"
}
```

---

### POST /api/subscriptions/sync

Sync the authenticated user's subscription from Stripe. No request body -- always operates on the authenticated user (there is no admin/debug `userId` override on this route).

**Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Subscription synced successfully"
}
```

---

### POST /api/subscriptions/force-sync

Same as `/sync` but returns 500 (not 400) on failure. Comment in the route notes bulk syncs should use `bun run fix:mismatched` instead.

---

### POST /api/subscriptions/confirm

Confirm a subscription by Stripe Checkout session ID (used on the checkout success return). Falls back to a customer-based sync if the subscription ID is still missing after syncing by session.

**Request:**
```json
{ "sessionId": "cs_test_..." }
```

---

### POST /api/subscriptions/portal

Create a Stripe Billing Portal session for the authenticated user. Returns `{ url }`.

---

### POST /api/subscriptions/preview-upgrade

Preview proration for a monthly→yearly (or plan) upgrade before committing.

**Request:**
```json
{ "plan": "premium", "cycle": "monthly" | "yearly" }
```

---

### POST /api/subscriptions/upgrade

Perform an upgrade with proration. Returns immediately; the local DB is synced by the Stripe webhook.

**Request:**
```json
{ "plan": "premium", "cycle": "monthly" | "yearly" }
```

---

### GET /api/subscriptions/history

Return the authenticated user's `subscription_events` rows, most recent first.

---

## Pricing Logic

### Price Selection

**Monthly:**
```
STRIPE_PRICE_PREMIUM_MONTHLY_{THB|USD}
```

**Yearly:**
```
useCooldown = false:
  STRIPE_PRICE_PREMIUM_YEARLY_DISCOUNTED_{THB|USD}

useCooldown = true:
  STRIPE_PRICE_PREMIUM_YEARLY_DEFAULT_{THB|USD}
```

**With Offer:**
```
offerId provided:
  Use price from offer metadata
  (discountedPremiumPriceId{THB|USD})
```

### Environment Variables

Required for all environments:
```bash
STRIPE_PRICE_PREMIUM_MONTHLY_THB=price_xxx
STRIPE_PRICE_PREMIUM_MONTHLY_USD=price_xxx
STRIPE_PRICE_PREMIUM_YEARLY_DISCOUNTED_THB=price_xxx
STRIPE_PRICE_PREMIUM_YEARLY_DISCOUNTED_USD=price_xxx
STRIPE_PRICE_PREMIUM_YEARLY_DEFAULT_THB=price_xxx
STRIPE_PRICE_PREMIUM_YEARLY_DEFAULT_USD=price_xxx
```

---

## Webhook Events

### Stripe Webhooks Handled

| Event | Handler |
|-------|--------|
| `checkout.session.completed` | `handleCheckoutSessionCompleted` |
| `customer.subscription.created` | `handleSubscriptionCreatedOrUpdated` |
| `customer.subscription.updated` | `handleSubscriptionCreatedOrUpdated` |
| `customer.subscription.deleted` | `handleSubscriptionDeleted` |
| `invoice.payment_succeeded` | `handleInvoicePaymentSucceeded` |
| `invoice.payment_failed` | `handleInvoicePaymentFailed` |
| `setup_intent.succeeded` | `handleSetupIntentSucceeded` |
| `payment_method.attached` | `handlePaymentMethodAttached` |

All handlers live in `src/services/stripeWebhookService.ts`.

**Endpoint:** `POST /api/stripe/webhook`

**Signature Validation:**
- Uses `STRIPE_WEBHOOK_SECRET`
- Verified via `stripe.webhooks.constructEventAsync`
- Rejects requests with a missing/invalid signature

**Event Deduplication:**
- The route inserts the event into `subscription_events` (keyed on `eventId`) with `onConflictDoNothing` *before* dispatch -- this closes the check-then-record race, not just a soft dedup check
- A conflicting insert (duplicate delivery) short-circuits with `{ skipped: true }`

---

## Error Codes

This route file does not define subscription-specific error codes -- errors are returned via
`ApiResponses.error()`/`ApiResponses.validationError()` with the message from the thrown error,
or via `AppError.code` where a service throws an `AppError`. See `CLAUDE.md` "API Responses" for
the shared list of known root-level `code` values.

---

**For business logic, see:** `docs/business/SUBSCRIPTIONS.md`
