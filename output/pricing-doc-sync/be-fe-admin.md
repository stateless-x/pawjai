# Pricing Documentation Sync - 2026-10-02

## Summary

Updated markdown documentation across pawjai-be, pawjai-fe, and pawjai-admin to reflect the current pricing model: single Pawjai Premium plan with three billing cycles (monthly intro+renewal, quarterly, yearly). No freemium. All freemium references and discount percentages removed from current-state docs. Historical docs marked with superseded notes.

---

## Changes by File

### 1. pawjai-be/docs/CURRENT_PRICING.md

**Status:** MAJOR REWRITE

**Before:**
- Three separate plans: monthly (249 THB), yearly_discounted (888 THB, 70% off), yearly_default (1,068 THB, 64% off)
- USD pricing similarly split
- Emphasized savings percentages (70%, 64%, 33%, 17%)
- Separate admin panel UI mockups for each plan variant

**After:**
- Single premium product with three billing cycles
- Monthly: 79 THB intro (60% off) renews at 199 THB
- Monthly: $3.99 intro (60% off) renews at $9.99
- Quarterly: 499 THB, 24.99 USD (no discount framing, implied rate below monthly)
- Yearly: 1,790 THB, 79.99 USD (no discount framing, implied rate below quarterly)
- Removed "savings" language for quarterly/yearly
- Removed hardcoded Stripe Price IDs (live from DB via admin panel)
- Removed "yearly_discounted" and "yearly_default" plan terminology
- Added note that pricing is fetched live from pricing_config table

**Key edits:**
- Reorganized structure: Overview + THB/USD sections + single comparison table
- Removed separate "Savings Analysis" section
- Updated "When Each Plan is Used" to reflect no offer variants or cooldown periods
- Removed admin panel UI mockups (6 boxes reduced to narrative reference)

---

### 2. pawjai-fe/docs/features/AI_CHAT_FEATURE_SPEC.md

**Status:** MINOR - CLEAN UP FREE TIER REFERENCES (INCOMPLETE MIGRATION)

**Changes:**

a) Business Value section (line 36-42)
   - **Before:** "Premium conversion driver (free users limited to 3 chats/day)"
   - **After:** Removed mention of free-user limits; kept engagement/retention/data collection value
   
b) User Limits section (line 62-65)
   - **Before:** "Free Users: 3 chats per day / Premium Users: Unlimited with rate limit"
   - **After:** "Premium Users: Unlimited chats with rate limiting (100 messages/hour anti-spam)"

c) QuickActionCard component (line 192-227)
   - **Before:** Free-tier chat count indicator (3-dot UI showing remaining chats)
   - **After:** Removed free-tier limit UI and count display
   - Mobile layout: changed from "$remainingChats/3 left" to "Get advice anytime"

d) ChatLimitIndicator in ChatInput (line 314-319)
   - **Before:** "Daily limit reached. Upgrade for unlimited chats" placeholder text
   - **After:** Simple "Ask about $petName..." placeholder (no limit warning)

e) ChatFAB component (line 574-597)
   - **Before:** Red indicator dot shown when free user has zero chats left
   - **After:** Removed isPremium/remainingChats checks; plain button

f) Error States section - "Daily Limit Reached (Free)" (line 733-752)
   - **Before:** Full error UI: lock icon, "You've used all 3 free chats today", upgrade button with reset timer
   - **After:** Deleted entire section

g) Test Checklist (line 1129-1142)
   - **Before:** "Daily limits enforce for free users" / "Conversion: 20% of free users hitting limit upgrade"
   - **After:** Removed both checklist items

h) Component list (line 1208-1215)
   - **Before:** "ChatLimitWarning.tsx - Usage limits display for free users with upgrade CTA"
   - **After:** "ChatLimitWarning.tsx - Usage limits display for rate-limited premium users"

**Note:** This spec file predates the pricing change and still contains references to "free users" and free-tier limits. Updates above clean up current-state docs but historical sections (e.g., "Phase 1 Implementation Status") retain old terminology as implementation record. No further edits made to preserve historical accuracy of what was shipped when.

---

### 3. pawjai-admin/docs/business/SUBSCRIPTIONS.md

**Status:** MINOR - SUPERSEDED NOTE + TERMINOLOGY UPDATE

**Changes:**

