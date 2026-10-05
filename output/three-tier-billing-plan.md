# Three-option billing + navbar localization: orchestration plan

> **Superseded 2026-10-02:** Pawjai no longer has a free tier or multi-tier billing. Current offer is a single Pawjai Premium plan with intro-first-month pricing on the monthly cycle (79 THB / 3.99 USD first month, renews 199 THB / 9.99 USD); quarterly (499 THB / 24.99 USD); yearly (1790 THB / 79.99 USD). Quarterly and yearly are plain prices, not discounts. Canon source: pawjai-public/src/lib/subscription/pricing.ts.

**Original status:** SUPERSEDED 2026-09-18 by an owner pricing change. The public page now
ships an intro-month model (79 THB first month renewing to 199, plus 599
quarterly and 2,000 yearly; USD 3.99/9.99/26.99/79.99). The backend lanes below
remain valid and unstarted, but their prices are stale: read
~/product-decisions/pawjai/2026-09-18-monetize.md first. Quarterly at 599 THB is
dominated by 3x monthly (597) and needs an owner decision.

Written 2026-09-18.
Evidence: `pawjai-public` @ `f687410` (branch `feat/astro-public-site`), `pawjai-be` working tree.
Owner: Purin. Execution: orchestrator agent + Sonnet subagents.

---

## Headline finding: quarterly is not purchasable today

The request says "keep all three options genuinely purchasable." That is a backend
fact, and the backend does not currently support it. Verified:

| Evidence | Consequence |
|---|---|
| `pawjai-be/src/db/schema/enums/subscription.ts:26` — `pricingCycleEnum` is `['monthly','yearly_discounted','yearly_default']` | No quarterly slot in `pricing_config`. Postgres enum change required. |
| Same file line 11 — `billingCycleEnum` is `['monthly','yearly']` | `user_subscriptions.billing_cycle` cannot record a quarterly subscriber. |
| `pawjai-be/src/services/pricingService.ts:8` — `PriceTier` union; `interval: 'month' \| 'year'` | Stripe `interval_count: 3` has no representation in the response type. |
| `pawjai-be/src/services/stripe/checkout.ts:117` — `trial_period_days: eligibleForTrial && cycle === 'yearly' ? ... : undefined` | The trial is hardcoded to **yearly**. The request wants the trial on **quarterly**. Directly contradictory. |
| `pawjai-public/src/lib/subscription/api.ts:17` — `PricingApiData` has `monthly` + `yearly_discounted` + `yearly_default` only | Public site has no quarterly to read. `QUARTERLY_PRICE_THB = 399` in `pricing.ts:10` is a **hardcoded frontend constant**, not a live price. |

**The current /tier page advertises a 399 THB quarterly plan that no Stripe price backs.**
That is a pre-existing defect this work must close, not one it introduces.

### Price reconciliation needed before any code

The requested table does not match live data. `pawjai-be/src/__tests__/integration/pricing.test.ts:126`
asserts THB `yearly_discounted` = `154800` cents = **฿1,548**, but the request says
**฿1,188**. And `฿249` monthly is not asserted anywhere I read.

**Resolved by `pawjai-public/docs/migration-notes.md:137`:** the live endpoint returned
`thb.monthly.amount = 24900` cents = **฿249**, matching the request exactly. Monthly is
not in question.

**Still open:** the same notes record live yearly as **฿948** (line 154), while
`pawjai-be/src/__tests__/integration/pricing.test.ts:126` asserts **154800 cents = ฿1,548**.
Neither is the requested **฿1,188**. Two sources disagree with each other *and* with the
request, so yearly is a genuine repricing with existing subscribers on a different
number.

This is a **flag, not a gate.** Purin supplied 249/399/1188 in the request, so those are
the spec for the page. Frontend lanes build on them immediately. What gates is
*deployment*: Release B does not ship until the Stripe prices exist and match.

---

## Scope decision: two releases, not one

Coupling a Stripe/DB repricing to a marketing page rewrite makes both harder to roll
back. Split:

- **Release A (backend):** quarterly becomes a real, purchasable cycle with the trial
  attached to it. Ships independently; no visible change to the public site.
- **Release B (frontend):** three-option selector, quarterly preselected, plus navbar
  localization fixes. Depends on A only for the "genuinely purchasable" claim.

Navbar work (Lane 5) depends on neither and starts immediately in parallel.

---

## Lane map

Lanes 1–3 are Release A. Lanes 4, 6, 7 are Release B. Lane 5 is independent.

