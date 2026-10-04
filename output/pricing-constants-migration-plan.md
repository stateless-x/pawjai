# Retiring env-var pricing: migration plan

> **Superseded 2026-10-02:** Pawjai no longer has a free tier or multi-tier billing. Current offer is a single Pawjai Premium plan with intro-first-month pricing on the monthly cycle; quarterly and yearly are plain prices (canon: pawjai-public/src/lib/subscription/pricing.ts). This migration plan predates that change and its recommendations are obsolete.

Written 2026-09-20. Owner: Purin.
Request: "get rid of env var for pricing", scout fe/be/ios/android for where price
IDs should live, remove the old env-var ones, self-audit the findings.

Evidence: `pawjai-be` working tree @ staging; `pawjai-fe`, `pawjai-ios`,
`pawjai-android` scouted 2026-09-20. Extends (does not replace)
`output/three-tier-billing-plan.md`, whose backend lanes remain valid and unstarted.

---

## Summary of what the scouts found

| Repo | Has Stripe price IDs? | What a shared pricing constant means here |
|---|---|---|
| `pawjai-be` | **Yes.** 6 env vars, DB table, Redis cache | The whole migration surface |
| `pawjai-fe` | **No.** Zero pricing env vars; sends `{plan,cycle,currency,useCooldown}` | Display ladder only |
| `pawjai-ios` | **No.** No StoreKit, no monetization surface at all | Nothing to add yet |
| `pawjai-android` | **No.** WebView wrapper, no Play Billing | Nothing to add yet |

### The four-repo premise needs splitting

Stripe price IDs are a **backend-only** concept. iOS and Android cannot use them
for digital subscriptions even in principle: Apple and Google require their own
IAP product/base-plan/offer identifiers, which are a different namespace bought
through a different system.

Concretely, today:

- **iOS** (`pawjai-ios`): `Entitlements.showsSubscriptionFeatures = false`
  (`PawjaiMobile/Core/Stores/Entitlements.swift:7`), enforced by comments in four
  files and a UI test (`PawjaiMobileUITests/PlanGatingTests.swift`).
  `DeepLinkMapper.swift:62-64` routes `pricing`/`tier` deep links to Home
  specifically to avoid showing a paywall. `SubscriptionModels.swift:21` states
  billing details are intentionally not modeled. This is a deliberate App Store
  compliance posture.
- **Android** (`pawjai-android`): a WebView wrapper. Stripe checkout opens in
  Chrome Custom Tabs (`webview/PawjaiWebViewClient.kt:37-43`) and returns via an
  App Link (`AndroidManifest.xml:83-98`). Zero billing dependencies.

**Recommendation: add nothing to ios/android in this migration.** Creating
placeholder constants files there would be speculative code for a payment method
neither app has chosen. When native IAP happens it is its own project (and on
Android, note `minSdk = 24` is below the API 26 floor current Play Billing
requires, so it forces an SDK bump).

**pawjai-fe has no pricing env vars to remove.** Verified: zero `STRIPE_PRICE_*`
references in source; the only Stripe var is
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`components/providers/StripeProvider.tsx:9`),
which is not a price. The checkout payload
(`lib/api/subscriptionService.ts:71-82`) carries `{plan, cycle, currency,
useCooldown}` and **no price ID**. `priceId` exists on the response type
(`hooks/usePricing.ts:12`) but is dropped by `apiToPricing` and read by nothing.

So for fe this is **not** a migration, it is an addition: hardcoding price IDs in
fe would be a *new* coupling, not a relocation. Recommend fe receives the display
ladder only, and keeps sending the cycle triple.

What *is* genuinely shareable across repos is the **display ladder** (amounts,
cycles, intro disclosure), not the IDs. Both mobile repos already keep
cross-repo constants in sync **by hand with comments citing the source file and
line** (`pawjai-ios/PawjaiMobile/Services/MockData.swift:51-55` cites
`pawjai-be/src/seed/planRules.ts:7`; `pawjai-android/.../Configuration.kt` says it
"Mirrors iOS Configuration.swift exactly"). That is the existing precedent.

---

## The decision that must come first

**This is the one thing that cannot be deferred, because it determines the key
shape of the constants file. Writing the file before deciding means writing it
twice.**

Today the config layer encodes **offer state on the yearly axis**:

