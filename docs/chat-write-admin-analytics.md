# Chat-Write — Admin Analytics & Reporting

Companion to the BE / FE inventories. Defines what admins see and how the data gets there. Pair with `CONTEXT.md`, `docs/adr/0001-chat-write-confirm-architecture.md`, `docs/chat-write-backend-inventory.md`, `docs/chat-write-frontend-inventory.md`.

The pattern below mirrors existing admin analytics:
- BE service per domain: e.g. `analyticsAiService`, `analyticsEngagementService` (`pawjai-be/src/services/`).
- Admin routes per namespace: `analytics-ai.ts`, `analytics-engagement.ts` (`pawjai-be/src/routes/admin/`), mounted under `/analytics` prefix.
- Admin app page per dimension: `app/admin/analytics/ai-usage/`, `chat-health/`, etc.
- Reuse `PeriodSelector`, `AnalyticsSection`, `MetricsGrid` from `pawjai-admin/components/admin/analytics/`.

---

## Data source rule

Admin analytics queries the **database**, not Mixpanel. Every admin metric must be derivable from DB rows.

Most chat-write metrics derive from data the feature already writes:
- `pet_records.created_in_chat_id` — chat-created vs timeline-created records.
- `pet_weight_records.created_in_chat_id` — same for weight.
- `pet_chat_messages.metadata` (JSONB) — proposal payload + status (`pending` / `confirmed` / `cancelled` / `superseded` / `commit_failed`) + error code on failure.

Two extra crumbs of data needed (both JSONB additions, **no new column or table**):

1. **Commit-failure tracking** — FE writes status `commit_failed` + `errorCode` into the chat message's metadata on commit failure. Otherwise failures leave no DB trace.
2. **Edited fields tracking** — FE writes `editedFields: string[]` (subset of `pet | subtype | time | unit | note`) into the chat message's metadata on commit. Powers the "which mapping does the LLM fail at most" chart.

---

## What admins need to see

### 1. Adoption funnel (per period)
1. Premium users who opened `/chat` in the period.
2. → who received at least one proposal.
3. → who confirmed at least one proposal.
4. → still using chat-write 7 days later (retention slice).

### 2. Quality signals
- **Confirm rate** = `confirmed / emitted`.
- **Edit rate per field** — % of confirmed proposals where each field was edited. Tells you which mapping the LLM fails at most.
- **Cancel reasons** — `user_cancelled` vs `superseded` vs `error`.
- **Avg proposals per confirmed record** — 1.0 means perfect first parse; 2.5 means lots of supersession.

### 3. Volume / breakdown
- Proposals emitted / confirmed / cancelled per `recordType` (`activity` / `symptom` / `vet_visit` / `medication` / `weight`).
- Top confirmed subtype rows (e.g. "diarrhea is logged most often").

### 4. Reliability
- Commit failure rate.
- Failure code breakdown (`PREMIUM_EXPIRED`, `RATE_LIMIT`, `VALIDATION`, `NETWORK`).
- Median + p95 time from proposal emitted to commit success.

### 5. Outliers / abuse
- Top users by chat-write volume.
- Multi-proposal cap hits — how often does the LLM try to emit >3 in a turn?

---

## Deliberately excluded from v1

- Real-time / streaming metrics — match existing batch + period-based analytics.
- Per-pet drilldown — volume too low to be meaningful.
- Cohort analysis (e.g. "users acquired in March who use chat-write") — save for later engagement-service expansion.
- Reading actual conversation content — privacy-sensitive, separate feature if ever.

---

## BE additions

### New service functions (`src/services/analyticsEngagementService.ts`)

| Function | Returns |
|---|---|
| `getChatWriteOverview(period)` | Adoption funnel + per-recordType volume. |
| `getChatWriteQuality(period)` | Confirm rate, edit-rate-per-field, cancel reasons, avg proposals per confirmed record. |
| `getChatWriteReliability(period)` | Failure rate, error-code breakdown, p50/p95 proposal-to-commit latency. |
| `getChatWriteTopUsers(period, limit)` | Top N users by chat-write volume (abuse / outlier surface). |