### Lane 0 — Price confirmation (Purin, non-blocking flag)
Confirm the yearly number: the request says ฿1,188, the notes say ฿948, the backend test
says ฿1,548. Confirm whether monthly and yearly also get a 7-day trial, or whether it
stays quarterly-only as written. Frontend lanes proceed on the requested numbers; this
gates **backend Lane 1 and the Release B deploy**, not the page build.

### Lane 1 — Backend: quarterly as a first-class cycle (Sonnet)
Owns `pawjai-be/src/db/schema/enums/subscription.ts`, a new Drizzle migration,
`pricingConfigService.ts`, `pricingService.ts`.

1. Add `'quarterly'` to `pricingCycleEnum` and `'quarterly'` to `billingCycleEnum`.
   Postgres `ALTER TYPE ... ADD VALUE` is not transactional in older PG and cannot be
   rolled back in-transaction. Write the migration accordingly and state the PG version.
2. Widen `PriceTier` and `PricingCycle` to include quarterly. Widen `PriceInfo.interval`
   or add `intervalCount` so a 3-month recurrence is representable. Do not fake a
   quarterly price as "monthly".
3. Extend `PricingResponse` with a `quarterly` key per currency.
4. Env fallback key follows the existing `getEnvKey` pattern:
   `STRIPE_PRICE_PREMIUM_QUARTERLY_THB`.

**Do not touch `.env` files or print any secret.** Per the standing rule, env files are
process input only. Report the variable *name* that needs setting; Purin sets the value.

Exit: `bun test` in pawjai-be passes; `bun run build` clean; migration applies to a
local DB and is reversible or documented as not.

### Lane 2 — Backend: trial moves to quarterly (Sonnet, after Lane 1)
Owns `pawjai-be/src/services/stripe/checkout.ts`.

Replace the `cycle === 'yearly'` trial condition with whatever Lane 0 decided. As
written in the request, the 7-day card-required trial attaches to **quarterly**. Removing
it from yearly is a real change to an existing purchase path: confirm before shipping,
and check whether any existing copy or email promises a yearly trial.

Exit: unit tests covering trial-eligible and trial-ineligible for all three cycles.

### Lane 3 — Stripe price objects (Purin, manual)
Create the three recurring THB prices in Stripe (399 with `interval_count: 3`), then
seed `pricing_config` rows. **I will not create or modify Stripe objects** — that is a
financial-configuration action for the account owner. Lane 1 delivers the code path;
this lane supplies the IDs.

### Lane 4 — Public site pricing model + JSON-LD (Sonnet, after Lane 1)
Owns `pawjai-public/src/lib/subscription/{pricing,api,formatters}.ts`,
`src/lib/seo/schema.ts`, `src/__tests__/public-seo.test.ts`.

1. Replace the lone `QUARTERLY_PRICE_THB` constant with a single three-plan source of
   truth carrying cycle, price, `billingDuration` (`P1M`/`P3M`/`P1Y`), and a
   `recommended` flag on quarterly.
2. **Delete** `QUARTERLY_MONTHLY_EQUIVALENT_THB` — the request says omit monthly
   equivalents. Deleting the constant is what stops it reappearing.
3. Emit three JSON-LD offers. Two tests in `public-seo.test.ts` **will fail and must be
   rewritten, not deleted**:
   - `:192` asserts `offer.price === 399` on a single offer.
   - `:198` "the visible tier page contains one paid plan" asserts the source
     **contains** `QUARTERLY_PRICE_THB` and does **not** contain `BillingToggle`. It
     encodes single-plan as an invariant. Rewrite it to assert the new invariant: three
     cycles present, quarterly flagged recommended, and **no savings/equivalent math in
     the source** — keep a guard there so the deleted discount copy cannot creep back.
4. **Compute no comparison numbers anywhere.** 249×12 vs 1188 invites a "save 60%"
   badge. No savings math in code, copy, JSON-LD, or alt text. The request says omit
   introductory discounts, and a derived-savings claim is the same thing wearing a hat.

Decide explicitly: build-time API fetch or build-time constants. The page is static and
`fetchPricingAtBuildTime` already throws on a bad shape, so the API path stays honest,
but it requires Lane 1 deployed before the public site can build. Constants decouple the
releases. **Recommendation: constants for Release B, with a follow-up to re-source from
the API once Lane 1 is live.** Record the choice in `docs/migration-notes.md`.

Exit: `bun test`, `astro check`, `bun run build` all clean.

### Lane 5 — Navbar + hamburger localization (Sonnet, starts now, independent)
Owns `pawjai-public/src/components/layout/Navbar.astro` and both `pages/nav.ts` catalogs.

