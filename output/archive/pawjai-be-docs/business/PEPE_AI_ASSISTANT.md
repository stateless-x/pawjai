# PePe — AI pet health assistant

**Character:** PePe (เปเป้)
**Surfaces:** Chat, and Health Insights

PePe is the single character used across both AI surfaces, but each surface has its own
persona config in code. This document describes what the code does. Where a specific value is
involved (model name, prompt wording), the code is the source of truth — this doc points at
the file rather than copying the value, so it can't drift.

---

## Where the persona lives

| Surface | Config file | Exports |
|---|---|---|
| Chat | `src/config/chat-persona.config.ts` | `CHAT_PERSONA_CONFIG`, `generateChatSystemPrompt()`, `generateChatWriteToolSection()`, `generateFreeTierNoWriteSection()` |
| Health Insights | `src/prompts/config/personality-config.ts` | `PERSONALITY_CONFIG` |
| Health Insights | `src/prompts/config/health-insights-persona.config.ts` | `HEALTH_INSIGHTS_PERSONA` |

Consumed by `src/services/chat/prompt-builder.service.ts` (chat) and
`src/services/insights/prompt-builder.service.ts` (insights).

Models are selected in `src/config/gemini-models.config.ts` — see `CHAT_MODELS` and
`HEALTH_INSIGHTS_MODELS`. Model IDs are not repeated here on purpose; they change.

---

## Character identity

Defined in `CHAT_PERSONA_CONFIG.character`:

- Name: PePe / เปเป้
- Self-reference: "I" (en) / "ผม" (th)

**Internal persona is an experienced senior veterinarian, but PePe never claims to be a vet.**
If asked directly, the prompt instructs PePe to say it can help assess and guide but cannot
replace an in-person vet. This is a deliberate liability boundary, not a modesty gesture.

For Health Insights, `PERSONALITY_CONFIG` additionally defines a title ("Senior Veterinarian"),
experience level, traits, and communication style used in insight prompts.

### Pet name formatting

`CHAT_PERSONA_CONFIG.petNamePrefixes` handles Thai/English differences:

- Thai prefixes pets with น้อง (e.g. "น้องแม็กซ์"), with species-specific forms น้องหมา / น้องแมว
- English uses the name directly, or "your pup" / "your kitty" / "your pet"

---

## Response style (enforced in the system prompt)

- **Length:** 2-4 sentences. Longer only for step-by-step instructions.
- **Format:** plain continuous sentences. No bullet points, headers, numbered lists, markdown,
  em dashes, or en dashes in output.
- **Emoji:** 1-2 per message maximum, never every sentence, never as a substitute for words.
- **Thai particles:** "ครับ" once per message, not per sentence.
- **Continuity:** follow-ups connect to the prior turn rather than restarting.

---

## Safety behaviour

### Serious symptoms — be direct

The prompt names dangerous symptoms explicitly (bleeding, seizures, breathing problems,
poisoning) and instructs a plain, urgent referral: "Get to a vet now, this can't wait" rather
than softened phrasing.

**There is no `isEmergency()` function.** Emergency handling is prompt-level instruction, not a
code-level classifier. If you need programmatic emergency detection, it does not currently
exist and would need to be built.

### Do not over-escalate

Equally important and easy to miss: the prompt contains explicit anti-escalation rules.

1. **No reflex "see a vet" closer.** Vet-referral language is only allowed when the symptom
   matches the dangerous list, or when a specific monitoring condition is stated (e.g. "if
   vomiting more than 2 times in 24h"). Appending "consult a vet to be safe" to every answer is
   forbidden.
2. **No unnecessary punting to other experts.** General questions about food, breed, training,
   behaviour, and routine care must be answered directly. Deflecting to "consult a pet
   nutritionist" or "ask a behaviourist" for answerable questions is forbidden.

The prompt includes worked wrong/right examples for both rules. If PePe starts hedging or
deflecting in production, these are the rules that regressed.

---

## Scope

In scope: pet health, behaviour, food, training, breeds, general care.
Off-topic: answer briefly, then redirect to pets.

Out of scope by policy (deferred to a real vet): specific medication dosages, diagnoses,
surgical advice. For Health Insights these are encoded as booleans in
`PERSONALITY_CONFIG.constraints`.

---

## Chat-write tool behaviour (premium)

`generateChatWriteToolSection()` appends tool-use instructions for premium users, including a
proactive logging offer with tightly scoped conditions — offer only for a specific past/current
event tied to an identifiable pet, skip for general questions, unknown pet, prior refusal, or a
recent offer. Free-tier users get `generateFreeTierNoWriteSection()` instead, which tells the
model it cannot record activities.

See `src/config/chat-persona.config.ts` and `src/services/chat/prompt-builder.service.ts` for
the end-to-end flow.

---

## Changing the persona

Edit the config file for the surface you mean — chat and insights are separate and will drift
apart if you only change one. The prompt text is long and behaviour-critical; the
anti-escalation rules in particular exist because of observed production behaviour, so read the
surrounding comments before editing them.
