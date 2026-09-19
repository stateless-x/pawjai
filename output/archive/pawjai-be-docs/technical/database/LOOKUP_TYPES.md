# Pet Record Lookup Types

## Overview

The quickLog feature uses a unified lookup table (`pet_record_types`) to store all types of pet records. This simplifies the database structure by consolidating what used to be 4 separate tables into one.

## Database Schema

### Table: `pet_record_types`

Defined in `src/db/schema/pets.ts`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `type` | record_type | Type of record (activity, symptom, vet_visit, medication) |
| `species` | species | Species this applies to (dog, cat, or NULL for all) |
| `name_en` | text | English name |
| `name_th` | text | Thai name |
| `icon_url` | text | URL to icon image |
| `sort_order` | integer | Display order (default: 0) |
| `metadata` | jsonb | Field configuration, e.g. which metadata fields a symptom shows (`supportsFrequency`, `supportsDuration`) |
| `is_active` | boolean | Soft-delete flag (default: true); public API only returns active rows |
| `concept_id` | uuid, nullable | References `pet_record_type_concepts.id` -- see "Canonical concepts" below |
| `created_at` / `updated_at` | timestamp | Audit timestamps |
| `created_by` / `updated_by` | uuid | References `admins.id` |

## Managing Lookup Values

### Upsert Script

Use the upsert script to add or update lookup values:

```bash
bun run scripts/upsert-lookup-types.ts
```

The script:
- Checks for duplicates (by type, species, name_en, name_th)
- Inserts new records
- Updates existing records (preserves ID)
- Prevents duplication

Edit the `lookupValues` array in `scripts/upsert-lookup-types.ts` to manage your lookup data.

### Example Lookup Value

```typescript
{
  type: 'activity',
  species: 'dog',
  nameEn: 'Walk',
  nameTh: 'เดินเล่น',
  iconUrl: 'https://pawjai.b-cdn.net/WebAssets/Lookups/Activity/dog-walk.webp',
  sortOrder: 1
}
```

## API Endpoints

### Public (read-only)

Registered under `/api/lookup-types` (`src/routes/lookupTypes.ts`), unauthenticated. All of
them use the unified table and only return active rows (`is_active = true`):

- `GET /api/lookup-types/:type` - Get lookup types by type (activity, symptom, vet_visit, medication)
- `GET /api/lookup-types/:type/all-species` - Get lookup types for a species; omit `species` query param to get all four categories across all species
- `GET /api/lookup-types/:type/:id` - Get single lookup type
- `GET /api/lookup-types/:type/stats` - Get statistics

This router is read-only. It previously also exposed unauthenticated create/update/delete/bulk
routes; those were removed (see "Write validation" below) and replaced entirely by the
authenticated admin routes.

### Admin (authenticated)

Registered under `/api/admin/lookup-types` (`src/routes/admin/lookupTypes.ts`). Every route
requires `requireAdmin` plus a `lookup_types:read` or `lookup_types:write` permission:

- `GET /api/admin/lookup-types` - List lookup types, including inactive, with filters (`lookup_types:read`)
- `POST /api/admin/lookup-types` - Create a new lookup type (`lookup_types:write`)
- `PUT /api/admin/lookup-types/:id` - Update a lookup type (`lookup_types:write`)
- `PATCH /api/admin/lookup-types/:id/toggle` - Soft-delete/restore via `isActive` (`lookup_types:write`)
- `GET /api/admin/lookup-types/:id/usage` - Usage statistics for a lookup type (`lookup_types:read`)

There is no hard-delete route, admin or public. Deactivation is soft (`isActive = false`) via
the toggle endpoint; inactive rows stay in the table so historical `pet_records` referencing
them remain readable, but they can no longer be selected for new writes.

### Write validation

New pet-record writes (owner, bulk, helper, and chat auto-commit) are gated by
`PetRecordService.validateRecordWrite` (`src/services/petRecordServices.ts`), which checks the
type exists, matches the submitted `recordType`, is active, and is species-compatible with the
target pet (`species = NULL` on the lookup type means it applies to every species). This does
not affect reads: existing records keep displaying via their `type_id` even after that type is
deactivated.

## Canonical concepts (Phase 1A, additive; localization amended in Phase 1A-L)

`pet_record_type_concepts` (`src/db/schema/pets.ts`) groups dog/cat `pet_record_types` variants
that represent the same semantic concept -- e.g. "Dog Feeding" and "Cat Feeding" both belong to
the concept `activity.feeding`. Each concept has a stable, immutable `key`
(`activity.feeding`, `activity.bowel_movement`, `symptom.vomiting`, etc.), a `type`, an
`is_vet_visible` flag, `sort_order`, and `field_schema` -- machine/domain fields only.
**Concept identity is locale-independent**: the table has no `name_en`/`name_th` columns, so
adding a new locale never requires a database column or a migration. `pet_record_types` keeps
its own species-specific `name_en`/`name_th`/`icon_url` as the legacy/species **presentation
layer** -- current UI keeps reading those columns until a later read-contract migration.

### Translations

`pet_record_type_concept_translations` holds one row per `(concept_id, locale)`: `name`,
optional `description`, audit fields. `locale` is a free-form **BCP-47** tag (`en`, `th`, `ja`,
`en-US`, `zh-Hant`, ...) -- deliberately not the DB `languageEnum`/app `Locale` type, which are
both restricted to `en`/`th` and unsuitable for an extensible catalog. **Adding a database
translation row does not expand the application's global `Locale` type or the UI language
selector** -- those stay `en`/`th`-only until a dedicated expansion is designed.

Locale identity is **case-insensitive per concept**, enforced by the DB: the unique index is on
`(concept_id, lower(locale))`, so `en-US` and `en-us` cannot coexist as two rows for the same
concept (a second insert is rejected, not silently merged) -- while the *stored* `locale` value
keeps whatever casing the source (registry or lookup row) provided. Full BCP-47
parsing/canonicalization (script/region normalization beyond simple case-folding, tag validity)
is still deferred to a future write/API boundary -- this table only establishes safe identity
and non-blank values. `locale` and `name` both have a non-blank CHECK constraint
(`trim(...) != ''`); a blank/whitespace-only value is rejected outright rather than stored.