```
pricingCycleEnum = ['monthly', 'yearly_discounted', 'yearly_default']
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                              discount lives here, selected by useCooldown:boolean
```
`src/db/schema/enums/subscription.ts:26`

Astro canon puts the intro on **monthly** (฿79 first month, renews ฿199) and adds
a plain quarterly. So adopting Astro is **not** "add quarterly to an enum." It
**moves which axis carries the introductory offer**, and the existing
discounted/default machinery is built around the old axis:

- `getPriceId(plan, cycle, useCooldown, ...)` collapses 3 config values into 2
  public values via a boolean (`pricingConfigService.ts:106-112`).
- `checkout.ts:119` — `trial_period_days: eligibleForTrial && cycle === 'yearly'`.
  The trial is hardcoded to yearly.
- `stripeWebhookService.ts:266` — `priceObj.recurring?.interval === 'year'` gates
  the discounted→default swap.

### Sub-decision: how is "฿79 then ฿199" actually charged?

This is not two price IDs in a flat checkout. Current checkout is:

```ts
line_items: [{ price: priceId, quantity: 1 }]   // checkout.ts:107
```

No `discounts`, no subscription schedule. An intro-then-renew monthly needs
either a **subscription schedule with phases** or a **coupon/promotion applied to
the ฿199 price**. Which one you pick changes how many Stripe prices you create:
the coupon approach needs ฿199 + a coupon, not a separate ฿79 price.

**This changes the list of prices you are about to create:**

| Approach | Stripe prices to create | Notes |
|---|---|---|
| **Coupon on ฿199** | **฿199 only** (no ฿79 price) | A 60%-off coupon, first invoice only. `checkout.ts:110` already sets `allow_promotion_codes: true`, so some machinery exists. |
| **Subscription schedule** | **฿79 *and* ฿199** | Phase 1 = ฿79 × 1 month, phase 2 = ฿199 recurring. Checkout must switch from flat `line_items` to a schedule. |
| **7-day trial instead** | **฿199 only** | Uses `subscription_data.trial_period_days` (`checkout.ts:119`), which already exists but is currently hardcoded to `cycle === 'yearly'`. This is what the freemium-to-paid work assumed. |

**Answer needed before the Stripe prices are created**, since it changes the list.

---

## Fork: does the admin pricing UI survive?

Two coherent end states. Pick one.

**Option A — constants replace env only (recommended).**
Chain becomes `cache → DB → constants`. Admin UI, `pricing_config`,
`pricing_config_history` all keep working. Constants become the
committed-in-git default instead of the env fallback. Smallest change, keeps the
audit trail and the ability to swap a price without a redeploy.

**Option B — constants replace env *and* DB.**
Chain becomes `cache → constants` (or no cache at all). Retires 8 admin routes
(`src/routes/admin/pricing.ts`), 2 tables, and the seed script. Simplest runtime,
but every price change is a code deploy, and you lose `pricing_config_history`.

Option A is recommended: it delivers what you asked for (no env vars, IDs in
code) without discarding working tooling.

---

## Staging vs production: one question, not a design

`src/lib/stripe.ts` builds a single client from `STRIPE_SECRET_KEY`; that key
alone selects test vs live mode. The only environment discriminator in code is
`NODE_ENV` (`src/config/env.ts:35`), and staging and prod would both be
`'production'` — so a constants file keyed on `NODE_ENV` **cannot** tell them
apart.

Note dev/test don't need real IDs: `stripe.ts:9` permits a missing key in
`development`/`test`. So this collapses to a single question:

> **Does staging use the same Stripe account and mode as production?**
> - Same mode → one flat constants map. Simplest, and what you want.
> - Different mode → the map must be keyed by mode, and a new explicit env var
>   (e.g. `APP_ENV`) is needed to select the key, since `NODE_ENV` can't.

Answer this when handing over the price IDs.

---

## Are price IDs safe to commit?

Yes. A Stripe price ID is an **identifier, not a credential** — it is inert
without `STRIPE_SECRET_KEY`, and it is already exposed to any browser that opens
checkout. Committing them is a normal practice.

(Six real IDs are *already* committed in `pawjai-be/docs/CURRENT_PRICING.md:9-40`.
That is evidence of existing practice, not the justification.)

---

## Migration surface (mechanical inventory)

