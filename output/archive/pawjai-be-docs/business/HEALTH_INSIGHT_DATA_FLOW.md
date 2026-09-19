# Health Insights - Data Flow & Architecture

**Document:** Data Flow Visualization
**Purpose:** Show how health insights are generated, cached, and displayed
**Last Updated:** 2026-08-07
**Architecture:** Modular Orchestrator Pattern (V2)

**Accuracy note:** this doc went unverified for a long time and had drifted from the code in
several specific, load-bearing numbers (model name, rate limits, tier generation strategy, the
raw DB schema shape, and most of the cost/revenue tables). The architecture description (the
7-layer pipeline, file layout, cache-invalidation-on-upgrade flow) still matches
`src/services/insights/` closely and is kept. Numbers that drift easily now point at the file
that owns them instead of restating a value. Anything not re-verified below (frontend behavior
in pawjai-fe, cost/revenue projections) is marked as such.

---

## 🔄 Complete Data Flow

### User Request → Insight Display (Modular Architecture V2)

```
┌─────────────────────────────────────────────────────────────────┐
│ User opens /pet/[id]/health-insights                            │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Context Resolver                                       │
│ • Fetch pet (breed, age, weight) + user (locale, tier)          │
│ • Validate ownership                                            │
│ • Determine effective locale (request > user pref > default)    │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: Strategy Router                                        │
│ • Check DB cache (30-day TTL)                                   │
│ • Enforce rate limits (see rateLimitConfig in                  │
│   strategy-router.service.ts -- values change; don't restate)  │
│ • Decision: CACHE_HIT → Return instant                          │
│            GENERATE → Proceed                                   │
│            RATE_LIMITED → Error 429                            │
└────────────────┬────────────────────────────────────────────────┘
                 │ (if GENERATE)
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Frontend: Show "Thinking..." Loading Animation                  │
│ • Animated mascot (PePe)                                        │
│ • Progress messages (Analyzing breed, Checking age, etc.)       │
└─────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: Knowledge Processor                                    │
│ • Load breed knowledge from JSON (/knowledge-base/breeds/)      │
│ • Filter by age relevance (±36 months)                         │
│ • Pre-categorize: breed_risk, preventive_care, lifestyle       │
│ • Pre-assign risk levels: high, medium, low                    │
│ • Sort by severity and relevance                                │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4: Prompt Builder                                         │
│ • System prompt: PePe personality + constraints                 │
│ • User prompt: Pet profile + pre-categorized knowledge          │
│ • LLM role: Write content ONLY (not structure)                 │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 5: LLM Generation                                         │
│ • Model: see HEALTH_MODEL in gemini-models.config.ts --        │
│   this has changed over time, don't trust a model name in       │
│   prose docs                                                    │
│ • Time: roughly 10-30 seconds                                   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 6: Post-Processor                                         │
│ • Parse and validate JSON response                              │
│ • Merge LLM content + system metadata                          │
│ • Store complete insights in database                           │
│ • Cache TTL: 30 days (720 hours)                               │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 7: Tier-Aware Generation                                  │
│ Generation itself is tier-specific -- the LLM is asked for a   │
│ different insight count per tier (see selectInsightsForTier in  │
│ prompt-builder.service.ts for the exact split):                │
│                                                                 │
│ FREE TIER: 3 insights (1 high, 1 medium, 1 low)                │
│ • Stored with generatedForTier='free'                          │
│ • Frontend adds dummy/locked cards around the 3 real ones       │
│   (count: see DUMMY_CARDS_COUNT in                              │
│   dummy-card-generator.service.ts)                              │
│                                                                 │
│ PREMIUM TIER: up to 9 insights (up to 4 high, 3 medium, 2 low) │
│ • Stored with generatedForTier='premium'                       │
│ • Frontend shows: all real insights unlocked, no dummy cards   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ API Response → Frontend                                         │
│ • insights: Array<Insight> (real + dummy combined)             │
│ • metadata: source, cacheAge, generatedAt, tier, hiddenCount   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Frontend: Render Health Insights Page                           │
│ • Summary view: AI-generated health summary                     │
│ • Risks view: 3 risk level tabs (High, Medium, Low)            │
│ • Interactive carousels: Swipe/drag navigation                  │
│ • Detail modals: Full insight breakdown with tabs              │
│ • FOMO strategy: Locked cards with upgrade prompts (free tier) │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Detailed Component Architecture

### 1. Frontend Request Flow

**Unverified from this repo** -- pawjai-fe is a separate codebase, so page/component names and
exact fields below are not confirmed against frontend source. Treat as illustrative only. The
endpoint it calls is `GET /api/pets/:petId/insights` (see section 2 below for the real path).

```
┌─────────────────────────────────────────────────────────┐
│ /pet/[id]/health-insights/page.tsx (illustrative)        │
│                                                         │
│ useEffect(() => {                                       │
│   1. Show loading state                                 │
│   2. Call GET /api/pets/:petId/insights                │
│   3. Wait for response                                  │
│   4. Render insight cards                                │
│ })                                                      │
└─────────────────────────────────────────────────────────┘
```

### 2. API Endpoint Flow

Real endpoint (see `src/routes/pet-insights.ts`): `GET /api/pets/:petId/insights`, with
`force`/`maxAge` query params, `requireAuth()` + `requirePetAccess` middleware.

```
GET /api/pets/:petId/insights
│
├─ Auth + pet-access middleware
│
├─ Database Check (via strategy-router.service.ts)
│  ├─ Query pet_insights for this pet + locale, check generatedAt age against
│  │  cacheTtlHours and generatedForTier against the user's current tier
│  │
│  ├─ HIT (fresh cache, tier matches)
│  │  └─ Return cached insights (instant)
│  │
│  └─ MISS (no cache, stale, or tier mismatch)
│     └─ Proceed to generation
│
├─ Insight Generation
│  ├─ Fetch pet profile
│  ├─ Load knowledge base JSON
│  ├─ Filter by age
│  ├─ Select insight count for tier (selectInsightsForTier)
│  ├─ Build LLM prompt
│  ├─ Call the configured Gemini model
│  └─ Parse response
│
├─ Database Save
│  ├─ Upsert rows into pet_insights (one row per insight, keyed on
│  │  petId + insightKey + locale)
│  └─ generatedAt defaults to now(); no separate expiresAt column is stored
│
└─ Response: insights array plus metadata (source, generatedAt, tier)
```

### 3. Knowledge Base Structure

```
/knowledge-base/breeds/
├─ golden-retriever.json
│  ├─ breedId, breedNameEn, breedNameTh, species
│  ├─ commonHealthRisks[]
│  │  ├─ insightKey
│  │  ├─ condition
│  │  ├─ prevalence (with breed context)
│  │  ├─ peakAgeRange [startYear, endYear]
│  │  ├─ severity (low|medium|high|critical)
│  │  ├─ notes (warm, actionable)
│  │  ├─ warningSigns[] (observable only)
│  │  ├─ prevention[] (with WHY explanations)
│  │  └─ whenToVet (specific triggers)
│  └─ preventiveCare[]
│     ├─ insightKey
│     ├─ careType
│     ├─ ageRange [start, end]
│     ├─ frequency
│     ├─ description
│     ├─ recommendations[]
│     └─ whenToVet
│
├─ persian.json
├─ labrador-retriever.json
└─ ... (201 total breeds)
```

### 4. Age Filtering Logic

```
Input:
  - Pet age: 2 years old
  - Knowledge base: 7 health conditions

