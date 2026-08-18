# Timeline + /pet Reading-Surface Improvement Plan
**Date:** 2026-08-18 | **Status:** DRAFT, awaiting user review | **Scope:** `/timeline` page and `/pet/[id]` page ONLY (per user decision 2026-08-18). Vet-share, paywall strategy, and chat-receipt changes are parked in Appendix B.

Source: 7-agent panel run 2026-08-18. 3 Sonnet personas (Mint: single-pet free; Bee: premium chronic-condition; Pom: 4-pet household) + 4 Opus experts (product designer, vet+business stakeholder, 10x engineer, architect). All findings below were verified against code with file:line evidence by at least one agent; items confirmed by 2+ independent agents are marked (xN).

---

## 1. Scoreboard (7 reviewers, 1-10 per quadrant)

### /timeline
| Reviewer | Q1 Readability | Q2 Findability | Q3 Insight | Q4 Action/Integration |
|---|---|---|---|---|
| Mint (free, 1 pet) | 6 | 3 | 3 | 5 |
| Bee (premium, chronic) | 7 | 4 | 2 | 6 |
| Pom (4 pets) | 5 | 4 | 3 | 6 |
| Product designer | 3 | 4 | 2 | 6 |
| Vet + business | 6 | 3 | 2 | 5 |
| 10x engineer | 6 | 3 | 4 | 7 |
| Architect | 6 | 4 | 2 | 5 |
| **Average** | **5.6** | **3.6** | **2.6** | **5.7** |

### /pet/[id]
| Reviewer | Q1 | Q2 | Q3 | Q4 |
|---|---|---|---|---|
| Mint | 6 | 2 | 4 | 4 |
| Bee | 7 | 6 | 3 | 4 |
| Pom | 6 | 2 | 3 | 6 |
| Product designer | 4 | 3 | 4 | 5 |
| Vet + business | 5 | 2 | 4 | 7 |
| 10x engineer | 4 | 2 | 3 | 4 |
| Architect | 4 | 2 | 3 | 4 |
| **Average** | **5.1** | **2.7** | **3.4** | **4.9** |

**Reading of the board:** both pages are competent displays and poor instruments. Worst cells: Timeline Insight (2.6, five reviewers gave 2-3: zero aggregation anywhere on screen) and /pet Findability (2.7: no filters, no pet switcher, cards not even tappable). Action/Integration is the strongest column because the write-side work (log-again, quick-log, receipts) already lands here; the read side simply has not been designed since April (designer: DESIGN_GUIDE.md has sections for chips, log-again sheet, and receipt states, and zero lines about timeline cards).

**Root cause in one sentence:** the timeline card was deliberately stripped to a ~110px "read-only summary" for virtualization (comment at `VirtualTimelineList.tsx:139`), and the freed budget was never re-spent on signal, while /pet received the same card minus its interactivity props.

---

## 2. Confirmed defects (fix regardless of any redesign)

