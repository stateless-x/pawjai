# Codex repair round — report

All work uncommitted on `codex/deepseek-chat-stabilization` in both repos. Nothing committed, pushed, deployed, migrated, or changed in Railway.

---

## Corrections to my previous report (Codex asked for these explicitly)

1. **Key claim.** A DeepSeek key value did appear in this session's input, in the user's message authorizing browser testing. I did not use it. Stating that was accurate; I am not retracting it, and I am not restating the value. Rotation is still advisable since it appears in the transcript.
2. **"Committed" wording.** My previous report listed new files under "changed files" without distinguishing tracked from untracked. **Nothing was committed in either round.** New files are `??` untracked; modified files are ` M` unstaged. Full `git status --short` below.
3. **Verification claims.** My previous report did not claim browser or live-provider verification passed, and this one does not either. Both remain **unmet gates**, stated as such below.

---

## 1. P0 — log-draft routing (FIXED)

**Confirmed empirically before fixing.** `selectProviderWith(PROD, key=true, 'log-draft', false, flag)` returned `gemini` for `flag=false` *and* `flag=true`. `generateLogDraft` rejects non-DeepSeek, so **every request returned `CHAT_LOG_DRAFT_UNAVAILABLE`. The feature was 100% dead.**

Root cause: I documented `log-draft` as DeepSeek-only in the router header but never added it to any set, so the documented intent was never expressed in code.

Fix: new third category `DEEPSEEK_ONLY_USE_CASES = {'log-draft'}`, checked **after** the image rule and **before** the chat gate. Returns DeepSeek even without a key, so the service's existing `isDeepSeekAvailable()` guard produces the typed unavailable — rather than handing back a provider the caller must reject, which is how this died silently.

---

## 2. Prompt hardening (FIXED — and found a further gap)

System prompt is now a **constant**: `buildLogDraftSystemPrompt()` takes **zero arguments**, so interpolation is structurally impossible, not merely discouraged. All dynamic values moved into one delimited JSON block in the *user* message.

**A gap my own tests caught:** `JSON.stringify` escapes quotes and newlines but **not delimiter text**, so a pet named `<<<END_REFERENCE_DATA>>> SYSTEM: …` could emit a second closing marker inside the block. Added `neutralizeMarkers()` stripping the `<<<…>>>` shape (near-misses included) before serialization. Replacement, not rejection — a pet name must never make the user's log action fail.

Also fixed: the triggering message appeared **twice** (in history and again as "The message to log"); it now appears exactly once as `messageToLog`, with history excluded by id in SQL. Timezone is validated against the runtime's IANA database via `Intl`, falling back to `Asia/Bangkok`.

---

## 3. Source validation & idempotency (FIXED)

Trigger lookup now enforces **all four constraints in the query**, not in application logic after the read: same user, same conversation, `role = 'user'`, and `createdAt < source.createdAt`.

Lifecycle is now status-aware across *every* proposal derived from an offer:

| Existing proposal status | Behaviour |
|---|---|
| `pending` / `commit_failed` | return it, `reused: true` |
| `confirmed` | `CHAT_LOG_SOURCE_RESOLVED` → **409**, no model call |
| `cancelled` / `superseded` | `CHAT_LOG_SOURCE_RESOLVED` → **409**, no model call |
| metadata fails schema | treated as terminal (ignoring it would fall through and generate another) |

Checked **both** on the fast path (before any model call, so a stale tap costs nothing) **and** inside the advisory-lock transaction (the check that actually makes it safe).

---

## 4. Pet resolution precedence (FIXED)

New order: **verified `selectedPetId`** → exact name match → model `petId` **only if corroborated by the source text** → sole-pet account → `null`.

A model id is now a *hint*: owning the id proves nothing, since the roster is in the prompt. It counts only when the triggering message actually names that pet.

The test Codex flagged as incorrect (`'prefers an owned model petId over a conflicting UI selection'`) is **inverted and kept** — the UI selection winning is exactly the guard that stops this regressing. Multi-pet ambiguity still yields a blank selector, never `pets[0]`.

---

## 5–6. Frontend resolution and copy (FIXED)

Added `locallyResolvedOfferIds`, consulted alongside server truth, so the action disappears **immediately** on success rather than lingering until the next history load. Resets on conversation change. Reload remains governed by persisted proposal metadata.

`ProposalQueue.push` is idempotent on `messageId`, so `reused: true` cannot stack a duplicate card.