Use the existing `startDateFromPeriod(period)` helper and the existing `PERIOD_DURATION` / `Period` types.

### New route file (`src/routes/admin/analytics-chat-write.ts`)

Mirrors `analytics-engagement.ts` structure. Exports `analyticsChatWriteRoutes(fastify)`. Four endpoints:

- `GET /admin/analytics/chat-write/overview?period=...`
- `GET /admin/analytics/chat-write/quality?period=...`
- `GET /admin/analytics/chat-write/reliability?period=...`
- `GET /admin/analytics/chat-write/top-users?period=...&limit=...`

### Wire-up (`src/routes/admin/index.ts`)
Register `analyticsChatWriteRoutes` with prefix `/analytics`, alongside `analyticsEngagementRoutes`.

### Schema delta
**None** beyond the JSONB additions to `pet_chat_messages.metadata` (no migration required — it's already JSONB).

The `created_in_chat_id` column from `docs/chat-write-backend-inventory.md` is already planned; this report reuses it.

### Permissions
Same `requireAdminRole` middleware as other analytics routes. No new permission concept.

---

## Admin app additions (`pawjai-admin`)

### New page
- `app/admin/analytics/chat-write/page.tsx` — chat-write dashboard. Sits next to `chat-health/`.

### New components (`components/admin/analytics/chat-write/`)
| Component | Purpose |
|---|---|
| `ChatWriteFunnel.tsx` | Adoption funnel viz (4 stages). |
| `ChatWriteFieldEditChart.tsx` | Bar chart of edit rate per field. The most actionable chart in this dashboard. |
| `ChatWriteReliabilityCard.tsx` | Failure rate + error code donut. |
| `ChatWriteRecordTypeBreakdown.tsx` | Stacked bars by `recordType`. |
| `ChatWriteQualityCards.tsx` | Confirm rate, avg proposals per confirmed record, cancel reasons. |
| `ChatWriteTopUsers.tsx` | Table of top users by volume. |

### Reused (do not fork)
- `PeriodSelector`, `AnalyticsSection`, `MetricsGrid` from `components/admin/analytics/`.

---

## FE additions to support the report (`pawjai-fe`)

These are small but mandatory writebacks to `pet_chat_messages.metadata`. Adding to the FE inventory by reference:

1. **On commit success** — FE PATCHes the chat message metadata with `status: 'confirmed'`, `editedFields: string[]`, `confirmedAt: timestamp`.
2. **On commit failure** — FE PATCHes with `status: 'commit_failed'`, `errorCode: string`.
3. **On cancel** — FE PATCHes with `status: 'cancelled'`, `reason: 'user_cancelled' | 'superseded'`.
4. **On supersession** — when a new proposal supersedes a prior pending one, the prior gets `status: 'superseded'`.

This requires either:
- (a) Reusing the existing chat message PATCH endpoint (if one exists) for metadata updates, or
- (b) Adding `PATCH /pets/:petId/chat/messages/:messageId/metadata` to `pawjai-be/src/routes/pet-chat.ts` for metadata-only updates.

**Recommended: (b)** — keeps the message-content path immutable and adds a clearly-scoped metadata-only endpoint. Lower risk of accidentally letting the FE rewrite message text.

---

## Implementation order

1. Ship the feature (BE + FE inventories) without admin analytics. Metadata writebacks land as part of FE work.
2. Ship admin analytics one dashboard at a time. Start with the funnel + field-edit chart — those answer the two biggest questions ("are people using it?" and "where does the LLM fail?"). Defer reliability and top-users to the second pass.

---

## Open follow-ups
- Decide which existing admin-side date/time / chart primitives to use for the funnel (`recharts`? `tremor`? Whatever is already there). Inspect `components/admin/analytics/` before building from scratch.
- Confirm `requireAdminRole` is the right middleware by reading `src/routes/admin/analytics-engagement.ts`'s preHandler.
