# Chat-Write Receipts

**Purpose:** Contract for the receipt Pepe shows in chat after auto-committing a pet
record or weight entry on the user's behalf.
**Audience:** Developers touching `src/services/chat/orchestrator.service.ts`,
`chat-query.service.ts`, or the frontend `ReceiptCard`.

---

## What a receipt is

When the chat orchestrator auto-commits a complete tool-call proposal (`tryAutoCommit`
in `orchestrator.service.ts`), it emits a `receipt` SSE event and persists the same
payload into `pet_chat_messages.metadata` (`{ kind: 'receipt', payload, committedAt }`)
so the receipt survives a page reload. The shape is `ChatReceiptPayload`, exported
from `orchestrator.service.ts`.

## Payload fields (Phase 2.3D)

```typescript
interface ChatReceiptPayload {
  messageId: string;
  recordId: string;               // always real -- the committed pet_records/pet_weight_records id
  target: 'pet_record' | 'weight_record';
  kind: 'create' | 'amend';
  petId: string;
  petName: string;
  recordType?: 'activity' | 'symptom' | 'vet_visit' | 'medication';
  typeId?: string;                 // real pet_record_types id; absent for weight receipts
  display?: PetRecordDisplay;      // Phase 2.3A localized presentation
  subtypeName?: string;            // @deprecated fallback, see below
  summary: string;
  occurredAt: string;
  weightKg?: number;
  displayUnit?: 'kg' | 'lb';
}
```

`recordId` was always real. Before this phase, `typeId`/`display` did not exist on the
payload at all -- the only subtype signal was `subtypeName`, a plain string resolved
once via a standalone `nameEn`/`nameTh` lookup at commit time, using whichever locale
the chat request happened to carry. Two problems followed from that: the frontend had
no real `typeId` to work with (it was reconstructing a fake one from the name string --
see the frontend's `ReceiptCard.tsx` history if curious), and the label could never
change language on a later read, since it was baked into the stored string.

`tryAutoCommit` now passes the request's `locale` as the `displayLocale` argument to
`petRecordService.createRecord`/`updateRecord` -- both already support this for every
other write path (Phase 2.3A) -- and reads `typeId`/`display` off the result instead of
a separate query. `subtypeName` is retained, derived from `display.label` for new
receipts, purely as **the fallback for receipts persisted before this phase** (which
have no `typeId`/`display` at all) and for weight receipts (no subtype to resolve).
Never remove it -- the frontend's presentation chain depends on it as the last tier
before a generic label.

## Read-time re-resolution for historical receipts

`GET /api/chat/history` accepts an optional `?lang=th|en` (falls back to
`Accept-Language`; if neither is present, **no re-resolution happens** and messages are
returned exactly as stored -- see "No-locale behavior" below).

When a locale is resolved, `getUserChatHistory` (`chat-query.service.ts`) calls
`resolveHistoricalReceiptDisplays` (`historical-receipt-resolver.service.ts`) on the
fetched page of messages. For every `pet_record` receipt in that page, it:

1. Collects the receipts' `recordId`s.
2. Runs **one** batched `pet_records` query (`WHERE id IN (...)`) and **one**
   `enrichRecordsWithDisplay` call (Phase 2.3A's batched resolver) for the whole page --
   never a per-message query, regardless of how many of the page's messages are
   receipts.
3. Returns a copy of the messages array with `display` (and `typeId`, for genuinely
   historical rows) patched into each resolved receipt's `metadata.payload`.

This applies to **every** `pet_record` receipt in the page, not only historical ones --
a receipt committed in Thai and reopened after the user switches to English shows
English, the same as any receipt written today.

**Nothing is ever written back to `pet_chat_messages`.** The resolver only returns a
new in-memory array; the stored row is untouched. A future read at a different locale
re-resolves from the live record again -- there is no caching or backfill of the
resolved value into the row.

### Deleted-record fallback

If the underlying `pet_records` row was soft-deleted or otherwise can't be resolved,
that receipt's `metadata.payload` is returned **completely unchanged** -- no partial
patch, no error. The frontend still has `subtypeName` (whatever locale it was committed
in) to fall back to; a missing record can never fail the whole history request.

### No-locale behavior

If a request carries neither `?lang` nor a readable `Accept-Language`, `getUserChatHistory`
skips the enrichment step entirely -- zero extra queries, response identical to before
this phase. This is deliberate: paying two queries on every history page for a caller
that isn't going to use the result is the wrong default, and `subtypeName` already makes
"do nothing" a fully correct response.

## Amend receipts

Before this phase, an `amend` (edit) receipt carried no subtype identity at all --
`tryAutoCommit`'s amend branch discarded `updateRecord`'s result entirely. It now passes
`locale` through the same way create does and carries the same `typeId`/`display`/
`subtypeName` fields.

## Weight receipts

`pet_weight_records` has no `typeId`/`conceptId`/lookup reference of any kind --
`target: 'weight_record'` plus `weightKg`/`displayUnit` already fully describe a weight
receipt. `tryAutoCommit`'s weight branches and `resolveHistoricalReceiptDisplays` both
skip `weight_record` payloads entirely; there is nothing to carry or resolve.
