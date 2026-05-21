# Chat-Write — Frontend Changes Inventory

Source of truth for what changes in `pawjai-fe` to ship the chat-write feature. Pair with `CONTEXT.md`, `docs/adr/0001-chat-write-confirm-architecture.md`, and `docs/chat-write-backend-inventory.md`. All line numbers below reference state as of 2026-05-21.

---

## 1. New files

| Path | Purpose |
|---|---|
| `components/chat/proposal/ProposalCard.tsx` | The inline + modal proposal renderer. Takes a `RecordWriteProposal` + status; exposes confirm / cancel / edit-field callbacks. Pure view component. |
| `components/chat/proposal/ProposalCardInline.tsx` | Collapsed-in-chat version of the card. Renders summary + status badge + tap-to-reopen. |
| `components/chat/proposal/ProposalQueue.tsx` | Sequential-queue controller. Holds the array of pending proposals from one turn and opens them one-at-a-time as modals. |
| `components/chat/proposal/PetPicker.tsx` | Horizontal avatar row. Hidden when user has 1 pet. |
| `components/chat/proposal/SubtypePicker.tsx` | Filtered dropdown over `pet_record_types` for the chosen `recordType`. Includes the "Other" free-text safety valve. |
| `components/chat/proposal/TimePicker.tsx` | Relative chooser (Now / 30m / 1h / Yesterday / Custom). Defaults to "Now" unless message contained a time token. |
| `components/chat/proposal/WeightUnitToggle.tsx` | kg/lb segmented control built on the existing `lib/utils/weightConversion.ts` util. Always shows canonical kg below the editable value. |
| `components/chat/ChatWriteOnboardingDialog.tsx` | One-time popup with example phrasings. Gated on the new tutorial flag (see "Tutorial flag" doc). |
| `lib/api/chatWriteService.ts` | Thin wrapper around existing record + weight POST/PATCH endpoints. Centralises `createdInChatId` / `viaChatConversationId` plumbing so callers don't need to remember to pass them. |
| `types/chatProposal.ts` | TS types mirroring BE's `RecordWriteProposal`. Hand-mirrored on purpose — keeps the FE/BE boundary explicit. |

---

## 2. Modified files

### `components/chat/ChatInterface.tsx`
- Wire the proposal queue: when the SSE handler emits `{ type: 'proposal' }`, push onto `<ProposalQueue>`.
- Mount `<ChatWriteOnboardingDialog>` for premium users who haven't dismissed it.

### `components/chat/hooks/useConversationManager.ts`
- Extend the message-list type to include proposal messages.
- On conversation reload, reconstruct queue state from `chat_messages.metadata` JSONB (proposal payload + status).

### `components/chat/ChatMessage.tsx`
- Branch: if `message.kind === 'proposal'`, render `<ProposalCardInline>`. Otherwise existing text rendering.

### `components/chat/ChatInput.tsx`
- Disable input while a proposal modal is open. Implements the "must decide before continuing" rule from the glossary.

### `lib/analytics.ts`
- Add the 8 new tracking methods listed in the Analytics section below.

### `app/chat/page.tsx`
- No structural change; the dialog mounts via `ChatInterface`. Listed for awareness only.

---

## 3. FE-side correctness rules

- **Idempotency**: confirm button disables on click until POST resolves. Re-enable only on completion (success or error).
- **Card holds its own state until commit**. Editing fields = local component state. Only at confirm does it call the API.
- **On commit success**: card → `confirmed` state; invalidate `queryClient.invalidateQueries({ queryKey: ['petRecords', petId] })` and `['petWeight', petId]`; auto-open the next pending proposal in the queue.
- **Pet picker visibility rule**: hidden iff `pets.length === 1`. Always shown when user has 2+ pets, even if the LLM resolved a pet from context.

---

## 4. SSE event handler extension

Current chat stream consumer parses three event types (`chunk`, `done`, `error`). Add a fourth handler branch in `useConversationManager`:

```ts
case 'proposal':
  proposalQueue.push(event.payload);
  break;
```

The queue handles ordering and modal auto-open. No timeline / record invalidation here — that happens on commit, not on proposal arrival.

---

## 5. Premium gating in FE

Two gates (per CONTEXT.md):
- **Suggestion chips / slash commands for record-write affordances** (when added) render the existing `<UpgradeDialog>` for free users.
- **Receiving a proposal as a free user is unreachable** — the BE doesn't emit them. No FE-side defense needed beyond not building affordances that imply writes work for free users.

---

## 6. Analytics — 8 new events

All events use the existing `pepe*` prefix and route through `track.*` methods in `lib/analytics.ts`.

| Event | Props | Purpose |
|---|---|---|
| `pepeWriteProposalEmitted` | `recordType`, `kind` (`create` / `amend`), `petCount` | Top-of-funnel rate. |
| `pepeWriteProposalOpened` | `recordType`, `kind` | First modal paint. |
| `pepeWriteProposalEdited` | `recordType`, `field` (`pet` / `subtype` / `time` / `unit` / `note`) | **Most valuable.** Which mapping does the LLM get wrong most? |
| `pepeWriteProposalConfirmed` | `recordType`, `kind`, `editedFieldCount` | Funnel finish + first-parse quality. |
| `pepeWriteProposalCancelled` | `recordType`, `reason` (`user_cancelled` / `superseded` / `error`) | Funnel leak. |
| `pepeWriteCommitFailed` | `recordType`, `errorCode` | Reliability signal. |
| `pepeWriteOnboardingShown` | (none) | Onboarding popup impressions. |
| `pepeWriteOnboardingDismissed` | `outcome` (`tried_example` / `closed`) | Did the popup work? |

### Naming + style rules
- Match the existing `pepe*` convention. Don't fork.
- Go through `track.*` methods only. Never `trackEvent` directly from components.
- One event per logical user action. Debounce the cancel handler to prevent double-fire.

### Deliberately excluded
- Keystrokes in the note field.
- "User typed a message" (already covered by `pepeMessageSent`).
- "Modal closed without decision" — same outcome as cancel; distinguishing is hindsight bias.