Absence of a translation row -- not an empty-string `name` -- is what signals "no translation
yet" to the future fallback chain (exact locale -> base language -> configured default ->
English -> concept key). The backfill never inserts a blank name: see "Blank/missing source
names" below.

Deleting a concept cascades to its translations; there is no cascade from concepts to
`pet_record_types` or `pet_records`.

### Lookup <-> concept type invariant

`pet_record_types.concept_id` is a **nullable** composite FK to
`pet_record_type_concepts (id, type)` -- not just `id` -- so the database itself rejects a
lookup row whose `type` doesn't match its linked concept's `type` (e.g. an `activity` row can
never point at a `symptom` concept). The FK uses the default MATCH SIMPLE semantics, so it's
skipped whenever `concept_id` is NULL (required for the Phase 1 compatibility period). No
`ON DELETE`/`ON UPDATE CASCADE`: a concept can never take variant rows down with it, and
changing a concept's `type` is blocked while variants still reference it.

As of Phase 1A-L:

- No route, service, or consumer reads `concept_id` or the translations table -- they exist
  purely as a link and a data store.
- The registry of known concepts lives in `src/db/concepts/petRecordConcepts.ts`. Each entry's
  `translations` map currently ships `en`/`th`; the shape is open to additional locale keys
  without any code change. `legacyNameAliases.en` is backfill *matching evidence* (which
  historical `pet_record_types.name_en` values resolve to this concept), not a canonical
  translated name.
- `scripts/backfill-record-type-concepts.ts` links existing `pet_record_types` rows to
  concepts and seeds/repairs their translations (dry-run by default, `--apply` to write); it
  only ever sets `concept_id` where it is currently null, only ever inserts a translation for a
  `(concept, locale)` pair that doesn't exist yet (never overwrites one that does, matched
  case-insensitively on locale), and never touches `pet_records` or existing lookup IDs.
  **Already-linked rows are never relinked or given a new concept**, but they *are* evidence for
  missing-translation repair: if a linked row's concept is missing a locale it should have
  (resolved from the registry for a registry concept, or from that row's own `name_en`/`name_th`
  for a legacy concept), a rerun plans just that missing translation. A linked row whose concept
  can't be resolved from the current snapshot is skipped for repair -- never guessed by name.
- Rows with no registry match get an isolated `legacy.<type>.<uuid>` concept rather than being
  merged by name, and its `en`/`th` translations are seeded from that row's own exact
  `name_en`/`name_th` -- English is never copied into the Thai slot. **Blank/missing source
  names**: a locale whose source name is blank or whitespace-only is skipped entirely (no row
  inserted for it), never stored as an empty string -- absence of the row is what signals "no
  translation yet" to the future fallback chain, not an empty display label. Existing valid names
  are never trimmed or rewritten. See the module doc comment in `petRecordConcepts.ts` for the
  exact matching rules.
- `field_schema` is reserved for machine identifiers, validation rules, units, and option keys
  only -- never localized field labels, descriptions, or option display text. Field-label
  localization will be designed separately when dynamic forms first consume `field_schema`.
- Icons belong to `pet_record_types` (species-specific presentation), never to concepts or
  translations.
- Analytics and LLM tools must key off `concept.key`, never a localized name.

### Out of scope for Phase 1A-L

No localized read API, no admin translation CRUD, no frontend changes, and no changes to
current API response fields -- see the Phase 1A-L plan for the full list and what comes next
(provenance/compatibility metadata, then localized read/admin contracts with deterministic
fallback: exact locale -> base language -> configured default -> English -> concept key).

## Record-level concept snapshot (Phase 1B, additive)

`pet_records` (`src/db/schema/pets.ts`) has five nullable columns that snapshot the canonical
concept an event represented **at write/last-metadata-edit time**:

| Column | Type | Description |
|--------|------|-------------|
| `concept_id` | uuid, nullable | The resolved `pet_record_type_concepts.id` this record represents |
| `concept_resolution_source` | text, nullable | `'lookup_type'` or `'legacy_metadata_override'` -- see below. Stored as `text`, not a PG enum, so a future source doesn't need a migration; a strict TS union (`ConceptResolutionSource`) constrains current code |
| `concept_resolution_version` | integer, nullable | The resolution algorithm version (`PET_RECORD_CONCEPT_RESOLUTION_VERSION`, currently `1`) that produced this snapshot |
| `concept_metadata_schema_version` | integer, nullable | The resolved target concept's `metadataSchemaVersion` at resolution time, for interpreting `metadata`'s shape |
| `concept_resolved_at` | timestamptz, nullable | When the snapshot was assigned -- **not** when the pet event occurred (`occurred_at` is separate) |

**Deliberately not a live join.** A record's snapshot is fixed at write/edit time and does not
follow later admin remapping of its lookup's `concept_id` -- if it did, historical analytics
would silently change meaning whenever an admin corrected or reorganized the catalog.