| # | Defect | Evidence | Found by | Sev |
|---|---|---|---|---|
| D1 | Delete confirmation shows NO pet identity; `petInfo` prop declared but never rendered, and `handleDeleteRecord` never passes a pet-bearing log. Wrong-pet deletion risk in multi-pet homes. NOTE: naive fix is dangerous, `handleDeleteRecord` does not set `selectedRecordLog` like view/edit do, so wiring "last viewed log" would show the WRONG pet. Must plumb the record's own pet. | `petRecordDeleteDialog.tsx:36-38,132-181`; `useTimelineData.ts:387-410` | Pom | CRITICAL |
| D2 | Photos never render anywhere in the read path. `imageUrl` is mapped onto every record and rendered by nothing: not the card, not the view dialog, not the edit dialog. (x3: Mint grep-verified, stakeholder traced e2e, designer flagged) | `TimelineCard.tsx:30`; `lib/mappers/petRecord.ts:55,119`; `petRecordViewDialog.tsx` (no image block) | Mint, stakeholder, designer | CRITICAL |
| D3 | Chat-receipt deep-link silently no-ops for any record outside the loaded pages (10/page): no fetch, no toast, dangling `?recordId=` in URL. The purpose-built endpoint `GET /records/:id` + `getRecordById` exists and is unused by its intended consumer. (x4) | `TimelineView.tsx:189-206`; `pawjai-be petRecord.ts:316`, `petRecordServices.ts:474` | Mint, Bee, engineer, architect | HIGH |
| D4 | `scrollMargin: 0` breaks window virtualization on both pages; visible-range math is offset by the full preamble height (800px+ on /pet), causing blank/unmounted cards while on screen. | `VirtualTimelineList.tsx:139` | Engineer | HIGH |
| D5 | Race silently removes "Log again" + pet avatars: `queryFn` closes over `transformedPets` but the key/gate does not include access readiness; records cache with `petInfo: undefined`, `makeLogShortcutFromRecord` returns null on blank petId, and sessionStorage persistence (2h) makes it survive reloads. | `useTimelineData.ts:148-151,206-208,268,294`; `lib/mappers/petRecord.ts:112` | Engineer | HIGH |
| D6 | Sort-order correctness: `occurredAt` is nullable and both reads order `desc(occurredAt)`; Postgres DESC defaults NULLS FIRST so null-dated rows pin to top, and offset pagination over the non-deterministic sort duplicates/skips rows under concurrent writes. Blocks correct day grouping. | `pets.ts:282`; `petRecordServices.ts:438,606`; `useTimelineData.ts:239-240` | Architect | HIGH |
| D7 | /pet blanks the entire rendered list on every background refetch and every "load more": `isFetching` passed as `isLoadingRecords` + full spinner swap. Designer ranked this "1st by fix-value-per-hour". (x2) | `PetDetailClient.tsx:493`; `regularPetView.tsx:330-334` | Engineer, designer | HIGH |
| D8 | /pet cards are not tappable, no log-again, no chip strip: `onView`, `onLogAgain`, `onTypeChipClick` simply not passed. Same component, materially different behavior per surface, reads as broken. (x4) | `regularPetView.tsx:344-355`; `TimelineCard.tsx:81` | Mint, Pom, engineer, architect | HIGH |
| D9 | Effect-mirrored query state in `useTimelineData` carries THREE suppressed `react-hooks/set-state-in-effect` lint rules; same shape as the 2026-08-18 prod incident (render-triggered state write), one dependency edit from looping. Should be `useMemo`. | `useTimelineData.ts:310-347` | Engineer | HIGH (risk) |
| D10 | Hardcoded query keys bypass `queryKeys.ts` factory; `petRecords` key has no factory at all so invalidation relies on a string predicate. One added key segment silently breaks invalidation. | `PetDetailClient.tsx:124,153,195`; `cacheInvalidation.ts:92-97` | Architect | MED |
| D11 | Dead code traps: `TimelineList.tsx` (149 lines, zero consumers, 3 feature-rounds stale, and the only place the old time-of-day range feature survives); `petRecordSection.tsx` null stub still mounted while `healthEntries` is computed, sorted, and thrown away every render. (x5) | `petLog/index.ts:1`; `petRecordSection.tsx:22`; `PetDetailClient.tsx:265-303` | all experts + Pom | MED |
| D12 | i18n defects on these two pages: English success toasts on edit/delete ("Record updated successfully!"), English error toast on /pet, and the empty-state CTA that OPENS THE LOG DIALOG is labeled "รายละเอียดเพิ่มเติม" (borrowed key meaning "more details"). | `useTimelineData.ts:437,447`; `PetDetailClient.tsx:342-346`; `TimelineView.tsx:313` | Bee, designer | MED |
| D13 | Index gaps under growth: main timeline index not partial on `deleted_at`; type-filtered index uses `createdAt` (wrong time column for every read); no `(petId, recordType, occurredAt)`. | `pets.ts:318-319,372-374` | Architect | MED |
| D14 | Timeline pageLimit 10 vs /pet 20, undocumented divergence; `refetchTimelineQuery()` refetches ALL loaded pages after every write (5 pages deep = 5 requests). | `useTimelineData.ts:167`; `PetDetailClient.tsx:157` | Engineer | LOW |

