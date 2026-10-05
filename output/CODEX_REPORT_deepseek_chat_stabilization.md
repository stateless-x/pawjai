# Report to Codex — DeepSeek chat stabilization

Branch prepared for review. **Not committed, not pushed, not released.**

---

## 1–2. Branches and SHAs

| Repo | Branch | Start SHA | Current SHA | State |
|---|---|---|---|---|
| pawjai-be | `codex/deepseek-chat-stabilization` | `f5d6cfc9751a261d295ad19c4d06d21b0a9cb0a0` | `f5d6cfc…` (uncommitted) | working tree dirty, as intended |
| pawjai-fe | `codex/deepseek-chat-stabilization` | `1844a26b677a37789f19cdf4384b2f33cf0786f0` | `1844a26…` (uncommitted) | working tree dirty, as intended |

Both matched the verified starting SHAs before branching. Backend's untracked `output/` was preserved untouched. Parent repo untouched and still on `main` (its submodule pointers show as modified, which is unavoidable when branching submodules; nothing was committed there).

---

## 3. Changed files

### Backend — modified (22)
```
.env.dev.example                                  env.example
src/config/env.ts                                 src/config/chat-persona.config.ts
src/config/gemini-models.config.ts                src/config/deepseek-models.config.ts
src/routes/chat.ts                                src/services/chat/orchestrator.service.ts
src/services/chat/prompt-builder.service.ts       src/services/chat/proposal.types.ts
src/services/chat/proposal-metadata.schema.ts     src/services/insights/orchestrator.service.ts
src/services/llm/router.ts                        src/services/llm/types.ts
src/services/llm/index.ts                         src/services/llm/gemini.provider.ts
src/services/llm/deepseek.provider.ts             src/services/pets/suggestion-context.service.ts
src/__tests__/unit/llm/provider-router.test.ts    src/__tests__/unit/chat/chat-prompt-policy.test.ts
src/__tests__/unit/chat/chat-source-and-selection.test.ts
src/__tests__/unit/chat/orchestrator-image-failures.test.ts
```

### Backend — new (7)
```
src/services/chat/logging-offer.schema.ts     src/services/chat/log-draft.types.ts
src/services/chat/log-draft-prompt.ts         src/services/chat/log-draft-resolver.ts
src/services/chat/log-draft.service.ts        scripts/prompt-budget.ts
scripts/eval-log-draft.ts
src/__tests__/unit/chat/log-draft-resolver.test.ts
```

### Frontend — modified (10)
```
components/chat/ChatInterface.tsx      components/chat/ChatMessage.tsx
components/chat/ChatMessageList.tsx    components/chat/proposal/ProposalQueue.tsx
lib/analytics.ts                       lib/api/chatService.ts
lib/api/chatWriteService.ts            types/chatProposal.ts
lib/i18n/locales/pages/en/chat.ts      lib/i18n/locales/pages/th/chat.ts
```

### Frontend — new (4)
```
components/chat/LogSuggestionAction.tsx      components/chat/loggingOffer.ts
components/chat/hooks/useLogDraftRequest.ts  src/__tests__/log-suggestion.test.ts
```

---

## 4. Architecture

Ordinary chat can no longer write. The guarantee is **structural, not prompt-based**: `recordWriteTools` is `undefined` outright in the orchestrator, so there is no branch to get wrong and no jailbreak that can produce a draft. A tool call arriving anyway is logged and dropped.

```
A. text chat   → normal-chat prompt → focused context → DeepSeek (flag+key) or Gemini
                 → text + optional [LOG_SUGGESTION] → no proposal, no write
B. image chat  → image-chat prompt  → Gemini vision model → final answer → no 2nd call
C. "Log this"  → POST /api/chat/log-drafts → trusted DB rows → compact extraction prompt
                 → DeepSeek, 1 required tool → validate → resolve identity server-side
                 → existing RecordWriteProposal → existing queue/card → existing Confirm writes
D. failure     → typed unavailable → localized copy → Quick Log opens
```

---

## 5. Draft endpoint contract

`POST /api/chat/log-drafts` (authenticated)

```jsonc
// request — carries NO event text, transcript, or proposal fields
{ "conversationId": "uuid", "sourceAssistantMessageId": "uuid",
  "selectedPetId": "uuid?", "timezone": "Asia/Bangkok?" }

// 200
{ "success": true, "data": { "proposal": {...}, "reused": false,
                             "requiresManualSubtype": false } }

// 400 CHAT_LOG_SOURCE_INVALID     — not owned / not an offer / mismatched
// 404 (pet)                       — selectedPetId not owned
// 503 CHAT_LOG_DRAFT_UNAVAILABLE  — recoverable; { canUseQuickLog: true }
```
No provider or model name appears in any user-facing error.

