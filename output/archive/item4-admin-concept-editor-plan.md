# Roadmap item 4 — Admin concept editor — design plan (v1)

**Date:** 2026-08-16
**Decided by:** user (scope + access), orchestrator (design)
**Goal (roadmap):** manage concepts / translations / species variants without a deployment per content change.
**Decided scope:** **edit-only v1** (no concept creation — that stays in the code-reviewed rollout planners). **Mutations are super_admin only**; reads all-admin.

---

## What exists already (verified against `origin/staging` 2026-08-16)

- `pet_record_type_concepts` (`src/db/schema/pets.ts:160-195`): `key` (immutable semantic key, unique), `type` (enum, FK-composite-locked to lookups), `fieldSchema` (reserved, unused), `metadataSchemaVersion`, `isVetVisible`, `sortOrder`, `isActive`, and **`createdBy`/`updatedBy` already referencing `admins`** — the table was built for this editor.
- `pet_record_type_concept_translations` (`:197+`): per-concept `(lower(locale))`-unique rows, `name` + `description`, same admin audit columns.
- Species variants are `pet_record_types` lookup rows (species + `conceptId`); admin CRUD for lookups already exists at `src/routes/admin/lookupTypes.ts` (GET/POST/PUT/PATCH pattern to copy).
- `requireAdmin` middleware (`src/middleware/adminAuth.ts`); super_admin gating precedent in `src/routes/admin/settings-audit.ts`; an existing admin audit-log mechanism.
- Catalog freshness is a **content hash** (`catalogVersion.ts`) computed per request from resolved items — admin edits propagate without any cache-invalidation work. (Worker must verify no additional cache layer sits in front of the catalog route.)
- Item 5 hardening (merged): concept identity of existing records cannot be changed by record edits; only a catalog remap moves resolution. The editor is exactly that legitimate remap surface.

## Safety analysis

- **`isVetVisible` ship gate is structurally satisfied:** editor routes merge to staging after 2.3E's enforcement commit, so any prod release containing the editor necessarily contains enforcement. Rule for the rounds: no cherry-picking the editor into any release.
- 2.3E behavior on flip: a concept flipped to not-vet-visible is withheld from vet shares immediately (live join), surfaced only as a non-specific omission count. Flipping is therefore safe but user-visible — the UI must say so.
- Deactivating (`isActive = false`) a concept with attached records: creates unresolvable records on some paths (fail-closed on vet share). Allowed, but warned.
- Immutable in v1, enforced with 400s: `key`, `type`, `fieldSchema`, `metadataSchemaVersion`. No delete endpoints anywhere (matches "no hard-delete API exists" invariant the resolver relies on).

---

## Phase A — backend (`pawjai-be`), one round of implementation + one commit round

New `src/routes/admin/concepts.ts`, registered in `src/routes/admin/index.ts`. All handlers `requireAdmin`; mutations additionally require `super_admin` (copy the settings-audit gating). Every mutation writes the existing admin audit log and stamps `updatedBy`.

Endpoints (v1):
1. `GET /api/admin/concepts` — list, filterable by `type`/`isActive`/search; each row: concept fields + its translations + counts (linked lookups, attached records). Paginated per `ApiResponses.paginated`.
2. `GET /api/admin/concepts/:id` — single, with translations and linked lookup rows.
3. `PATCH /api/admin/concepts/:id` — mutable fields ONLY: `sortOrder`, `isActive`, `isVetVisible`. Zod `.strict()` so unknown/immutable fields 400 rather than being ignored. Flipping `isVetVisible` or `isActive` on a concept with attached records requires `confirm: true` in the body; the 409-style refusal response carries the affected-record count so the admin UI can show it.
4. `PUT /api/admin/concepts/:id/translations/:locale` — upsert `name`/`description`. Locale validated against supported locales; stored casing per the existing lower(locale) unique-index convention. No translation delete in v1.
5. `PATCH /api/admin/lookup-types/:id/concept` — the remap: point a lookup row at a different concept **of the same `type`** (the composite FK enforces it; surface the violation as a clean 400). Requires `confirm: true` + audit log. This is the one operation that changes future record resolution.

Tests: route-level integration (auth: non-admin 401, non-super mutate 403), immutability 400s, confirm-flag flow with real attached-record counts, translation upsert + case-insensitive locale conflict, remap same-type constraint, audit-log row written per mutation.

Out of scope for Phase A: concept creation, deletion, `fieldSchema`/`metadataSchemaVersion` editing, any migration (none needed — schema already complete), any non-admin route.

## Phase B — admin UI (`pawjai-admin`), after Phase A merges

Next.js app (`app/admin/...`). New section: concept list (grouped by `type`, showing key, active, vet-visible, sort, translation completeness), edit drawer (toggles + sort), translations editor (th/en side by side), lookup-remap flow with the confirm dialog rendering the affected-record count from the API.

Repo rule from memory: **run `bun run build` in pawjai-admin before committing** — it is the type-error gate.

## Phase C — nothing

No feature flag, no staged rollout mechanics: the structural ship gate plus super_admin gating plus audit logging is the whole safety story. Deliberately boring.

---

## Round structure (same protocol as item 5)

- A1: backend implementation + tests, no commit → orchestrator verifies (re-runs suite/tsc/build, reviews diff) → A2 commit → A3 push + PR (each its own authorization).
- B1/B2/B3: same shape in `pawjai-admin` once Phase A is merged to staging.
- Worktrees prepared by the orchestrator per round, branched from `origin/staging` of each repo.

## Explicitly deferred (recorded so v2 scoping starts here)

- Concept creation + new-key validation (v2, after edit-only has proven itself).
- `fieldSchema` editor (blocked on the dynamic-forms design the schema comment defers to).
- Translation deletion.
- Any species-variant *creation* flow beyond what admin lookupTypes already offers.
