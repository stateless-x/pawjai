# Roadmap item 5 — Logger safety fixes — ROUND 1 packet (v2)

**To:** worker session
**From:** orchestrator
**Date:** 2026-08-16
**Repo:** `pawjai-be` only. No frontend work in this round.
**Supersedes:** v1 of this packet. The root cause below is expanded (v1 missed the concept-corruption half) and the `null` semantics are now decided, not open.

---

## Standing rules (unchanged, restated because they get let slip on long sessions)

- **No commit, no push, no PR, no merge, no migration in this round.** Round 1 is implementation + verification only. The commit gets its own authorization round.
- Stage nothing. Do not run `git add`. Ever. Never `git add -A`, never `--no-verify`.
- Env files and secrets are process input only. Never `cat`/`head`/`grep`/`env`/`printenv` them, never run an unscoped `railway variables`.
- No schema changes, no migration files. Service/constants/route layer + tests only. If you conclude a schema change is needed, **stop and report**.
- Independently verify every root-cause claim below against the actual source before writing code. If your reading disagrees, **stop and report the disagreement** rather than implementing what I described.
- **Hard stop at the end of scope item 4.** Do not chain into the daily-limit work or the frontend (see "Explicitly out of scope").

## Where to work

Worktree already exists: `/Users/purin/dev/pawjai/pawjai-be-item5-metadata-merge`, branch `item5-metadata-merge-staging`, at `dc6f8319` (= `origin/staging`). Work there. Do not create another worktree or branch.

---

## Background: TWO defects, one mechanism, both verified in source

Editing a pet record via `PATCH /api/records/:id` destroys metadata, in two escalating ways.

### Defect A — silent key loss (all records)

1. The FE edit dialog (`pawjai-fe/components/petRecordEditDialog.tsx:137-152`) rebuilds `metadata` from only the fields it renders: `amount` (activity), `severity`/`frequency` (symptom). Any other stored key is dropped from the payload. (FE is context only — do not touch it.)
2. The BE replaces rather than merges: `src/services/petRecordServices.ts` writes `metadata: validatedData.metadata` straight into the `.set()` (the UPDATE near the end of `updateRecord`), and `updatePetRecordSchema` (`src/constants/schemas.ts:102-111`) is `z.record(z.any()).optional()` — whole-blob overwrite.

**Verified loss case:** `src/services/recent-symptoms.service.ts:108-110` reads `metadata.duration`, which the dialog never renders. A note-only edit on a symptom that has `duration` destroys it.

### Defect B — concept-identity corruption (legacy records)

`src/db/concepts/recordConceptResolution.ts:162-167` reads `metadata.detailType` to apply `LEGACY_METADATA_OVERRIDES` (`:43-45`): a record whose lookup maps to `activity.bowel_movement` but whose `detailType` is `'urination'` resolves to concept `activity.urination`.

`updateRecord` deliberately re-resolves the concept snapshot on every metadata-supplying edit (against the *current* catalog — that behavior is intentional, keep it). But it resolves against `validatedData.metadata`, the client's fragment. So:

1. Legacy record: Bathroom typeId, stored `metadata.detailType = 'urination'`, snapshot = `activity.urination`.
2. User edits the note; dialog sends `metadata: {amount}` or `null` — no `detailType`.
3. Resolution sees `detailType === undefined`, no override matches, snapshot is **rewritten to `activity.bowel_movement`** with `conceptResolutionSource` flipped to `'lookup_type'`.

A note edit silently changes what the record *is* — the exact thing the immutable snapshot (migrations 0116/0117) exists to prevent.

### Scope facts you should verify yourself, then rely on

