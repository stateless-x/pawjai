# Item 6 — Progressive Logger: design brief

Status: design round, no code written. Recon-backed, file:line cited throughout.
Date: 2026-08-17.

Hard constraint restated: shortcuts carry **identity only** — record type/concept and pet. Never time, note, photo, severity, frequency, amount, dose, or any other metadata. "Log again" produces a fresh record pre-aimed at the same type/concept, never a duplicate of the old record's data.

---

## 1. Current-state map

### Surface A — Quick-log (dashboard "+" and timeline "+" share one flow)

Both entry points open the identical `QuickLogDialog`:
- Timeline FAB: `pawjai-fe/components/timeline/TimelineView.tsx:366` (button), `:370-376` (dialog), pet defaulted via `activePetIdForLog` (`TimelineView.tsx:146-149`).
- Dashboard FAB: `pawjai-fe/components/dashboard/DashboardView.tsx:120` (button), `:159-163` (dialog).

Flow: `lib/store/quickLogStore.ts` (dialog step state, **not persisted** — plain `create<QuickLogState>()`, `quickLogStore.ts:178`) → `components/quickLog/QuickLogDialog.tsx` orchestrates steps → `hooks/useQuickLogSave.ts:110-207` builds the payload via `createQuickLogRecordData` (`lib/utils/quickLogTypeOptions.ts:484-495`) and calls `petRecordService.createRecord`.

Step-by-step for a repeat log ("fed breakfast" again today), because the store resets fully on dialog close (`resetState()`, `QuickLogDialog.tsx:186-193`) — there is no memory of yesterday's choice:
1. Tap "+" FAB
2. Tap category card (e.g. "Activity") — `LogTypeGrid`
3. Tap the specific item (e.g. "Fed breakfast") — `ActivitySelection`
4. Tap "Save" — `QuickLogFooter`

**Today's tap count: 4 taps**, every time, cold or repeat. Nothing in this flow is aware that "fed breakfast" was logged yesterday.

### Surface B — Timeline "+"

Not a separate implementation — literally the same `QuickLogDialog` component (`TimelineView.tsx:33-39` lazy-imports it). Only the pet-preselection logic differs (`activePetIdForLog`, `TimelineView.tsx:146-149`, uses the active filter tab). **Tap count: identical 4 taps.**

### Surface C — Chat record-proposal

Two live code paths, materially different tap costs:

**Path A, auto-commit (current default)** — `components/chat/hooks/useConversationManager.ts:311-345`, comment at `:315-317` states the backend writes the record before emitting the receipt SSE event. The FE only renders a read-only `ReceiptCard` (`components/chat/proposal/ReceiptCard.tsx`) after the fact.
- Repeat log: type a message describing the log + send. **Unit is keystrokes-plus-send, not taps** — there is no comparable integer to the QuickLog "4 taps," and forcing one would misstate the finding. Effectively **0 confirmation taps** once the message is sent, contingent entirely on NLU resolving pet + record type + (if needed) `detailType` unambiguously.

**Path B, legacy/fallback modal** — reached when petId/typeId/subtype can't be auto-resolved, or when replaying old conversations (`components/chat/proposal/ProposalCardInline.tsx:6-9`).
- If committable (`isCommittable`, `ProposalCardInline.tsx:165-173`): 1 tap ("Confirm").
- If not committable (missing pet or subtype): 1 tap ("Edit") to open `ProposalCard` modal, then a pet-picker tap and/or subtype-picker tap, then 1 tap ("Confirm") — **3 to 5 taps** depending on how many fields need manual resolution (`ProposalCard.tsx:394-411, 331-339`).

### Where "recent" data already exists client-side vs. what's new

