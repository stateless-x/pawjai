# Subscription Integration Tests

Comprehensive integration tests for the subscription system covering all critical flows and edge cases.

---

## Overview

**Test Framework:** Bun Test (built-in)
**Test Location:** `src/__tests__/integration/`
**Test Type:** Integration tests -- mixed: some suites hit a real (throwaway) database via
`TestDataFactory`, others mock all services/DB and need no connection. See "Test Suites" below
for which is which.
**Coverage:** Trial eligibility, premium access, grace periods, pricing, offers, and full subscription lifecycles

---

## Running Tests

Use `bun run test`, not bare `bun test` -- the npm script runs `scripts/test.sh`, which spins up
a throwaway Docker Postgres, migrates it, runs the suite, then tears it down. Bare `bun test`
skips that provisioning and fails any suite that needs a live connection.

```bash
# Run all tests (through scripts/test.sh)
bun run test

# Run only integration tests
bun run test:integration

# Run tests with coverage report
bun run test:coverage

# Once a DB is provisioned (e.g. mid-session via test.sh), bun test's own flags work directly:
bun test src/__tests__/integration/trial-eligibility.test.ts
bun test --test-name-pattern "grace period"
```

Note: `bun run test:watch` (`bun test --watch`) does NOT go through `scripts/test.sh` -- it will
only succeed against DB-backed suites if a `DATABASE_URL` is already reachable in your shell.

---

## Test Structure

### Helper Files

**`src/__tests__/helpers/test-helpers.ts`**
- `TestDataFactory` - Creates test users and subscriptions in real DB
- `DateHelpers` - Date manipulation utilities
- `AssertHelpers` - Custom assertions for subscription testing
- `MockStripeHelpers` - Stripe mock data generators

**`src/__tests__/helpers/webhook-helpers.ts`**
- `WebhookTestHelpers` - Creates mock Stripe webhook events
- `generateWebhookSignature()` - Generates valid HMAC SHA256 signatures
- `createCheckoutSessionCompletedEvent()` - Mock checkout.session.completed
- `createSubscriptionCreatedEvent()` - Mock customer.subscription.created
- `createSubscriptionUpdatedEvent()` - Mock customer.subscription.updated
- `createSubscriptionDeletedEvent()` - Mock customer.subscription.deleted
- `createInvoicePaymentSucceededEvent()` - Mock invoice.payment_succeeded
- `createInvoicePaymentFailedEvent()` - Mock invoice.payment_failed
- `createWebhookRequest()` - Creates complete webhook request with signature

**`src/__tests__/helpers/mock-webhook-service.ts`**
- `MockWebhookService` - In-memory webhook processing logic (no database)
- `createSubscription()` - Create mock subscription
- `getSubscription()` - Get subscription by userId
- `processEvent()` - Process Stripe webhook event
- `isEventProcessed()` - Check event deduplication
- Used exclusively for webhook integration tests for fast, isolated testing

**`src/__tests__/helpers/mock-offer-service.ts`**
- `MockOfferService` - In-memory offer timer logic (no database)
- `trigger()` - Create new offer for user
- `getActiveOffer()` - Get active offer for user
- `canTrigger()` - Check if user can receive new offer (cooldown logic)
- `expire()`, `redeem()`, `markShown()` - Offer state management
- `expireAllPast()` - Cleanup expired offers
- `cleanupOldOffers()` - Delete old expired/redeemed offers (90-day retention)
- Used exclusively for offer timer integration tests for fast, isolated testing

**`src/__tests__/helpers/mock-payment-service.ts`**
- `MockPaymentService` - In-memory payment method logic (no database)
- `createPaymentMethod()` - Create payment method for customer
- `getPaymentMethods()` - List payment methods (with deduplication)
- `setDefaultPaymentMethod()` - Set default payment method
- `deletePaymentMethod()` - Delete payment method (with safety checks)
- `deduplicatePaymentMethods()` - Remove duplicate cards by fingerprint
- `findDuplicates()` - Find duplicate cards
- Used exclusively for payment method integration tests for fast, isolated testing

