# Decision brief: the 30-record daily limit

**Status:** needs a product decision. No code will be written until it is answered.
**Raised by:** roadmap item 5 (logger safety), blocks roadmap item 7 (care foundation).
**Date:** 2026-08-16

---

## What exists today

A hard cap of **30 records per pet per day**, enforced in two places:

- `pawjai-be/src/services/petRecordServices.ts:179` — single-record create
- `pawjai-be/src/services/petRecordServices.ts:321` — batch create, checked per pet

Both throw `dailyRecordLimitReached`. The number is a hardcoded literal in both places, not configurable, not tier-aware, and not overridable.

Worth separating from a similar-looking number: the `30` in `src/services/chat/rate-limit.service.ts:35` is the **premium daily chat-message** limit. Different concern, different subsystem. Do not conflate them.

The record limit's stated purpose in the code is abuse/runaway protection, and the implementation is deliberately careful about it — there is a comment at `:108` about the read-then-insert race, so someone thought about correctness here.

## Why it is a question now

The user flagged it as one of six open questions blocking **item 7, care foundation**. The tension:

> A pet in an acute episode — vomiting hourly, a post-surgery medication schedule, seizure tracking — can legitimately exceed 30 records in a day. The limit exists to stop abuse, but the user it actually stops is the one with the sickest animal.

That is also the sharpest form of the second question the user raised: **should a subscription limit ever block essential care logging?** Whatever is decided here sets precedent for every limit item 7 introduces (care tasks, medication outcomes), which is why it wants an answer before that work starts rather than during it.

## The options

### A. Leave it. Close the question.
30/pet/day is genuinely generous for normal use; the acute case is rare enough to absorb.
- **Cost:** the rare user who hits it is, by definition, the one in a crisis. They get a hard error at the worst moment.
- **Pick this if** you believe real users effectively never hit it. That is checkable — see "Before deciding" below.

### B. Raise the number.
Same shape, bigger literal.
- **Cost:** nothing structural, and it does not answer the precedent question — it just moves the wall. A seizure-tracking day could still hit 100.
- **Pick this if** the data shows the ceiling is merely mistuned rather than wrong in kind.

### C. Make it tier-aware.
Free keeps a low cap; premium gets a much higher one or none.
- **Cost:** this is the option that most directly answers "should subscription limits block essential care logging" with **yes**. Consider whether that is a position you want to hold, particularly for symptom and medication records.
- **Pick this if** the limit is fundamentally a monetization lever rather than an abuse control.

### D. Make it record-type aware.
Cap activity logging; exempt or greatly raise symptom / medication / vet_visit.
- **Cost:** more logic, and it needs a rule for what happens as new concept types appear (item 4's admin editor can create them). Fits the existing `isVetVisible` precedent of behavior driven by concept properties.
- **Pick this if** the abuse you are guarding against is bulk activity spam, and clinical records are simply a different category. **This is my recommendation** if the usage data shows anyone is hitting the cap at all — it protects against the actual abuse vector without ever blocking care.

### E. Make it admin-configurable.
Move it into config so it can be tuned without a deploy.
- **Cost:** `docs/future-improvement/ADMIN_CONFIGURABLE_SETTINGS.md` proposes exactly this via a generic `app_config` table, and records that it **remains unbuilt** — there is no `app_config` table in the schema. So this is not a small change; it is adopting that proposal. Pricing config already went DB-first (`pricingConfigService.ts`), so there is a working pattern to copy.
- **Pick this if** you want the number tunable regardless of which of A–D you choose. It composes with them rather than competing.

## Before deciding: one query worth running

The whole question is currently being argued from first principles. It is cheap to replace that with data:

> How many pet/day pairs have ever reached 25+ records? Broken down by record type, and by whether the owner is free or premium.

If the answer is zero, option A is defensible and this closes today. If clinical records dominate the top of that distribution, option D is nearly decided for you. I have not run this — it is a read-only query against production and needs your authorization.

## What I recommend

1. Run the query.
2. If nobody is near the cap: take **A**, and record the reasoning so item 7 inherits the answer rather than reopening it.
3. If people are hitting it: take **D**, optionally with **E** layered on so the numbers are tunable.
4. Avoid **C** unless you have decided, deliberately, that tier gating applies to clinical records. That is a product-values call, not an engineering one.

## Related

- Item 5's other half — metadata destroyed on edit — is a genuine bug and is being fixed separately in `output/item5-logger-safety-round1-packet.md`. It does **not** depend on this decision.
- Same shape as `output/share-token-gaps-decision-brief.md`: a product question surfaced by engineering work, written up rather than answered unilaterally.
