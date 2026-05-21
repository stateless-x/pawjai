# Pawjai — Glossary

Canonical terms for the codebase. Implementation lives in code; this file only fixes language.

---

## PetRecord
A single timeline entry for a pet, stored in `pet_records`. Every record has:
- `recordType`: one of four umbrella categories — `activity`, `symptom`, `vet_visit`, `medication`
- `typeId`: pointer to a row in `pet_record_types` (the specific subtype, e.g. "diarrhea" under `symptom`)
- `occurredAt`, `note`, `vibe`, optional images, free-form `metadata`

`PetRecord` is the canonical name in code and internal docs. User-facing UI uses friendly words like "บันทึก" / "log" / "activity (gerund)" — those are not the entity name.

## recordType (umbrella)
The enum value on `PetRecord.recordType`. Always one of: `activity` | `symptom` | `vet_visit` | `medication`. When ambiguity is possible, write "umbrella recordType" or qualify with the value, e.g. "a `recordType=symptom` PetRecord".

## record subtype
The row in `pet_record_types` referenced by `PetRecord.typeId`. Examples: "walk" (under `activity`), "diarrhea" (under `symptom`), "annual checkup" (under `vet_visit`), "amoxicillin" (under `medication`). Never call a subtype an "activity" — that name is already taken by the umbrella value.

## "activity" (forbidden in internal docs)
Banned as a standalone noun in code, schema talk, and design docs because it is overloaded: it can mean (a) the umbrella `recordType=activity`, (b) any `PetRecord`, or (c) the Thai UI label บันทึกกิจกรรม. Use `PetRecord` for the entity and the specific `recordType` value when referring to the umbrella.

User-facing copy (Thai or English) may still say "activity" / "กิจกรรม" — that is a translation choice, not a domain term.

## PetWeightRecord
A weight entry, stored in `pet_weight_records`. Parallel to `PetRecord` but a separate table with its own route (`/api/pets/:id/weight`). Not a subtype of `PetRecord`. When the chat feature writes weight, it writes to this table, not `pet_records`.

## canonical weight unit
Database stores weight in **kg only** (`pet_weight_records.weightKg`, `numeric(6,3)`). The user has a display preference at `user_config.weightUnit` (`kg | lb`). Conversion happens at the edge:
- **Input edge** (chat parsing, form submit): convert to kg before the API call.
- **Display edge** (timeline, chat confirmation card): convert kg → user's preferred unit at render.

When the chat infers weight from natural language ("น้องหนัก 12 โล" / "Mochi is 26 pounds"), the proposal MUST surface both the user's spoken value (with the unit they said) AND the kg-canonical value. This is the user's last chance to correct unit mis-parsing.

## record-write proposal
The structured object the chat model emits when it intends to create or amend a `PetRecord` or `PetWeightRecord`. Never written to the DB directly. Shown to the user in a confirmation card; only after user-side confirm does the FE call the existing write API (`/api/pets/:id/records`, `/api/pets/:id/weight`). A proposal has at minimum: target pet, write kind (create | amend), recordType + subtype (or weight + unit), occurredAt, free-form fields. The chat may emit a proposal with **unresolved fields** (no pet picked, ambiguous subtype) — the confirmation UI is responsible for resolving them.

**Vendor-neutral wire format.** The proposal shape on the chat stream (`{ type: 'proposal', payload: {...} }`) is defined by us, not by any LLM vendor's function-call shape. The mapping from vendor-specific tool output (Gemini `functionCall`, OpenAI `tool_calls`, Anthropic `tool_use`, etc.) into our proposal shape happens inside a **`llmToolAdapter`** in the BE. The FE never sees vendor-specific fields. Switching providers means writing one new adapter, not changing the FE or the rest of the BE.

## mapping (confirmation-time)
The user-driven step where a `record-write proposal` with ambiguous or missing fields is resolved before commit. Three mapping axes:
1. **Pet mapping** — which of the user's pets this is for (mandatory when user has >1 pet).
2. **Subtype mapping** — which `pet_record_types` row this PetRecord references (e.g. "diarrhea" vs "soft stool" under `symptom`).
3. **Unit / time mapping** — weight unit (kg ↔ lb), occurredAt (now vs "yesterday morning" → concrete timestamp).

A proposal cannot be committed while any mapping axis is unresolved. The confirmation card renders a control for each unresolved axis. The chat must never silently guess and commit — guesses appear in the card as pre-filled but editable values.