**`src/__tests__/helpers/mock-pricing-service.ts`**
- `MockPricingService` - In-memory pricing logic (no database, no Stripe API)
- `getPricing()` - Get all 6 price tiers (THB/USD × 3 tiers)
- `getPricingByCurrency()` - Get prices for specific currency
- `calculateYearlySavings()` - Calculate savings for yearly subscription
- `updatePrice()` - Update price amount (for testing price changes)
- `reset()` - Reset to default prices
- Used exclusively for pricing integration tests for fast, isolated testing

---

## Test Suites

### 1. Trial Eligibility Tests
**File:** `src/__tests__/integration/trial-eligibility.test.ts`

**Test Type:** Uses `TestDataFactory` against a real (throwaway) database -- run via `bun run test`, not bare `bun test`.

**Scenarios covered:**
- ✅ New user with no trial history should be eligible for a trial
- ✅ User who already used trial should NOT be eligible for another trial
- ✅ User who completed trial and canceled should NOT get trial again on re-subscribe
- ✅ User currently in trial period should have `trialEndsAt` set
- ✅ User who upgraded from trial to paid should have `trialEndsAt` in past
- ✅ Trial eligibility should be checked server-side not from client
- ✅ User with existing subscription (no trial) should NOT have `trialEndsAt`

**Key validations:**
- Server-side trial eligibility enforcement, driven entirely by `trialEndsAt` on the
  `user_subscriptions` table (there is no separate `trialUsed` flag, and no such column exists
  on `user_profiles`)
- `trialEndsAt` field accuracy
- Trial only applies to yearly subscriptions
- Trial period length defaults to 7 days, configurable via `STRIPE_TRIAL_PERIOD_DAYS`
  (`src/config/env.ts`)

---

### 2. Premium Access Tests
**File:** `src/__tests__/integration/premium-access.test.ts`

**Test Type:** Uses `TestDataFactory` against a real (throwaway) database -- run via `bun run test`, not bare `bun test`.

**Scenarios covered:**
- ✅ Free user should NOT have premium access
- ✅ Premium user with active subscription should have premium access
- ✅ User upgrading from free to premium should immediately gain access
- ✅ Premium user in trial period should have full access
- ✅ Premium user who canceled should retain access until period ends
- ✅ Premium user after period ends should lose access
- ✅ Access control should use cached results within 60 seconds
- ✅ Cache invalidation should force fresh access check
- ✅ Premium features should be gated by `hasAccess` flag
- ✅ User with no subscription record should default to free with no access
- ✅ Auto-fix should correct mismatched subscription status

**Key validations:**
- `accessControlService.checkAccess()` is single source of truth
- Premium features respect `hasAccess` flag
- Cache behavior (60s TTL)
- Access retained during cancellation period
- Automatic status correction

---

### 3. Grace Period Tests
**File:** `src/__tests__/integration/grace-period.test.ts`

**Test Type:** Uses `TestDataFactory` against a real (throwaway) database -- run via `bun run test`, not bare `bun test`.

**Scenarios covered:**
- ✅ User with payment failure should enter 7-day grace period
- ✅ User in grace period should see warning but keep premium status
- ✅ User after grace period expires should lose premium access
- ✅ Grace period should be cleared after successful payment retry
- ✅ `fixExpiredGracePeriods()` should downgrade users after grace expires
- ✅ Grace period warning should show correct days remaining
- ✅ Grace period should only show to `past_due` users with valid `graceUntil`
- ✅ Grace period extends for 7 days from first payment failure
- ✅ Premium access should continue during entire grace period

**Key validations:**
- 7-day grace period from payment failure
- Premium access retained during grace period
- Grace period fields cleared on successful payment
- Automatic downgrade after grace expiry
- Days remaining calculation accuracy
- Dashboard banner shows only for `past_due` with `graceUntil` set

---