---

## 3. The experience gaps (what the personas could not do)

1. **Count anything.** "How many seizures in 30 days" = manual scroll-and-tally. No counts, no date-range filter, `pagination.total` returned by BE and discarded. The only aggregation in the product (`getFrequentSymptoms`, top-3 over 7 days) lives on the vet-share page owners never open. (Bee, stakeholder)
2. **See severity without opening each record.** Cards show icon + badge + timestamp only; `hasNote={false}` hardcoded; `RecordMetadataDisplay` has exactly one consumer (the modal). Red is spent on ALL symptoms, so mild and emergency look identical. (Bee, designer, stakeholder)
3. **See time-of-day patterns.** Exact time is behind a per-card tap that resets on scroll; 30 records = 30 taps. The day chip strip vanishes the moment a type filter is active (the exact moment Bee filters to symptoms) and hides on single-record days (the common case for seizures). (Bee)
4. **Trust pet identity at a glance.** Pet avatar is 24px in the card footer while the generic type icon owns the 48px hero slot; the ReceiptCard (56px avatar, name first) already shows the correct pattern. On /pet, cards show no pet identity at all (`showPetInfo={false}`) which is fine only until D1 makes deletion blind. (Pom)
5. **Move between pets.** No sibling-pet switcher on /pet; every cross-pet move round-trips through /my-pets (4+ taps). `MultiPetSheet` proves the fast picker pattern already exists in the codebase. (Pom)
6. **Find a photo, or anything, from >2 weeks ago.** No search, no date jump, manual "Load more" at 10/page. BE already accepts a `to` date param that the FE never sends. (Mint, engineer)
7. **Answer "did everyone eat yesterday" in a 4-pet home.** Absence is invisible by construction; a pet with zero records simply is not there. (Pom)

---

## 4. The plan

Structure: 4 phases. Phase 0 is pure correctness (no design decisions needed, shippable immediately). Phase 1 and 2 are the experience work, each with explicit user decision points before implementation, per the design-guidelines house rule. Phase 3 is the BE structural base for insight features and scale. Phases 0 and 3 can run in parallel with 1's design decisions.

### Phase 0: Correctness + hygiene (no design gate, ~2-3 worker rounds, fe+be)
All items are defect fixes from section 2. Suggested round split:

**Round 0A (be, small):**
- D6 sort fix: `COALESCE(occurred_at, created_at)` or NULLS LAST on both read queries. Gate any `occurredAt NOT NULL` migration on a null-row count first (architect: do not open that PR blind).
- D13 indexes: `(petId, occurredAt) WHERE deleted_at IS NULL` and `(petId, recordType, occurredAt)`.

**Round 0B (fe, medium):**
- D3 deep-link: fetch-then-open via existing `getRecordById`; on failure show a toast and clear the URL params. Kills the silent dead-end.
- D5 query gate/key: require `transformedPets.length > 0` in `enabled` (and/or include access-readiness in the key). Restores log-again + avatars.
- D4 `scrollMargin`: measure container `offsetTop`, pass it, both surfaces.
- D9: replace the effect-mirrored `timelineData` state with `useMemo`; delete all three lint suppressions (no-symptom-patch rule: the suppressions ARE the symptom patch).
- D7: pass `isLoading` not `isFetching`; never unmount the rendered list for a background refetch.
- D10: add `petRecords` factory to `queryKeys.ts`, convert the three hardcoded keys, drop the string predicate.
- D11: delete `TimelineList.tsx` + barrel export; delete `petRecordSection.tsx` stub + the dead `healthEntries` compute (Phase 2 reintroduces a summary cleanly).
- D12 i18n: localize the three English toasts; give the empty-state CTA its own correctly-worded key.

**Round 0C (fe, small but careful):**
- D1 delete-dialog pet identity: plumb the record's own pet (name + avatar) into the dialog, copying the ReceiptCard identity pattern (56px avatar, name first). MUST come from the record being deleted, never from `selectedRecordLog`.
- D8 /pet wiring: pass `onView`, `onLogAgain`, `onTypeChipClick` in `regularPetView` (handlers already exist in `PetDetailClient`).

