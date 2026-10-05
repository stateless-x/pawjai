# LLM Provider Migration: DeepSeek V4 + Gemini

**Branch:** `feature/llm-provider-abstraction`
**Status:** Superseded — see `docs/planning/NEXT_SESSION_HANDOFF.md` "Provider routing as it stands" for current state (Phases 1-3, 5, 6-gate done; chat routing still on Gemini).
**Last updated:** 2026-08-03

> **Staleness warning (2026-08-07).** `llm.ts` has changed since this was written and the
> specific line numbers below are wrong. Re-read the file before following any of them. The
> most important change: `generateChat` now returns `{ text, usage }`, not a bare string, and
> `generateChatStream` yields a terminal usage chunk -- the telemetry work already made part
> of the signature change this plan calls for, which shrinks Phase 1. The facade leak in
> `suggestion-context.service.ts` is unchanged and still real; note it now also means that
> path skips usage telemetry, which is a second reason to fix it.
>
> The architectural conclusions still hold: DeepSeek V4 cannot accept image input, so Gemini
> stays for vision regardless, and this is an *additional* provider rather than a replacement.

---

## Goal

Route text-only LLM work to DeepSeek V4 (cheaper, stronger reasoning) while keeping
Gemini for image understanding and, initially, tool calling. One conversation must
flow across both providers without the user noticing.

## Decision summary

| Path | Provider | Reason |
|---|---|---|
| Chat, no images | DeepSeek | Primary target. Cheapest, good reasoning. |
| Chat, with images | Gemini | DeepSeek V4 cannot accept image input at all. |
| Chat-write tools (`propose_pet_record`) | Gemini until proven | Documented silent-write failure, see Risk 1. |
| Health insights / summaries | DeepSeek | Largest spend (20k token ceiling), not latency-sensitive. |
| Translations | DeepSeek | High volume, low risk. |
| Chat titles | DeepSeek | Trivial, 100 token ceiling. |
| Suggestion context | DeepSeek | Text-only. Must route through facade first. |

## Why images cannot move

DeepSeek's Chat Completions API defines a user message's `content` as a required
**string**, not an array of content parts. There is structurally no field to put an
image in, and its Anthropic-compatibility table marks image blocks unsupported.
A `GET /models` check exposes only `deepseek-v4-flash` and `deepseek-v4-pro`, both
text-only.

The "describe with Gemini, then reason with DeepSeek" workaround was considered and
rejected: it doubles calls and latency to save on the cheaper half of the work, and
the description becomes a lossy bottleneck. Anything Gemini omits is permanently
invisible to DeepSeek, which cannot tell it is reasoning about a summary rather than
a photo. Wrong failure mode for pet health.

---

## Why "same session" is not a problem

`conversationHistory` in `generateChat` / `generateChatStream` is already
`Array<{ role, content }>` -- provider-neutral plain text. Images attach only to the
**current** message, never to history.

Neither provider holds server-side session state. Every call replays full history
from our database. So conversation continuity is guaranteed by the DB, not by the
provider, and per-message routing is safe by construction. Turn 5 can be Gemini,
turn 6 DeepSeek, turn 7 Gemini again, all seeing identical history.

### Open decision: image follow-up turns

When Gemini analyses a photo, its reply is stored as an assistant message. DeepSeek
reads that text on later turns and can discuss it. But DeepSeek never sees the pixels.

If a user uploads a photo and three turns later asks "look again, is the border
irregular?", DeepSeek answers from Gemini's earlier description, not the image.

- **Option A (recommended):** detect references to prior images ("the photo", "ดูรูป",
  "look again") and re-route that turn to Gemini with the original image re-fetched
  from CDN. Costs a heuristic plus an image fetch; keeps answers grounded.
- **Option B:** Gemini handles only the upload turn; all follow-ups go to DeepSeek.
  Simpler and cheaper, but occasionally answers detail questions from a summary
  without signalling reduced confidence.

Recommend A for a health product. Decide before implementing Phase 4.

---

## Files to change

Only three files touch the Gemini SDK today. The other ~12 that mention "gemini" are
name-only references (prompts, tests, a schema comment) and are cosmetic; renaming
them does not belong in this PR.

| # | File | Lines | Work |
|---|---|---|---|
| 1 | `src/services/pets/suggestion-context.service.ts` | 566 | Constructs `GoogleGenerativeAI` directly at :75-81 and calls `generateContent` at :467. Bypasses the facade. Route through `llm.ts` **first, as its own no-behavior-change commit.** |
| 2 | `src/services/llm.ts` | 369 | The bulk. Introduce `LlmProvider` interface behind the existing 4 exports. |
| 3 | `src/services/chat/llm-tool-adapter.ts` | 198 | `toGeminiTools()` -> OpenAI tool schema; `functionCall` -> `tool_calls`. Already correctly isolated per its own header. |
| 4 | `src/services/chat/orchestrator.service.ts` | — | Routing decision at the two existing image branches (:227, :648). |
| 5 | `src/config/gemini-models.config.ts` | — | Add DeepSeek model IDs + per-use-case provider selector. Consider renaming file to `llm-models.config.ts` in a later cosmetic PR. |
| 6 | `src/config/env.ts` | — | Add `deepseekApiKey`. Keep `geminiApiKey` -- Gemini is not going away. |
| 7 | `package.json` | — | Add `openai` SDK. **Keep `@google/generative-ai`.** |
| 8 | `src/__tests__/unit/llm/llm-retry-logic.test.ts` | — | Asserts on Gemini error strings; will fail. Needs per-provider cases. |

---

## What actually breaks (not the imports)

### Risk 1 -- Tool calling silently loses data. HIGHEST.