Process:
  Condition 1: Hip Dysplasia
    peakAgeRange: [3, 10]
    Age 2 vs [3, 10]? → Hide (too young)

  Condition 2: Elbow Dysplasia
    peakAgeRange: [1, 6]
    Age 2 vs [1, 6]? → Show ✓

  Condition 3: Hemangiosarcoma
    peakAgeRange: [7, 12]
    Age 2 vs [7, 12]? → Hide (too young)

  Condition 4: Lymphoma
    peakAgeRange: [6, 13]
    Age 2 vs [6, 13]? → Hide (too young)

  Condition 5: Exocrine Pancreatic Insufficiency
    peakAgeRange: [1, 5]
    Age 2 vs [1, 5]? → Show ✓

  ...more conditions...

Output:
  Show: [Elbow Dysplasia, EPI, ...]
  Hide: [Hip Dysplasia, Hemangiosarcoma, Lymphoma, ...]
```

### 5. LLM Prompt Architecture

```
SYSTEM PROMPT:
  You are a warm, knowledgeable veterinarian creating
  personalized health insights for pet parents.

  - Use breed name and age in context
  - Provide hope and empowerment
  - Make prevention actionable and affordable
  - Format: JSON with specific fields

USER PROMPT:
  Pet Profile:
    - Name: Max
    - Breed: Golden Retriever
    - Species: Dog
    - Age: 2 years old
    - Gender: Male
    - Activities: Daily 30-min walks, active play

  Knowledge Base (filtered for age):
    - Elbow Dysplasia (peak age 1-6)
    - Exocrine Pancreatic Insufficiency (peak 1-5)
    - ... [age-filtered conditions]

  Generate personalized health insights for Max
  covering all applicable conditions.