### 4. Offer and Pricing Tests
**File:** `src/__tests__/integration/offer-pricing.test.ts`

**Test Type:** Uses `TestDataFactory` against a real (throwaway) database -- run via `bun run test`, not bare `bun test`.

**Scenarios covered:**
- ✅ Monthly subscription should use `STRIPE_PRICE_PREMIUM_MONTHLY_{CURRENCY}`
- ✅ Yearly subscription with `useCooldown=false` should use DISCOUNTED price
- ✅ Yearly subscription with `useCooldown=true` should use DEFAULT price
- ✅ Multi-currency support: THB vs USD should use different prices
- ✅ Price override should take precedence over environment variables
- ✅ `resolvePlanCycleFromPriceId()` should correctly identify monthly THB
- ✅ `resolvePlanCycleFromPriceId()` should correctly identify yearly discounted USD
- ✅ `resolvePlanCycleFromPriceId()` should return null for unknown price
- ✅ Pricing should support 3-tier model: monthly, yearly discounted, yearly default
- ✅ First-time yearly subscriber should get discounted price
- ✅ Renewal after cooldown should use default price
- ✅ User should see correct pricing based on offer status
- ✅ Pricing should be consistent across all 6 environment variables
- ✅ Monthly pricing should ignore `useCooldown` parameter
- ✅ Offer metadata should contain pricing for both currencies
- ✅ User selecting monthly plan should see monthly price regardless of offers
- ✅ Trial-eligible user should get a trial on yearly subscriptions only

**Key validations:**
- 3-tier pricing model (monthly, yearly discounted, yearly default)
- 6 environment variables (THB/USD x 3 tiers)
- `useCooldown` parameter controls yearly pricing
- Offer metadata structure validation
- Price resolution accuracy
- Multi-currency support

---

### 5. Subscription Lifecycle Tests
**File:** `src/__tests__/integration/subscription-lifecycle.test.ts`

**Test Type:** Uses `TestDataFactory` against a real (throwaway) database -- run via `bun run test`, not bare `bun test`.

**Scenarios covered:**
- ✅ Full lifecycle: Free → Premium Trial → Paid → Cancel → Expired
- ✅ Lifecycle: Premium → Payment fails → Grace period → Payment succeeds → Resume
- ✅ Lifecycle: Premium → Payment fails → Grace expires → Downgrade to free
- ✅ Lifecycle: Trial user cancels during trial → No conversion
- ✅ Lifecycle: User re-subscribes after cancellation
- ✅ Lifecycle: Monthly to Yearly upgrade mid-period
- ✅ Lifecycle: Subscription auto-renews successfully
- ✅ Lifecycle: `fixAllExpiredSubscriptions()` should handle `cancelling → canceled`
- ✅ Complete flow: New user → Trial → Cancel → Re-subscribe → Monthly → Payment fails → Recovers

**Key validations:**
- Complete subscription journeys from start to end
- Status transitions at each lifecycle stage
- Access control accuracy throughout lifecycle
- Automatic status corrections (cron jobs)
- Complex multi-phase scenarios

---

### 6. Webhook Integration Tests
**File:** `src/__tests__/integration/webhook-stripe.test.ts`

**Test Type:** Integration tests with mocked webhook service (NO database required)

**Test Approach:**
- Uses `MockWebhookService` for in-memory webhook processing
- No database connection required
- Fast execution (~26ms for all 15 tests)
- Tests webhook processing logic in isolation
- Deterministic and repeatable

**Scenarios covered:**
- ✅ Webhook signature validation (missing, invalid, valid signatures)
- ✅ Webhook event deduplication (prevents double-processing)
- ✅ Event storage in mock event store
- ✅ `checkout.session.completed` - New subscription creation
- ✅ `checkout.session.completed` - Yearly subscription with trial
- ✅ `customer.subscription.updated` - Cancel at period end (status → cancelling)
- ✅ `customer.subscription.updated` - Immediate cancellation after period expires
- ✅ `customer.subscription.deleted` - Downgrade to free
- ✅ `invoice.payment_succeeded` - Clear grace period after successful payment
- ✅ `invoice.payment_failed` - Enter 7-day grace period on first failure
- ✅ `invoice.payment_failed` - Maintain existing grace period on subsequent failures
- ✅ Error handling for non-existent users
- ✅ Error handling for malformed webhook payload