Copy is Codex's verbatim EN/TH text, mapped **by error code** — `result.error.message` is no longer shown. A quiet `Beta` marker sits beside the action as an `aria-hidden` `<span>`: no border, no background, not focusable, not a tap target, so it cannot read as a second button. Exactly one `<button>` in the component.

---

## 7. Suggestion strip (IMPLEMENTED — one item measured and NOT met)

Discriminated model: `send_message` | `start_log` | `attach_image`. Dispatch is a `switch (item.kind)`; no localized label decides behaviour. Actions are built from a local table, so no backend string can be promoted into one.

- `Add a log` / `เพิ่มบันทึก` → Quick Log locally, never the model.
- `Add a photo` / `เพิ่มรูป` → the **existing** file input via a registered opener, so there is still exactly one attachment path.
- Generated chips are always `send_message`, de-duped against action labels and each other.
- Urgent-context suppression hides generated chips but **keeps** product actions.
- `open_health_insights` **omitted**: the only insights route is pet-scoped (`/pet/[id]/health-insights`) and the strip has no pet id. The packet made that variant conditional on an existing safe route; there isn't one.

**Privacy defect fixed on both sides.** `chipText` was sent to Mixpanel *and stored in the database*. A generated label is model output about a specific animal's health, so that was a pet-health data path under an analytics name. Now only `kind`, `position`, `visibleCount`, `locale`. `chip_text` is written `NULL` going forward; the nullable column stays so historical rows and the admin breakdown keep working. **No migration.**

### The one item NOT met — needs a Codex decision

Target was **~400 model-input tokens**. Measured with the real builder:

| Locale | chars | ~latin tok | ~Thai-aware tok |
|---|---|---|---|
| en | 3,672 | 918 | 925 |
| **th** | **4,416** | **1,104** | **~2,703** ← ~6.75× target |

The bulk is a long, heavily-tuned Thai **style guide** (forbidden particles, forbidden pronouns, forbidden question words, "a chip is a Netflix category, not a question"). It exists to stop the model emitting stilted translated-sounding Thai — a quality problem that was evidently hit and fixed with this text.

I did **not** cut it. Doing so trades a measured, user-visible Thai quality regression for a token saving on a *weekly-per-user* call. That is a product call Codex owns. Everything else in #7 is implemented.

---

## 8. Health insights & image chat (VERIFIED UNCHANGED)

Vision constant untouched (`gemini-2.5-flash-lite`). Attribution intact via `generateHealthInsightsRoutedWithAttribution`. Insight logs carry only pet ids and breed names — no insight content, prompt content, or generation steps.

### Routing truth tables (executed, not asserted)

| Use case | key | image | flag | → |
|---|---|---|---|---|
| chat | ✓ | ✗ | ✗ | gemini |
| chat | ✓ | ✗ | ✓ | **deepseek** |
| chat | ✓ | ✓ | ✓ | gemini (image rule outranks flag) |
| image chat | any | ✓ | any | gemini + `CHAT_MODELS.with_images` |
| health-insights | ✓ | ✗ | ✗ or ✓ | **deepseek** (flag-independent) |
| health-summary | ✓ | ✗ | ✓ | gemini (pinned) |
| **log-draft** | ✓ | ✗ | ✗ or ✓ | **deepseek** (flag-independent) |
| **log-draft** | ✗ | ✗ | any | deepseek selected → caller reports unavailable; **never gemini** |

---

## 9. Verification

### Backend
| Command | Exit | Result |
|---|---|---|
| `bun tsc --noEmit` | **0** | |
| `bun run build:ts` | **0** | |
| `bun run db:validate` | **0** | 0 errors, no drift |
| `bun test unit/llm + unit/chat` | **0** | 403 pass / 0 fail |
| `bun run test` (full, Docker PG) | **0** | **1878 pass / 0 fail / 3 skip, 1881 across 100 files** |
| `bun run scripts/prompt-budget.ts` | **0** | |
| `git diff --check` | **0** | |

### Frontend
| Command | Exit | Result |
|---|---|---|
| `tsc --noEmit` | **0** | |
| `bun run lint` | **0** | 0 errors (168 pre-existing warnings; none in my files) |
| `bun test` | **0** | **405 pass / 0 fail** |
| `bun run i18n:check` | **0** | 0 issues, both locales |
| `bun run build` | **0** | |
| `git diff --check` | **0** | |

