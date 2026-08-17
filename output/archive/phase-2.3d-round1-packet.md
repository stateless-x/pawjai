# PHASE 2.3D ROUND 1 PACKET: investigation + one authorized doc fix (paste to the worker; Round 1 standing rules remain in force)

STATUS UPDATE: Phase 2.3C is COMPLETE. Both PRs merged (be #257, fe #286); staging is now `f6280af7` (be) and `63f46d0f` (fe). Worktree cleanup is done. Start this round from a fresh `origin/staging` in each repo.

Task 1 of this packet is READ-ONLY investigation: no code changes, no commits, no branches, no worktrees. Task 2 is a small authorized documentation fix. Do Task 1 first and do not let Task 2 bleed into it.

## Goal

Phase 2.3D: "Fix chat receipt identity and localized labels." When Pepe (the chat assistant) logs a record on the user's behalf, the chat shows a receipt card. That receipt currently fabricates a record identity from a display string instead of carrying the real one.

## Root cause the orchestrator has already confirmed (verify, do not re-derive)

Backend, `pawjai-be/src/services/chat/orchestrator.service.ts`:
- Line ~553: the commit result type is `{ kind: 'committed'; recordId: string; subtypeName?: string }`.
- Line ~580: `const subtypeName = (await lookupSubtypeName(proposal.typeId!, locale)) ?? undefined;` then line ~581 returns only `recordId` + `subtypeName`.
- Line ~969: `subtypeName` is passed out to the client.
- So at the moment the receipt is built, the backend HAS `proposal.typeId` and the real `recordId`, but discards `typeId` and ships a single already-localized string.

Frontend, `pawjai-fe/components/chat/proposal/ReceiptCard.tsx`:
- Line ~294: `typeId: receipt.subtypeName || receipt.recordType || "activity"` -- a human-readable NAME is being passed as a typeId. This is the identity fabrication.
- Lines ~299-303 and ~319-322: builds a fake `typeInfo` with `nameEn: receipt.subtypeName, nameTh: receipt.subtypeName` -- the SAME string in both locale slots, so switching language cannot change the label; it is frozen at whatever locale the backend used at commit time.
- `pawjai-fe/lib/api/chatService.ts:54` declares `subtypeName?: string`.

## Investigate and report

1. Confirm each of the above against current code (line numbers may drift). State the actual lines.
2. Trace the full receipt path end to end: where `subtypeName` is produced, every hop it takes to the client (including whether it is persisted into chat message metadata or only returned live), and every place it is read. This matters: if receipts are PERSISTED, old messages carry the frozen string forever and we need to know whether historical receipts can be re-resolved or only new ones improve.
3. Determine what the backend can cleanly carry instead. The 2.3C/2.3A precedent is `prefetchRecordDisplayData` + `resolveRecordDisplays` for the write path, or a stored concept snapshot. `pet_records` already stores concept-snapshot columns (deployed 2026-08), so the created record itself may already have everything needed. Report which of these is available at the receipt-construction point WITHOUT a new query, and what a minimal correct payload looks like (expect: real `typeId`, `conceptId`, and either a `display` object or enough to resolve one client-side).
4. Locale: state how the chat orchestrator currently obtains `locale` for `lookupSubtypeName`, and whether a receipt rendered later in a different UI language can be re-localized under your proposal.
5. Backward compatibility: what happens to receipts already rendered/persisted with only `subtypeName` under your proposal. The fix must degrade gracefully, same additive discipline as 2.3C.
6. Check `pawjai-be/docs` and `pawjai-fe/docs` for any chat receipt/proposal contract docs that would need updating.
7. Flag any OTHER identity fabrication you find in the chat proposal flow while you are in there (e.g. `SubtypePicker.tsx` also appeared in a legacy-name grep). Report only, do not fix.

## Task 2: Fix a false claim in pawjai-be/CLAUDE.md (EXPLICITLY AUTHORIZED, one commit)

Do this only AFTER finishing the Task 1 investigation report. It is unrelated to 2.3D and must not be mixed into that analysis.

`pawjai-be/CLAUDE.md` line ~236, in the "Common issues" section, currently claims: "The same `.p8` key signs APNs requests and backs the Apple Sign-In flow, so an expired or revoked key breaks both at once."

**This is false and it sits in incident-response documentation, where it would send someone down the wrong path during an outage.** APNs and Apple Sign-In use two DIFFERENT keys with different key IDs. This was established by an in-memory public-key fingerprint comparison during earlier work, and the orchestrator has re-confirmed the env-var split: APNs uses `APNS_KEY_BASE64`/`APNS_KEY_PATH`/`APNS_KEY_ID` (`src/config/env.ts:78-80`), while Apple Sign-In uses `APPLE_PRIVATE_KEY_BASE64`, consumed by `scripts/renew-apple-client-secret.js`.

1. Work in the main `pawjai-be` checkout on a branch off fresh `origin/staging` (no worktree needed for a doc fix; name it something like `docs/fix-apns-apple-signin-key-claim`).
2. Correct the passage so it states the two are separate keys, that rotating one does NOT require rotating the other, and keeps the useful part (where each env var lives, how to rotate). Verify the env-var names and the script path against the actual code before writing; do not copy the names above on faith.
3. Do not rewrite the rest of the section or reformat unrelated lines.
4. Commit (stage `CLAUDE.md` by name only). Push is authorized for this branch. Opening the PR is authorized, targeting `staging`. Do NOT merge it.

## RETURN TO ORCHESTRATOR

Report Task 1 and Task 2 in clearly separate sections.

### Task 1 (investigation)
1. Confirmed root cause with actual path:line references.
2. Receipt data-flow trace, explicitly answering the persisted-vs-live question.
3. Proposed minimal payload change, with what is available at the construction point and at what query cost.
4. Locale re-resolution answer.
5. Backward-compatibility plan for existing receipts.
6. Docs that need updating.
7. Other fabrication sites found.
8. Your proposed implementation split into rounds (expect backend-first, mirroring 2.3C).

### Task 2 (doc fix)
9. The corrected wording, the verified env-var names/script path, commit SHA, and the PR URL.

Task 1 is READ-ONLY: no edits, no commits, no branches for the 2.3D investigation. Task 2's single doc commit/push/PR is the only write authorized this round. Do not implement any part of 2.3D. Do not merge anything. Stop after this report.