**Key validations:**
- Webhook signature validation (HMAC SHA256)
- Event deduplication using event IDs
- Subscription status transitions via webhooks
- Grace period management (7-day grace on payment failure)
- Cancellation handling (cancelling vs canceled)
- Trial handling in yearly subscriptions
- Error handling for missing/invalid data

**Test helpers:**
- `MockWebhookService` - In-memory webhook processing (no database, no real Fastify server)
- `WebhookTestHelpers` - Creates mock Stripe webhook events and signatures

---

### 7. Offer Timer Integration Tests
**File:** `src/__tests__/integration/offer-timer.test.ts`

**Test Type:** Integration tests with mocked offer service (NO database required)

**Test Approach:**
- Uses `MockOfferService` for in-memory offer timer logic
- No database connection required
- Fast execution (~16ms for all 35 tests)
- Tests offer creation, expiration, cooldown, redemption, and cleanup in isolation
- Deterministic and repeatable

**Scenarios covered:**
- ✅ Offer creation for new users
- ✅ Expiration time calculation (windowHours parameter)
- ✅ Default window hours (24h)
- ✅ Offer metadata storage
- ✅ Automatic expiration when past expiry time
- ✅ Manual offer expiration
- ✅ Batch expiration with `expireAllPast()`
- ✅ Active offer blocking (no duplicate offers)
- ✅ 21-day cooldown enforcement after expiration
- ✅ 21-day cooldown enforcement after redemption
- ✅ Cooldown based on most recent offer
- ✅ Offer redemption and status tracking
- ✅ Offer shown tracking (`markShown`)
- ✅ Multiple users with independent offers
- ✅ Edge cases (exact expiry time, non-existent offers, unique IDs)
- ✅ `canTrigger()` logic validation
- ✅ Cleanup old offers (90-day retention by default)
- ✅ Custom retention periods for cleanup
- ✅ Cleanup preserves active offers
- ✅ Cleanup only targets expired/redeemed offers

**Key validations:**
- Offer window and expiration logic
- Cooldown period enforcement (21 days)
- Offer status transitions (active → expired/redeemed)
- Multiple offer lifecycle management
- User-specific offer isolation
- Offer metadata integrity

**Test helpers:**
- `MockOfferService` - In-memory offer timer service

---

### 8. Payment Method Integration Tests
**File:** `src/__tests__/integration/payment-methods.test.ts`

**Test Type:** Integration tests with mocked payment service (NO database required)

**Test Approach:**
- Uses `MockPaymentService` for in-memory payment method logic
- No database connection required
- Fast execution (~28ms for all 33 tests)
- Tests payment method CRUD operations, deduplication, and default management
- Deterministic and repeatable

**Scenarios covered:**
- ✅ Payment method creation and attachment to customer
- ✅ Set first payment method as default automatically
- ✅ Generate unique payment method IDs
- ✅ Store card details correctly (brand, last4, exp_month, exp_year)
- ✅ Retrieve payment method by ID
- ✅ List all payment methods for customer
- ✅ Set and change default payment method
- ✅ Delete non-default payment methods
- ✅ Prevent deletion of default payment method
- ✅ Prevent deletion of only payment method
- ✅ Find duplicate payment methods by fingerprint
- ✅ Deduplicate by keeping default card
- ✅ Deduplicate by keeping newest card
- ✅ Handle multiple sets of duplicates
- ✅ Attach/detach payment methods
- ✅ Cross-customer payment method isolation
- ✅ Edge cases (non-existent customer, reset, multiple users)