- `hooks/usePetSnapshot.ts:1-57` — `useQuery` fetching `petRecordService.getRecords(petId, { limit: 3 })`, returns `recentLogs: PetRecord[]`. This is the only existing "recent logs" cache. **It is desktop-only** (comment at `usePetSnapshot.ts:47`) and consumed read-only by `PetSnapshotCard.tsx:192-207` (no tap action, just a "View all →" link). Not available on mobile dashboard or timeline.
- `hooks/useTimelineData.ts` — paginated `useInfiniteQuery`, filtered by pet/type, not deduplicated by identity. Wrong shape for "recent distinct identities."
- `lib/utils/cacheInvalidation.ts` → `invalidatePetRecords(queryClient, petId)` — the one choke point already called after every create/update/delete across QuickLog, chat commit, and timeline edit/delete. Natural hook for keeping a future "recent identities" cache fresh.
- **Nothing resembling "log again," "pinned," or "last logged" shortcuts exists anywhere in the codebase.** The only `pinned` hits are `PINNED_CHIPS` in `components/chat/ChatSuggestions.tsx:31-162` — static suggested chat prompt chips, unrelated to logged-record history.
- Record identity fields a shortcut would reference already exist client-side: `types/petRecordConceptCatalog.ts:15` (`typeId`), `:22/53/59` (`conceptId`, null for legacy pre-catalog options). The POST body shape needed to re-fire a create is already isolated in `createQuickLogRecordData` (`lib/utils/quickLogTypeOptions.ts:484-495`): `{ recordType, typeId, note, metadata, occurredAt }` — a shortcut simply omits everything but `recordType`/`typeId` (and `detailType` when applicable, see §4).

---

## 2. Proposed UX

**Quick-log dialog (surfaces A & B).** The very first screen of `QuickLogDialog` — currently `LogTypeGrid`, a cold category grid — gains a "Recent" row above the grid, showing up to N recently-logged identities for the active pet (icons + labels only, no timestamps/notes visible, so nothing metadata-shaped ever renders here). Tapping a recent chip skips categories entirely and lands directly on the confirm step pre-aimed at that identity. A pinned item, if any, appears first in the same row, visually distinguished only by a pin glyph — same tap behavior as recent. This turns the flow into: **tap "+", tap the recent/pinned chip, tap confirm — 3 taps**, or **2 taps** if the confirm step is folded into the chip tap itself (see open decision 6c).