**Atomic bundle invariant, enforced by the database, not just app code:** all five columns are
either entirely `NULL` (unresolved -- still a fully valid record) or entirely non-`NULL`
(`pet_records_concept_snapshot_bundle_check`). Three more CHECK constraints:
`concept_resolution_source` non-blank when present, `concept_resolution_version > 0` when
present, `concept_metadata_schema_version > 0` when present. A composite FK
`(concept_id, record_type) -> pet_record_type_concepts (id, type)` (same MATCH SIMPLE / no-cascade
shape as `pet_record_types.concept_id`'s FK) rejects a category mismatch at the DB level. An
analytics-oriented partial index `(concept_id, occurred_at) WHERE deleted_at IS NULL AND
concept_id IS NOT NULL` supports "all resolved events of concept X over time" without scanning
unresolved or soft-deleted rows.

All five columns start `NULL` for every pre-Phase-1B row; the migration performs no in-migration
data update.

### Resolution rules

Pure logic lives in `src/db/concepts/recordConceptResolution.ts` (`resolveRecordConcept`) --
works only with concept keys, record category, and metadata; never localized names or species.
A DB-aware wrapper, `resolveRecordConceptSnapshot` (`src/db/concepts/resolveRecordConceptSnapshot.ts`),
loads the record's lookup-linked concept and any concept the pure resolver might additionally
need, then calls the pure resolver.

- **`lookup_type`** (default): the record's `typeId` -> `pet_record_types.concept_id` ->
  concept, used as-is.
- **`legacy_metadata_override`**: a checked-in compatibility exception, defined in
  `LEGACY_METADATA_OVERRIDES` in `recordConceptResolution.ts`. Currently one rule: if the
  lookup's concept key is `activity.bowel_movement` and `metadata.detailType === 'urination'`,
  the record resolves to `activity.urination` instead. This exists because `bathroomUrinationMetadataSchema`
  (`src/constants/validators.ts`) legally allows a "Bathroom"-lookup record to carry
  `detailType: 'urination'` (see `validateActivityMetadata` in `src/routes/petRecord.ts`) --
  without this override, that record's snapshot would misclassify a urination event as a bowel
  movement. **The rule keys on the concept key, not on the lookup's localized name** -- it fires
  for any lookup variant mapped to `activity.bowel_movement`, not only rows literally named
  "Bathroom". Adding a second override means adding a row to `LEGACY_METADATA_OVERRIDES`; both
  the pure resolver and the DB-aware wrapper's pre-load (`candidateTargetKeys`) pick it up
  automatically -- no other file hardcodes override keys.
- **Never guesses.** A missing lookup->concept link, a missing target concept, or a category
  mismatch all resolve to "unresolved" (the complete bundle stays/becomes `NULL`) rather than a
  best-effort guess. An unresolved snapshot never blocks an otherwise-valid write.

`conceptSnapshotColumns` (`resolveRecordConceptSnapshot.ts`) is the single place that turns a
resolution result into the five-column insert/update payload -- every write path uses it rather
than hand-assembling the bundle.

### Write and update integration

Owner create, bulk create, helper create, and chat auto-commit create (all funnel through
`PetRecordService.createRecord` / `bulkCreateRecords`, or `helper.ts`'s POST route) resolve and
set the complete bundle at insert time. `PetRecordService.validateRecordWrite` (see "Write
validation" above) now also returns the validated lookup row so callers don't re-query it.

PATCH (`PetRecordService.updateRecord`) cannot change `typeId`/`recordType`, but can change
`metadata`:

- **`metadata` omitted** -- the snapshot is left completely untouched (the five columns stay
  absent from the `UPDATE ... SET`, not set to their existing values).
- **`metadata` supplied** -- re-resolves against the record's immutable `typeId`/`recordType`,
  the new metadata, and the **current** catalog mapping (an admin may have remapped the lookup's
  concept since the record was created), in the same `UPDATE` statement as the metadata write so
  the two can never diverge.
  - **The lookup's `isActive` flag is not consulted by resolution at all.** `is_active` only
    gates *new* writes against a type (`validateRecordWrite`); editing an existing record's
    metadata continues to resolve through an inactive lookup exactly as it would through an
    active one -- historical record editing must remain possible, and inactivity by itself never
    clears or blocks a snapshot.
  - The edit itself is **never rejected** by resolution outcome either way.
  - The complete bundle is cleared to `NULL` only when resolution is actually unsafe: the
    lookup's `conceptId` is null (no link, e.g. lookup concept backfill was never run for this
    row), the linked/target concept no longer exists, or the category (`recordType` vs. the
    concept's `type`) disagrees. None of these are guessed around -- the bundle is cleared rather
    than kept stale.

Current API request/response shapes are unchanged: clients cannot supply `conceptId`/resolution
fields (server-owned only), `PetRecordService`'s `.returning()` calls use an explicit column list
(`PET_RECORD_RETURNING_COLUMNS`) so the five internal columns never leak into a response, and
`LookupTypeService` selects/returns an explicit `LEGACY_LOOKUP_TYPE_COLUMNS` projection (backing
`LookupTypeData = Omit<PetRecordType, 'conceptId'>`) so the same holds for `pet_record_types`
reads and mutation returns -- an unrestricted `db.select()`/`.returning()` would otherwise pick up
`concept_id` automatically the moment the column existed. The canonical concept fields are
intentionally introduced through the future Phase 2 catalog API instead of surfacing here.

### Backfill for existing `pet_records`

`scripts/backfill-pet-record-concepts.ts` -- separate from the Phase 1A-L lookup backfill, dry-run
by default, `--apply` to write, `--batch-size=N` to override the default batch size (500).

**Required order:** migration 0117 applied -> `scripts/backfill-record-type-concepts.ts --apply`
(lookup concepts) reviewed and applied -> this script dry-run -> this script `--apply`. It
detects lookup rows that haven't been concept-backfilled and reports them as unresolved; it does
not create concepts or repair lookup links itself.

Scans via a bounded uuid-keyset cursor (`WHERE id > :cursor AND id <= :startupUpperBoundId ORDER
BY id LIMIT :batchSize`, never `OFFSET`), against a stable upper bound that is the greatest
`pet_records.id` present at startup (captured once via `ORDER BY id DESC LIMIT 1`) -- every row
that existed at startup has an id `<=` that bound, since ids never change after insert. An earlier
version used `max(created_at)` captured once at startup instead; that was rejected because
Postgres `timestamptz` retains microsecond precision while the JS `Date` round-trip through the
driver truncates to milliseconds, so a row landing between the true max and its
millisecond-truncated value failed `created_at <= bound` and was silently skipped (observed on
staging: 60 scanned instead of 61). ids never round-trip through any lossy JS numeric/date type,
so this can't recur. Records inserted concurrently during the run land at essentially-random ids
(`pet_records.id` is `defaultRandom()`, not time-ordered) and already receive a snapshot from the
live write path regardless of whether their id happens to fall above or below the startup bound --
the `WHERE concept_id IS NULL` guard on every UPDATE means a concurrent insert is simply a no-op
for this run either way. Each batch applies in its own transaction (a failure rolls back only that
batch); that same `WHERE concept_id IS NULL` guard is also what makes reruns idempotent and
resumable. Soft-deleted records are scanned and classified like any other row (so a future restore
doesn't revive an unclassified record) -- `deleted_at` itself is never touched, and neither is
`typeId`, `recordType`, `metadata`, notes, images, `helperLabel`, `createdInChatId`, `created_at`,
`updated_at`, or record IDs. (`updated_at` needs explicit care: it carries Drizzle's
`$onUpdate(() => new Date())`, which Drizzle's update builder auto-includes in `SET` whenever it's
omitted -- the writer sets it to `sql\`${petRecords.updatedAt}\``, a self-referencing no-op, so
historical rows this backfill touches don't have their `updated_at` silently bumped to "now".)

Pure planning (`src/db/concepts/recordConceptBackfillPlan.ts`, `planRecordConceptBackfillBatch`)
uses the exact same `resolveRecordConcept` rules as the live write path. The report breaks
unresolved rows into `lookup_missing`, `lookup_concept_null`, `target_concept_missing`, and
`category_mismatch`, plus resolved-via-lookup-type vs. resolved-via-override counts, batch
count, and resolution version -- dry-run output states explicitly that no writes were made.

### Out of scope for Phase 1B

Localized concept read APIs, admin concept/translation CRUD, frontend changes, analytics queries
consuming `conceptId`, vet-sharing filtering, LLM catalog reads by concept key, record-origin
normalization (owner/helper/chat is a separate concern from resolution *source*), and per-pet
customization all remain future phases.

## Localized record display projection (Phase 2.3A, additive)

Adds a localized, additive `display` object to the six owner-facing pet-record response paths:

- `POST /api/pets/:petId/records`
- `POST /api/pets/bulk-records`
- `GET /api/pets/:petId/records`
- `GET /api/timeline/records`
- `GET /api/records/:id`
- `PATCH /api/records/:id`

All existing response fields, including the legacy `typeInfo` projection, are unchanged --
`display` is added alongside them, never in place of them. Implementation lives under
`src/services/petRecordDisplay/` (`resolution.ts` -- pure resolution rules, `loader.ts` --
batched data access, `index.ts` -- public entrypoints, `dataSource.ts` -- real DB-backed batch
queries), consumed by `PetRecordService` in `src/services/petRecordServices.ts`.

### Response shape

```typescript
interface PetRecordDisplay {
  conceptId: string | null;
  key: string | null;
  type: "activity" | "symptom" | "vet_visit" | "medication";
  label: string;
  description: string | null;
  iconUrl: string | null;
  requestedLocale: "th" | "en";
  resolvedLocale: "th" | "en";
  usedFallback: boolean;
}
```

- **`conceptId`** is the record's immutable snapshot `pet_records.concept_id` (see "Record-level
  concept snapshot" above) -- the write-time/last-metadata-edit identity, not a live re-lookup
  through the record's `typeId`. Preserved even when it can't be resolved to a usable concept
  (e.g. the concept was since deleted).
- **`key`** is the matched concept's stable `key` (`activity.feeding`, ...), or `null` when the
  snapshot is absent or can't be resolved.
- **`requestedLocale`** is the resolved input locale (`?lang=` query param, else
  `Accept-Language`, else `th`); **`resolvedLocale`** is the locale the returned `label`/
  `description` actually came from -- they diverge whenever a fallback tier below the first one
  fires. **`usedFallback`** is `true` whenever anything below tier 1 (exact concept + requested
  locale) supplied the label, so a client can distinguish "fully localized" from "fell back."

### Locale resolution and label fallback

`?lang=` accepts only `"th"` or `"en"` (`recordDisplayLangQuerySchema`, `src/constants/`); an
explicit unsupported value (e.g. `?lang=fr`) returns the standard 400 validation envelope rather
than silently falling back -- this is a deliberate, accepted behavior change on these
already-deployed routes (previously an unrecognized `lang` was likely ignored). No `?lang=` falls
through to `Accept-Language`, then to `th`.

Label/description resolve through a five-tier fallback chain, evaluated per record
(`resolveLabel` in `resolution.ts`):

1. The matched snapshot concept's translation in the **requested locale**.
2. The matched concept's **English** translation (skipped when the requested locale is already
   `en` -- tier 1 already covers it).
3. The record's legacy `typeId` lookup's name in the **requested language**.
4. The legacy lookup's name in the **other language**.
5. A generic per-category label (`"Activity"`/`"ชีวิตประจำวัน"`, `"Symptom"`/`"อาการป่วย"`,
   `"Vet visit"`/`"ไปหาหมอ"`, `"Medication"`/`"ยา"`) -- always available, so `label` is never
   empty.

A translation or legacy-lookup row's name and description are always used as one unit --
description is never cross-filled from a different tier or locale than the label that was
selected.

### Snapshot identity, inactive concepts, and orphaned records

The snapshot `conceptId` is looked up against the *current* concepts table at read time (concepts
themselves are never versioned), but is never re-derived from the record's `typeId` -- an admin
remapping a lookup's `concept_id` after the fact does not retroactively change what a historical
record displays. A concept is matched only when it exists, its `type` matches the record's
`recordType`, and its `key` is non-blank; **`isActive` is not part of matching** -- inactive/
archived concepts remain fully readable in `display`, consistent with the existing
"deactivation only blocks new writes" rule for lookup types.

A record whose snapshot can't be resolved to a usable concept (missing, deleted, category
mismatch, or a malformed blank key) is treated as unmatched: `key` is `null`, resolution falls
through to the legacy-lookup tiers and then the generic label, `usedFallback` is `true`. The
snapshot `conceptId` value itself is still preserved on the response even when unmatched.

### Icon resolution

`resolveIconUrl` in `resolution.ts` picks `iconUrl` with the following precedence, given the
record's owning pet's species:

1. An **active** current `pet_record_types` variant linked to the matched concept, matching the
   record's category: an exact-species variant is selected over a universal (`species: null`)
   variant outright, even if the exact variant's icon is blank/null. If more than one variant
   would tie at the same precedence level (ambiguous), none is selected and resolution falls
   through to tier 2. Selecting a variant and *using* its icon are separate steps: a
   selected-but-blank-icon variant is never allowed to fall back to a sibling variant's icon
   (e.g. universal's, when exact was selected) -- it falls through to tier 2 instead.
2. The record's own legacy `typeId` lookup's icon, even if that lookup row is inactive.
3. `null`.

### Presentation batching and operational failure propagation

Every one of the six paths loads presentation data (matched concepts, translations, legacy
lookups, current variants) in a **bounded number of queries independent of record count** --
one batch covers a single record or a full bulk-create/list/timeline page alike. Read paths use
the combined `enrichRecordsWithDisplay` (fetch + resolve in one step, via `loadRecordDisplays`);
write paths split fetch (`prefetchRecordDisplayData`, async/failable) from resolve
(`resolveRecordDisplaysFromBatch`/`resolveRecordDisplays`, pure/infallible) so the fetch can run
before the mutation -- see below.

An operational failure loading presentation data (a DB/connection error, not a data-shape issue)
propagates as a normal error to the route's existing error handling on every path -- it is never
swallowed into a misleading successful response or downgraded to a generic/placeholder `display`.

### Write-path atomicity: prefetch before mutate

`createRecord`, `bulkCreateRecords`, and `updateRecord` **prefetch the presentation batch before
performing their mutation** (outside the `FOR UPDATE` transaction, so the lock window stays
short), then resolve the final `display` object afterward using the mutation's real output (the
new record's id, and for `updateRecord`, the post-write resolved `conceptId` when metadata
re-resolution remapped it). If the prefetch fails, the mutation never runs: a failed presentation
lookup rejects the call and leaves **zero rows inserted** (create/bulk-create) or the **existing
row completely unchanged** (update) -- a client retry after a 500 can never produce a duplicate
or a partially-applied edit. `bulkCreateRecords` prefetches once for the whole batch, since every
inserted row shares the same `(recordType, conceptId, typeId)`.

### Compatibility

Existing fields and the legacy `typeInfo` projection are unchanged on every path; `display` is
purely additive. `conceptId` continues to never be accepted as client input -- `createPetRecordSchema`
and `updatePetRecordSchema` do not include it, matching the existing "server-owned only" rule for
the concept-snapshot columns (see "Write and update integration" above).

### Out of scope for Phase 2.3A

Chat auto-commit, vet-sharing routes, analytics, and admin routes remain deferred. Helper-link
routes were added in Phase 2.3C, below; frontend consumption of `display` for owner-facing routes
shipped in Phase 2.3B (`pawjai-fe`), and for helper routes in Phase 2.3C (`pawjai-fe`).

## Localized record display on helper-link routes (Phase 2.3C, additive)

Extends the Phase 2.3A `display` projection to the unauthenticated helper-link endpoints
(`src/routes/helper.ts`), which were out of scope for 2.3A:

- `GET /api/helper/*` (history list) -- each entry in `logs[]` gains a `display` object.
- `POST /api/helper/*/logs` (create) -- the created record's response gains a `display` object.

Both routes reuse `enrichRecordsWithDisplay` / `prefetchRecordDisplayData` /
`resolveRecordDisplays` from `src/services/petRecordDisplay/` exactly as
`PetRecordService` does for the owner-facing routes -- no parallel implementation. Existing
response fields, including legacy `type.nameEn` / `type.nameTh` / `type.iconUrl`, are unchanged;
`display` is additive only. The PUT (update) and DELETE routes were not touched -- neither
returns type/display data today (PUT returns `{id, note, updatedAt}`; DELETE returns nothing).

### Locale resolution differs from the owner-facing chain

Owner-facing routes (Phase 2.3A) resolve locale as `?lang=` -> `Accept-Language` -> `'th'`,
because the requester and the record owner are always the same authenticated person.

Helper links are accessed by an unauthenticated third party (family member, sitter) who has no
account, no session, and no stored language preference of their own. The chain adds one more
tier before the hard default, so it becomes:

**`?lang=` -> `Accept-Language` -> the pet owner's `userConfig.preferredLanguage` -> `'th'`.**

This is a deliberate divergence, not an oversight: the owner's stored preference is the best
available signal for what language a helper should see, since a stranger's browser locale is a
weaker signal than the account owner's own explicit setting. `resolveHelperDisplayLocale` in
`src/routes/helper.ts` implements this chain; `ownerId` is already present in every verified
helper JWT payload, so resolving it costs one additional indexed `userConfig` lookup per
request (both routes already fetch pet/owner data, so this is a small incremental cost, not a
new query pattern). Do not simplify this back to the 2.3A three-tier chain -- the owner-preference
tier is required behavior, confirmed and approved during Phase 2.3C review.

### Helper subtype picker: intentionally not localized yet

The frontend helper page's subtype picker (record-type selection when creating a log) is a
separate data source from the per-record `display` projection covered above: it lists
*available* types for a species (`GET /api/lookup-types/activity/all-species`, legacy
`nameEn`/`nameTh` only), not a property of an existing record. Phase 2.3C's per-record `display`
cannot localize it.

A public, localized, concept-aware replacement already exists and needs no new backend work:
`GET /api/pet-record-concepts/catalog` (`src/routes/petRecordConcepts.ts`, unauthenticated).
It is deliberately not wired into the helper picker yet -- see `pawjai-fe/docs/technical/PET_RECORD_DISPLAY.md`
for why, and do not build a second, bespoke catalog integration for the helper page in the
meantime; it would be discarded once `NEXT_PUBLIC_PET_RECORD_CONCEPT_CATALOG_ENABLED` rolls out.

## Catalog content rollout (Phase 2.4, additive)

Adds two new concepts to the registry, repairs a live catalog drift, and fixes an icon bug --
content changes only, no schema/migration, no route changes.

### New concepts

- **`activity.drinking`** -- "Drinking" / "ดื่มน้ำ". Dog and cat variants, `metadata:
  { supportsAmount: true }` (same shape as feeding/urination/bowel movement), `isVetVisible:
  true` (same clinical class: hydration matters for sick, disabled, recovering, and elderly
  pets). Sorted immediately after `activity.feeding`; every activity concept from
  `activity.urination` onward shifted `sortOrder` by one to make room, preserving their relative
  order.
- **`symptom.breathing_change`** -- "Breathing change" / "หายใจต่างจากปกติ". Dog and cat
  variants, `metadata: { supportsSeverity: true, supportsFrequency: false }` (continuous-state
  shape, matching `symptom.lethargy`), `isVetVisible: true`. Sorted immediately before
  `symptom.coughing`; `symptom.coughing` through `symptom.excessive_scratching_grooming` shifted
  `sortOrder` by one. Deliberately kept separate from `symptom.coughing` /
  `symptom.coughing_sneezing` -- a breathing-pattern change (faster, slower, noisier, harder) is
  not the same clinical observation as a coughing/sneezing action, and merging distinct
  respiratory symptoms would damage subtype analytics (same reasoning that already keeps
  `symptom.coughing` and `symptom.coughing_sneezing` apart -- see "Canonical concepts" above).
  `symptom.coughing_sneezing` itself gets no new variants in this phase; its live-catalog
  absence and overlap with `symptom.coughing` remain an open, separate decision.
- **`symptom.mobility_change` was evaluated and explicitly rejected for this phase** -- it
  overlaps `symptom.lethargy`'s existing description ("reluctance to move/play"). Revisit only
  alongside a scoped clinical-wording pass that tightens `symptom.lethargy` to mean low
  energy/alertness and a prospective `mobility_change` to mean limping, stiffness, or difficulty
  standing/walking. Do not add it without that disambiguation.

### Live-drift repairs

- **Cat `activity.scratching` parity**: staging has an active cat variant for
  `activity.scratching` under id `bd60ec20-bce5-49c9-9128-7625db26bde2`, confirmed against the
  public staging catalog (`GET /api/pet-record-concepts/catalog?species=cat`) by the immutable
  concept key -- production lacks it. This id is now a fixed constant
  (`CATALOG_CONTENT_FIXED_IDS.scratchingVariantCat` in `catalogContentPlan.ts`), the same way the
  two brand-new concepts' ids are, rather than an operator-supplied flag: applying the plan to
  staging is expected to be a no-op (the row already exists under that id); applying it to
  production creates the missing row under that SAME id, converging both environments. If a
  correctly-linked active cat variant already exists in an environment under a *different* id,
  this is still a no-op there (existing content is never touched). If the fixed id is ever already
  occupied in the target environment by an unrelated row (different concept/species), or if an
  *inactive* cat `activity.scratching` variant already exists, `planCatalogContent` fails closed --
  see "Idempotency and failure rules" below for what failing closed actually blocks.
- **`vet_visit.routine_checkup` dog icon**: the dog variant currently points at
  `Vet-visit/follow-up.webp` (borrowed from `vet_visit.follow_up`) instead of its own artwork.
  Fixed to `https://pawjai.b-cdn.net/WebAssets/Lookups/Vet-visit/routine-checkup.webp`. Selected
  by concept id + species (`vet_visit.routine_checkup`, `dog`), **never by translated label** --
  the fix targets the linked row directly, so it can't accidentally match a same-named row in
  another environment or a future re-translation. The `vet_visit.follow_up` variant is untouched.
  The apply step guards this UPDATE on the DB still holding the EXACT icon value observed at plan
  time (not merely "different from the new value") -- a concurrent, deliberate icon change between
  planning and apply aborts the whole apply rather than being silently overwritten.

### Deferred: shared-icon standardization

Several concepts meant to share identical artwork across dog/cat (`activity.rest`,
`activity.play`, and multiple `symptom.*` concepts) currently use different per-species artwork.
**This phase does not standardize those icons.** Fixing them requires reviewed, neutral
(non-species-specific) artwork that does not yet exist -- do not reuse one species' existing icon
for the other as a stand-in fix. Species-specific concepts (`activity.walk`, `activity.training`,
`activity.enrichment`, `activity.scratching`) correctly keep species-specific icons and are
unaffected by this deferral.

### Rollout script

`scripts/rollout-catalog-content.ts` -- dry-run by default, `--apply` to write. `--apply` is bound
to a specific, separately reviewed dry-run by a fingerprint -- see "Apply is bound to the reviewed
dry-run" below:

```bash
bun run scripts/rollout-catalog-content.ts            # dry run -- prints the plan AND
                                                        # "Reviewed plan fingerprint: sha256:<hex>"
bun run scripts/rollout-catalog-content.ts --apply \
  --expected-plan-fingerprint=sha256:<hex from the dry-run above>   # write
```

Deliberately a new, focused module (`src/db/concepts/catalogContentPlan.ts` for pure planning,
`src/db/concepts/applyCatalogContentPlan.ts` for the transactional writer) rather than an
extension of `scripts/upsert-lookup-types.ts`. That script matches existing rows by `(type,
species, nameEn, nameTh)` -- changing `nameTh` there changes the match key and inserts a
duplicate row instead of updating one, which is exactly the kind of drift this phase is fixing,
not a pattern to build on. **Do not add this phase's new content through
`upsert-lookup-types.ts`.**

**Architecture invariant this rollout upholds** (not new for Phase 2.4 -- restated here because
this module is where it is most load-bearing): `conceptId` and the immutable concept `key` are
the only identity a concept or variant is ever resolved, matched, or deduplicated by. Translation
rows (`name`, `description` per locale) are localized *display* data, never identity. Variant rows
still carry legacy `nameEn`/`nameTh` fields for older-client compatibility, and this rollout
validates their *content* matches the registry exactly (see below) -- but it never uses them to
look up, group, deduplicate, or decide whether a variant already exists; that resolution is always
by `conceptId` + `species`. A translation edit can therefore never create, relink, or duplicate a
variant. English and Thai remain the only enabled locales; this phase does not add a third.

Idempotency and failure rules:

- Resolves existing content by **`(concept key, species)`** via `pet_record_types.concept_id` --
  never by `nameTh`, and never by translated label.
- Every insert (concept, translation, variant) is planned only when the corresponding row is
  absent; every update (icon fix, sortOrder fix) is planned only when the live value still
  disagrees with the target. A second dry-run against post-apply state reports zero planned
  writes across all five categories (concepts, translations, variants, icon fixes, sortOrder
  fixes).
- **Never relinks** an already-linked variant to a different concept.
- **Never reactivates or duplicates** an existing *inactive* (soft-deleted) variant for a
  `(concept, species)` pair this rollout would otherwise create fresh -- that state is fails
  closed instead, since reactivating a soft-deleted row is a decision for a human, not something
  this rollout does silently.
- **An existing active variant is validated by content, not just presence.** When a `(concept,
  species)` pair this plan would create already has exactly one active variant, its `id`, `nameEn`,
  `nameTh`, and `metadata` must ALL match what this plan expects (metadata compared by deep-equal,
  key-order-independent) or the plan fails closed -- "a row exists" is not the same as "the correct
  row exists," and this rollout never silently updates, relinks, or accepts a near-miss.
- **Fixed concept ids are validated before planning.** If a concept key this rollout owns already
  exists under a *different* id than its fixed constant, or a fixed concept id is already occupied
  by a *different* concept key, or an existing concept's `isVetVisible` disagrees with the
  registry, the plan fails closed. (`sortOrder` drift alone is not an error -- that is the
  sortOrder-fix repair path, described below.)
- **Existing translations must match the registry exactly.** Locale *presence* alone is not
  enough -- an existing `name`/`description` that disagrees with the registry's reviewed wording
  fails the plan closed rather than being silently left as-is or overwritten. (`description:
  undefined` in the registry and `description: null` in the DB are treated as equal, not a
  mismatch.)
- **Fails closed**, and refuses to apply the ENTIRE plan (see the paragraph below -- this is not
  a per-item failure), when: a concept key this rollout owns already exists with a different
  `type` than the registry defines; an active variant already exists for a `(concept, species)`
  pair this rollout would otherwise create (duplicate-variant protection, since the customer
  catalog route itself fails closed with a 500 on that condition -- see "Multiple variants at the
  same precedence" above); an inactive-only variant already exists for a `(concept, species)`
  pair this rollout would otherwise create; or a fixed id this rollout would insert under is
  already occupied by an unrelated row (checked globally across every fixed id this rollout uses,
  not just the scratching-parity one).
- **IMPORTANT -- any single entry in the plan's error list blocks applying the WHOLE plan, not
  just the one item that failed.** `applyCatalogContentPlan` checks the error list once, up
  front, and refuses to run at all if it's non-empty -- there is no per-item apply-the-rest mode.
  A plan that would otherwise create two valid new concepts but also contains one scratching-
  parity error applies NOTHING until that error is resolved.
- **Apply is bound to the reviewed dry-run by a SHA-256 fingerprint -- the caller-supplied plan
  object's own content is never trusted or compared structurally; only the fingerprint is.**
  `catalogContentPlanFingerprint` (`catalogContentPlan.ts`) computes a deterministic
  `sha256:<hex>` over the plan's **canonical form**: every one of the five planned-write lists
  (`conceptsToCreate`, `translationsToCreate`, `variantsToCreate`, `variantIconFixes`,
  `conceptSortOrderFixes`) plus `errors`, each list independently sorted by a stable key so
  incidental DB read order never affects the result, then every object's keys recursively sorted
  at every nesting level (including inside `variantsToCreate[].metadata`) -- array element order
  itself is always preserved, since array order is semantically meaningful within a `metadata`
  value. Two structurally identical plans (any list order, any nested key order) always fingerprint
  identically; any semantic difference -- a different planned write, a different error, a different
  nested metadata value -- always fingerprints differently.

  The dry-run prints this fingerprint as `Reviewed plan fingerprint: sha256:<hex>`. **An `--apply`
  invocation never prints this line** -- only a dry-run does. This is deliberate: printed output
  from `--apply` is diagnostic only and must never be treated as, or usable as, human approval
  (there is nothing in it to copy into a retry). `--apply` REQUIRES
  `--expected-plan-fingerprint=sha256:<hex>`, copied verbatim from a dry-run reviewed separately
  and earlier. `applyCatalogContentPlan(reviewedPlan, expectedFingerprint)` takes
  `expectedFingerprint` as a REQUIRED parameter (not optional) specifically so no caller can
  silently skip the binding by omitting an argument.

  The fingerprint is checked THREE times, any one of which can abort with zero writes and a
  non-zero exit code:
  1. **CLI gate** (`resolveApplyGate`, before any DB read for the apply path itself) -- a missing
     or malformed `--expected-plan-fingerprint` flag blocks immediately. This runs BEFORE the
     empty-plan ("nothing to do") check, so a stale or wrong fingerprint always exits non-zero even
     if the live DB happens to already be fully rolled out -- it is never silently downgraded to a
     0-exit no-op.
  2. **Pre-lock check**, inside `applyCatalogContentPlan`, before any lock is acquired: a fresh,
     unlocked read of current state is re-planned and re-fingerprinted; a mismatch against
     `expectedFingerprint` aborts immediately, before touching a lock at all.
  3. **Locked check**, inside `applyCatalogContentPlan`, after the table locks below are held:
     state is loaded again (via the same `loadCatalogContentState` helper the CLI's dry-run and the
     pre-lock check both use, so every read uses an identical column set), re-planned, and
     re-fingerprinted. This closes the remaining window between the pre-lock read and the locks
     actually being granted -- `READ COMMITTED` means the pre-lock read cannot see an in-flight,
     not-yet-committed writer that commits in between. Any mismatch here aborts too, with zero
     writes.

  Before any read, `applyCatalogContentPlan` takes
  `LOCK TABLE pet_record_type_concepts IN SHARE ROW EXCLUSIVE MODE`, then
  `LOCK TABLE pet_record_type_concept_translations IN SHARE ROW EXCLUSIVE MODE`, then
  `LOCK TABLE pet_record_types IN SHARE ROW EXCLUSIVE MODE` -- all three content tables, in that
  fixed order, as the FIRST thing the transaction does. `SHARE ROW EXCLUSIVE` is the least
  restrictive PostgreSQL mode that still blocks any concurrent `INSERT`/`UPDATE`/`DELETE` on any
  of the three tables (including a writer that inserts a `pet_record_types` row without ever
  touching a concept row, or a writer that only touches translations) while continuing to permit
  `SELECT` -- readers, including the public catalog route, are never blocked by a rollout apply.
  `SHARE ROW EXCLUSIVE` also self-conflicts, so two overlapping rollout runs serialize against
  each other rather than racing.

  Only after BOTH fingerprint checks pass does the apply write anything, and it writes the LOCKED
  plan (recomputed under lock, not the caller-supplied one), in the SAME transaction that holds the
  locks -- never a nested transaction. The per-entry preconditions from round 2 (no active variant
  yet, fixed id still free, an existing translation's content still matches exactly, icon/sortOrder
  still at the exact previously-observed value) are still checked immediately before each write.
  With the locks held before the authoritative read, nothing can change between that read and these
  rechecks, so they are now defense-in-depth beneath the two fingerprint checks rather than the
  primary mechanism -- kept because they're cheap, correct, and produce a more specific error than
  a fingerprint mismatch would on their own.

  Note: the pre-lock read (step 2 above) issues its three SELECTs outside any transaction, so a
  writer interleaving between them could in principle produce a torn snapshot. This can only cause
  a spurious *abort* (a false mismatch, safe), never a spurious *accept* -- the locked read (step 3)
  is atomic under all three locks and is the actual backstop the apply's correctness depends on.

  Proven against a genuinely independent second DB connection (not just a second sequential write
  on the same connection) for both `pet_record_types` and
  `pet_record_type_concept_translations` in `src/__tests__/integration/catalog-content-rollout.test.ts`
  -- including tests that mutation-verify the pre-lock fingerprint check and the locked fingerprint
  check are each independently load-bearing (temporarily disabling each one confirms the
  corresponding tests fail for the right reason, not by timing coincidence, then both are
  reverted and re-verified green).
- The apply step runs inside a single DB transaction; a failure partway through (including any
  stale-plan abort above) rolls back everything, never a partial write.
- Never deletes rows. Never touches `pet_records`. Never prints database connection details --
  only concept keys, ids, and planned field values.
- All fixed-id content this rollout creates -- the two new concepts, their dog/cat variants, and
  the cat `activity.scratching` parity row -- uses hardcoded UUIDv4 constants declared in
  `catalogContentPlan.ts`, matching the existing `activityMetadataSeeds.ts` / `symptomSeeds.ts`
  convention, so the same row gets the same id in every environment this plan is applied to. The
  scratching parity id's provenance is Codex-attested from the public staging catalog by immutable
  concept key -- not independently re-verifiable from this repo, which has no live HTTP/DB access
  -- see "Live-drift repairs" above.

### Rollout sequence

**dry-run -> review plan and fingerprint -> apply using that exact fingerprint -> rerun dry-run and
confirm zero pending writes.**

1. Dry-run against staging; review the printed plan line by line, AND its
   `Reviewed plan fingerprint: sha256:<hex>` line -- this fingerprint is what step 2 must pass back
   verbatim.
2. `--apply --expected-plan-fingerprint=sha256:<hex from step 1>` against staging. If the flag is
   missing, malformed, or no longer matches staging's current state, the apply refuses with zero
   writes and a non-zero exit -- see "Apply is bound to the reviewed dry-run" above for the three
   checks this can fail at.
3. Immediately re-run dry-run and confirm it reports zero planned writes across every category
   (proves idempotency held), and note its (new) fingerprint for reference.
4. Verify the public catalog route (`GET /api/pet-record-concepts/catalog`) for dog/cat x en/th
   on staging, and confirm the exact live concept ordering matches the registry's canonical
   `sortOrder` sequence.
5. Only after staging is verified, repeat the full sequence (dry-run -> review plan and
   fingerprint -> `--apply` with that fingerprint -> re-verify) against production, independently --
   production's fingerprint will differ from staging's and must be captured fresh from a production
   dry-run, never reused from staging.
6. `scripts/sync-symptom-ids.ts`'s icon-erasure hazard is fixed as part of this phase (its
   `onConflictDoUpdate` no longer writes `iconUrl`, matching `sync-activity-metadata.ts`'s
   icon-safe pattern) -- but that script still is not part of this rollout and should not be run
   as a substitute for it.
7. If `--apply` refuses with a fingerprint-mismatch message (pre-lock or locked), something in the
   target environment changed between the reviewed dry-run and the apply attempt -- no writes were
   made. Do not retry blindly, and never copy a fingerprint printed by an `--apply` invocation
   itself (it never prints one -- see above): re-run a fresh dry-run, review the new plan and its
   new fingerprint (it may differ from what was originally reviewed), and only then re-apply. The
   CLI exits non-zero in this case, same as any other plan-error or apply-failure outcome.

### Out of scope for Phase 2.4

`symptom.mobility_change`, shared-icon standardization art, Thai canonical-translation
corrections (a separate, already-tracked work item), Quick Log grouping/UI behavior, and any
frontend change are all explicitly deferred -- this phase is backend content only.

## Migration

The migration automatically:
1. Creates the unified `pet_record_types` table
2. Migrates data from old tables (activity_types, symptom_types, vet_visit_types, medication_types)
3. Drops the old tables

To run the migration:

```bash
bun run db:migrate
```

## Analytics Tracking

User activity tracking is maintained through `pet_records` table:
- Each pet record references a `type_id` from `pet_record_types`
- Analytics can query `pet_records` grouped by `type_id` to see what activities users log
- The `record_type` field allows filtering by category (activity vs symptom vs vet_visit vs medication)

## Benefits

1. **Simplified Schema** - One table instead of four
2. **Easier Maintenance** - Single upsert script for all lookup types
3. **Cleaner Code** - Unified service methods, less duplication
4. **Better Performance** - Fewer joins, simpler queries
5. **Centralized Logic** - All lookup management in one place