Confirmed defects:

1. **Duplicated link lists.** `Navbar.astro:47` `NAV_LINKS` and `:53` `MOBILE_NAV_ITEMS`
   are two hand-maintained arrays. Desktop omits `home`; mobile includes it. Merge into
   one exported list with a `desktop`/`mobile` visibility flag so labels cannot diverge.
2. **`nav.menu` never flips.** The `sr-only` label is `"เปิดเมนู"` / `"Open menu"`
   always, including while the menu is open. Add `nav.closeMenu` to both catalogs and
   swap it in the toggle script alongside `aria-expanded`.
3. **Do NOT collapse `contact` / `contactUs`.** They look like duplicates in Thai (both
   `"ติดต่อเรา"`) but are distinct in English: `contact: "Contact"` is a nav link,
   `contactUs: "Contact us"` is the mobile-menu footer heading rendered at
   `Navbar.astro:290`. Merging them would force one English label into two contexts —
   introducing a localization bug rather than fixing one. The Thai catalog reusing one
   string is a translation choice. Leave both keys; verify each renders in its own slot.
4. **Hardcoded stroke colors.** The hamburger SVGs at `Navbar.astro:214,215` use literal
   `stroke="#584a40"` while DESIGN.md's migration map calls for tokens. Use
   `currentColor` plus a token text class.
5. **`navItems.ts` is dead — verified.** `src/lib/constants/navItems.ts` exports
   app-shell nav (`/dashboard`, `/my-pets`); a grep across `src/` returns **zero**
   importers. Delete it rather than leaving a second nav definition to drift.
6. **iPad breakpoint.** The desktop/mobile switch is `lg:` = 1024px. iPad Pro 12.9"
   portrait is exactly 1024px wide and therefore lands on **desktop** nav, which must fit
   four links plus EN/ไทย plus two auth buttons — in Thai, whose labels are longer
   ("ทดลองใช้ฟรี 7 วัน" as a button). iPad 10.9" portrait (820px) and iPad mini (744px)
   get the hamburger. Verify at **744, 820, 1024, 1180, 1366** widths in **both locales**.
   Catalog parity proves keys exist, not that the navbar renders without overflow.

Exit: `bun test`, `astro check`, `bun run build`, plus a browser pass (below).

### Lane 6 — Tier card UI (Sonnet, after Lane 4)
Owns `pawjai-public/src/components/tier/TierPlans.tsx`, `src/components/islands/TierPlans.tsx`,
`src/pages/[...lang]/tier.astro`.

1. **The page currently ships zero JS.** `tier.astro:36` renders `<TierPlans />` with no
   `client:*` directive. A selector that does nothing would still pass build and tests.
   Add `client:load` and **server-render quarterly as selected** so there is no
   post-hydration flash and no-JS visitors see the recommended plan.
2. Three genuinely selectable options, identical feature list for all three. The feature
   list renders once, outside the selector, not repeated per plan.
3. `แนะนำ` renders as a **separate pill element**, never concatenated into the label
   string, so it stays translatable and screen-reader-separable.
4. Selected plan's **actual charge and renewal interval beside the CTA** — the request's
   explicit requirement. Quarterly shows "399 บาท · ทุก 3 เดือน", monthly "249 บาท ·
   ทุกเดือน", yearly "1,188 บาท · ทุกปี".
4b. **The CTA must carry the selected cycle.** `tier.astro:34` currently builds one
   static `appUrl("/auth/signup?redirectTo=%2Ftier")` with no cycle. If the href does not
   change with the selection, the selector is decorative and "genuinely purchasable"
   fails. The CTA href must vary by selection (e.g. `?plan=premium&cycle=quarterly`).
   This makes **Lane 8 mandatory**, not optional.
5. Semantics: a radiogroup (`role="radiogroup"` + `aria-checked`), not three buttons.
   Arrow keys move between options.
6. **Layout.** "รายไตรมาส · แนะนำ" will not fit a 3-up segmented control at the existing
   `max-w-[400px]` (see `BillingToggle.tsx`). Expect stacked radio cards on mobile,
   3-up only where width genuinely allows. This is a **new pattern** — per the project
   rule, propose it to Purin and record the accepted version in `DESIGN.md` before
   building it.
7. `BillingToggle.tsx` is the old two-way monthly/yearly control. **Verified: nothing
   imports it** (the only reference is the negative assertion in `public-seo.test.ts:206`).
   Delete rather than extend — a 2-way toggle and a 3-way radiogroup are different
   components — and update that assertion in Lane 4.