**Timeline "log again" on a past record.** Each record row/card in the timeline gains a "Log again" action (icon button or overflow-menu item, `min-h-[44px]` per design guide's touch-target rule) that reads only that record's `recordType` + `typeId` (+ `detailType` if the record's `conceptResolutionSource` indicates a legacy override was in play, see §4) and opens the same slim confirm step used by the recent-chips path — never the record's own note/photo/time. **Tap count: 1 tap ("Log again") + 1 tap (confirm) = 2 taps.** This is the fastest path in the system and the one closest to the roadmap's ≤2-taps-plus-confirm target.

The slim confirm sheet needs an explicit error state for `DAILY_RECORD_LIMIT_REACHED` (429, `pawjai-be/src/services/petRecordServices.ts:179-181`) — a 2-tap path reaches the daily cap sooner than the previous 4-tap one, so "confirm" failing with a clear, non-dead-end message (not a generic toast) is part of this surface's design, not an afterthought. This is a UI-error-handling detail, independent of the pending pricing/cap product decision noted at the end of this document.

**Chat.** No new UI needed for the auto-commit path (Path A) — it is already at the tap-count floor. For the fallback modal path (Path B), the same "recent identities" list could pre-fill the `PetPicker`/`SubtypePicker` defaults with the pet's most-recently-used identity, cutting the worst case from 3-5 taps toward the low end of that range. This is a nice-to-have, not core scope for v1 — flagged as such in §5.

**Pin control.** A pin/unpin toggle lives inside the quick-log flow's per-item selection state (e.g. a pin icon on each `ActivitySelection` row, and on the "Log again" affordance itself) and, separately, as a management surface — plausibly a small "Manage shortcuts" list reachable from the same recent-row area — rather than a new standalone page. This keeps the feature inside the existing quick-log surface rather than adding new navigation.

**Design-system note (per CLAUDE.md: pawjai-client work must not deviate from `DESIGN_GUIDE.md`, and additions need user confirmation before being added to it):** `DESIGN_GUIDE.md` has no "chip" pattern today — only Buttons, Cards, Inputs, `rounded-full` badges/avatars, bottom-sheet modals, and the `LOOKUP_ICONS` taxonomy. The "recent" row, the pin glyph, and the "log again" affordance are **new UI affordances**, not applications of an existing documented pattern. They should be flagged to the user for confirmation before implementation, and if accepted, added to `DESIGN_GUIDE.md` (likely composing existing primitives: a horizontally-scrollable row of `rounded-full` chip buttons at `feature`/`inline` icon size, 44px touch target, built from `BTN_SECONDARY_SUBTLE`-style styling) rather than invented ad hoc.

---

## 3. Data design

**"Recent" derivation.** Per the backend recon, the internal query behind `GET /pets/:petId/records` (`pawjai-be/src/routes/petRecord.ts:213-240` → `petRecordServices.ts:374-467`) selects `typeId`, `metadata`, and `conceptId` per row (`petRecordServices.ts:419-433`), and there is already a partial index `pet_records_concept_id_occurred_at_idx` (`pawjai-be/src/db/schema/pets.ts:372-374`) scoped to non-deleted, resolved rows — exactly the shape a "most recent per identity" query wants. Note the **wire shape differs from the internal query**: `attachDisplay`/`stripInternalConceptId` (`petRecordServices.ts:1002-1034`) strip the top-level `conceptId` field before the response leaves the service — the public surface for it is `display.conceptId`, not a root field (comment at `petRecordServices.ts:990-992`). `metadata`, `note`, `vibe`, `typeId`, and everything else pass through unchanged (`{ conceptId, ...rest }`, i.e. only `conceptId` is dropped). So a client reading the existing `GET /pets/:petId/records` response has `typeId` and `metadata.detailType` directly, and `display.conceptId` if it requested `displayLocale`.

**Canonical identity key, both variants must agree on it:** `(recordType, typeId, detailType ?? null)` — the same tuple `LogShortcut` carries in §4. `typeId` alone is not identity (see §4's urination/bowel_movement example: two distinct concepts share one `typeId`, disambiguated only by `metadata.detailType`); deduping by `typeId` alone would collapse them into one chip and fire whichever `detailType` the dedup happened to keep, reintroducing the exact failure §4 exists to prevent.

No existing endpoint deduplicates by this key today; the closest precedent, `recent-symptoms.service.ts`, returns raw recent rows with duplicates allowed and is internal-only (not an HTTP route). **Recommended server-side approach (PR 2, see §7):** a new service method (e.g. `getRecentIdentities(petId, limit)`) using `DISTINCT ON (concept_id) ... ORDER BY concept_id, occurred_at DESC`. Caveat: `conceptId` is nullable — `resolveRecordConceptSnapshot` sets it `null` when resolution fails (`petRecordServices.ts:146`), and the fe recon confirms legacy pre-catalog record-type options exist with `conceptId: null` (`types/petRecordConceptCatalog.ts:22,53,59`). `DISTINCT ON (concept_id)` collapses every unresolved record into a single `NULL` group, and the partial index (`pet_records_concept_id_occurred_at_idx`) is scoped to resolved rows only, so a query leaning on that index silently drops unresolved records from "recent" entirely. This must be an explicit, stated tradeoff for PR 2 (unresolved/legacy records excluded from recents) — not an accident of the index shape — or the query must key on the full `(recordType, typeId, detailType)` tuple instead of `conceptId` to include them. The client-side v1 dedup (§7) does not have this problem, since it keys on the tuple directly. Exposed either as a new query param (`mode=identities`) on the existing route or as a small dedicated endpoint; either is a thin service-layer addition on infrastructure that already exists, no new migration required. Cost: one indexed query per pet, cacheable client-side via the existing `invalidatePetRecords` choke point (`lib/utils/cacheInvalidation.ts`).

**"Pinned" storage — recommended: client-only for v1 (see §6d); server-side new table as the fast-follow shape.** No existing per-user or per-pet preference/config table fits (`userConfig`, `pawjai-be/src/db/schema/users.ts:65-94`, is a global-scalar singleton per user, not a one-to-many list; `notificationSettings`, `pricingConfig` are unrelated domains). If server-side is chosen later, a new table (e.g. `pet_record_pins`: `userId` or `petId` FK, `recordType`, `typeId`, `detailType` nullable, `sortOrder`, timestamps) would be required — nothing to repurpose.

**Alternative — client-only storage.** `lib/store/quickLogStore.ts` has no persistence today; a new dedicated persisted Zustand store (following the pattern of `lib/store/personalizationStore.ts`, localStorage-backed) could hold pins per-device with zero backend work.
- **Tradeoff:** server-side pins sync across devices (phone + desktop, or a future native app — `project_pawjai_android.md` in memory confirms a second client already exists) and survive reinstall/logout; client-only is simpler to ship (no migration, no new endpoint, no auth-scoping bugs) and has no privacy exposure since pinned items are just `(recordType, typeId)` pairs, not sensitive data. See open decision 6d.

---

## 4. The identity-only rule, enforced structurally

**Ruling (decision e, principal orchestrator + user, 2026-08-17):** the constraint "shortcuts never carry metadata" means *descriptive* content — time, note, photo, severity, frequency, amount, dose. It does not mean *identity-bearing* metadata. Item 5 already classified `detailType` as identity-bearing, not descriptive: it lives in `RESOLUTION_METADATA_KEYS` and is immutable on PATCH precisely because it participates in determining which concept a record *is*. Carrying it in a shortcut is a clarification of the original constraint, not an exception to it. The alternative considered — excluding legacy-override records (bowel-movement/urination) from shortcuts entirely — was rejected: urination tracking is a prime repeat-log use case, and excluding it would make the feature worse at the exact thing it exists to speed up.

**The naive type from the roadmap sketch is insufficient in two directions, not one.**

*Leak direction:* a plain object type like `{ petId; recordType; typeId }` does not by itself prevent copying extra fields at the call site. TypeScript's excess-property check only fires on fresh object literals assigned to a typed target — `const s: ShortcutPayload = { ...sourceRecord, petId }` is rejected, but `function buildShortcut(s: ShortcutPayload)` called with a wider variable that structurally contains the extra fields passes silently. The metadata can still ride along at runtime.

*Loss direction, discovered in this recon and more consequential:* identity for a `pet_records` row is **not** simply `(recordType, typeId)`. Create always re-resolves the concept server-side — `resolveRecordConceptSnapshot({ recordType, lookup: validatedLookup, metadata: validatedData.metadata })`, called from `createRecord` at `pawjai-be/src/services/petRecordServices.ts:141-146`, with `conceptId` **never accepted as client input** (`createPetRecordSchema`, `pawjai-be/src/constants/schemas.ts:89-100`, has no `conceptId` field). Resolution can be steered by a `detailType` key inside `metadata` via `LEGACY_METADATA_OVERRIDES` (`pawjai-be/src/db/concepts/recordConceptResolution.ts:45`), and exactly which metadata keys participate in resolution is the closed list `RESOLUTION_METADATA_KEYS = ['detailType'] as const` (`recordConceptResolution.ts:53`, consumed by `recordMetadataMerge.ts:19,50`). Concretely (per the item5 packet's own worked example): a record on a bowel-movement-mapped lookup with stored `{detailType: 'urination'}` resolves to concept `activity.urination`, not `activity.bowel_movement`. A shortcut carrying only `{ recordType, typeId }` and dropping `detailType` would silently re-resolve to the wrong concept on "log again" — reproducing a different identity than the one the user tapped. This is a second, independent failure mode from metadata leakage, and both must be closed by the type, not just the leak.

**Recommended type — closed by construction, not by convention:**

```typescript
// The ONLY identity-bearing metadata a shortcut may ever carry is the closed
// set that participates in concept resolution. This is not Record<string, unknown>
// or Partial<RecordMetadata> — it is DERIVED from RESOLUTION_METADATA_KEYS
// (pawjai-be/src/db/concepts/recordConceptResolution.ts:53), not hand-typed
// alongside it, so the two can never drift: that module's own consistency
// test already guards every future addition to the list, and this type
// inherits that guarantee instead of duplicating it. Widening RESOLUTION_METADATA_KEYS
// automatically widens what a shortcut is allowed to carry — deliberate by
// construction, not by a second manually-maintained list.
type IdentityMetadata = { [K in typeof RESOLUTION_METADATA_KEYS[number]]?: string };
// Today this resolves to { detailType?: string } — one key, because
// RESOLUTION_METADATA_KEYS has exactly one entry. It is not written as
// { detailType?: string } directly so a future second entry in that list
// widens this type for free.

type LogShortcut = Readonly<{
  petId: string;
  recordType: "activity" | "symptom" | "vet_visit" | "medication";
  typeId: string;
  identityMetadata: IdentityMetadata; // never note, vibe, imageUrl, occurredAt
}>;

// Constructed only through a positional-argument factory — never a spreadable
// object literal at the call site. There is nothing to spread a source record
// into: time/note/photo/severity are not in lexical scope where a shortcut is
// built, because the "recent identities" query (§3) never selects those columns
// in the first place. The boundary is enforced twice: once by what the query
// returns, once by what the constructor accepts.
//
// identityMetadata is REQUIRED, not defaulted to {}. A default would silently
// reopen the loss direction this type exists to close: a caller who forgets to
// pass detailType for a record that resolved via a legacy override would
// produce a shortcut that "log again" re-resolves to the WRONG concept
// (see the urination/bowel_movement example below). Every call site must state
// either `{ detailType: "..." }` or an explicit `{}` — never an implicit gap.
function makeLogShortcut(
  petId: string,
  recordType: LogShortcut["recordType"],
  typeId: string,
  identityMetadata: IdentityMetadata,
): LogShortcut {
  return Object.freeze({ petId, recordType, typeId, identityMetadata });
}
```

Two enforcement layers, deliberately redundant:
1. **Data boundary** — the "recent identities" query (§3) selects only `recordType, typeId, metadata->detailType, occurredAt` (for sort), never `note`/`imageUrl`/`vibe`. If the extra fields are never fetched, they cannot leak into a shortcut regardless of what the type allows — this is the same "narrow at the source" principle the backend already applies for the immutable-identity-on-PATCH fix (item 5).
2. **Construction boundary** — `makeLogShortcut` takes positional scalars, not an object. A caller holding a full `PetRecord` cannot pass it in directly; they must destructure exactly the fields the signature names. This is the concrete fix for the excess-property-check gap above.

This also means the create call for a "log again" record sends `{ recordType, typeId, metadata: shortcut.identityMetadata }` and nothing else in the body — no `note`, no `occurredAt` override beyond "now," no `imageUrl` — which is already exactly the immutable-on-create-input shape `createPetRecordSchema` accepts (`pawjai-be/src/constants/schemas.ts:89-100`), so no backend schema change is required for the create path itself.

---

## 5. Explicit non-goals for v1

- No cross-device sync for pins unless open decision 6d resolves to server-side (client-only ships without it).
- No "smart" ranking of recent items (frequency-weighted, time-of-day-aware) — pure most-recently-logged-per-identity ordering only.
- No pre-filling the chat fallback modal's pickers from recent identities (§2's chat note) — desirable but not required to hit the tap-count target on the primary surfaces.
- No changes to `createPetRecordSchema`, `updatePetRecordSchema`, or any migration — v1 is additive (a new read query, optionally a new pins table), not a change to the create/update contract.
- No admin-configurable shortcut limits or count — the "how many recent items" number (open decision 6b) is a fixed constant for v1, not user-configurable.
- No handling of what happens to a pin when its underlying concept is remapped/deactivated by the item-4 concept editor — flagged as a follow-up, not solved here.

---

## 6. Open decisions for the user

**(a) Pinned scope: per-pet or per-user?**
Recommendation: **per-pet**. A household with a dog on a medication schedule and a cat that's only ever fed will pin different things; a shared per-user pin list would either show irrelevant shortcuts for the wrong pet or require per-pet filtering of a per-user list anyway, which is the same data shape as per-pet with extra indirection. Per-pet also matches how `activePetIdForLog` already scopes the quick-log entry points (`TimelineView.tsx:146-149`).

**(b) How many recent items to show?**
Recommendation: **3**, matching the existing (if currently desktop-only, unrelated-feature) precedent at `usePetSnapshot.ts` which already fetches `limit: 3`. Keeps the chip row from crowding a 375px mobile viewport (design guide's baseline breakpoint) and avoids needing horizontal scroll for the common case.

**(c) Does "log again" open the full log form pre-aimed at the type, or a slim confirm sheet?**
Recommendation: **slim confirm sheet** (identity + a large "Confirm" button, optionally with note/time still editable but collapsed by default) rather than the full multi-step `QuickLogDialog`. This is what makes the ≤2-taps-plus-confirm target reachable at all — routing back through the full form (category grid, then item grid, then form section) would just be the existing 4-tap flow with the first two taps auto-answered, not a structurally faster path.

**(d) Server-side pins vs. client-only storage for v1?**
Recommendation: **client-only for v1**, server-side as a fast-follow. Reasoning: nothing to repurpose exists server-side (§3) either way, so client-only is not "cutting corners" relative to an existing table — it's genuinely less work (no migration, no new endpoint, no auth-scoping surface) and ships the tap-count win sooner. The cost is real (no sync across the confirmed second client, pawjai-android, per project memory) but pins are low-stakes, easily re-created state, unlike e.g. auth or payment data — a user re-pinning three things on a new device is a minor friction, not a data-loss event. Revisit if usage data shows heavy multi-device usage per user.

---

## 7. Proposed round structure for implementation

**An fe-only v1 is possible, and is the recommended starting point**, because:
- The "recent identities" data needed for the chip row is **not yet available as a dedicated query**, but the existing `GET /pets/:petId/records` response already carries `typeId` and `metadata` per row (confirmed at the wire, not just internally — §3), so a client can dedup by the same canonical key as §4/§3, `(recordType, typeId, metadata.detailType ?? null)`, take the most recent `occurredAt` per key, and slice the top N — viable without any backend change, at the cost of over-fetching slightly more rows than a server-side `DISTINCT ON (concept_id)` would return. This trades a small amount of query efficiency for zero backend dependency, and **must not** dedup by `typeId` alone (§3).
- Pins, per decision 6d, are client-only for v1 — no backend work.
- The "log again" affordance and the identity-only shortcut type (§4) are pure frontend construction over data the client already has from the timeline query.

**Recommended phasing:**
1. **PR 1 (fe-only):** `LogShortcut` type + `makeLogShortcut` constructor, client-side dedup-from-existing-query for "recent," client-only pins store, "log again" affordance on timeline records, slim confirm sheet, recent/pinned chip row in `QuickLogDialog`. No backend PR needed to ship this.
2. **PR 2 (be, fast-follow, only if 6d is revisited toward server-side pins or if the client-side dedup proves too expensive at scale):** dedicated `getRecentIdentities` service method + route param, and/or a `pet_record_pins` table + CRUD endpoints. Independent of PR 1's UI, swaps out only the data-fetching layer.

This keeps backend off the critical path entirely for v1, consistent with §5's non-goals, and defers the only genuinely new backend surface (a pins table) until real usage data suggests cross-device sync matters.

---

## 8. Round 2 implementation status (2026-08-17/18)

Round 2a (`lib/logShortcut/` — `LogShortcut`, `IdentityMetadata`, `makeLogShortcut`, `makeLogShortcutFromRecord`, `getRecentDistinctRecords`, `toCreatePetRecordData`/`toCreateRecordArgs`) and round 2b (pin store, recent/pinned chip row, log-again affordance, slim confirm sheet, `DESIGN_GUIDE.md` additions) are both implemented and accepted by the principal orchestrator. `tsc --noEmit`, `lint`, and `build` independently re-run at exit 0. Commit round follows.

**Accepted v1 limitations:**
- **Pinned legacy label ambiguity.** A *pinned* identity affected by `LEGACY_METADATA_OVERRIDES` (today: the single bowel_movement/urination pair) cannot show a visually distinct chip label, because the FE catalog/options layer (`PetRecordTypeOption`/`findQuickLogOption`) has no `detailType` field — that split only exists in `PetRecord.display` (server-resolved, used correctly for *recents*, which read from actual records) and in the activity-details form. The pin still carries `identityMetadata.detailType` through to the create call, so "log again" still re-resolves to the correct concept — only the pinned chip's displayed label is ambiguous for this one legacy pair. Create-time identity correctness is unaffected; this is a display-only gap.
- **Log-again wired in `TimelineView.tsx` only.** `TimelineCardActions`'s `onLogAgain` prop is optional and not yet threaded through the other three `TimelineList` consumers (`petRecordSection.tsx`, `regularPetView.tsx`, `PetDetailClient.tsx`). Deliberate v1 scope boundary, not a bug — nothing breaks where it's unwired, the affordance is simply absent there.

**Fast-follows queued (not this round):**
- Thread `onLogAgain` through the remaining three `TimelineList` consumers.
- Add a reciprocal comment on the backend side: `pawjai-be/src/db/concepts/recordConceptResolution.ts:53`'s `RESOLUTION_METADATA_KEYS` should point back at the fe mirror (`pawjai-fe/lib/logShortcut/identityMetadata.ts`), so the lockstep contract is documented from both ends, not just the fe→be direction. Queue for the next be round.
- PR 2 (server-side `getRecentIdentities` query and/or a `pet_record_pins` table) — only if decision 6d is revisited toward server-side pins or client-side dedup proves too expensive at scale.

**Incident, 2026-08-18: v1 shipped, crashed prod, reverted, fixed, relanded — a repo-wide lesson, not just an item-6 footnote.**

v1 (`8ee8c66`) landed on fe `main`/`staging` with three green static gates (tsc/lint/build) and zero runtime verification. It crashed the dashboard for all users within minutes: `hooks/useRecentLogShortcuts.ts` selected pins via `state.listPins(petId)`, which resolves to `pinsByPet[petId] ?? []` — a fresh array allocated on every Zustand store snapshot for any pet with zero pins, i.e. every first-time user. `QuickLogDialog` mounts unconditionally on the dashboard whenever the user has a pet, so this hook runs on every dashboard load regardless of whether the quick-log sheet is open. Under React's `useSyncExternalStore` contract (which Zustand v5's `useStore` delegates to directly, with no built-in memoization), an unstable `getSnapshot` result forces a synchronous re-render loop — "Maximum update depth exceeded" — which the dashboard's error boundary surfaced as a full-page "Something went wrong" for essentially every session.

Reverted same-day (`07be528`), fixed by selecting the stable `pinsByPet` object and deriving the per-pet list outside the subscription against a module-level `EMPTY_PINS` fallback, adversarially re-reviewed (independent mechanism confirmation + full selector audit + gate re-runs), proven with a real-browser (Playwright) repro of both the crash and the fix, and relanded via fe PR #298 (`4bf2762`, squash `9ea74e1`). Full incident trace in `output/CODEX_HANDOFF_AUDIT.md`.

**The repo-wide lesson (now in `output/ORCHESTRATOR_HANDOFF.md`'s protocol section as a standing rule):** any change rendered on an always-mounted surface (dashboard, layout, providers, quick-log) requires a runtime pass in a real browser before release — static gates cannot see `useSyncExternalStore` contract violations. And structurally: a Zustand selector must never allocate a fresh object/array/function inside the selector body (watch for inline `?? []`/`?? {}` defaults reached through a store method) — select the stable container from state and derive downstream, or use `useShallow` from `zustand/react/shallow` when the derived shape can't be avoided.

---

## Interaction with the on-hold daily-limit / pricing decision

Noted, not resolved: the 30-records/pet/day cap (`pawjai-be/src/services/petRecordServices.ts:41,179-181`) is enforced at record *creation*, and this feature's entire point is to make creation faster and lower-friction. A user who previously found the cap effectively unreachable (4 taps × however many times a day) may reach it sooner once repeat-logging drops to 2 taps. The pending pricing packet (`output/pricing-model-prep-round1-packet.md`, status ON HOLD as of 2026-08-16) already anticipates a version of this tension: it repurposes the cap as pure abuse control post-migration to paid-only, exempting clinical record types (symptom, medication, vet_visit) for paying subscribers and leaving only `activity` capped (at a higher 100/day) as a runaway-script guard. If shipped as described, that change would make the progressive logger's speed-up mostly harmless for the record types most likely to be repeat-logged rapidly (symptom/medication tracking during an acute episode) — but this brief does not depend on that decision landing, and the two pieces of work are not blocking each other in either direction.