LLM OUTPUT (current field names -- see `OUTPUT_FORMAT.jsonStructure` in
`src/prompts/config/output-format.ts` and `docs/prompts/LLM_REFERENCE.md`):
  [
    {
      "insightKey": "elbow_dysplasia_golden_retriever",
      "category": "breed_risk",
      "riskLevel": "high",
      "title": "Elbow Joint Health - Early Prevention Matters",
      "description": "Golden Retrievers like Max are predisposed to elbow dysplasia...",
      "recommendations": ["Controlled exercise", "Joint supplements", "Weight management"],
      "ageRelevance": { "startMonths": 12, "endMonths": 72 }
    },
    ...
  ]
```

### 6. Database Schema

The real table is **one row per insight**, not one row per pet with an `insights[]` array.
Defined in `src/db/schema/pets.ts` (`petInsights`, table name `pet_insights`):

```typescript
export const petInsights = pgTable('pet_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  petId: uuid('pet_id').notNull().references(() => pets.id, { onDelete: 'cascade' }),
  insightKey: text('insight_key').notNull(),
  category: insightCategoryEnum('category').notNull(),
  riskLevel: riskLevelEnum('risk_level').notNull(),
  locale: languageEnum('locale').notNull().default('th'),
  content: jsonb('content').notNull(), // { title, description, recommendations[], ... }
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  generatedBy: text('generated_by').notNull(), // model identifier string
  generatedForTier: subscriptionTierEnum('generated_for_tier').notNull().default('free'),
  viewCount: integer('view_count').default(0),
  lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
});
```

There is no `userId`, `expiresAt`, `refreshedAt`, or `version` column on this table -- cache
freshness is computed from `generatedAt` plus the TTL in `strategy-router.service.ts`, not
stored as a separate expiry timestamp. Unique index: one row per `(petId, insightKey, locale)`.
Indexes: `(petId, locale)`, `(petId, category, riskLevel)`, `(petId, generatedAt)`.

---

## 🔄 Caching Strategy & Generation Frequency

### ✅ Generation Frequency Control (Production-Ready)

**Goal:** Both insights and summaries regenerate **once per month** unless incomplete/missing.

**Current Implementation:**
```
Cache TTL:
  - Insights: 30 days (720 hours) -- see cacheTtlHours in strategy-router.service.ts
  - Health summary: tier-aware -- 30 days for free, 7 days for premium
    (HEALTH_SUMMARY_CACHE_TTL_FREE / _PREMIUM in src/constants/cache-ttl.constants.ts).
    This is NOT the same TTL as insights; don't assume they match.
