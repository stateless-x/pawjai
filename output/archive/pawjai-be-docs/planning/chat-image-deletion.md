# Phase 7: stored-image deletion lifecycle

**Status:** Implemented — see CLAUDE.md "Media uploads" for the shipped API (deleteByUrls, prepareChatImages/uploadPreparedChatImages).
**Parent plan:** `chat-image-reliability.md` Phase 7
**Audited against:** `staging` at b93fb51c

---

## Audit findings

Five paths delete user data without deleting the associated CDN objects. One path already
does it correctly and is the reference pattern for the rest.

**Reference implementation:** `petService.ts:502-509` (`deletePet`). Deletes the CDN object
first inside a try/catch, logs on failure, then proceeds with the DB delete regardless. That
ordering and failure posture is what every gap below should adopt.

`bunnyService.deleteByUrl()` is already safe to call from anywhere: it returns `boolean`,
never throws, and returns `false` for a URL that is not ours. Callers do not need their own
try/catch for correctness, only for logging context.

| # | Path | File | Current state |
|---|---|---|---|
| 1 | Account deletion | `scripts/hard-delete-user.ts` | Deletes 15 tables, zero Bunny calls |
| 2 | Conversation delete | `services/chat/history.service.ts:146` | No image cleanup |
| 3 | Scheduled cleanup job | `services/chat/cleanup.service.ts:83,94` | No image cleanup, inside a locked tx |
| 4 | Single message delete | `services/chat/history.service.ts:174` | No image cleanup |
| 5 | Pet delete, chat images | `services/petService.ts:495` | Deletes pet avatar; leaves that pet's chat photos |

**#1 is the most serious.** A user deletes their account, 15 tables are wiped, and every pet
photo, avatar, and chat image remains fetchable at a public CDN URL. For a Thai pet-health
product this is the clearest PDPA exposure in the codebase.

**#3 is the only structurally hard one.** `cleanupOldMessages` runs inside `db.transaction()`
holding `pg_try_advisory_xact_lock` (`cleanup.service.ts:120-136`), and its deletes are
batched `.delete()` calls with no `.returning()`. URLs must be collected inside the
transaction but the CDN calls must happen after it commits, outside the lock.

**#2 and #4 are trivial.** Both already use `.returning({ id })`; widening that to include
`imageUrls` is a one-line change each.

## Design decisions

**Best-effort delete plus logging.** Not a `pending_deletions` table, not a reconciliation
sweep. Rationale: it matches the existing `deletePet` pattern exactly, needs no migration and
no worker, and covers the privacy case immediately. A durable retry queue is a real
improvement but it is a separate piece of infrastructure and should not gate closing a privacy
gap that is open today.

**Deliberately deferred:** a reconciliation sweep that lists Bunny objects and compares them
against the DB. That is the only thing that cleans up orphans already accumulated from every
deletion that has happened so far. Worth doing, separable, not urgent. Note it explicitly so
it is not mistaken for covered.

**A failed CDN delete must never block or fail the user's DB deletion.** In every path.

## Shared helper

Add to `src/utils/bunny.ts`:

```
deleteByUrls(imageUrls: Array<string | null | undefined>): Promise<{ deleted: number; failed: number }>
```

Flattens, filters null/empty, de-duplicates, calls `deleteByUrl` per URL via
`Promise.allSettled`, returns counts. Never throws. All five call sites use this rather than
looping `deleteByUrl` themselves.

De-duplication matters: `imageUrls` is an array column, and a single delete can span many rows.

## Implementation per path

### 2 and 4 -- conversation and single-message delete (easiest, do first)

`services/chat/history.service.ts`.

- `deleteConversation`: change `.returning({ id })` to also return `imageUrls`. After the
  delete resolves, collect all `imageUrls` arrays and pass to `deleteByUrls`. Log the counts.
- `deleteMessage`: same change on its `.returning()`.

Both already run outside any transaction, so the CDN calls can follow the delete directly.

### 5 -- pet delete cascades to that pet's chat images

`services/petService.ts` `deletePet`.

Before deleting the pet row, SELECT `imageUrls` from `petChatMessages` where `petId` matches,
and pass them to `deleteByUrls` alongside the existing avatar delete. Note the pet's chat
messages are removed by the `onDelete: 'cascade'` FK, so the rows disappear without an explicit
delete -- which is exactly why the images are currently missed.

### 1 -- account deletion (highest severity)

`scripts/hard-delete-user.ts`.

Before the table deletions begin, collect every CDN URL belonging to the user:
- `petChatMessages.imageUrls` where `userId` matches (array column, flatten)
- `pets.imageUrl` for all the user's pets
- `userProfiles.imageUrl` (or whichever column holds the avatar -- confirm the name in the
  schema, do not assume)

Run the existing DB deletions unchanged. **After** they commit, call `deleteByUrls` with the
collected list and log the outcome.

Collect first, delete after: once the rows are gone the URLs are unrecoverable, so the
collection must happen before the deletes and the CDN calls after.

This script is a destructive admin operation. Print a clear summary of how many CDN objects
were deleted and how many failed, in the same style as its existing output.

### 3 -- scheduled cleanup job (hardest)

`services/chat/cleanup.service.ts`.

Inside the transaction, add `.returning({ imageUrls: petChatMessages.imageUrls })` to both
batched deletes and accumulate the URLs in an array in the enclosing scope. Do **not** call
Bunny inside the transaction.

After `db.transaction()` resolves (in `cleanupOldMessages` and `manualCleanup`), call
`deleteByUrls` with the accumulated list. If the transaction rolls back, the array is
discarded and nothing is deleted from the CDN -- which is correct.

Watch the memory profile: `MAX_MESSAGES_PER_RUN` bounds the row count per run, so the URL
array is bounded too. Confirm that bound is still respected and note the max in a comment.

## Tests

`src/__tests__/`, fully mocked, no real DB or network (repo rule). Use `spyOn` on the real
singletons rather than `mock.module` -- `mock.module` is process-global in bun and has caused
cross-file collisions in this repo.

- `deleteByUrls` de-duplicates, skips null/empty, and returns correct counts
- `deleteByUrls` never throws when an individual delete fails
- `deleteConversation` calls the CDN delete with the URLs from the deleted rows
- `deleteConversation` still returns the deleted count when the CDN delete fails
- cleanup job collects URLs inside the transaction and calls Bunny only after it commits
- cleanup job does not call Bunny when the transaction rolls back
- account deletion collects URLs before the DB deletes and calls Bunny after
- pet delete removes both the avatar and that pet's chat images

## Verification

```
bun tsc --noEmit
bun run build:ts
bun run db:validate
bun test src/__tests__
```

Baseline on `staging` is **594 pass / 16 fail**. The 16 are known and pre-existing
(9 offers/pricing, 1 premium-access cache, 5 demographics, 1 helper-token). New tests should
add to the pass count. Any new failure, or any failure in chat/orchestrator/bunny/pet code:
stop and report rather than committing.

No migration. No schema change. No new environment variables.

## Rollback

Every change is additive -- a CDN delete call appended to an existing DB deletion path.
Reverting the commit restores exactly the previous behaviour. No data migration, nothing
destructive to undo.

Note the asymmetry: this feature *deletes* remote objects, so a bug here is not recoverable by
reverting code. That is why every call site passes URLs that came from rows being deleted in
the same operation, and why `deleteByUrl` returns false rather than throwing on a URL it does
not recognise as ours.