Exit gate: suite green, then a real-browser pass on both pages (RUNTIME GATE rule 9: virtualization + effect changes are exactly the class static checks miss).

### Phase 1: Card readability redesign (DESIGN GATE: user decisions below, then 1-2 rounds)
The card keeps its ~110px height budget but spends it on signal:
- Record label out of the Badge, up to `text-base font-semibold` (today it is the smallest text on the card).
- One condensed metadata line: severity (symptoms), amount (meals), dose when present; `RecordMetadataDisplay` condensed variant.
- Note preview, single line clamped; delete the hardcoded `hasNote={false}`.
- Photo thumbnail when `imageUrl` present (D2): small square, tap opens viewer in the view dialog (which also gains an image block).
- Severity color system: red/amber ramp reassigned from "type = symptom" to actual severity, via ONE shared util replacing the duplicated switches (`TimelineCardHeader.tsx:5-18`, `RecordSummaryHeader.tsx:21-34`). Type identity moves to the icon.
- Pet identity: promote avatar+name per the ReceiptCard pattern when `showPetInfo` (timeline all-pets view); keep suppressed on /pet where the page header carries identity.
- Timestamps: absolute time visible by default (or one global toggle persisted), replacing the per-card tap-toggle that resets on scroll.
- Visual language: card becomes a density variant of the receipt so timeline/receipt/log-again read as one system.

**USER DECISIONS needed before Phase 1 build:**
1. Approve severity color ramp taking over red/amber (this changes what red means app-wide on these pages).
2. Photo thumbnail on card face: yes/no (screen-privacy consideration: poop/wound photos visible on an open timeline in public).
3. Absolute-time default vs global toggle.
4. DESIGN_GUIDE.md additions (designer proposed 7 rules: Record Card section, severity encoding, disclosure budget, refetch behavior, one-empty-state rule, Thai-first copy rules, read-surface touch targets). Per house rule, guideline changes need explicit user sign-off.

