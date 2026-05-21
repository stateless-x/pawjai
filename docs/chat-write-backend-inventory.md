# Chat-Write — Backend Changes Inventory

Source of truth for what changes in `pawjai-be` to ship the chat-write feature. Pair with `CONTEXT.md` (glossary) and `docs/adr/0001-chat-write-confirm-architecture.md` (architecture decision). All line numbers below reference state as of 2026-05-21.

---

## 1. New files

| Path | Purpose |
|---|---|
| `src/services/chat/llm-tool-adapter.ts` | Vendor-neutral adapter. Maps Gemini `functionCall` output into our `RecordWriteProposal` shape. Single export: `normalizeToolCall(rawCandidate)`. Swapping providers = writing a sibling file, no call-site changes. |
| `src/services/chat/proposal.types.ts` | Shared TS types: `RecordWriteProposal`, `ProposalKind = 'create' \| 'amend'`, `ProposalStatus`, plus the vendor-neutral tool schema definitions (`PROPOSE_PET_RECORD_TOOL`, `PROPOSE_WEIGHT_RECORD_TOOL`, `AMEND_PET_RECORD_TOOL`, `AMEND_WEIGHT_RECORD_TOOL`). Imported by adapter, orchestrator, and prompt builder. |

---

## 2. Modified files

### `src/services/llm.ts`
- `generateChatStream` (line 227): change yield type from `string` to `string | { type: 'tool_call'; name: string; args: unknown }`. When a Gemini chunk carries a `functionCall` part, yield the tool-call variant; otherwise yield text as today.
- `generateChat` (line 145): same return-type extension for the non-streaming path.

### `src/services/chat/orchestrator.service.ts`
- `ChatStreamEvent` union (line 75): add `| { type: 'proposal'; payload: RecordWriteProposal }`.
- `sendMessageStream` (line 321): inside the stream loop (current lines 473–484), branch on yielded value. Text → existing `{ type: 'chunk' }`. Tool call → call `normalizeToolCall` (from `llm-tool-adapter.ts`), then yield `{ type: 'proposal', payload }`.
- Premium gate: at the `modelConfig` selection point near line 408, conditionally attach `tools: RECORD_WRITE_TOOLS` to the LLM call only when `subscriptionTier === 'premium'`. Free users get an identical call without the `tools` field.
- `sendMessage` (line 87): same tool-call fan-out for the non-streaming path (proposal returned inside `ChatResponse`).

### `src/config/chat-persona.config.ts`
- Add `generateChatWriteToolSection(locale)` exporting the conditional tool-use prose block appended to the system prompt for premium users.

### `src/services/chat/prompt-builder.service.ts`
- `buildChatPrompt` (line 84): accept `subscriptionTier`. When premium, append `generateChatWriteToolSection` output to `systemPrompt`.
- `buildFocusedConversationContext`: extend to render the "Amendable records in this conversation" section. Data comes from a new context-loader query.

### `src/services/chat/context-loader.service.ts` and `context-builder.service.ts`
- New query: select `pet_records.id`, `pet_record_types.nameEn`, `pet_record_types.nameTh`, `pet_records.occurredAt` joined where `pet_records.created_in_chat_id = :conversationId`. Same for `pet_weight_records`.
- Stitch into the context block under a clearly-labelled "Amendable records in this conversation" header (around `buildFocusedConversationContext` line 203).

### `src/routes/petRecord.ts`
- POST handler (line 64): extend `createBodySchema` with optional `createdInChatId: z.string().uuid().optional()`. Pass through to `petRecordService.createRecord`.
- PATCH handler (line 280): extend `updateBodySchema` with optional `viaChatConversationId: z.string().uuid().optional()`. After fetching the record, if the field is present and `record.createdInChatId !== viaChatConversationId`, return `403 CHAT_AMEND_FORBIDDEN`.

### `src/routes/petWeight.ts`
- POST handler (line 13): pass `createdInChatId` through to `petWeightService.createWeightRecord`.
- PATCH handler (line 66): same `viaChatConversationId` enforcement as the record route.

### `src/services/petRecordServices.ts` and `src/services/petWeightService.ts`
- Accept `createdInChatId` on create paths and write it to the new column.

---

## 3. Schema changes

In `src/db/schema/pets.ts`:

- `pet_records` (table def at line 174): add `createdInChatId: uuid('created_in_chat_id')` — nullable, no FK.
- `pet_weight_records` (table def at line 200): add the same column.
- Add a btree index on `created_in_chat_id` for both tables (used by the context-loader query).

No new tables. No new enums. One migration generated via `bun run db:generate`. Use `IF NOT EXISTS` guards.

---

## 4. New API endpoints

**None.** Every chat-write commit reuses an existing endpoint:

- `POST /pets/:petId/records` — chat-create for `PetRecord`
- `POST /pets/:petId/weight` — chat-create for `PetWeightRecord`
- `PATCH /records/:id` — chat-amend for `PetRecord`
- `PATCH /pets/:petId/weight/:weightId` — chat-amend for `PetWeightRecord`

The SSE stream endpoint `POST /pets/:petId/chat` (`pet-chat.ts` line 26) already exists; it only gains a new event variant via the orchestrator change above.

---

## 5. Modified API endpoints

All changes are **additive optional fields** — no breaking changes; timeline UI callers pass nothing and behave identically.

- `POST /pets/:petId/records` — optional `createdInChatId` on body.
- `POST /pets/:petId/weight` — optional `createdInChatId` on body.
- `PATCH /records/:id` — optional `viaChatConversationId` on body; BE enforces amendable-window if present.
- `PATCH /pets/:petId/weight/:weightId` — same as above.

---

## 6. Streaming contract change

Current `ChatStreamEvent` (orchestrator.service.ts line 75) is a three-variant union: `chunk`, `done`, `error`. Add a fourth:

```ts
{ type: 'proposal'; payload: RecordWriteProposal }
```

`RecordWriteProposal` (in `proposal.types.ts`) carries at minimum:
- `kind: 'create' | 'amend'`
- For records: `petId`, `recordType`, `typeId`, `occurredAt`, `note?`, `vibe?`, `imageUrls?`
- For weight: `petId`, `weightKg`, `displayUnit ('kg' | 'lb')`, `displayValue` (the user's spoken number), `occurredAt`
- For amends: `recordId`
- `conversationId` (FE passes back on commit so amendable-window can be enforced)
- `summary?` (optional LLM-authored sentence rendered at the top of the card)

The SSE handler in `pet-chat.ts` line 136 writes events via `writeEvent` with no type-specific branching, so that file does not change.

---

## 7. Premium-gate enforcement points

**Primary gate (BE):** `sendMessageStream` (orchestrator.service.ts line 321) and `sendMessage` (line 87). `subscriptionTier` is already resolved (line 336 / line 105). At the `modelConfig` selection point near line 408, pass `tools: RECORD_WRITE_TOOLS` only when premium. Free users get a tool-less LLM and cannot emit `functionCall` responses.

**Secondary gate (FE):** out of scope for this inventory. Renders `<UpgradeDialog>` for free users per `CONTEXT.md`.

The premium gate is **separate from** the existing chat rate limit (`chatRateLimitService.tryClaimMessageSlot`) — both apply, in order.

---

## 8. System prompt sections to add

In `chat-persona.config.ts`, six new sections, applied only when `subscriptionTier === 'premium'`:

1. **Record-write tool definitions** — declares the four tools with parameter schemas (vendor-neutral; adapter maps to Gemini wire format).
2. **Amendable-window rule** — LLM may only amend records listed in the "Amendable records in this conversation" context block; otherwise direct user to timeline.
3. **"LLM never guesses" rule** — if a field has no confidently-parsed source token in the user's message, ask a clarifying question; do not invent values.
4. **Multi-proposal cap** — 3-proposal-per-turn maximum, enforced both via `maxItems: 3` in tool schema and a prose instruction to ask the user to split overflowing requests.
5. **Weight unit handling** — surface both the user's spoken value (with their unit) and the canonical kg value in weight proposals.
6. **Proposal supersession** — a new proposal supersedes any prior pending proposal in the same conversation; the LLM should not re-emit a proposal it already sent.

---

## Open follow-ups (not in this inventory)

- FE inventory (separate doc) — proposal card component, SSE event handler change, `UpgradeDialog` integration, first-time popup.
- Onboarding tracker reuse — confirm the existing dashboard tutorial flag table/column to piggyback on.
- Analytics — track proposal-emitted, proposal-confirmed, proposal-cancelled, proposal-superseded events through `lib/analytics.ts` (FE side).