### Lane 7 — Copy and SEO (Sonnet, after Lane 4 settles the numbers; sole owner of tier catalogs)
Owns `pawjai-public/src/i18n/locales/{th,en}/pages/tier.ts` and `src/lib/seo/registry.ts`.

**One agent owns both tier catalogs.** Lane 6 and Lane 7 both want to edit them; two
agents editing two files that a parity test compares will conflict or break parity
quietly. Lane 6 requests keys; Lane 7 writes them.

1. **Trial disclosure is currently page-level and unconditional.** `tier.ts`
   `trialSubtitle`, `subtitle`, and `noRefund` all assert "7 days then ฿399 every 3
   months." With three selectable plans that wrongly promises a trial on monthly and
   yearly. Make the disclosure **per-plan and conditional on the selection**.
2. Use Purin's Thai string **verbatim** for quarterly:
   `หลังทดลอง เรียกเก็บ 399 บาททุก 3 เดือนโดยอัตโนมัติ จนกว่าจะยกเลิก`
   Write a real English counterpart; do not round-trip it through translation.
3. **Delete** `monthlyEquivalent` (both catalogs) — omit monthly equivalents.
4. **Delete** `yearlyBadge: "ประหยัด ฿791!"`. It is stale (reconciles to a retired
   anchor, not 1188) **and it is untranslated Thai sitting in `en/tier.ts:21`** — a live
   localization bug. It also violates "omit introductory discounts."
5. **Verified dead keys — delete.** A grep across `src/` excluding the catalogs returns
   **zero** render sites for `countdownLabel`, `almostExpired`, `limitedTime`,
   `savePercent`, `badges.bestValue`, `saveMoreWithYearly`, `yearlyBadge`, and
   `freeCardFeatures`. `monthlyEquivalent` has exactly one (the card, removed by this
   work). Delete all of them, plus `countdownUnits` / `freeBenefits` / `freePlan` after
   the same check.
   **Every deletion must hit both catalogs in the same commit** or the parity test fails
   — that is the guard working correctly, not an obstacle.
6. **Navbar trial copy.** `nav.signup` and `nav.createProfile` are both
   "ทดลองใช้ฟรี 7 วัน". If the trial is quarterly-only, a global nav button promising a
   free trial needs review. Flag to Purin; it is a positioning call, not a code call.
7. **SEO registry** still names 399 as *the* price: `registry.ts:85,87,187,189`. Lines
   `344` and `364` state the ฿133/month equivalent — that violates the omit rule **in
   indexed content**, which is worse than on the page. Lines `263,289` assert the trial
   unconditionally. All must be rewritten for a three-plan page.

### Lane 8 — App must honor the chosen cycle (Sonnet, after Lane 1; REQUIRED)
Owns `pawjai-fe/lib/api/subscriptionService.ts` and the signup/tier entry that reads the
redirect.

`pawjai-fe/lib/api/subscriptionService.ts:72` types `cycle: "monthly" | "yearly"` — the
same two-value union as the backend. A quarterly selection made on the public site has
nowhere to land today. This lane widens that union and threads the cycle from the
inbound URL through signup into `createCheckoutSession`.

Without this lane the public page can display three options but only sell two. That is
why "Deliberately not doing" no longer excludes `pawjai-fe`: it is in scope, narrowly.

Exit: `bun run build` in pawjai-fe clean; a cycle param survives signup into checkout.

---

## Orchestration

**Orchestrator** (me) holds the dependency graph, assigns file ownership, and runs the
gates. **Sonnet subagents** execute one lane each.

```
Lane 0 (Purin, flag) ──> Lane 1 ──> Lane 2 ──> Lane 3 (Purin, Stripe)
                            │
                            └────────> Lane 8 (pawjai-fe cycle)
                                                    │
Lane 4 (constants) ──> Lane 6 (UI) ─────────────────┘  [Release B deploy gate]
             └───────> Lane 7 (copy + SEO)
Lane 5 (navbar) ── independent, RUNNING NOW

Lanes 4/6/7 build on the requested 249/399/1188 immediately; they do not wait on Lane 1.
Only the Release B *deploy* waits on Lanes 1-3 and 8.
```

File ownership is exclusive. No two lanes hold the same file:

| Files | Lane |
|---|---|
| `pawjai-be` enums, migration, pricing services | 1 |
| `pawjai-be/src/services/stripe/checkout.ts` | 2 |
| `pawjai-fe/lib/api/subscriptionService.ts` + signup cycle plumbing | 8 |
| `pawjai-public/src/lib/subscription/*`, `lib/seo/schema.ts`, `__tests__/public-seo.test.ts` | 4 |
| `Navbar.astro`, `locales/{th,en}/pages/nav.ts`, `constants/navItems.ts` | 5 |
| `components/tier/*`, `components/islands/TierPlans.tsx`, `pages/[...lang]/tier.astro` | 6 |
| `locales/{th,en}/pages/tier.ts`, `lib/seo/registry.ts` | 7 |

Every lane exits on `bun test` + `astro check` + `bun run build` (or pawjai-be's
equivalents). A lane that cannot pass its own gate reports back rather than weakening
the gate — no `as any`, no swallowed errors, no skipped tests.

## Verification

Automated gates do not prove the selector works, because the page ships no JS today and
a dead control passes every test. Required browser pass on the built site, **both
locales**:

- Widths **390, 744, 820, 1024, 1180, 1366**. 1024 is the iPad-Pro-portrait desktop/mobile
  boundary and the most likely overflow.
- Quarterly is preselected on first paint, before hydration.
- Selecting each option updates the charge and interval beside the CTA.
- Hamburger opens, closes, traps scroll, flips its `sr-only` label, and every item is
  localized in both locales.
- Keyboard: tab to the radiogroup, arrow between options, focus rings visible.

## Deliberately not doing

- Creating or editing Stripe prices, or any other financial configuration.
- Reading, printing, or editing `.env` files or any secret value.
- Any savings, discount, or "save X%" claim, computed or written.
- Redesigning the app's tier/checkout screens. Lane 8 touches `pawjai-fe` only enough to
  carry a quarterly cycle through to checkout; the app's own pricing UI is untouched.

## CONFIRMED LIVE BUG: desktop nav overflows at iPad Pro portrait

Found by Lane 5, **independently re-verified by the orchestrator** with
`getBoundingClientRect()` in a real browser at 1024x1366, and confirmed to **predate**
Lane 5 by stashing its changes and re-measuring at `HEAD`.

| Build | Viewport | Header scrollWidth | Rightmost element | Overflow |
|---|---|---|---|---|
| `HEAD` (before Lane 5) | 1024 | 1178 | signup "เริ่มใช้ฟรี" at x=1178 | **154px** |
| With Lane 5 | 1024 | 1252 | signup "ทดลองใช้ฟรี 7 วัน" at x=1252 | **228px** |

`document.documentElement.scrollWidth` stays at 1009, under the viewport, so **there is no
horizontal scrollbar**: the signup button is clipped off-screen and cannot be reached by
scrolling. Sign-in is partly cut too. A screenshot at 1024 in Thai shows "เข้าสู่ระบบ"
truncated at the right edge with the signup button entirely absent.

This is already broken in production for **iPad Pro 12.9" portrait**, which is exactly
1024px and therefore lands on the desktop nav. Lane 5 did not cause it; Lane 5 made it
74px worse by adopting the longer trial label already present in the catalogs.

Lane 5 correctly **did not** change the breakpoint, since that is a design decision.
Ranked options for Purin:

1. **Move the desktop/mobile switch from `lg:` (1024) to `xl:` (1280).** iPad Pro portrait
   then gets the hamburger, which it has the width for. Smallest change, no visual
   redesign, and the mobile menu already renders every link correctly.
2. **Tighten desktop spacing** (`gap-7`/`gap-6`/`gap-4`, `px-4` per link). Keeps the
   desktop nav at 1024 but is fragile: it re-breaks the moment any label grows, and Thai
   labels are the long ones.
3. **Shorten the nav CTA label.** Related to open question 4 below, since the button
   currently promises a 7-day trial that may become quarterly-only.

Recommendation: option 1. It fixes the real device rather than buying margin that the
next copy change spends.

## Open questions for Purin

1. **Which yearly price is real?** Request says ฿1,188; `docs/migration-notes.md:154`
   records live ฿948; `pawjai-be` test asserts ฿1,548. Three numbers, one plan. Frontend
   builds on 1,188 meanwhile.
2. **Does the 7-day trial move off yearly onto quarterly only?** As written, yes — and
   that removes a trial from an existing purchase path.
3. **Stacked radio cards on mobile** is a new pattern for DESIGN.md. Approve before build?
4. **Navbar "ทดลองใช้ฟรี 7 วัน"** promises a trial globally; keep, or make plan-neutral?
5. **Which nav overflow fix?** Recommend moving the breakpoint to `xl:` (see above).
   Blocks closing Lane 5.