### Phase 2: Findability + on-page insight (1-2 rounds after Phase 1, some items need Phase 3 endpoint)
No-new-endpoint items (BE capacity already exists):
- Date-range / month-jump control using the BE's already-accepted `to` param (FE declares it, never sends it).
- Filters into the URL (`?pet=&kind=`): shareable, back-button-correct, and gives deep-links a home.
- Show `pagination.total` ("24 records", "showing 10 of 24").
- Chip strip fixes: keep it rendered when a type filter is active; show it for single-record days; counts visible on touch (not tooltip-only).
- /pet: add the FilterBar (single-pet scope, type + date range).
- /pet: sibling-pet switcher strip (other pets' avatars at top, MultiPetSheet-style picker), killing the /my-pets round-trip.
- /pet: 7-day summary strip filling the old `PetRecordSection` slot: records logged, symptom count, latest weight delta, active meds. (Data largely in memory already; this is the daily-open surface.)
- Timeline (all-pets view): per-pet daily coverage row ("Pepe Y, Momo Y, Bo N") so absence becomes visible. Needs design sign-off; pairs with the summary endpoint if counts must be exact beyond loaded pages.
- Promote `getFrequentSymptoms` clustering into the timeline header ("frequent this week: vomiting 3x"): logic already written and tested at `vetShareStyles.ts:38-77`, currently unreachable. Stakeholder rated this the single best effort-to-impact move and the trial "aha".

**USER DECISIONS needed:** coverage-row design; frequent-symptoms window fixed 7d vs selectable; whether the /pet summary strip counts as a new design pattern for the guide.

### Phase 3: Structural base for insight + scale (be-heavy, parallel-safe with Phase 1)
- Counts/summary endpoint: `GET /pets/:id/records/summary` (GROUP BY record_type over a date range, optional per-day buckets), modeled on `recent-symptoms.service.ts`, with concept-level label resolution (architect: `attachDisplay` is per-record and cannot be reused). Serves: real 7/30/90-day counts, time-of-day patterns, the summary strip, the coverage row.
- Cursor pagination keyed `(occurredAt, id)` replacing offset on both list reads (depends on D6). This is the item that silently degrades as logging grows; do it before any grouped view builds on offset math.
- Split `useTimelineData` (40-field return) into data/filter/dialog concerns; extract PetDetailClient fetching so both surfaces share one records hook.

### Explicitly deferred (bigger concepts, decide after Phases 0-2 land)
- **Day Digest** (day header becomes the reading unit with verdict line): M, builds on chip strip + summary endpoint.
- **Concern Threads** (group by symptom identity + severity sparkline, answers "is it getting worse?"): L, premium flagship candidate, needs summary endpoint + design round.
- Cross-pet comparison views: out of current scope, needs product discussion.
- Text search over notes: real BE work (FTS/trigram index + `q` param), decide demand first.

---

## 5. Suggested execution order

```
Round 0A (be correctness)  ──┐
Round 0B (fe correctness)  ──┼── can run as parallel worker rounds
Phase 1 design decisions   ──┘   (user answers 4 decision points)
        ↓
Round 0C + browser pass (RUNTIME GATE)
        ↓
Phase 1 build (card redesign, 1-2 rounds, design-gated)
        ↓                          Phase 3 endpoint work (parallel, be)
Phase 2 build (findability + insight, 1-2 rounds)
        ↓
Reassess: Day Digest / Concern Threads go/no-go with real usage
```

Everything ships under v1.8.0 per standing rule (no version bumps, no new tags) unless the user says otherwise.

---

## Appendix A: Notable positive findings (do not "fix" these)
- Shared presentation layer `resolvePetRecordPresentation` is healthy across 12+ call sites; receipt/card/sheet do NOT diverge at the label layer. ReceiptCard's one deviation is deliberate and documented. (Architect: "this is the house rule working.")
- Soft-delete exclusion verified consistent on every read path.
- `invalidatePetRecords` correctly covers both cache roots; cross-surface refresh works. (Fragile invariant though: `handleLogComplete` relies on callers self-invalidating; note in code when touched.)
- Free-tier 3-month gate is honest backend truncation, not a blur-tease; Thai upsell copy is warm. Only ding: the paywall trigger is styled as an ordinary "Load more" button.
- Zustand selector audit CLEAN on both pages (all scalar selects). The repo has no `useShallow` example though; add one documented usage when convenient.
- "Log again" deliberately excludes severity/note/time from shortcuts, correctly and documented.

## Appendix B: Out-of-scope findings, parked (need separate decisions)
1. **SAFETY: `vibe` (1-5 mood/energy) is labeled "Severity/ความรุนแรง" on the on-screen vet-share page while the PDF labels the same field "Mood/อารมณ์"** (`en/vetShare.ts:33` vs `:60`). A vet could under-triage a "2/5 severity" that meant "low energy". Trivial fix, recommend a standalone hotfix round soon even though it is outside this plan's scope.
2. Real severity enum (mild/moderate/severe/emergency) is SELECTed for vet share (`share.ts:204`) but never rendered; vet share also has no record times (dates only) and excludes all diet/appetite signal.
3. Paywall placement: stakeholder's analysis says the 3-month history gate is structurally inert under the coming paid+trial model (trialists read as premium; at trial end they have ~7 days of history). Belongs to the pricing packet (`output/pricing-model-prep-round1-packet.md`, ON HOLD).
4. Health-insights subpage: 30-day `staleTime` with `invalidateHealthInsights` never called from any record-mutation path (stale AI summary before a vet visit); content is generic breed prose with zero grounding in logged records. Larger product question than this plan.
5. Chat ReceiptCard view path drops `metadata`/`note` so severity is unverifiable from a receipt (edit path fetches the live record; view path does not reuse it).
6. Untranslated strings on vet-share/weight surfaces ("Exporting...", "Happy pets, happy family", "Your Pet").
7. Species-scoped batch logging (`sameSpeciesPets`) means "log all 4 pets" is secretly two operations; write-side scope.
