# PHASE 2.3D ROUND 3 PACKET: backend commit + frontend implementation (paste to the worker; Round 1 standing rules remain in force)

## Round 2 review verdict: APPROVED

The orchestrator independently verified your backend work:
- Branch/base confirmed (`phase23c...` -> `phase23d-chat-receipt-identity-staging` off `f6280af7`), footprint is exactly the 5 files you listed.
- `historical-receipt-resolver.service.ts` read in full and confirmed genuinely batched: one `inArray` query joined to `pets`, one `enrichRecordsWithDisplay` call per page, with early returns when there are no receipts and when no rows come back. Never per-message. This was the packet's main risk and you handled it correctly.
- Non-destructive confirmed: it builds patched copies and returns `messages.map(...)`; there is no `db.update` against `pet_chat_messages` anywhere in the file.
- Deleted/missing-record fallback confirmed: `if (!display || !typeId) continue;` leaves that message's metadata exactly as stored, and the soft-delete filter (`isNull(petRecords.deletedAt)`) means deleted records simply never resolve.
- `lookupSubtypeName` confirmed deleted (only a comment in the new test file references it).
- Amend-path fix verified at the dependency level: `updateRecord`'s 4th parameter really is `displayLocale?: RecordDisplayLocale` (`petRecordServices.ts:700-704`), so deriving `subtypeName` from `display?.label` there is sound.
- Weight-record finding accepted; your reasoning matches the schema.
- Re-ran the gates myself: `tsc --noEmit` 0 errors, full suite **1173 pass / 0 fail** (exactly your 1163 baseline + 9 new tests, zero regressions).

Your scoping decision to leave `src/routes/pet-chat.ts` alone was correct and well-argued.

## USER DECISIONS on your two flagged items

**1. No-locale case: KEEP YOUR IMPLEMENTATION.** When a request carries neither `?lang` nor a readable `Accept-Language`, skip re-resolution and return metadata exactly as stored. Your reasoning was accepted: paying two queries on every history page for a caller that may ignore the result is the wrong default, and `subtypeName` already makes "do nothing" a correct response. This is now the spec; do not change it.

**2. Test depth: ACCEPT AS-IS.** Do not export `tryAutoCommit` and do not build a mocked full-flow test. The new logic is thin wiring over already-tested calls plus a resolver with 7 dedicated tests. Your cost/benefit judgment was right.

## Task 1: Backend commit (EXPLICITLY AUTHORIZED, this round only)

One commit in `/Users/purin/dev/pawjai/pawjai-be-chat-receipt-identity-phase23d` on `phase23d-chat-receipt-identity-staging`. Commit only. No push, no PR yet.

1. Stage EXACTLY these five files by name (never `git add -A`):
   - `src/routes/chat.ts`
   - `src/services/chat/chat-query.service.ts`
   - `src/services/chat/orchestrator.service.ts`
   - `src/services/chat/historical-receipt-resolver.service.ts`
   - `src/__tests__/integration/chat-receipt-identity.test.ts`
2. Commit following repo convention, e.g. `feat(chat): carry real record identity on chat receipts`. Never `--no-verify`; if a hook blocks, stop and report.

## Task 2: Frontend implementation (pawjai-fe)

Setup: `git fetch origin`, worktree at `/Users/purin/dev/pawjai/pawjai-fe-chat-receipt-identity-phase23d`, branch `codex/phase-2-3d-chat-receipt-identity-staging` off fresh `origin/staging`. Report the base SHA. No cross-repo gate is needed this time (the backend change is additive and independent), but confirm 2.3C is present since you will reuse `resolvePetRecordPresentation`.

Implement, additive only:

1. `lib/api/chatService.ts`: extend `ChatStreamReceiptPayload` with optional `typeId?: string` and `display?: PetRecordDisplay`, reusing the existing fe type (do not redefine the shape). Keep `subtypeName?: string`.
2. Pass `?lang=<current UI locale>` on the chat-history fetch. **Without this the entire backend round is inert** -- the server skips enrichment when no locale is supplied. This is the single most important line in this round.
3. `components/chat/proposal/ReceiptCard.tsx`: this is the actual bug fix.
   - Line ~294: stop passing `receipt.subtypeName` as `typeId`. Use the real `receipt.typeId` when present. If it is absent (a historical receipt whose record was deleted, so the backend could not re-resolve it), pass `undefined`/null rather than a name string. Never synthesize an identity from a label again.
   - Lines ~299-306 and ~319-324: stop writing the same string into both `nameEn` and `nameTh`. Use `resolvePetRecordPresentation` with a `display?.label -> subtypeName -> generic category label` fallback chain, the same pattern as 2.3B/2.3C.
   - Check `getDetailLabel` (~262) and any other `subtypeName` reader still behaves.
4. Verify the Edit flow (`handleEdit`, ~91) still works: it refetches the live record by the real `recordId`, so it should be unaffected. Confirm rather than assume.
5. Verification: `bunx tsc --noEmit`, `bun run lint`, `bun run build`. Extend tests only if an existing harness covers these files; do not invent one.

NO frontend commit this round.

## Task 3: Docs

Your investigation found no existing receipt/proposal contract doc in either repo, so this needs a NEW section rather than an additive edit. Keep it short and factual. Document: what the receipt payload now carries, that `subtypeName` is retained as the historical fallback and why, the read-time re-resolution behavior including the no-locale skip and the deleted-record fallback, and that nothing writes back to `pet_chat_messages.metadata`. Put it wherever it best fits each repo's existing docs structure; state your choice in the report. Do not commit docs this round; include them in the frontend diff for review.

STOP after Task 3 and report.

## RETURN TO ORCHESTRATOR

1. Backend commit SHA, `git show --stat`, hook result, clean-tree confirmation.
2. Frontend: base SHA, worktree/branch, every file touched with path:line.
3. Confirmation that the history fetch now sends `?lang=`, and how you obtain the current UI locale there.
4. What `typeId` resolves to for a historical receipt whose record was deleted, and what the card renders in that case.
5. Edit-flow verification result.
6. Docs: where you put them and why.
7. Verification: tsc/lint/build results.
8. Open questions, risks, proposed Round 4 (expect: fe commit, then push + PRs for both repos).

No push, no PR, no merge. Stop after this report.