## amendable window
The set of `PetRecord` / `PetWeightRecord` rows the chat is allowed to amend (edit) via tool call. Defined as: records created **by this same chat conversation** (tracked via a `createdInChatId` or equivalent column / metadata). Anything older — including records created via the timeline UI or via a previous chat session — is read-only from chat. Amending those redirects the user to the timeline.

## confirmation gate
A hard, always-on requirement: no `record-write proposal` may be committed without an explicit user tap on a confirm control in the FE. There is no "auto-commit after N seconds", no "remember my choice", no "trust the model" flag, no batch confirm. Every create and every amend is a separate confirmation. The BE enforces this by never writing to `pet_records` / `pet_weight_records` from the chat orchestrator — writes only happen when the FE calls the existing record-write APIs (`/api/pets/:id/records`, `/api/pets/:id/weight`) after user confirmation.

## premium gate
The chat-write feature (proposing and committing records via chat) is restricted to users whose `accessControlService` returns `effectivePlan === 'premium'`. Free users still get the read-only chat experience (the same as today) but cannot trigger record-write proposals. Gate is enforced in two places:
- **BE chat orchestrator**: when `subscriptionTier !== 'premium'`, the LLM is configured without the record-write tools. Free users physically cannot get a proposal back.
- **FE chat UI**: any record-write affordance (suggestion chips, slash commands, etc.) renders the existing `<UpgradeDialog>` for free users instead of triggering the tool flow.

A premium user who downgrades mid-conversation loses tool access on the next request — there is no in-flight grandfathering.

## proposal card
The FE rendering of a `record-write proposal`. Lifecycle:
1. **First appearance**: card auto-opens as a modal as soon as it arrives in the stream, blocking further chat input until the user decides (confirm / cancel / dismiss).
2. **Inline after dismissal**: once the modal closes, the card collapses to an inline message in the chat scroll (same vertical position the model would have written into), showing a summary, the resolved values, and a state badge (`confirmed` | `cancelled` | `pending`).
3. **Re-openable**: tapping the inline card reopens it as a modal. Pending cards reopen as fully editable; confirmed/cancelled cards reopen as read-only with a status line ("Confirmed at 14:32" / "You cancelled this proposal").

A new proposal from the model **supersedes** any prior pending proposal in the same conversation — the previous pending card collapses to `cancelled (superseded)` state.

## chat-driven edit
The user revises a proposal or amends a recently-committed record by talking to the LLM. Two flavours, both bound by the same "LLM never guesses" rule:

- **Edit-during-proposal**: a pending `proposal card` is on screen. User says "use Mochi instead" or "it was yesterday morning". The LLM emits a revised proposal that **supersedes** the prior one.
- **Edit-after-commit**: a confirmed record exists *within the* `amendable window`. User says "change that diarrhea time to 7am". The LLM emits an `amend` proposal, which goes through the same `proposal card` confirmation gate.

Records **outside** the amendable window (old, or timeline-created) cannot be edited by chat. The LLM's response in that case is to direct the user to the timeline.

## "LLM never guesses" rule
If a user instruction is ambiguous, the LLM **must ask a clarifying question** rather than emit a proposal with guessed values. Examples of ambiguity that force a clarification turn (not a proposal):
- "change the time" with no time given and >1 candidate record in the amendable window
- "log diarrhea" when user has >1 pet and no pet was named
- "she gained weight" with no number

A proposal with **pre-filled-but-editable** fields is not a guess — that is the model surfacing its best parse for the user to confirm or correct in the card. The line: if the field has a confidently-parsed value with a recognisable source token in the user's message, it can be pre-filled. If it is invented from thin air, the model must ask instead.

## proposal-card field controls
The `proposal card` exposes these field controls. Each is pre-filled per the rules below; values shown are always editable until commit.

- **Pet picker** — horizontal avatar row. Hidden if user has 1 pet (auto-resolved). Pre-selected to the pet the model identified; tapping switches local target with no LLM round-trip.
- **Subtype picker** — dropdown of valid `pet_record_types` for the chosen `recordType`, filtered by species. Pre-filled to the model's resolved row. **Fallback rule:** if the model cannot map the user's words to any row, it does NOT emit a proposal with an empty subtype — it asks a clarifying question instead (e.g. "ผมยังไม่แน่ใจว่าเป็นอาการแบบไหน — ใช่ ท้องเสีย หรือ อาเจียน หรือ...?"). The picker offers `Other` as a free-text safety valve for cases the model resolves but the user wants to override.
- **Time picker** — relative chooser (Now / 30 min ago / 1 hr ago / This morning / Yesterday / Custom). **Default rule:** pre-fill to `Now` unless the user's message contained an explicit time token (e.g. "เมื่อเช้า", "yesterday at 8pm").
- **Weight unit toggle** (weight proposals only) — `kg | lb` segmented control. Pre-filled to the unit the user spoke. Toggling **converts** the displayed value (never silently rescales). The card always shows the canonical kg value beneath in muted text.
- **Note** — free-text, pre-filled with whatever the model captured beyond structured fields.

