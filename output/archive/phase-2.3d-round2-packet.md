# PHASE 2.3D ROUND 2 PACKET: backend implementation (paste to the worker; Round 1 standing rules remain in force)

## Round 1 review verdict: APPROVED

The orchestrator independently verified your investigation against the code:
- Persistence CONFIRMED: `receiptPayloadBase` is written via `chatHistoryService.saveMessage` into `pet_chat_messages.metadata` BEFORE the SSE yield, same code path. `metadata` is untyped `jsonb` with no version field (`src/db/schema/chat.ts:72`), and `history-query.service.ts:154,245` passes it through with zero re-resolution. Your load-bearing finding is correct.
- `createRecord`'s optional `displayLocale` (prefetch-before-insert, ~line 156) confirmed: it already returns a resolved `display` at no extra query cost, and `tryAutoCommit` simply never passes it. Correct.
- `lookupSubtypeName` (~542-549) confirmed as a standalone legacy `nameEn`/`nameTh` query that bypasses the 2.3A machinery entirely.
- Amend path (~584-590) confirmed to return no `subtypeName` at all.
- `SubtypePicker.tsx` confirmed NOT fabricating identity (real `LookupType` ids, merely unlocalized). Your correction to the packet's hint was right.
- Blast radius confirmed display-only: the edit flow refetches via the real `recordId`.

Your Task 2 doc fix is also verified and approved: PR #258 open against `staging`, unmerged. Splitting the one misleading entry into two separate symptoms, and capturing the `.env.apple-renew` path that `env.ts` alone would not reveal, was better than the minimal correction the packet asked for.

## USER DECISIONS (both explicit, these are now the spec)

**Decision 1: RE-LOCALIZE AT READ TIME.** A receipt reopened in a different UI language must show the label in the CURRENT language, not the one frozen at commit time. Rationale: otherwise the chat pane and the timeline disagree about the same record, which reads as a bug.

**Decision 2: READ-PATH REPAIR, NO MIGRATION.** Do NOT write a backfill against `pet_chat_messages.metadata`. Historical receipts get repaired on read, using the real `recordId` they already carry. You correctly noted a name-to-typeId backfill is lossy; that is exactly why we are not doing it. Nothing in this phase writes to existing chat history rows.

## Scope: pawjai-be only. Frontend is Round 3.

Setup: `git fetch origin`, worktree at `/Users/purin/dev/pawjai/pawjai-be-chat-receipt-identity-phase23d`, new branch `phase23d-chat-receipt-identity-staging` off fresh `origin/staging`. Note `origin/staging` has moved since 2.3C (it now includes the 2.3C merge); confirm the SHA you branch from and report it.

1. **Carry real identity in the receipt payload.** Extend `AutoCommitResult` and the receipt payload type to include the real `typeId` and `conceptId`. Get them from the existing `createRecord`/`updateRecord` results by passing the `displayLocale` param that is already supported. Delete `lookupSubtypeName` once nothing uses it.
2. **Keep `subtypeName` populated.** It stays in both the wire type and the stored shape, derived from the resolved display label. This is the fallback that stops historical receipts regressing to a generic category label, exactly as you argued. Never remove it in this phase.
3. **Fix the amend path** so amend receipts carry the same identity fields as create receipts. `updateRecord` supports `displayLocale` the same way; verify that before relying on it. This closes the gap you found.
4. **Weight records:** check whether the weight-record commit path (~600) needs the same treatment or is genuinely identity-free. Report your reasoning; do not force a change that does not apply.
5. **Read path for historical receipts.** This is the Decision-2 half and the most delicate part. When chat history is served, a persisted receipt that lacks `typeId`/`conceptId` (every receipt written before this change) should be re-resolved from its `recordId` so the frontend can localize it. Requirements:
   - Additive and non-destructive: enrich the response only. Never write back to `pet_chat_messages.metadata`.
   - Must degrade gracefully when the underlying record was deleted or is otherwise unresolvable: fall back to the stored `subtypeName`, then to a generic label. A missing record must never error the history request.
   - Watch the query cost: history returns many messages at once, so resolve in a batch, not per message. If a per-message query is the only option, say so and stop rather than shipping an N+1 on a hot path.
   - If you conclude this belongs in the frontend instead (it has `recordId` and could fetch), make that case in the report rather than implementing it unilaterally.
6. **Tests:** cover new-receipt identity (create AND amend), the stored-metadata shape, historical-receipt re-resolution including the deleted-record fallback, and that `subtypeName` is still populated. Run the full backend suite (`bun --env-file=/Users/purin/dev/pawjai/pawjai-be/.env.local run test`) plus `bunx tsc --noEmit` and `bun run build:ts`.

Constraints: no schema changes, no migrations, no writes to existing chat rows. Additive only. No commit this round.

STOP after step 6 and report.

## RETURN TO ORCHESTRATOR

1. Base SHA branched from, and worktree/branch names.
2. Changes: every file, path:line, one line each.
3. The read-path design you chose, why, and its query cost for a typical history page. Include the deleted-record fallback behavior.
4. Weight-record finding from step 4.
5. Tests: suite results before/after, new test names, tsc/build results.
6. Open questions, risks, and proposed Round 3 (frontend) scope.

No commit, no push, no PR. Do not touch the frontend. Stop after this report.