**Key validations:**
- Payment method CRUD operations
- Default payment method management
- Deduplication by card fingerprint
- Safety checks (prevent deletion of default/only card)
- Cross-customer security (prevent unauthorized access)
- Unique ID generation

**Test helpers:**
- `MockPaymentService` - In-memory payment method service

---

### 9. Pricing Integration Tests
**File:** `src/__tests__/integration/pricing.test.ts`

**Test Type:** Integration tests with mocked pricing service (NO database, NO Stripe API required)

**Test Approach:**
- Uses `MockPricingService` for in-memory pricing logic
- No database connection required
- No Stripe API calls required
- Fast execution (~24ms for all 30 tests)
- Tests all 6 price tiers (THB/USD × 3 tiers), formatting, and savings calculations
- Deterministic and repeatable

**Scenarios covered:**
- ✅ All 6 price tiers present (THB/USD × monthly/yearly_discounted/yearly_default)
- ✅ Correct structure for each price (priceId, amount, currency, interval, displayAmount, tier)
- ✅ Correct tier assignments (monthly, yearly_discounted, yearly_default)
- ✅ Correct intervals (month for monthly, year for yearly)
- ✅ THB formatting (฿ symbol, no decimals, comma separators)
- ✅ USD formatting ($ symbol, 2 decimals)
- ✅ Yearly discounted cheaper than yearly default
- ✅ Yearly discounted cheaper than 12x monthly
- ✅ All prices positive and in cents (no fractional cents)
- ✅ Savings calculations (amount, percent, monthly equivalent)
- ✅ Currency-specific pricing (getPricingByCurrency)
- ✅ Price updates and recalculations
- ✅ Edge cases (large amounts, minimum price, consistency)

**Key validations:**
- Currency formatting (฿249, $9.99)
- Price logic (discounted < default < 12×monthly)
- Savings calculations (realistic 10-50% range)
- Structure consistency (all fields present and correct types)
- Price updates propagate correctly
- No fractional cents
- Thousands separators for large amounts

**Test helpers:**
- `MockPricingService` - In-memory pricing service

---

## Test Coverage Matrix

| Feature | Trial | Premium Access | Grace Period | Pricing | Lifecycle | Webhooks |
|---------|-------|---------------|--------------|---------|-----------|----------|
| Trial eligibility | ✅ | - | - | ✅ | ✅ | ✅ |
| Premium features | - | ✅ | - | - | ✅ | - |
| Grace period | - | - | ✅ | - | ✅ | ✅ |
| Pricing tiers | - | - | - | ✅ | - | - |
| Offers | - | - | - | ✅ | - | - |
| Status transitions | ✅ | ✅ | ✅ | - | ✅ | ✅ |
| Auto-fix jobs | - | ✅ | ✅ | - | ✅ | - |
| Cache behavior | - | ✅ | - | - | - | - |
| Re-subscriptions | ✅ | - | - | - | ✅ | - |
| Payment failures | - | - | ✅ | - | ✅ | ✅ |
| Webhook processing | - | - | - | - | - | ✅ |
| Event deduplication | - | - | - | - | - | ✅ |
| Signature validation | - | - | - | - | - | ✅ |

---

## Critical Scenarios Tested

### 1. Trial Management
- ✅ First-time users get a trial (yearly only; 7 days by default, `STRIPE_TRIAL_PERIOD_DAYS`)
- ✅ Trial-used users cannot get another trial
- ✅ Trial eligibility enforced server-side
- ✅ Canceling during trial prevents conversion

### 2. Access Control
- ✅ Premium users have access
- ✅ Free users blocked from premium features
- ✅ Access retained during cancellation period
- ✅ Access revoked after period ends
- ✅ 60-second caching for performance

### 3. Grace Period
- ✅ 7-day grace period on payment failure
- ✅ Premium access retained during grace
- ✅ Warning banner shows in dashboard
- ✅ Automatic downgrade after grace expires
- ✅ Grace cleared on successful payment