`gemini-models.config.ts:61-65` documents a real production incident: a weaker model
"wrote a formatted 'I recorded the symptom' message instead of emitting
propose_pet_record, so no DB write happened." That is why `CHAT_TOOL_MODEL` is pinned
to `gemini-2.5-flash`.

The user sees a success message and nothing is written. Benchmarks also show Gemini
ahead of DeepSeek on Toolathlon (tool use) specifically.

**Mitigation:** tool calling stays on Gemini until a dedicated test suite exercises
`RECORD_WRITE_TOOLS` against DeepSeek and proves it emits calls reliably. A type-check
proves nothing here. Flip per-use-case only after that passes on staging.

### Risk 2 -- Streaming chunk shape differs.

`llm.ts:293-334` iterates `streamResult.stream`, reads
`candidates[0].content.parts[]`, and checks `finishReason !== STOP`. OpenAI-compatible
streams use `choices[0].delta` with `finish_reason` of `stop` / `length` / `tool_calls`.
Both the loop body and the `LlmStreamChunk` mapping change.

### Risk 3 -- `isRetryable()` is Gemini-specific.

`llm.ts:27` matches `503 / 429 / 500 / overloaded / quota` -- Gemini's error strings.
Against DeepSeek this silently stops retrying. Needs to become per-provider.

### Risk 4 -- Context caching semantics differ.

`enableCaching: true` in the insights config maps to Gemini's **explicit** context
caching for pet profiles. DeepSeek uses **automatic prefix caching** instead. The flag
silently becomes a no-op. Not a correctness bug, but the expected saving will not
appear where assumed.

### Risk 5 -- Structured JSON output.

`llm.ts:125` sets `responseMimeType: 'application/json'`. DeepSeek supports JSON
output mode but the strictness guarantee is not identical. The 20k-token premium
insight path parses this JSON; prose-wrapped or truncated output is a user-visible
failure. Needs explicit validation, not trust.

### Risk 6 -- Latency regression on chat.

DeepSeek time-to-first-token ~1.16s vs Gemini ~0.87s, plus geographic latency from a
China-hosted API. Chat streams, so users feel this as a slower first word. This is the
main argument for keeping streaming chat on Gemini longer than the other paths.

### Risk 7 -- Data residency.

Pet health data would transit a China-hosted API. If Thai PDPA obligations or EU users
are in scope, this is a compliance decision, not a technical one. **Confirm before
shipping.**

---

## Implementation phases

Each phase is separately reviewable and independently revertable.

### Phase 0 -- Measure first (BLOCKING)

Pull actual Gemini spend from Google AI Studio for last month.

This whole migration is a **spend** optimisation. It does not reduce the Railway bill
(Gemini stays, so `@google/generative-ai` and its boot cost stay). If current spend is
under roughly $50/month, the correct decision is to park this branch and revisit at
volume. **Do not start Phase 1 without this number.**

### Phase 1 -- Route suggestion-context through the facade

No behaviour change, no provider change. Pure refactor so all LLM access goes through
`llm.ts`. Makes the later diff reviewable and shrinks the SDK surface from 3 files to 2.

Verify: `bun tsc --noEmit`, `bun run build:ts`, suggestion output unchanged.

### Phase 2 -- Provider interface

Define `LlmProvider` behind the existing 4 exports (`generateText`,
`generateHealthInsights`, `generateChat`, `generateChatStream`). Implement Gemini as
the first provider. Still 100% Gemini at runtime; no caller changes.

Also make `isRetryable()` per-provider (Risk 3).

Verify: full test suite green, staging behaviour identical.

### Phase 3 -- DeepSeek provider, lowest-risk paths only

Add the DeepSeek implementation. Enable **only** for: chat titles, translations,
suggestion context. All text-only, no tools, not latency-critical.

Add per-use-case env flags so each path flips independently and rolls back alone.

Verify on staging: output quality, JSON validity (Risk 5), retry behaviour.

### Phase 4 -- Chat routing

Route no-image chat turns to DeepSeek; image turns stay on Gemini. Decide Option A vs
B for image follow-ups first.

Watch time-to-first-token on staging (Risk 6). If the regression is felt, keep chat on
Gemini and stop here -- the insights savings are already banked.

### Phase 5 -- Health insights and summaries

Largest spend, so the biggest win, but also the 20k-token JSON path. Move only after
Phase 3 has proven DeepSeek JSON reliability in production.

### Phase 6 -- Tool calling (only if justified)

Requires a dedicated `RECORD_WRITE_TOOLS` test suite proving reliable emission. If
DeepSeek shows any regression, **stop and keep Gemini.** The savings on this path do
not justify silent data loss.

---

## Expected outcome

Blended pricing: DeepSeek V4 Flash ~$0.06/1M vs Gemini 3.1 Flash-Lite ~$0.22/1M,
roughly 3.7x cheaper, plus a 90% prefix-cache discount that fits repeated pet-profile
prompts well.

On the earlier 10,000-user projection, the Gemini line of ~$300-800/mo would fall to
roughly ~$80-220/mo **if all paths move**. Phases 3 and 5 alone capture most of it,
since insights dominate token volume.

Cost of the change: two providers, two SDKs, two keys, two failure modes, permanently.

### Alternative worth considering

If two providers is unwanted operational complexity, **GPT-5 Mini (~$0.25/1M) handles
both text and vision.** One SDK, one key, moderate savings vs Gemini, and it deletes
the entire routing problem including the image follow-up decision. Worse per-token than
DeepSeek on text; better on simplicity. Reasonable choice for a small team.

---

## Rollback

Every phase is behind a per-use-case flag. Rollback is flipping a flag to `gemini`,
no redeploy needed if flags are env vars. No schema changes, no migrations, no data
changes anywhere in this migration.
