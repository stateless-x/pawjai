# 0001 — Chat-driven record writes require FE-side confirmation; BE never auto-commits

**Status:** Accepted
**Date:** 2026-05-21

## Context

We are adding the ability for users to create and amend `PetRecord` / `PetWeightRecord` entries from the `/chat` page through natural conversation. The backend chat already runs Gemini and streams text to the FE; it has no tool-call wiring today. We are introducing tool calls for the first time as part of this feature.

The team's hard requirement is that **every write must be confirmed by the user in the UI** — no exceptions, no "trust the model" mode. Users with up to ~10 pets need a chance to fix pet-mapping, subtype-mapping, and unit-mapping mistakes before any DB write happens.

Four architectures were considered:

1. **BE auto-commits when the LLM emits a tool call**, then FE shows a "done" toast and an undo.
2. **BE writes a `pending_proposal` row in a staging table**, FE polls/streams, user confirms, BE moves it to the real table.
3. **BE intercepts the LLM tool call but does not write**; instead it streams a structured `proposal` event to the FE. FE renders a confirmation card and, on confirm, calls the existing `/api/pets/:id/records` and `/api/pets/:id/weight` write endpoints.
4. **Hybrid: BE writes immediately but in a `confirmed=false` state**; FE flips the bit on confirm.

## Decision

Adopt **option 3**: BE proposes, FE commits via existing endpoints.

- The chat orchestrator declares LLM tools (`propose_pet_record`, `propose_weight_record`, `amend_pet_record`, `amend_weight_record`) via a **vendor-neutral adapter** (`llmToolAdapter`). Today the adapter targets Gemini; in the future, swapping to another provider means writing a sibling adapter, not changing call sites.
- The orchestrator never executes the tool. When the model emits a tool call, the adapter normalises it to our internal `proposal` shape and the orchestrator streams `{ type: 'proposal', payload: {...} }` over the existing chat stream.
- The FE consumes the vendor-neutral proposal shape and renders a confirmation card. On confirm, the FE calls the existing record-write APIs (the same ones the timeline UI uses). On cancel, nothing happens server-side.
- The premium gate is enforced in the orchestrator: free users get a tool-less LLM configuration. They cannot receive proposals at all.

## Consequences

**Good:**
- No new staging table; no new "is this row real yet?" state to migrate or clean up.
- The write path is the **same code** the timeline already uses, including its rate limits, plan checks, and validation. We don't fork the write path.
- Abandoned proposals leave zero database footprint — the user closes the tab, nothing happened.
- Each tool category maps 1:1 to an existing REST endpoint, so the FE confirmation handler is a thin switch.

**Bad / trade-offs:**
- **Two network legs per write**: chat stream returns proposal, then a separate POST to commit. Adds one round-trip's worth of latency between user-confirm and timeline-updated.
- **The proposal payload is "trusted" by the FE-side commit logic only as a draft.** The FE still must let the user edit every field before commit, and the final POST body is whatever the user confirmed in the UI — never the raw model output. (This is how we keep the model honest.)
- **No server-side memory of "the model wanted to write X but the user cancelled"**, beyond what we choose to log for analytics. If we ever want to ask "what proposals get cancelled most?" we have to add logging explicitly.
- **Idempotency is the FE's job.** If the user double-taps confirm, the FE must guard against double-POST. The BE write endpoints already do not enforce idempotency keys today; we will not add them in this feature unless duplication shows up in practice.

## Rejected alternatives

- **Option 1 (BE auto-commit + undo)**: violates the team's hard rule. "Confirm every time" is non-negotiable, and an undo button is not a confirmation.
- **Option 2 (staging table)**: introduces a new entity, new lifecycle, new garbage collection. Solves a problem we don't have — the FE can hold the proposal in component state until commit.
- **Option 4 (`confirmed=false` row)**: same downsides as option 2, plus it pollutes timeline queries with "is this real?" filters forever.