### Removals
| What | Where |
|---|---|
| 6 Zod env declarations | `src/config/env.ts:55-60` |
| 6 camelCase re-exports | `src/config/env.ts:172-177` |
| Env fallback + `getEnvKey` | `src/services/pricingConfigService.ts:64-76`, `158-171` |
| Env fallback maps | `src/services/stripe/pricing.ts:40-45`, `69-71` |
| Env→DB seed script | `scripts/seed-pricing-config.ts` (whole file) |
| 6 PREMIUM vars, `env.example` | `env.example:37-44` (that file declares 6 total) |
| 6 PREMIUM vars, `.env.dev.example` | `.env.dev.example:39-41,45-47` (that file declares 12 total) |
| **6 dead BASIC vars** | `.env.dev.example:42-44,48-50` — no code path; `pricingPlanEnum` is `['premium']` only, so `'basic'` is unrepresentable. Delete regardless of this migration. |

### Tests that need rework, not patching
- `src/__tests__/integration/offer-pricing.test.ts` — asserts resolution equals
  `process.env.STRIPE_PRICE_*` in ~20 places (`:19,28,37,53,...`). Structurally
  coupled to the env design.
- `src/__tests__/unit/subscription/winback-offer-trigger.test.ts:133` — asserts
  the **exact** error string naming the env var.
- `src/__tests__/helpers/mock-pricing-service.ts:52-98` — fixture amounts
  (฿249 / ฿1,548 / ฿1,908; $9.99 / $79.99 / $99.99).

### Three latent defects found (report only, fix separately)
1. **`stripeWebhookService.ts:266`** — `recurring?.interval === 'year'` ignores
   `interval_count`. Stripe encodes quarterly as `interval:'month',
   interval_count:3`, so a quarterly sub is misclassified as monthly and silently
   skips the price swap. `interval_count` is read nowhere in that file.
2. **`src/routes/admin/pricing.ts:295`** — `pricingConfigService.clearCache()` is
   **not awaited** (verified). The route can return success before Redis
   completes; a rejection becomes an unhandled rejection. Every other service
   call in the file is awaited.
3. **`pricingConfigService.ts:148-156`** — a DB error is caught and **falls
   through to env** rather than surfacing. Under Option A this becomes
   fall-through-to-constants, which is defensible, but it is currently a silent
   downgrade.

### Frontend defects found (separate from this migration)
4. **`lib/i18n/locales/pages/en/tier.ts:156`** — the **English** locale contains
   **Thai** copy: `yearlyBadge: "ประหยัด ฿791!"` (verified). English-locale users
   see Thai text today, and the hardcoded ฿791 matches no current price. Rendered
   at `components/tier/TierPageView.tsx:92`. Same string in the th file at `:154`.
5. **`hooks/usePricing.ts:49-105`** — `FALLBACK_PRICING` is all zeros, so a failed
   pricing fetch renders **฿0 / $0** rather than an error. A fallback that hides
   failure; worth revisiting under the standing no-symptom-patches rule.
6. **`components/tier/TierPageView.tsx:95-97`** re-derives amount and unit by
   splitting the formatted `priceLabel` on `" / "`. Fragile; a centralized ladder
   removes the need.

### The cutover trap
`pricingConfigService.ts:169` **writes env-resolved values into shared Redis**
(verified). So deleting an env var does not remove its effect: the stale ID keeps
serving live checkouts until TTL expiry. **The cutover must clear the price cache
(`cacheDelPattern('price:*')`) as an explicit step**, not rely on env removal.

---

## Sequencing

### STATUS 2026-09-20: frontend is DONE and verified.

`/tier` now renders pawjai-public's UI exactly: three stacked billing rows from
`lib/subscription/planPricing.ts`, monthly intro 79 with 199 struck through and a
derived "60% off" badge, quarterly 599, yearly 2,000. Verified in-browser in both
locales and at 375px. The page makes **zero API calls** (confirmed on a clean
tab): no pricing fetch, no offer fetch, so the old all-zeros pricing fallback can
no longer show customers a price of 0.

A client-only promotional countdown (`hooks/useOfferCycle.ts`) runs a 5-days-on /
2-days-off loop from one localStorage timestamp, with no per-user DB or server
state. Colour escalates ink -> orange (3d) -> red pulsing (1d). Phase arithmetic
unit-verified across 13 cases incl. one year out; all four visual states verified
in-browser.