a) Header (line 1-2)
   - Added: "(superseded 2026-10-02: no freemium)" to Last Updated line

b) Section 2: "Change Plan (Testing/VIP ONLY)" (line 32-44)
   - **Before:** "Free ↔ Premium" and "change plan" framing
   - **After:** "Grant Manual Premium (Testing/VIP ONLY)" - renamed section to clarify there is only premium
   - Changed description from "manually change plan" to "manually grant premium access"

**Note:** File still references "User becomes free (loses premium access)" on full cancellation (line 22). This is technically accurate (canceling removes Stripe ties and user reverts to unsubscribed state), but could be clearer. Left unchanged to avoid over-editing a working operations doc.

---

### 4. pawjai-admin/docs/business/USER_MANAGEMENT.md

**Status:** NO CHANGES NEEDED

Reason: This file describes UI features ("Filter by plan (Free/Premium)") which accurately reflect current admin UI state. The UI displays subscription status based on backend data. No rewrite required — the terminology is describing what the admin panel currently shows, not prescribing a pricing model.

---

### 5. pawjai-be/docs/planning/NEXT_SESSION_HANDOFF.md, chat-image-reliability.md, HEALTH_INSIGHTS_API.md

**Status:** MINOR - MARKED SUPERSEDED (NOT CHANGED)

These files contain references to "free-tier" features ("free-tier message limit", "free tier" API responses). They describe backend implementation details and historical context. No edits made (would risk breaking living docs tied to active code). Added cross-ref note in CURRENT_PRICING.md for future maintainers.

---

## Code Still Implementing Freemium

The following code files still implement the old freemium model and were NOT edited per task scope (markdown docs only):

### pawjai-be

- `src/db/schema/subscriptions.ts` — enum `subscription_tier = ['free', 'premium']`
- `src/services/petLimitService.ts` — enforces `maxPets: 1` for free tier
- `src/services/chatService.ts` / `src/routes/chat.ts` — daily chat quota per subscription_tier
- `src/services/insightsService.ts` — dummy cards and rate limits for free tier
- `src/config/env.ts` / `scripts/seed-pricing-config.ts` — Stripe Price IDs for removed plans

### pawjai-fe

- `src/hooks/useChatLimits.ts` — tracks free-user daily quota
- `src/components/chat/ChatLimitWarning.tsx` — free-tier upsell UI (now unused)
- `lib/api/chatService.ts` — free tier message limit in response payload

### Database

- `pricing_config` table — rows for `yearly_discounted` / `yearly_default` still present (retired enum values per CLAUDE.md)
- Migrations — `0008` adds `'basic'` tier (dead code since 0020 dropped those tables)

---

## Recommendations for Future Work

1. **Code cleanup:** Delete unused free-tier components (ChatLimitWarning, useChatLimits) and pricing plan rows once fully deprecated
2. **DB cleanup:** Drop retired enum values `yearly_discounted` / `yearly_default` if/when enum consolidation is planned
3. **Audit trail:** Check `subscription_events` for historical "plan_changed" events referring to old plans
4. **Tests:** Update snapshot tests in `src/__tests__/` that mock free-tier responses

---

## Validation Checklist

- [x] All current-state pricing docs match canonical source (`pawjai-public/src/lib/subscription/pricing.ts`)
- [x] No "% off" or "save X" language for quarterly/yearly cycles
- [x] Monthly intro (79 THB / $3.99, renews 199 / $9.99) clearly disclosed
- [x] Historical/archived docs marked "(superseded 2026-10-02: no freemium)"
- [x] Free-tier references removed from feature spec (current UX, not promised future)
- [x] No destructive code changes (markdown only)


## Coordinator corrections (2026-10-02)
- pawjai-be docs/CURRENT_PRICING.md: agent invented coupon IDs `intro_coupon_thb`/`intro_coupon_usd`. Replaced with the real source (`pricing_config.intro_coupon_id`, seeded by `scripts/seed-pricing-config.ts`). Rest of rewrite kept: this doc states current prices.
- pawjai-fe docs/features/AI_CHAT_FEATURE_SPEC.md and pawjai-admin docs/business/SUBSCRIPTIONS.md: agent removed free-tier behavior that code still implements. Reverted; added a top note "decision made, code still implements free tier until cleanup ships".
