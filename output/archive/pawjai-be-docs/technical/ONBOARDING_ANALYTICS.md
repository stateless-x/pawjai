# Onboarding Analytics System

**Purpose**: Track user progress through onboarding flow for funnel analysis and trend monitoring.

**Date Created**: 2025-11-29
**Last Updated**: 2025-11-30
**Status**: ✅ Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Tracked Events](#tracked-events)
4. [API Endpoints](#api-endpoints)
5. [Frontend Integration](#frontend-integration)
6. [Analytics Queries](#analytics-queries)
7. [Admin Dashboard Integration](#admin-dashboard-integration)
8. [Monitoring & Alerts](#monitoring--alerts)

---

## Overview

The onboarding analytics system tracks each step of the user onboarding flow to provide insights into:

- **Conversion funnel**: How many users complete each step
- **Drop-off rates**: Where users abandon the flow
- **Time to complete**: How long each step takes
- **Cohort analysis**: Completion rates by signup cohort (week/month)
- **Trends over time**: Daily, weekly, monthly, quarterly, yearly patterns

### Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **Onboarding Completion Rate** | % of signups that complete onboarding | >90% |
| **Average Completion Time** | Hours from signup to completion | <24 hours |
| **Step Drop-off Rate** | % of users who don't proceed to next step | <10% per step |

---

## Database Schema

### Table: `onboarding_analytics`

```sql
CREATE TABLE onboarding_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  step onboarding_step NOT NULL,

  -- Metadata for analysis
  session_id UUID,
  metadata JSONB,

  -- Timestamps
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_date DATE NOT NULL DEFAULT CURRENT_DATE
);
```

### Enum: `onboarding_step`

```sql
CREATE TYPE onboarding_step AS ENUM (
  'signup_completed',      -- Email verified or OAuth completed
  'pet_added',            -- First pet created
  'display_name_saved',   -- Display name entered
  'demographics_saved',   -- Demographics form completed (optional)
  'tos_accepted',         -- Terms of Service accepted
  'onboarding_completed'  -- Full onboarding flow finished
);
```

### Indexes

```sql
-- Primary indexes for common queries
CREATE INDEX onboarding_analytics_user_id_idx ON onboarding_analytics(user_id);
CREATE INDEX onboarding_analytics_step_idx ON onboarding_analytics(step);
CREATE INDEX onboarding_analytics_completed_at_idx ON onboarding_analytics(completed_at);
CREATE INDEX onboarding_analytics_completed_date_idx ON onboarding_analytics(completed_date);

-- Composite index for funnel analysis
CREATE INDEX onboarding_analytics_step_completed_date_idx
  ON onboarding_analytics(step, completed_date);

-- Unique constraint: one record per user per step
CREATE UNIQUE INDEX onboarding_analytics_unique_user_step_idx
  ON onboarding_analytics(user_id, step);
```

---

## Tracked Events

All six steps below are tracked through a single shared helper, `trackOnboardingStep()` in
`src/utils/trackOnboarding.ts`, which wraps `onboardingAnalyticsService.trackStep()` in a
try/catch and reports failures to Sentry without throwing (analytics never blocks the main
flow):

```typescript
import { trackOnboardingStep } from '@/utils/trackOnboarding';

await trackOnboardingStep(userId, 'pet_added', fastify.log);
// or with metadata:
await trackOnboardingStep(userId, 'signup_completed', fastify.log, { created_via: 'auth_guard' });
```

### 1. `signup_completed`

**Triggered**: When a new user is first detected
**Where**: called from the auth callback flow in `src/routes/auth.ts`
**Metadata**: `{ created_via: 'auth_guard' }`

### 2. `pet_added`

**Triggered**: After first pet is successfully created
**Where**: `POST /api/pets` (`src/routes/pets.ts`)

### 3. `display_name_saved`

**Triggered**: After user saves display name
**Where**: `POST /api/users/onboarding/name` (`src/routes/users-onboarding.ts`)

### 4. `demographics_saved` (Optional Step)

**Triggered**: After user completes demographics form
**Where**: `POST /api/users/onboarding/demographics` (`src/routes/users-onboarding.ts`)

**Excluded from the funnel**: because this step is optional, `getFunnel()` in
`onboardingAnalyticsService.ts` deliberately omits it from the step sequence so skipping it
doesn't show up as false drop-off. It's surfaced separately as `demographicsSkipRate` in the
overview stats instead.

### 5. `tos_accepted`

**Triggered**: After user accepts Terms of Service
**Where**: `POST /api/users/onboarding/finalize` (`src/routes/users-onboarding.ts`)

### 6. `onboarding_completed`

**Triggered**: After full onboarding flow is complete
**Where**: `POST /api/users/onboarding/finalize` (same request as `tos_accepted` — both steps
are tracked back-to-back in that handler)

### Hydration recovery tracking

There is also a generic `POST /api/users/onboarding/track` endpoint (accepting any of the six
step names plus optional metadata) used by the frontend to recover tracking calls that were
missed due to page hydration issues. It always returns 200, even on internal tracking failure,
since analytics must never fail the caller's request.

---

## API Endpoints

All analytics endpoints require admin authentication and `analytics:read` permission.

All responses below are wrapped in the standard envelope (`ApiResponses.success(data, message)`
→ `{ success, data, message, meta: { timestamp } }`); only the `data` shape is shown. Field
names are camelCase, matching the interfaces in `onboardingAnalyticsService.ts`, not the
snake_case shown in earlier drafts of this doc.

### 1. Get Onboarding Overview

**Endpoint**: `GET /api/admin/onboarding-analytics/overview?days=30`

**Response `data`** (shape: `OverviewStats`):
```json
{
  "totalSignups": 1250,
  "completedOnboarding": 1125,
  "completionRate": 90.00,
  "inProgress": 125,
  "avgCompletionTimeMinutes": 750.5,
  "dropOffAtStep": "demographics_saved",
  "highestDropOffRate": 19.49,
  "demographicsSkipRate": 8.5
}
```
`totalSignups` uses `max(signup_completed count, pet_added count)` as the denominator, to avoid
undercounting users who signed up before analytics was deployed. `dropOffAtStep` /
`highestDropOffRate` are computed only across the required-step sequence (excludes
`demographics_saved`, which is optional). `demographicsSkipRate` is the only place
`demographics_saved` shows up in these stats.

### 2. Get Onboarding Funnel

**Endpoint**: `GET /api/admin/onboarding-analytics/funnel?startDate=2024-01-01&endDate=2024-12-31` (or `?days=30`)

**Response `data`** (array of `FunnelStep`):
```json
[
  { "step": "signup_completed", "step_order": 1, "users_reached": 1250, "completion_percentage": 100.00, "drop_off_count": 0, "drop_off_percentage": 0, "avg_time_to_complete_seconds": null },
  { "step": "pet_added", "step_order": 2, "users_reached": 1200, "completion_percentage": 96.00, "drop_off_count": 50, "drop_off_percentage": 4.00, "avg_time_to_complete_seconds": null },
  { "step": "display_name_saved", "step_order": 3, "users_reached": 1180, "completion_percentage": 94.40, "drop_off_count": 20, "drop_off_percentage": 1.67, "avg_time_to_complete_seconds": null },
  { "step": "tos_accepted", "step_order": 4, "users_reached": 1150, "completion_percentage": 92.00, "drop_off_count": 30, "drop_off_percentage": 2.60, "avg_time_to_complete_seconds": null },
  { "step": "onboarding_completed", "step_order": 5, "users_reached": 1125, "completion_percentage": 90.00, "drop_off_count": 25, "drop_off_percentage": 2.17, "avg_time_to_complete_seconds": null }
]
```
**`demographics_saved` is deliberately excluded from the funnel** — it's an optional step, so
including it would show every skip as false drop-off (see `getFunnel()` in
`onboardingAnalyticsService.ts`). `avg_time_to_complete_seconds` is always `null` here; use
step-stats (below) for per-step timing.

### 3. Get Trends

**Endpoint**: `GET /api/admin/onboarding-analytics/trends?period=week&startDate=2024-01-01&endDate=2024-12-31`

**Query Parameters**:
- `step`: accepted but currently ignored by the service (`getTrends`'s step parameter is
  unused) — trends always return signups + completions, not a per-step breakdown
- `period`: `day` | `week` | `month` | `quarter` | `year`
- `startDate` / `endDate`: ISO date strings (defaults to the last 90 days if omitted)

**Response `data`** (array of `TrendDataPoint`):
```json
[
  { "period": "2024-01-01T00:00:00.000Z", "period_label": "2024-W01", "signups": 45, "completions": 40, "completion_rate": 88.89 },
  { "period": "2024-01-08T00:00:00.000Z", "period_label": "2024-W02", "signups": 52, "completions": 47, "completion_rate": 90.38 }
]
```

### 4. Get Step Statistics

**Endpoint**: `GET /api/admin/onboarding-analytics/step-stats?step=pet_added&startDate=2024-01-01&endDate=2024-12-31`

**Response `data`** (shape: `StepStats`):
```json
{
  "step": "pet_added",
  "totalReached": 1250,
  "completedCount": 1200,
  "inProgressCount": 50,
  "avgTimeSeconds": 9000,
  "medianTimeSeconds": null
}
```
`medianTimeSeconds` is always `null` — not implemented (`percentile_cont` was judged too
expensive; see the code comment in `getStepStats()`).

### 5. Get Cohort Analysis

**Endpoint**: `GET /api/admin/onboarding-analytics/cohort?period=weekly&startDate=2024-01-01&endDate=2024-12-31`

The frontend sends `period=daily|weekly|monthly`; the legacy `cohortPeriod` query param is still
accepted for backward compatibility, and `period` takes precedence when both are present.
Unrecognized values fall back to `weekly`.

**Response `data`** (array of `CohortData`):
```json
[
  { "cohort_start": "2024-01-01T00:00:00.000Z", "cohort_label": "2024-W01", "total_signups": 450, "completed_count": 405, "completion_rate": 90.00, "avg_completion_time_minutes": 720.3 },
  { "cohort_start": "2024-01-08T00:00:00.000Z", "cohort_label": "2024-W02", "total_signups": 500, "completed_count": 455, "completion_rate": 91.00, "avg_completion_time_minutes": 698.1 }
]
```
This is a signup-to-completion rollup per cohort, not a per-step breakdown — there is no
`pet_added` / `name_saved` / `tos_accepted` field per cohort in the current implementation.

---

## Frontend Integration

Analytics tracking is automatically handled by backend endpoints during the onboarding flow. No special frontend integration is required - all events are tracked server-side when users complete each step.

---

## Analytics Queries

### Common Queries

#### 1. Overall Completion Rate

```sql
WITH signup_count AS (
  SELECT COUNT(DISTINCT user_id) AS total
  FROM onboarding_analytics
  WHERE step = 'signup_completed'
),
completed_count AS (
  SELECT COUNT(DISTINCT user_id) AS total
  FROM onboarding_analytics
  WHERE step = 'onboarding_completed'
)
SELECT
  s.total AS signups,
  c.total AS completed,
  ROUND((c.total::numeric / s.total) * 100, 2) AS completion_rate
FROM signup_count s, completed_count c;
```

#### 2. Daily Signup Trend

```sql
SELECT
  completed_date,
  COUNT(*) AS signups
FROM onboarding_analytics
WHERE step = 'signup_completed'
  AND completed_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY completed_date
ORDER BY completed_date;
```

#### 3. Funnel Drop-off Analysis

```sql
WITH step_counts AS (
  SELECT
    step,
    COUNT(DISTINCT user_id) AS users
  FROM onboarding_analytics
  GROUP BY step
)
SELECT
  step,
  users,
  LAG(users) OVER (ORDER BY step) AS previous_step_users,
  users - LAG(users) OVER (ORDER BY step) AS dropoff_count,
  ROUND(((LAG(users) OVER (ORDER BY step) - users)::numeric / LAG(users) OVER (ORDER BY step)) * 100, 2) AS dropoff_rate
FROM step_counts
ORDER BY step;
```

#### 4. Average Time to Complete Each Step

```sql
SELECT
  current_step.step,
  AVG(EXTRACT(EPOCH FROM (current_step.completed_at - signup_step.completed_at)) / 3600) AS avg_hours
FROM onboarding_analytics AS current_step
INNER JOIN onboarding_analytics AS signup_step
  ON current_step.user_id = signup_step.user_id
  AND signup_step.step = 'signup_completed'
WHERE current_step.step != 'signup_completed'
GROUP BY current_step.step
ORDER BY avg_hours;
```

---

## Admin Dashboard Integration

### Recommended Visualizations

1. **Overview Cards** (Top of Dashboard)
   ```
   ┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
   │  Total Signups  │  Completed      │  Completion Rate│  Avg Time       │
   │     1,250       │     1,125       │      90%        │   12.5 hours    │
   └─────────────────┴─────────────────┴─────────────────┴─────────────────┘
   ```

2. **Funnel Visualization** (Horizontal Bar Chart)
   ```
   Sign Up              ████████████████████████████████ 1,250 (100%)
   Add Pet              ███████████████████████████████  1,200 (96%)
   Enter Name           ██████████████████████████████   1,180 (94%)
   Demographics         ████████████████████             950 (76%)
   Accept TOS           ████████████████████████████     1,150 (92%)
   Completed            ███████████████████████████      1,125 (90%)
   ```

3. **Trends Chart** (Line Graph)
   - X-axis: Time period (day/week/month)
   - Y-axis: Number of signups
   - Multiple lines for different steps

4. **Cohort Heatmap** (Table with Color Coding)
   ```
   Cohort    | Signups | Pet Added | Name Saved | TOS Accepted | Completed
   ----------|---------|-----------|------------|--------------|----------
   2024-01   |   450   | 96% 🟢    | 94% 🟢     | 92% 🟢       | 90% 🟢
   2024-02   |   500   | 97% 🟢    | 95% 🟢     | 93% 🟢       | 91% 🟢
   2024-03   |   300   | 85% 🟡    | 82% 🟡     | 80% 🟡       | 75% 🟡
   ```

---

## Monitoring & Alerts

### Key Metrics to Monitor

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| **Completion Rate** | <85% | Investigate funnel drop-off |
| **Avg Completion Time** | >48 hours | Review UX friction points |
| **Step Drop-off** | >15% | Investigate specific step UX |

### Recommended Dashboards

1. **Daily Monitoring Dashboard**
   - Last 24 hours signup count
   - Completion rate vs target
   - Current funnel state

2. **Weekly Review Dashboard**
   - 7-day trend charts
   - Cohort comparison
   - Step-by-step completion rates
   - Average time to complete

3. **Monthly Business Review**
   - Month-over-month trends
   - Cohort retention analysis
   - Conversion optimization opportunities
   - Revenue impact of completion rate changes

---

## Files Modified/Created

### Backend

1. **Database**:
   - `src/db/schema/content.ts` - `onboardingAnalytics` table
   - `src/db/schema/enums/content.ts` - `onboardingStepEnum`
   - Schema changes ship as Drizzle-generated migrations under `db/drizzle/` per this repo's
     migration workflow (see root `CLAUDE.md`), not a hand-written script under
     `scripts/database/migrations/`.

2. **Services**:
   - `src/services/onboardingAnalyticsService.ts` - Analytics service
   - `src/utils/trackOnboarding.ts` - Shared `trackOnboardingStep()` wrapper used by all call sites

3. **Routes**:
   - `src/routes/users-onboarding.ts` - Onboarding step endpoints + tracking calls +
     `/onboarding/track` (hydration-recovery endpoint)
   - `src/routes/pets.ts` - Tracking call in pet creation
   - `src/routes/auth.ts` - `signup_completed` tracking call
   - `src/routes/admin/onboarding-analytics.ts` - Admin analytics endpoints
   - `src/routes/admin/index.ts` - Registered onboarding analytics routes

### Frontend

No frontend-specific files were needed - all tracking is handled server-side.

---

## Best Practices

1. **Tracking is Non-Blocking**: Always wrap tracking calls in try-catch to prevent analytics from breaking the main flow
2. **Idempotent by Design**: Unique constraint on (user_id, step) prevents duplicate records
3. **Privacy First**: No PII in metadata field
4. **Performance**: Indexes optimized for common analytics queries

---

**Created**: 2025-11-29
**Last Updated**: 2025-11-30
**Maintained By**: Engineering Team