- `detailType` is **legacy-only**: the current FE never sends it anywhere (whole-repo grep: only `types/activityMetadata.ts` type defs). Quick-log creates urination and bowel-movement as separate concepts (`lib/utils/quickLogTypeOptions.ts:45-50`). The BE create path still validates it when supplied (`src/routes/petRecord.ts:52-55` via `validateActivityMetadata`) for old clients and legacy data.
- Nothing anywhere edits `detailType` after creation. This is why the immutability rule below breaks no one.
- The chat amend path (`src/services/chat/orchestrator.service.ts`, the `updateRecord` call in `tryAutoCommit`'s amend branch) never sends `metadata` — it takes the untouched branch and is safe today. It must remain so.
- The existing untouched-metadata behavior (`petRecordServices.ts`, comment block starting "Note-only/image-only/vibe-only/occurredAt-only edits must not touch the snapshot") is CORRECT. `metadata` absent from `.set()` (undefined, not null) on those edits. **Do not disturb it.**

---

## The decided design: identity-bearing metadata keys are immutable on PATCH

This is decided; implement it as specified. Rationale on file in the audit trail: the metadata blob mixes user-facing detail fields (amount, severity, frequency, duration...) with identity-bearing keys that participate in concept resolution (today: only `detailType`). The future-proof rule is that the update path distinguishes them via ONE source of truth, so that when activity concepts are restructured later (they are expected to change), only the resolver module changes.

### 1. Single source of truth for identity keys

In `src/db/concepts/recordConceptResolution.ts`, colocated with `LEGACY_METADATA_OVERRIDES`, export:

```ts
/** Metadata keys that participate in concept resolution. Immutable on the
 * record update path: updateRecord pins them from stored metadata and rejects
 * client attempts to change them. Extend this list when a new override rule
 * reads a new key — the update path reads this list and needs no change. */
export const RESOLUTION_METADATA_KEYS = ['detailType'] as const;
```

Add a comment on `LEGACY_METADATA_OVERRIDES` noting that any key a future override reads MUST be added to `RESOLUTION_METADATA_KEYS`. Do not derive the list dynamically from the overrides table — explicit beats clever here; a test (below) enforces consistency instead.

### 2. Merge semantics in `updateRecord`

Add `metadata` to the existing `existingRecord` `.select()` at the top of `updateRecord` — no second query. Then, when metadata is supplied (i.e. not `undefined`), compute the effective metadata:

- **`metadata: <object>`** → `merged = { ...stored, ...supplied }`, shallow, one level. Nested objects replace wholesale. Then, within `supplied`:
  - a key with value `null` → **delete** that key from `merged` (explicit key deletion),
  - EXCEPT identity keys (`RESOLUTION_METADATA_KEYS`): if `supplied` contains an identity key whose value differs from stored (including `null`/deletion when stored has a value), **throw `badRequest`** with a message naming the key and stating it is immutable on update. If the supplied value equals the stored value, accept (idempotent no-op).
- **`metadata: null`** → clear all user-facing keys but **preserve identity keys** from stored metadata. Result: if the record has no identity keys, the column becomes SQL `NULL` (today's behavior, unchanged for every non-legacy record); if it has `detailType`, the result is `{ detailType: <stored> }`.
- **`metadata` absent/undefined** → untouched, exactly as today: no `metadata` in `.set()`, no re-resolution.

The effective metadata feeds **both** the `.set()` write **and** `resolveRecordConceptSnapshot` (the call inside the `metadataSupplied` branch). This is the load-bearing line of the whole fix: because identity keys are always pinned from stored, resolution against the merged blob means **an edit can never change `conceptId`** — only an admin catalog remap can, which is the existing intended behavior. Preserve the existing atomicity: merged metadata + resolved snapshot written in the same single UPDATE.

Implement the merge as a small pure exported function (e.g. in `src/db/concepts/` next to the resolver, or `src/utils/` if you judge it more discoverable — your call, report which and why): `(stored, supplied) => { merged } | { violation: key }`. Pure and unit-testable; `updateRecord` maps a violation to `badRequest`.

### 3. Schema changes (Zod only — no DB)

- `updatePetRecordSchema` in `src/constants/schemas.ts`: `metadata: z.record(z.any()).nullable().optional()` so `null` passes validation (today it is rejected by `z.record` — verify this claim; if the route's `safeParse` was already letting `null` through some other way, report what you find).
- The route-level `updateBodySchema` in `src/routes/petRecord.ts` (the inline `z.object` in the PATCH handler): same `.nullable()` treatment, keeping the two schemas in agreement.
- Keep `z.record(z.any())` for the value type this round. Do NOT introduce a typed metadata schema — that is a bigger contract change and not this round's job.

### 4. Tests

Extend the existing pet-record integration suites (`src/__tests__/integration/` — see `record-concept-snapshot.test.ts` for the snapshot-assertion pattern; run with `bun run test`, NOT bare `bun test` — Docker throwaway DB). Minimum matrix:

1. Note-only edit leaves a multi-key metadata blob **byte-identical** and the snapshot columns untouched (regression guard on the untouched branch).
2. Symptom edit supplying `{severity, frequency}` against stored `{severity, frequency, duration}` **preserves `duration`** (Defect A, exact reported case).
3. **The urination case (Defect B — centerpiece):** record on a bowel-movement-mapped lookup with stored `{detailType: 'urination'}`, snapshot resolved to `activity.urination`. Edit sending `metadata: {amount: 'small'}`. Assert: persisted metadata is `{detailType: 'urination', amount: 'small'}` AND `conceptId` still = the `activity.urination` concept AND `conceptResolutionSource` still `'legacy_metadata_override'`.
4. Same record, edit sending `metadata: null` → metadata becomes `{detailType: 'urination'}`, snapshot unchanged.
5. Non-legacy record, `metadata: null` → column is SQL `NULL` (behavior unchanged).
6. `{someKey: null}` deletes only that key; siblings intact.
7. Edit sending `{detailType: 'bowel_movement'}` (different from stored) → 400, record byte-identical after.
8. Edit sending `{detailType: 'urination'}` (equal to stored) → succeeds, no-op on that key.
9. Snapshot resolves against the **merged** metadata: prove it by asserting the persisted snapshot columns, not just the metadata column.
10. Chat amend path still takes the untouched-metadata branch (no metadata in the UPDATE).
11. Consistency guard (unit test, `pet-record-concept-resolution.test.ts`): every `detailType`-style key referenced by `LEGACY_METADATA_OVERRIDES` handling is present in `RESOLUTION_METADATA_KEYS` — so adding a future override without updating the list fails a test instead of reopening this bug.

---

## Explicitly out of scope — do not touch

- **The 30-record daily limit** (`MAX_RECORDS_PER_PET_PER_DAY`, and both throw sites). Product decision, brief already on file (`output/daily-record-limit-decision-brief.md`). Do not change or parameterize.
- **The frontend.** `petRecordEditDialog.tsx` gets its own round after this lands; the backend fix makes sparse client patches safe, which is the point.
- **`createRecord`.** The create path's metadata handling is correct as-is (client supplies the full intended blob at creation). Only `updateRecord` changes.
- Any migration, any `src/db/schema/` change, any typed-metadata contract change.

---

## Verify before reporting

- `bun run test` — full suite through the throwaway-DB script. **Report the process exit code, not just the printed pass/fail line** (a printed "0 fail" has masked a non-zero exit in this repo before — PR #260). Baseline to beat: 1173 pass / 0 fail, plus your new tests.
- `bun tsc --noEmit` — clean.
- `bun run lint` — report any finding in a touched file.
- `bun run build:ts` — clean.

## Report back to the orchestrator

1. Your independent read of both defects — quote the lines you checked. **If your reading disagrees with the background section, stop and say so before implementing.**
2. The diff, file by file, one-line rationale each.
3. Where you put the pure merge function and why.
4. How the merged metadata reaches `resolveRecordConceptSnapshot`, and the test number that proves snapshot/metadata cannot diverge.
5. The exact assertion from test 3 (the urination case).
6. Suite exit code, tsc, lint, build results.
7. Anything this packet got wrong.

**Then stop.** No commit, no push, no staging of files. The commit is round 2 and needs its own authorization.