**Quarterly is displayed but deliberately NOT purchasable**: its CTA is disabled
with an explanatory note (`pages.tier.cycleUnavailable`), because the backend
still rejects the cycle and no quarterly Stripe price exists.
`useCheckoutSession` throws if quarterly ever reaches it, so the disabled CTA and
the API contract cannot drift apart silently.

The remaining blockers are therefore **entirely backend**: the cycle enum and the
Stripe prices. Nothing further is needed in fe to unblock them.

Work that does **not** depend on receiving the price IDs:

1. Settle the axis decision + intro mechanism (above). → verify: written down here.
2. ~~`planPricing.ts` in fe~~ **DONE 2026-09-20.**
3. Add `quarterly` to **`billingCycleEnum` only**. This value is
   **axis-independent**: quarterly is a real cycle under every intro mechanism
   above. Write the Postgres migration, **do not apply it**.
   → verify: migration file reviewed; `ALTER TYPE ... ADD VALUE` is irreversible
   and non-transactional.
4. Fix `interval_count` (defect 1) and the missing `await` (defect 2) as their own
   commits with their own tests.
   → verify: a quarterly-shaped price object classifies correctly in test.

Work that **is blocked** on the axis decision:

5. **`pricingCycleEnum` changes.** Deliberately *not* in the unblocked lane. If
   the intro moves to monthly, this enum may not need `yearly_discounted` /
   `yearly_default` at all; it might need `monthly_intro` / `monthly`, or nothing
   beyond `quarterly`. `ALTER TYPE ... ADD VALUE` cannot be undone, so adding
   values against the old axis is unrecoverable. Decide the axis first.
6. Zod schemas at `src/routes/subscriptions.ts:152,253,271` and the `getPriceId`
   cycle mapping (`pricingConfigService.ts:106-112`) — both encode the axis.

Work that **is blocked** on the IDs:

7. Write the constants module with real IDs.
8. Rework the two env-coupled test suites.
9. Cutover: deploy → clear price cache → remove env vars from Railway (pinned
   `-e` per standing rule) → verify `/api/subscriptions/pricing`.

### Back-compatibility constraint (applies to every option)

`user_subscriptions.billing_cycle` holds `'monthly'` / `'yearly'` for existing
subscribers, and `user_subscriptions.stripe_price_id` holds prices that may be
**retired**. Two consequences:

- Existing rows are **not** rewritten. If cycle values change meaning, historical
  rows still describe the plan shape sold at the time.
- `resolvePlanCycleFromPriceId` (`src/services/stripe/pricing.ts:34`) must keep
  resolving **legacy** price IDs forever, including prices no longer sold.

This is a further argument for **Option A**: retired price IDs stay in
`pricing_config` / `pricing_config_history`, whereas a constants file naturally
lists only *current* prices. A constants-only design must still carry every
retired ID, or old subscribers become unresolvable.

---

## Open questions for you

1. **Axis + intro mechanism**: subscription schedule phases, or coupon on ฿199?
   (Changes the Stripe price list.)
2. **Option A or B**: does the admin pricing UI survive?
3. **Staging Stripe mode**: same as prod, or separate test mode?
4. **THB reprice confirmation**: Astro's ฿199/฿2,000 vs live ฿249/฿1,548. Adopting
   Astro canon reprices THB; USD is unchanged. Intended?
5. **฿599 quarterly** is strictly dominated by 3 × ฿199 = ฿597. Cheapest moment to
   change it is before the Stripe price exists.

---

## Doc hygiene note

`pawjai-be/docs/CURRENT_PRICING.md` (dated 2026-02-05) is **stale and contradicts
the test fixtures in both currencies**:

| | doc says | `mock-pricing-service.ts:60-98` says |
|---|---|---|
| THB yearly discounted | ฿888 | ฿1,548 |
| THB yearly default | ฿1,068 | ฿1,908 |
| USD yearly default | $99.00 | $99.99 |

(THB monthly ฿249, USD monthly $9.99 and USD yearly discounted $79.99 agree.)

Neither source is necessarily live. It must be rewritten or deleted as part of
this work, then FRESH-scored per the standing doc rule. It is also the only place
in the repo where real Stripe price IDs are committed (`:9-40`).
