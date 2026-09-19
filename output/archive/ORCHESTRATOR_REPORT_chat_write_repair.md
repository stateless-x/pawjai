# Chat-write repair: state report to orchestrator

**Date:** 2026-08-23
**Scope:** pawjai-be Round 1 + pawjai-fe Round 2 (+ addendum)
**Headline:** All code is merged and on both prod branches. The feature it enables is
**inert in every environment** because its data rollout has not been run anywhere. No
human has browser-verified any of it.

---

## 1. What we set out to fix

Two logging requests could not be written at all:

1. **Cross-species.** The subtype catalogue in the chat prompt was scoped to the transport
   pet's species. On a dog+cat account the model only ever saw one species' type ids, so a
   request about the other pet had no valid id to name, and anything it produced failed
   commit-time species validation with a 400.
2. **Uncatalogued events.** `typeId` was a required tool parameter, so an event with no
   matching catalogue subtype ("went skateboarding", "มีจุดสีม่วงที่ท้อง") could only be
   expressed by the model inventing a UUID, which then failed closed.

On the frontend, the "Other" escape hatch was broken end to end and one adjacent defect
silently corrupted edit state.

---

## 2. What shipped

### Round 1 — pawjai-be (PR #283, commit `141b7a3`)

- **Multi-species catalogue context.** The prompt now carries the subtype catalogue for
  every species the account owns. Each id sits under an explicit species heading;
  species-NULL rows are factored out and listed once. Loaded via a *separate cache key*
  rather than a marker field — a 1h-old cached blob would otherwise deserialize with the
  new field absent and double-print universal rows under both species.
- **Tool contract.** `typeId` optional; new bounded `subtypeText` (200 chars) carries the
  user's own wording. Additive and backward compatible on the persisted blob and the wire.
- **Four universal "Other" concepts** (activity / symptom / vet_visit / medication), one
  species-NULL variant each under fixed UUIDs, added through the sanctioned
  `planCatalogContent` path. No migration — catalogue content is script-applied.
  sortOrders appended at the end of each type's range (13/9/7/5) so no existing concept's
  live sort order is rewritten.
- **One rule set, two callers.** Extracted `classifySubtypeForWrite`, which returns a
  rejection reason instead of throwing; `validateRecordWrite` became a thin throwing
  wrapper over it with byte-identical messages. Emission coerces on the reason, commit
  fails closed on it. No weaker emission-time copy, no exceptions as control flow.
- **Commit hardening.** After the final pet is resolved and authorized: wrong-species
  variant remapped to the same concept's variant for that species; uncatalogued proposal
  carrying `subtypeText` resolves to the universal Other with the wording preserved. A
  fabricated id with no wording is passed through untouched so it still fails closed.

### Round 2 — pawjai-fe (PR #320, commit `0c4c208`)

- **"Other" wired to real rows.** The picker used a client-only `"__other__"` sentinel that
  set `typeId` to null; the commit body then omitted `typeId` and concatenated the free
  text into the note. The backend rejects that outright, so *every Other commit failed*.
  Other now selects the real universal row, identified by fixed UUIDs mirrored in
  `lib/constants/otherSubtypes.ts`.
- **Absent-row fail-safe.** When the universal row is missing from the fetched list, the
  Other option is not offered at all and the existing hint keeps Confirm blocked.
- **Safe pet switching.** An incompatible subtype is cleared so the card asks, rather than
  being silently reclassified as "Other" with an empty text box and a dropped `typeId`.
  Clearing waits for the new species' list to load so it never fires mid-fetch.
- **One Confirm gate.** The inline card required petId+typeId; the modal required petId
  only and could submit doomed commits. Both now call a shared predicate, preserving the
  deliberate asymmetry that an amend needs no `typeId`.
- **`subtypeText` mirror**, i18n'd picker strings (replacing hardcoded locale ternaries
  that bypassed the CI checker), `maxLength=200` on the free-text input.
- **Addendum (orchestrator-decided):** lookup cache `v1`→`v2`, and note fold order flipped
  to match the backend (`user wording: model note`) so truncation at the 500-char cap can
  only drop the model's tail, never the user's words.

---

## 3. Deployment state — verified, not assumed