Rate Limits (see rateLimitConfig defaults in strategy-router.service.ts -- these have changed
before and will again, so treat any number here as illustrative, not authoritative):
  - A per-pet daily cap on new generations
  - A per-user hourly cap on new generations (counts insight rows written, not "generation
    calls" -- one generation call writes multiple rows)

Logic Flow (Insights):
1. User visits /pet/[id]/health-insights
2. Strategy Router checks cache:
   - If cache exists AND age < 720 hours → Return cached (instant)
   - If cache missing OR age > 720 hours → Generate new
   - If generated within 24 hours → Rate limit error
3. Rate limits can be bypassed with force=true flag

Logic Flow (Health Summary):
1. User visits /pet/[id]/health-insights (summary loads with insights)
2. Orchestrator checks cached summary:
   - If summary exists AND age < 720 hours AND tier matches → Return cached
   - If summary missing OR age > 720 hours OR tier mismatch → Generate new
3. Summary stored in pets table (healthSummary, healthSummaryLocale,
   healthSummaryGeneratedAt, healthSummaryTier)
```

**Generation Triggers:**
- ✅ First visit (no cache exists)
- ✅ Cache older than 30 days (stale)
- ✅ Tier upgrade (free → premium) - Different tone/content
- ✅ Locale change (summary needs new language)
- ✅ Manual regeneration (force=true, respects rate limits)
- ⚠️ Birthday/age change (NOT YET IMPLEMENTED - Future enhancement)

### Cache Lifecycle

```
┌──────────────────────────────────────────────────────┐
│ Insight Generated at Time T                           │
│ cacheAge = 0 hours, TTL = 720 hours                  │
└────────────────┬─────────────────────────────────────┘
                 │
        ┌────────┴────────┬─────────────────┐
        │                 │                 │
   Day 1-29         Day 30 (Stale)    Forced Regeneration
   Return cached    Generate new       Bypass cache
   (instant)        (if no rate limit) (respects rate limit)

Cache Key: (petId + locale)
Note: `generatedForTier` is stored per insight row and IS used for cache-freshness checks --
      a stored tier that doesn't match the user's current tier is treated as stale and
      triggers regeneration (see strategy-router.service.ts tier-mismatch handling). This is
      different from an earlier design where the same content was meant to serve both tiers;
      the shipped implementation generates tier-specific content instead (see below).
```

### Free vs Premium Generation Strategy

Generation is tier-specific -- the LLM is asked to produce a different insight count per tier,
it does not generate a large set once and filter down. See `selectInsightsForTier` in
`src/services/insights/prompt-builder.service.ts`.

**Free Tier:**
- Requests 3 insights from the LLM (1 high, 1 medium, 1 low risk)
- Stored with `generatedForTier='free'`
- Frontend adds dummy/locked cards around the 3 real ones to show what's available on upgrade

**Premium Tier:**
- Requests up to 9 insights from the LLM (up to 4 high, 3 medium, 2 low risk -- the exact caps
  live in `selectInsightsForTier`)
- Stored with `generatedForTier='premium'`
- All real insights shown, no dummy cards

**Design consequence:** because generation is tier-specific, an upgrade from free to premium
needs a fresh generation call, not just a response-time filter -- see the cache invalidation
flow below.

---

## 💎 Free-to-Premium Upgrade Experience

Because generation is tier-specific (see above), upgrading from free to premium requires a
fresh generation call -- there is no "instant unlock from shared cache" path. The real flow
invalidates the cache on upgrade and regenerates with premium content on the user's next visit.
See "Upgrade Experience Flow (Free → Premium)" further down in this document for the accurate,
code-verified version of this flow (matches `subscriptionService.invalidateHealthInsightsCacheForUser`
in `src/services/subscriptionService.ts`), including the regeneration wait on first post-upgrade visit.

An earlier design considered generating one shared set of insights for both tiers and filtering
at response time (which would have made upgrades instant, with no regeneration). That design
was not what shipped -- don't rely on it.

---

## 📝 Health Summary Generation

### Overview

The health insights feature includes TWO components:
1. **Health Insights** - Detailed risk assessments and preventive care (up to 3 cards free, up
   to 9 cards premium -- see `selectInsightsForTier`)
2. **Health Summary** - AI-generated 2-3 sentence overview at the top of the page

Both use a tier-based content strategy, but their cache TTLs differ: insights cache for 30 days
regardless of tier, while the health summary caches for 30 days on free and 7 days on premium
(see `src/constants/cache-ttl.constants.ts`). Don't assume they're on the same schedule.

### Health Summary Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ User visits /pet/[id]/health-insights                            │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ├──────────────────┬──────────────────┐
                 ▼                  ▼                  ▼
           Load Insights      Load Summary      Load Activity
           (detailed cards)   (overview text)   (recent data)
```

### Summary Generation Flow

```
Step 1: Check Cache
┌─────────────────────────────────────────────┐
│ orchestrator.generateHealthSummary()        │
│ ├─ Check pets.healthSummary exists?         │
│ ├─ Check locale matches?                    │
│ ├─ Check age within tier's TTL (30d/7d)?    │
│ └─ Check tier matches current subscription? │
└────────────────┬────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
     Valid Cache      Cache Miss/Stale
     Return cached    Generate new
        │                 │
        ▼                 ▼
Step 2: Generate (if needed)
┌─────────────────────────────────────────────┐
│ 1. Fetch existing insights for context      │
│ 2. Count risk levels (high/medium/low)      │
│ 3. Get recent activity summary (30 days)    │
│ 4. Build tier-aware prompt:                 │
│    • Free: Cautionary tone                  │
│    • Premium: Reassuring tone               │
│ 5. Call Gemini LLM (fast model)             │
│ 6. Save to pets table with tier marker      │
└─────────────────────────────────────────────┘

Step 3: Return Summary
┌─────────────────────────────────────────────┐
│ { summary: string, cached: boolean }        │
└─────────────────────────────────────────────┘
```

### Database Schema (pets table)

```typescript
{
  // Health Summary (AI-generated executive overview)
  healthSummary: string | null             // 2-3 sentence summary
  healthSummaryLocale: 'th' | 'en' | null  // Language of summary
  healthSummaryGeneratedAt: Date | null    // Generation timestamp
  healthSummaryTier: 'free' | 'premium' | null  // Which tier this summary was generated for
}
```

### Cache Validation Rules

Summary is considered **valid** if ALL conditions are met:
1. ✅ `healthSummary` exists
2. ✅ `healthSummaryLocale` matches requested locale
3. ✅ Age is within the TTL for the current tier (30 days free, 7 days premium -- see
   `src/constants/cache-ttl.constants.ts`)
4. ✅ `healthSummaryTier` matches current subscription tier

If any condition fails → Regenerate summary

### Tier-Based Content Strategy

**Free Tier Tone:**
- Emphasizes importance of monitoring
- Cautionary language about risks
- Encourages upgrade for "peace of mind"
- Example: *"Max has 3 significant health considerations to monitor. Regular vet check-ups are essential."*

**Premium Tier Tone:**
- Reassuring and empowering
- Focuses on prevention and management
- Builds confidence in pet care
- Example: *"Max is doing well! Keep up the preventive care to maintain his excellent health."*

### Regeneration Triggers

Summary regenerates when:
- ✅ First visit (no summary exists)
- ✅ Cache older than the tier's TTL (30 days free / 7 days premium -- stale)
- ✅ Tier upgrade (free → premium) - **Different tone needed**
- ✅ Locale change (different language)
- ✅ Manual regeneration (force=true)

### Cost Optimization

Summary generation uses far fewer tokens than full insights generation (short prompt, 2-3
sentence output), so it's a small fraction of total LLM spend. See "Cost Tracking" below for
the caveat on why specific dollar figures aren't restated here.

### Implementation Files

| File | Purpose |
|------|---------|
| `src/services/insights/orchestrator.service.ts` | `generateHealthSummary()` method |
| `src/db/schema/pets.ts` | `pets` table with summary columns |
| `src/prompts/health-summary-prompt.ts` | Tier-aware prompt builder |
| `src/services/subscriptionService.ts` | Cache invalidation on upgrade |

### Upgrade Experience (Summary)

**Free User → Premium:**
```
Day 1 (Free):
  Summary: "Max has 3 health risks to monitor. Regular vet visits are essential."
  Tone: Cautionary

Day 5 (Upgrade to Premium):
  1. Payment successful
  2. Backend clears healthSummary fields (set to null)
  3. User visits insights page
  4. Summary regenerates with premium tone

  New Summary: "Max is healthy! Continue preventive care to maintain his excellent condition."
  Tone: Reassuring
```

**Technical Flow:**
```
subscriptionService.invalidateHealthInsightsCacheForUser():
  1. DELETE FROM pet_insights WHERE petId IN (user's pets)
  2. UPDATE pets SET
       healthSummary = NULL,
       healthSummaryLocale = NULL,
       healthSummaryGeneratedAt = NULL,
       healthSummaryTier = NULL
     WHERE id IN (user's pets)
```

This ensures both insights AND summary are regenerated with tier-appropriate content on upgrade.

---

## 💰 Cost Tracking

The detailed per-token cost/revenue tables that used to live here were computed against Gemini
2.5 Flash-Lite pricing and a $4.99/mo premium price -- both stale (see
`src/config/gemini-models.config.ts` for current models, and `docs/CURRENT_PRICING.md` for
current pricing: $9.99/mo USD, not $4.99). Rather than restate numbers that will drift again,
the calculation method is: `(input_tokens / 1e6 * input_price) + (output_tokens / 1e6 *
output_price)` per generation, using whatever the current model's per-token pricing is. LLM
cost has consistently been a small fraction of subscription revenue in every scenario modeled;
if you need current figures, recompute from the live model config and Stripe pricing rather
than trusting a number in this doc.

---

## 🚨 Field Variations & Fallbacks

### LLM Inconsistency Handling

An earlier version of the output schema used `summary`/`prevention` field names before
settling on `description`/`recommendations` (see `OUTPUT_FORMAT.jsonStructure` in
`src/prompts/config/output-format.ts` and `docs/prompts/LLM_REFERENCE.md`). Whether the
frontend (pawjai-fe, a separate repo) still has fallback logic reading both old and new field
names is unverified from this repo -- don't assume the fallback code below still exists without
checking pawjai-fe directly:

```typescript
const description = insight.description || (insight as any).summary;
const recommendations = insight.recommendations || (insight as any).prevention;
```

---

## ✅ Performance Targets

| Metric | Target |
|--------|--------|
| Cache hit response time | <100ms |
| Generation time | <30s |
| Database query | <50ms |
| Frontend load | <3s |

These are targets, not measured current values -- no monitoring/metrics pipeline that reports
against them is wired up in this repo as of this writing. Treat any "current: ~Xms" figure in
older versions of this doc as aspirational, not measured.

---

## 📈 Monitoring Points

1. **Cache Hit Rate**
   - Target: >80%
   - Monitor: Cache hits vs misses per day

2. **Generation Time**
   - Target: <30 seconds
   - Monitor: p50, p95, p99 latency

3. **LLM Cost**
   - Target: <200 THB/month for 10k users
   - Monitor: Tokens used, cost per request

4. **Error Rate**
   - Target: <1%
   - Monitor: LLM failures, timeout errors

5. **User Satisfaction**
   - Monitor: Feature adoption rate, premium conversion

---

## 🔄 Upgrade Experience Flow (Free → Premium)

**Updated:** 2025-12-06 - Two-Tier Generation Strategy

### User Journey

**Day 1: Free User Generates Insights**
```
1. User opens health insights for first time
2. Backend generates 3 insights (tier='free')
   ├─ 1 High risk insight
   ├─ 1 Medium risk insight
   └─ 1 Low risk insight
3. Stored in database with generatedForTier='free'
4. Frontend displays:
   ├─ 3 real insights (unlocked, full details)
   └─ dummy cards (blurred, locked with "Upgrade" prompts -- count is
      DUMMY_CARDS_COUNT in dummy-card-generator.service.ts, currently 6)
5. User sees value but wants more
```

**Day 5: User Upgrades to Premium**
```
1. User clicks "Upgrade to Premium"
2. Redirected to Stripe payment
3. Payment successful → Stripe webhook fires
4. Backend: subscriptionService.update()
   ├─ UPDATE user_subscriptions SET plan='premium'
   ├─ Invalidate access control cache
   └─ Invalidate health insights cache (DELETE insights)
5. User redirected back to app
```

**Immediate Visit After Upgrade**
```
1. User navigates to health insights page
2. Backend: Strategy Router checks cache
   ├─ No cache found (was deleted) OR
   ├─ Cache exists but tier mismatch detected:
   │  cached.generatedForTier='free' !== user.tier='premium'
   └─ Decision: REGENERATE
3. Backend: Orchestrator generates with tier='premium'
   ├─ Prompt Builder selects up to 9 insights (see selectInsightsForTier)
   │  ├─ up to 4 High risk insights
   │  ├─ up to 3 Medium risk insights
   │  └─ up to 2 Low risk insights
   ├─ LLM generates full content (roughly 10-30 seconds)
   └─ Post-Processor stores with generatedForTier='premium'
4. Frontend displays:
   ├─ Loading state: "Upgrading your insights..."
   ├─ up to 9 real insights (ALL UNLOCKED!)
   └─ No dummy cards
5. User sees IMMEDIATE VALUE: 3 → up to 9 insights!
```

### Technical Flow Diagram

```
FREE USER (Day 1):
┌─────────────────────────────────────────────┐
│ Generate Request                             │
│ └─ tier='free'                              │
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ Prompt Builder: Select 3 insights           │
│ ├─ 1 high risk                              │
│ ├─ 1 medium risk                            │
│ └─ 1 low risk                               │
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ LLM: Generate 3 insights                    │
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ Database: Store with tier='free'            │
│ INSERT INTO pet_insights                    │
│ VALUES (..., generated_for_tier='free')     │
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ Response: 3 real + dummy cards (currently 6)│
└─────────────────────────────────────────────┘

UPGRADE (Day 5):
┌─────────────────────────────────────────────┐
│ Stripe Webhook: Payment Success             │
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ subscriptionService.update()                │
│ ├─ UPDATE user_subscriptions                │
│ │   SET plan='premium'                      │
│ └─ DELETE FROM pet_insights                 │
│     WHERE petId IN (user's pets)            │
└─────────────────────────────────────────────┘

PREMIUM USER (Day 5 - Immediate Visit):
┌─────────────────────────────────────────────┐
│ Generate Request                             │
│ └─ tier='premium'                           │
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ Strategy Router: Check cache                │
│ ├─ No cache (deleted) OR                    │
│ ├─ Tier mismatch (free != premium)          │
│ └─ Decision: REGENERATE                     │
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ Prompt Builder: Select up to 9 insights     │
│ ├─ up to 4 high risk                        │
│ ├─ up to 3 medium risk                      │
│ └─ up to 2 low risk                         │
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ LLM: Generate up to 9 insights              │
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ Database: Store with tier='premium'         │
│ INSERT INTO pet_insights                    │
│ VALUES (..., generated_for_tier='premium')  │
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ Response: up to 9 real insights (no dummies)│
└─────────────────────────────────────────────┘
```

### Why This Works

1. **Explicit Tier Marker** (`generatedForTier`)
   - No guessing based on insight count
   - Robust detection of tier changes
   - Works even if free tier count changes (3 → 5)

2. **Dual Invalidation Strategy**
   - Primary: Delete cache on upgrade (immediate regeneration)
   - Fallback: Tier mismatch detection (if cache not deleted)

3. **Immediate Value**
   - User sees 3 → up to 9 insights within roughly 30 seconds
   - Clear upgrade benefit
   - No confusion about what they paid for

4. **Cost Efficient**
   - Free users generate fewer insights than premium, so free-tier cost per generation is lower
     (exact figures depend on the current model's pricing -- see "Cost Tracking" above)
   - Premium users: full value from day 1

### Key Metrics to Monitor

- **Upgrade regeneration rate**: Should be ~100% of premium upgrades
- **Regeneration time**: Target <30 seconds
- **Tier mismatch detection**: Should be minimal (cache deletion works)
- **User satisfaction**: Post-upgrade feedback

---