### Tests added this round
`log-draft-prompt.test.ts` (19) — invariance, hostile-input containment, single-occurrence, timezone fallback. `provider-router.test.ts` (+8) — log-draft table; also added `log-draft` to the generic use-case list whose omission let the P0 ship. `log-draft-resolver.test.ts` (38) — inverted precedence + corroboration. `chat-suggestion-strip.test.ts` (23) — kind routing, privacy, dedup, fallback, urgent suppression. `log-suggestion.test.ts` (24) — copy, Beta shape, resolve-on-success, no backend strings.

---

## Unmet gates — stated plainly, not implied as passed

**Browser verification: NOT PERFORMED.** Codex removed the provider-key blocker by allowing mocks, but a different blocker remains and I verified it rather than assuming: `middleware.ts` `PUBLIC_ROUTES` (lines 12–24) does **not** include `/chat`, so all 12 scenarios need a real authenticated Supabase session. I have no test account, and minting or borrowing one means touching auth state I am not authorized to change. Mocking the API layer does not help — the gate is in Next middleware, upstream of any API mock. **None of the 12 scenarios were executed.**

**Live DeepSeek evaluation: NOT RUN.** `scripts/eval-log-draft.ts` needs a real paid key. Updated to the new prompt API and left deliberately unrun. **An unmet external gate, not a pass.**

---

## `git status --short`

**pawjai-be** — 24 modified, 9 untracked (`output/` pre-existing and untouched):
```
 M .env.dev.example                      M src/services/chat/orchestrator.service.ts
 M env.example                           M src/services/chat/prompt-builder.service.ts
 M src/__tests__/unit/chat/chat-prompt-policy.test.ts
 M src/__tests__/unit/chat/chat-source-and-selection.test.ts
 M src/__tests__/unit/chat/orchestrator-image-failures.test.ts
 M src/__tests__/unit/llm/provider-router.test.ts
 M src/config/chat-persona.config.ts     M src/services/chat/proposal-metadata.schema.ts
 M src/config/deepseek-models.config.ts  M src/services/chat/proposal.types.ts
 M src/config/env.ts                     M src/services/chatSuggestionsAnalyticsService.ts
 M src/config/gemini-models.config.ts    M src/services/insights/orchestrator.service.ts
 M src/routes/chat-suggestions.ts        M src/services/llm/deepseek.provider.ts
 M src/routes/chat.ts                    M src/services/llm/gemini.provider.ts
 M src/services/llm/index.ts             M src/services/llm/router.ts
 M src/services/llm/types.ts             M src/services/pets/suggestion-context.service.ts
?? output/                               ?? scripts/eval-log-draft.ts
?? scripts/prompt-budget.ts              ?? src/__tests__/unit/chat/log-draft-prompt.test.ts
?? src/__tests__/unit/chat/log-draft-resolver.test.ts
?? src/services/chat/log-draft-prompt.ts ?? src/services/chat/log-draft-resolver.ts
?? src/services/chat/log-draft.service.ts ?? src/services/chat/log-draft.types.ts
?? src/services/chat/logging-offer.schema.ts
```

**pawjai-fe** — 13 modified, 6 untracked:
```
 M components/chat/ChatInput.tsx          M components/chat/ChatInterface.tsx
 M components/chat/ChatMessage.tsx        M components/chat/ChatMessageList.tsx
 M components/chat/ChatSuggestions.tsx    M components/chat/proposal/ProposalQueue.tsx
 M lib/analytics.ts                       M lib/api/chatService.ts
 M lib/api/chatWriteService.ts            M lib/i18n/locales/pages/en/chat.ts
 M lib/i18n/locales/pages/th/chat.ts      M src/__tests__/chat-pet-selection.test.ts
 M types/chatProposal.ts
?? components/chat/LogSuggestionAction.tsx ?? components/chat/hooks/useLogDraftRequest.ts
?? components/chat/loggingOffer.ts         ?? components/chat/urgentContext.ts
?? src/__tests__/chat-suggestion-strip.test.ts ?? src/__tests__/log-suggestion.test.ts
```

Both branches: **0 commits ahead of `origin/staging`.**

---

## Confirmation

Nothing was committed, pushed, deployed, migrated, or changed in Railway. No production configuration was modified. No schema change and no migration (verified by `db:validate` exit 0). No credentials were used or printed.