## amend-target identity
An amend `record-write proposal` carries the target record's `recordId` directly in its payload. The LLM resolves identity, not the FE. To make this possible, the BE chat context includes an **"Amendable records in this conversation"** section listing `{ recordId, subtype label, occurredAt }` for every chat-created record in the current `conversationId`. This is how the LLM enumerates candidates to apply the "LLM never guesses" rule — when the user says "change the time" and there are 2 candidates, the LLM sees 2 entries and asks which one.

A new column **`created_in_chat_id` (uuid, nullable, indexed)** on both `pet_records` and `pet_weight_records` is the source of truth for "this row was created by chat conversation X". Records created via the timeline have it null. The column powers the context-loader query and the server-side amendable-window check.

## amendable-window enforcement
Two layers, defense-in-depth:
1. **FE (primary)** — the LLM only ever sees and proposes amends for records in the amendable window because the BE context only lists those records. The FE never renders an amend card for an out-of-window record.
2. **BE (secondary)** — the existing `PATCH /records/:id` and `PATCH /pets/:petId/weight/:weightId` endpoints accept an optional `viaChatConversationId` field. When present, the BE verifies `record.createdInChatId === viaChatConversationId` and returns `403 CHAT_AMEND_FORBIDDEN` on mismatch. Timeline PATCH calls omit the field and behave as today.

## deleted-record proposal card
When a proposal card persisted in `chat_messages` references a `pet_record` that has since been soft-deleted from the timeline, the chat message stays as-is. The FE detects the deleted state at fetch time (record missing or `isDeleted=true`) and renders the inline card with a "This record was deleted from the timeline" status badge. No mirrored deleted-state on the chat message.

## proposal card persistence
Proposal cards are persisted as rows in the existing `pet_chat_messages` (or equivalent chat messages) table — not as separate entities. The proposal payload, its resolved values, and its current status (`pending` | `confirmed` | `cancelled` | `superseded`) live in the message row's `metadata` JSONB. This means conversation history reload reconstructs the inline card UI exactly as the user left it.

## chat-write failure UX
Keep it simple. Two failure modes matter:
1. **Premium expired between proposal-emit and confirm-click** — confirm POST fails with the existing tier error. The card shows an error state with a "Resume subscription to use this" link to the upgrade flow. The proposal stays pending; no retry until resubscribed.
2. **Any other commit failure** (rate limit, validation, network) — card shows the error message; the user can retry from the same card.

There is no auto-retry, no proposal-staging table, no offline-confirm queue. If it fails, it shows the error and lets the user try again or cancel.

## chat-write discovery (onboarding)
First-time premium users discover the feature via a one-time popup with example phrasings ("Try: 'Mochi pooped at 8am'"). Dismissal is tracked in the DB using the same pattern as the existing dashboard tutorial flag (look up the dashboard onboarding tracker — this is the source of truth for the column/table to reuse). No persistent UI nudge after the first-run popup; the LLM teaches the affordance by responding to natural language. The popup never shows for free users.

## multi-proposal turn
A single user message may cause the model to emit multiple `record-write proposal`s in one turn (e.g. "Mochi pooped and peed today" → two proposals). Rules:

- **Hard cap: 3 proposals per turn.** Enforced in the tool-call schema (`maxItems: 3` on any array param). If the user implies more, the LLM is prompted to either pick the top 3 or ask the user to split the request.
- **Sequential queue, never stacked.** Only one `proposal card` modal is open at a time. The first auto-opens. Confirming, cancelling, or dismissing it auto-opens the next. A small "N more to decide" indicator on the modal tells the user what's coming.
- **One card per record.** Each proposal is independent — its own card, own confirm/cancel/supersede lifecycle, own inline collapsed entry in the chat scroll. There is no "confirm all" affordance.
- The model's surrounding text reply (the optional `summary` field on each proposal) makes the group cohesive: "ขอบันทึก 2 อย่างให้นะครับ — อันแรกคือ..." appears as the first card's summary.

## Timeline
The chronological view of a pet's `PetRecord` + `PetWeightRecord` entries, rendered by `components/petLog/`. Edits and deletions to existing records happen here — the chat feature never deletes, it redirects to the timeline.
