# PHASE 2.3D ROUND 4 PACKET: land the phase (paste to the worker; Round 1 standing rules remain in force)

## Round 3 review verdict: APPROVED

Independently verified by the orchestrator:
- Backend commit `a7354bc7624d2fb5031506050dfeda9f3e2b59a8` confirmed: exactly the 5 intended files, +493/-38, clean tree, hook passed.
- Frontend branch confirmed off `63f46d0f` with exactly the 6 files you listed.
- **The fabrication is genuinely gone**: `typeId: receipt.subtypeName || receipt.recordType || "activity"` is now `typeId: receipt.typeId ?? ""`, and the dual-locale duplication is replaced by `resolvePetRecordPresentation`.
- Your empty-string choice verified safe: `RecordSummaryHeader` calls `resolvePetRecordPresentation(record, locale)` on the whole record and never reads `record.typeId`; neither does `PetRecordViewDialog`. Confirmed by grep, not assumed.
- **Your out-of-packet addition was correct and necessary.** Adding `display: receipt.display` to `receiptToPetRecord`/`receiptToTimelineLog` is exactly right: without it the presentation chain could never reach `display.label` for the View/Edit dialogs, silently defeating the round while appearing to work. Flagging it rather than doing it quietly was the right call.
- Locale-aware cache key verified backward-compatible: the one existing bare `invalidateQueries` call (`useConversationManager.ts:395`) has no `exact: true`, so it prefix-matches every locale variant. Adding locale to the key was necessary, not incidental -- without it a language switch would serve stale labels and look like the whole round failed.
- Re-ran the gates myself: `tsc --noEmit` 0 errors, `bun run lint` 0 errors with no findings in any touched file, `bun run build` clean with `/chat` compiling.
- Docs placement accepted in both repos; your reasoning for a new be file vs. an fe section extension is sound.

## Task 1: Commit (EXPLICITLY AUTHORIZED)

Two commits, one per repo. Never `git add -A`, never `--no-verify`; if a hook blocks, stop and report.

**pawjai-be** (`/Users/purin/dev/pawjai/pawjai-be-chat-receipt-identity-phase23d`, branch `phase23d-chat-receipt-identity-staging`): commit the docs, staged by name:
- `docs/technical/CHAT_RECEIPTS.md`
- `docs/technical/README.md`
Message along the lines of `docs(chat): document the chat receipt payload contract`.

**pawjai-fe** (`/Users/purin/dev/pawjai/pawjai-fe-chat-receipt-identity-phase23d`, branch `codex/phase-2-3d-chat-receipt-identity-staging`): one commit, these six files staged by name:
- `types/chat.ts`
- `lib/api/chatService.ts`
- `lib/queryKeys.ts`
- `hooks/useChatHistory.ts`
- `components/chat/proposal/ReceiptCard.tsx`
- `docs/technical/PET_RECORD_DISPLAY.md`
Message along the lines of `fix(chat): use real record identity on chat receipts`.

## Task 2: Push both branches (EXPLICITLY AUTHORIZED)

Before each push, re-fetch and confirm the base has not moved (be `f6280af7`, fe `63f46d0f`). If either HAS moved, STOP and report rather than rebasing or merging on your own initiative.

Push these two branches only. Never to `staging`, `main`, or `master`. Never force-push.

## Task 3: Open both PRs (EXPLICITLY AUTHORIZED)

One PR per repo, each targeting that repo's `staging`. Each body must state:
- The bug in plain terms: chat receipts fabricated a record identity from a display label, and the label was frozen in whatever language was active when the record was committed.
- That receipts are persisted in `pet_chat_messages.metadata`, which is why historical receipts needed a read-path fix rather than a forward-only one.
- The two design decisions: re-localize at read time, and read-path repair with NO migration (nothing writes to existing chat rows).
- That no-locale requests skip re-resolution entirely, so behavior is unchanged for callers that do not ask for a locale.
- Deleted-record behavior: falls back to the stored `subtypeName`, never errors the history request.
- That `subtypeName` is retained deliberately as the historical fallback; removing it belongs to the roadmap's legacy-cleanup phase.
- Test evidence: be full suite 1173 pass / 0 fail; fe tsc/lint/build clean.
- **Deploy ordering: re-verify it, do not assert it from 2.3C.** Read the code and confirm both directions, then state the conclusion with the reason for each direction. Flag any coupling you find rather than assuming there is none.
- Cross-link the two PRs by URL once both exist.

Do NOT merge either PR. Do NOT enable auto-merge.

**PR #258 is NOT yours to merge.** The user is handling it. Do not touch it.

## RETURN TO ORCHESTRATOR

1. Both commit SHAs, `git show --stat` for each, hook results, clean-tree confirmations.
2. Push confirmations, base-unchanged check results.
3. Both PR URLs and numbers, target branch confirmed as `staging` for each.
4. Your re-verified deploy-ordering conclusion, with the code evidence for both directions.
5. Anything unexpected.

Stop after this report. Do not merge anything, do not start Phase 2.3E.