### 4. Pricing & Offers
- ✅ 3-tier pricing (monthly, yearly discounted, yearly default)
- ✅ Multi-currency (THB, USD)
- ✅ Offer-based pricing
- ✅ Cooldown period uses default price
- ✅ First-time subscribers get discounted price

### 5. Status Transitions
- ✅ `active → cancelling → canceled`
- ✅ `active → past_due → active` (recovery)
- ✅ `active → past_due → canceled` (grace expired)
- ✅ `cancelling → canceled` (immediate via webhook)
- ✅ Automatic corrections via cron jobs

---

## Test Data Management

### TestDataFactory Usage

```typescript
import { TestDataFactory, DateHelpers, AssertHelpers } from '../helpers/test-helpers';

// Create test user
await TestDataFactory.createTestUser({
  userId: 'test-user-123',
  email: 'test@example.com',
  plan: 'premium',
  status: 'active',
  currentPeriodEnd: DateHelpers.daysFromNow(30),
  billingCycle: 'monthly',
});

// Get subscription
const sub = await TestDataFactory.getSubscription('test-user-123');

// Cleanup (automatically called in afterEach)
await TestDataFactory.cleanup();
```

### Date Helpers

```typescript
// Future dates
DateHelpers.daysFromNow(7);    // 7 days in future
DateHelpers.hoursFromNow(2);   // 2 hours in future

// Past dates
DateHelpers.daysAgo(5);        // 5 days in past
DateHelpers.hoursAgo(1);       // 1 hour in past

// Current
DateHelpers.now();             // Current timestamp
```

### Assert Helpers

```typescript
// Access assertions
AssertHelpers.assertHasAccess(result);
AssertHelpers.assertNoAccess(result);

// Plan assertions
AssertHelpers.assertPlan(result, 'premium');
AssertHelpers.assertPlan(result, 'free');

// Status assertions
AssertHelpers.assertStatus(result, 'active');
AssertHelpers.assertStatus(result, 'past_due');
```

---

## Environment Variables Required

Tests require these environment variables (from `.env.local`):

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...

# Pricing (6 variables)
STRIPE_PRICE_PREMIUM_MONTHLY_THB=price_...
STRIPE_PRICE_PREMIUM_MONTHLY_USD=price_...
STRIPE_PRICE_PREMIUM_YEARLY_DISCOUNTED_THB=price_...
STRIPE_PRICE_PREMIUM_YEARLY_DISCOUNTED_USD=price_...
STRIPE_PRICE_PREMIUM_YEARLY_DEFAULT_THB=price_...
STRIPE_PRICE_PREMIUM_YEARLY_DEFAULT_USD=price_...

# Trial period (optional, defaults to 7 -- see src/config/env.ts)
STRIPE_TRIAL_PERIOD_DAYS=7

# Database (provisioned automatically by `bun run test` via scripts/test.sh;
# only needed here if you're running bun test directly against your own DB)
DATABASE_URL=postgresql://...
```

---

## Adding New Tests

### 1. Create Test File

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TestDataFactory, DateHelpers, AssertHelpers } from '../helpers/test-helpers';
import { accessControlService } from '@/services/accessControlService';

describe('New Feature Tests', () => {
  beforeEach(async () => {
    await TestDataFactory.cleanup();
  });

  afterEach(async () => {
    await TestDataFactory.cleanup();
  });

  test('should do something', async () => {
    // Arrange
    const userId = 'test-user';
    await TestDataFactory.createTestUser({
      userId,
      email: 'test@example.com',
      plan: 'premium',
      status: 'active',
    });

    // Act
    const result = await accessControlService.checkAccess(userId);

    // Assert
    AssertHelpers.assertHasAccess(result);
  });
});
```

### 2. Run Test

```bash
bun test src/__tests__/integration/new-feature.test.ts
```

---

## Test Best Practices

### 1. Use Descriptive Test Names
```typescript
// ✅ Good
test('User with expired grace period should lose premium access', ...)

// ❌ Bad
test('grace period test', ...)
```