---

## 6. Required-tool schema — `draft_pet_log`

```ts
category: 'activity'|'symptom'|'vet_visit'|'medication'|'weight'   // required
petId?, petReference?(≤80), subtypeText?(≤200), occurredAt?, note?(≤500)
weight?: { displayValue, displayUnit:'kg'|'lb', weightKg }          // all three required together
```
One draft per request, create-only, no amend, no record id. The model never sees or returns a `typeId`.

DeepSeek call: thinking off, `max_tokens` 1024 (separate from chat's), `tool_choice` naming the function, **standard endpoint — not the beta strict one**.

---

## 7. Provider routing truth table (chat use case)

| key | image | flag | → |
|---|---|---|---|
| ✗ | ✗ | ✗ | gemini |
| ✗ | ✗ | ✓ | gemini (falls back, never fails) |
| ✗ | ✓ | any | gemini |
| ✓ | ✗ | ✗ | gemini |
| **✓** | **✗** | **✓** | **deepseek** ← only cell |
| ✓ | ✓ | any | gemini (images outrank the flag) |

`health-insights` independent of the flag; `health-summary` pinned to Gemini; `log-draft` is DeepSeek-only with no Gemini fallback (degrades to Quick Log instead of silently asking a different model to extract a health record).

---

## 8. Prompt budget (`bun run scripts/prompt-budget.ts`, exit 0)

| Segment | Before | After |
|---|---|---|
| ordinary-chat **system prompt** | 8,888 ch | **4,076 ch (−54.1%)** |
| tool schemas in ordinary chat | present | **0** |
| subtype catalogue in ordinary chat | present (largest dynamic block) | **0** |
| amendable rows + their query | present | **0** |

Totals with synthetic fixtures — ordinary chat 4,513 ch (~1,129 latin / ~1,277 Thai-aware tokens); image chat 4,729 ch; log-draft 3,636 ch.

**Thai worst case for Codex's attention:** the ordinary-chat ceiling was cut 8,192 → 1,024 per the packet. Thai tokenizes roughly 2× denser than the character estimate, so a genuinely long Thai answer is the case most likely to clip. I did not raise the ceiling — that is a product decision.

---

## 9–11. Offer persistence, idempotency, resolution

**Persistence.** `[LOG_SUGGESTION: …]` is stripped from visible text and stored as `{kind:'logging_offer', version:1, offerText, sourceUserMessageId}` in the existing jsonb column (no migration). The stream event carries the saved assistant `messageId`. An offer with no saved user message, or on an empty reply, is dropped rather than stored unusable.

**Idempotency.** Fast-path lookup, then a `pg_advisory_xact_lock(1002, hash(user:source))` transaction with the existence check **redone inside the lock** — same shape as `proposal-commit.service`. Marker is `sourceAssistantMessageId` in proposal metadata, **declared in `proposalMetadataSchema`** because that schema is a plain `z.object` that strips unknown keys and the commit path rewrites metadata from the re-parsed object; an undeclared marker would vanish on first commit, precisely when a duplicate is most likely. Cancelled/superseded/confirmed proposals deliberately do not match.

**Pet resolution** (never guesses): owned model `petId` → verified UI selection → exact name match against owned pets (ambiguous ⇒ null) → sole pet. **Never `pets[0]`.** Unresolved ⇒ `petId: null` and the card asks.

**Subtype resolution:** NFC + case + whitespace normalized, **exact** match only, both locales, species catalogue + universal rows; unique match required. Otherwise universal Other, with the user's wording folded into the note. If Other is absent (operator-run rollout, not a migration) ⇒ `requiresManualSubtype`, never an invalid proposal. **`weight` takes no subtype** — see §19.

**Weight:** model arithmetic ignored; kg recomputed server-side; finite/positive/range-checked; user's value and unit preserved. **Time:** parsed, rejected if unparseable/future/>2y old; never invented.

---

## 12. Quick Log fallback

`CHAT_LOG_DRAFT_UNAVAILABLE` or a transport failure → localized calm copy (EN/TH per packet) → Quick Log opens. No fabricated subtype/note/time, no automatic Gemini retry, never silently nothing. `CHAT_LOG_SOURCE_INVALID` does **not** open Quick Log (the event isn't known).

---

## 13. Health-insight attribution

Real defect confirmed at `insights/orchestrator.service.ts:114`: a routed call followed by `modelUsed` read from **Gemini config**, so every DeepSeek-generated insight was stored as Gemini's. Replaced with `generateHealthInsightsRoutedWithAttribution`, which returns the serving provider's own model. Old `generateHealthInsightsRouted` removed (no callers left). No migration; no health-summary change.

---

## 14–15. Tests and verification

Added: log-draft resolver (34), routing truth table + attribution (29 total in file), FE log-suggestion (19). Reworked the suites that pinned removed tool behavior into ones pinning the new guarantees (incl. a new test that an ordinary turn **never loads the subtype catalogue**, and that the byte-identical stable prefix is preserved for prompt caching).

| Command | Exit | Result |
|---|---|---|
| `bun tsc --noEmit` | **0** | |
| `bun run build:ts` | **0** | |
| `bun run db:validate` | **0** | 0 errors, no drift |
| `bun run test` | **0** | **1847 pass / 0 fail / 3 skip, 1850 across 99 files** (throwaway Docker PG) |
| `bun run scripts/prompt-budget.ts` | **0** | |
| `./node_modules/.bin/tsc --noEmit` | **0** | |
| `bun run lint` | **0** | |
| `bun test` (fe) | **0** | 377 pass / 0 fail |
| `bun run i18n:check` | **0** | 1781 paths both locales, 0 issues |
| `bun run build` (fe) | **0** | |

---

## 16. Browser checks — **NOT DONE**

The required runtime gate is **incomplete**. The new flow cannot be meaningfully exercised without a live DeepSeek key and `DEEPSEEK_CHAT_ENABLED=true`, both of which the packet withholds. No visual pass at desktop/mobile widths was performed.

---

## 17. Dead code removed (each verified before deletion)

| Removed | Why safe |
|---|---|
| `generateChatWriteToolSection()`, `proactiveLoggingOfferBlock()` (~6.7 KB) | Prompt text is request-path only; never read from history. Sole consumer updated in the same change. |
| Orchestrator: `RECORD_WRITE_TOOLS` + `normalizeToolCall` imports, `MAX_TOOL_CALLS_PER_TURN`, `toolCallsThisTurn`, context-loader import | Orphaned **by this change**; compiler caught the one reference I missed. |
| `proposalEmitted` | Permanently `false` once ordinary chat cannot emit proposals. |
| `generateHealthInsightsRouted` | Superseded by the attribution variant; no callers. |

**Kept deliberately:** `llm-tool-adapter.ts`, tool definitions, all proposal types (describe persisted jsonb the FE still renders), `ToolDefinition` (provider facade), `normalizeProposalFields` (no production caller, but an integration suite covers it — deleting it would drop tested subtype-normalization logic).

**Pre-existing, not mine:** `extractFunctionCalls` was already unreachable before this branch.

---

## 18. Risks

1. **Vision model is two generations behind** — see §19 Q1.
2. **1024-token Thai ceiling** may clip long Thai answers; measured, not changed.
3. **DeepSeek tool reliability unproven for this path.** The old 3/6 figure measured a different question (autonomous decision during chat). This path asks one question with `tool_choice` forcing the call — likely much better, but **unmeasured**. `scripts/eval-log-draft.ts` is the gate; it is committed **unrun**.
4. **Universal Other may be absent** in an environment where the catalogue rollout hasn't run → drafts require manual subtype.
5. **FE render tests absent** — no DOM renderer in the repo; covered by pure-logic + source-assertion tests instead.

---

## 19. Decisions needed

**Q1 — vision model (packet §2).** `gemini-2.5-flash-lite` is used by no live config in this repo; every production model is 3.x (`gemini-3.1-flash-lite`, `gemini-3.5-flash`), and 2.5-flash is the generation behind the empty-STOP prod incident fixed 2026-08-23. Implemented **literally as specified**, isolated in `GEMINI_MODELS.CHAT_VISION_MODEL` — one line to change. Likely intent: `gemini-3.1-flash-lite`.

**Q2 — "5 categories" is impossible for weight.** `RECORD_TYPE_ENUM` has **four** members; `pet_weight_records` has no `type_id`; `OTHER_CONCEPT_KEY_BY_RECORD_TYPE` covers exactly those four. There cannot be a `weight.other`. Resolved as: tool keeps 5 categories (weight is a legitimate proposal *target*), subtype/Other resolution applies to the 4 record types only, weight drafts carry no subtype. The packet's required test "universal Other for each of the 5 categories" was adjusted accordingly.

**Q3 — FE render tests.** Repo has no jsdom/happy-dom/@testing-library and zero component render tests. Adding that infra is scope expansion, so I matched the established pattern and am reporting the gate as unmet.

---

## 20. Explicit confirmation

I did **not**: inspect or print environment secrets (env conventions came from tracked `src/config/env.ts` and name-only greps; the DeepSeek key pasted in chat was **not used** — recommend rotating it, it is now in plaintext in the transcript); run live model evaluations; change database schema; generate migrations; write staging/production data; change Railway; deploy; commit; push; or create a pull request.

One machine-state change was made **with explicit user authorization**: `orb start`, to run the Docker-backed test gate.