| Repo | Commit | staging | prod | prod merge |
|---|---|---|---|---|
| pawjai-be | `141b7a3` | YES (`841fd58`) | **YES** (`904d143`) | PR #284 |
| pawjai-fe | `0c4c208` | YES (`6f99c29`) | **YES** (`304ed3b`) | PR #321 |

Both rounds went staging → prod. This is **further than the agreed sequence** — the plan
was merge → staging rollout → browser-verify → promote.

---

## 4. The gap: what is actually live vs inert

**Working right now, no rollout needed** (pure code paths):

- Cross-species logging — a named pet of a different species than the route pet
- Safe pet switching in the edit modal
- The unified Confirm gate
- All Round 1 commit hardening and the shared classifier

**Inert in every environment** — the whole uncatalogued-event path:

`resolveOtherSubtype` returns null because the four universal rows do not exist in any
database. Emission logs a warning, `typeId` stays null, the card renders Edit-only,
Confirm stays blocked. The frontend does not offer Other at all. This is the fail-safe
behaving exactly as designed: no errors, no bad writes, no user-visible breakage. But
"Log that Palo went skateboarding" still cannot be logged.

**The catalogue rollout has not been run anywhere** — not staging, not prod. It is a
separate gated step (`scripts/rollout-catalog-content.ts`).

---

## 5. Verification status

**Automated — strong.**

- pawjai-be: `tsc` / `build:ts` / `db:validate` / full suite (**1762 pass, 0 fail**), all exit 0
- pawjai-fe: `tsc` / `lint` / `test` (**358 pass, 0 fail**) / `i18n:check` / `build`, all exit 0
- 5 backend mutation checks + 3 frontend mutation checks, each confirmed to break a test
  and then restored byte-identically

**Human — none.** No browser pass has been done on any environment. Every one of the six
acceptance scenarios is verified by tests only. Because the code is already on prod, the
next rollout run would make a never-human-verified feature live for real users.

---

## 6. Recommended next steps

1. **Staging rollout first.** Fresh dry run → review *staging's own* fingerprint → `--apply`.
   The fingerprint captured during development (`sha256:548f…79c52`) was computed against
   an empty throwaway DB and is invalid for staging or prod — `planCatalogContent` is a
   function of existing rows, and `--apply` refuses any other fingerprint.
2. **Browser-verify the six scenarios on staging.** This is the step that has never happened.
3. **Then the prod rollout**, same fingerprint discipline, its own dry run.

Deferring the rollout indefinitely is a legitimate option: prod is stable and fail-safe as
deployed. The cost is only that the uncatalogued-event feature stays unavailable.

---

## 7. Open items and risks

- **No human verification of any of this work.** The single largest gap.
- **Gemini empty-STOP is untouched and unverified.** No model config, token limit, thinking
  config, or rate limit was changed. Nothing here provides real-provider evidence about it.
- **Dead card wiring.** `LoggingOfferCard` and `PetPickerCard` have zero import or render
  sites; `bottomActionCard` is set in `useConversationManager` but never read by
  `ChatInterface`. That state is computed and discarded, so the cards cannot render by any
  path. Possibly explains why the 2026-08-21 logging_offer feature is still marked "prod
  pending browser verification". Flagged, deliberately untouched.
- **Note-order trade-off.** Putting the user's wording first protects it from truncation;
  the model's note tail is now what gets dropped past 500 combined chars. Deliberate, and
  the better of the two losses, but the loss moved rather than vanished.
- **Cache v2 is app-wide.** It invalidates every cached lookup bundle, not just chat's, so
  all lookup consumers refetch once. Harmless — but a rollback would leave clients on v2
  keys with no v1 data, and they would simply refetch. Not a cache bug.
- **Pre-existing test-pollution bug fixed** (not introduced by this work):
  `chat-proposal-commit.test.ts` deleted lookup types before the records referencing them,
  so the FK failure was swallowed by a `.catch` and fixture concepts leaked into every
  later suite reading the catalogue.
- **Unrelated, still open:** two secrets flagged for rotation in project memory, including
  a live Supabase `service_role` key. Older than this work, but a genuine prod-readiness item.
- **Parent repo submodule pointers** (`pawjai-be`, `pawjai-fe`) are not yet bumped, and no
  version tag has been cut for this work. Latest tag remains `v1.9.0`.