### 2. Follow AAA Pattern
```typescript
test('example', async () => {
  // Arrange - Set up test data
  await TestDataFactory.createTestUser({...});

  // Act - Execute the code under test
  const result = await accessControlService.checkAccess(userId);

  // Assert - Verify the outcome
  AssertHelpers.assertHasAccess(result);
});
```

### 3. Clean Up Test Data
```typescript
beforeEach(async () => {
  await TestDataFactory.cleanup(); // Clean before each test
});

afterEach(async () => {
  await TestDataFactory.cleanup(); // Clean after each test
});
```

### 4. Invalidate Cache When Needed
```typescript
// After modifying subscription
await TestDataFactory.createTestUser({...});
accessControlService.invalidateCache(userId); // ⚠️ Important!
const result = await accessControlService.checkAccess(userId);
```

### 5. Test Edge Cases
- Boundary dates (yesterday, today, tomorrow)
- Null values
- Missing data
- Race conditions
- Expired periods

---

## CI/CD Integration

The real workflow is `.github/workflows/ci.yml`. It currently runs type-check, migration
validation, and build only -- **it does not run `bun test`**:

```yaml
name: CI

on:
  pull_request:
    branches: [master, staging]

jobs:
  ci:
    name: Type Check & Build
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Generate Drizzle types
        run: bun run db:generate
      - name: Validate migrations
        run: bun run db:validate
      - name: Type check
        run: bun tsc --noEmit
      - name: Build
        run: bun run build:ts
```

If you want to add a test job, base it on `bun run test` (which drives `scripts/test.sh` and
its own throwaway Postgres) rather than wiring a separate `services: postgres:` block and
calling `bun test` directly -- the latter skips the migration-repair steps `test.sh` may need
(see the known migration-replay issue in `CLAUDE.md` "Testing").

---

## Troubleshooting

### Test Failures

**1. Database connection errors**

Make sure you're running `bun run test` (not bare `bun test`) -- the npm script provisions a
throwaway Postgres via `scripts/test.sh` and runs migrations against it automatically. Bare
`bun test` has no `DATABASE_URL` and will fail every DB-backed suite.

```bash
# Only relevant if running bun test directly against your own DB:
echo $DATABASE_URL
bun run db:migrate
```

**2. Environment variable errors**
```bash
# Check all required vars are set
env | grep STRIPE
```

**3. Cache-related failures**
```typescript
// Always invalidate cache after updates
accessControlService.invalidateCache(userId);
```

**4. Date-related failures**
```typescript
// Use DateHelpers instead of hardcoded dates
const future = DateHelpers.daysFromNow(30);
const past = DateHelpers.daysAgo(5);
```

---

## Future Improvements

### Planned Tests
- [x] Webhook integration tests - **COMPLETED** ✅
- [x] Payment method management tests - **COMPLETED** ✅
- [x] Offer timer tests - **COMPLETED** ✅
- [x] Pricing tests - **COMPLETED** ✅
- [ ] Subscription sync tests
- [ ] Multi-pet premium limits tests

### Test Infrastructure
- [ ] Snapshot testing for API responses
- [ ] Load/performance tests
- [ ] E2E tests with frontend
- [ ] Test database seeding
- [ ] Parallel test execution

---

## Summary

✅ **9 test suites** organized by feature area, listed above (test count per suite varies -- see
each file under `src/__tests__/integration/` directly)
✅ **Complete lifecycle coverage** from free to premium to cancellation
✅ **Webhook processing** validated via `MockWebhookService` (no real Fastify server or database)
✅ **Edge case testing** including grace periods, trials, pricing, and error handling
✅ **Test helpers** for easy test creation and maintenance
✅ **Documentation** for all scenarios and best practices

**Run tests before every deployment to ensure subscription system integrity.**

---

## Related Documentation

- **Subscription business logic:** `docs/business/SUBSCRIPTIONS.md`
- **Pricing configuration:** `docs/CURRENT_PRICING.md`
- **Code standards:** `CLAUDE.md`
