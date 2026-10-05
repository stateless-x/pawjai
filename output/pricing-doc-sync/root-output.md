# Pricing Documentation Sync Changelog - 2026-10-02

## Summary
Updated 3 root-level output/*.md files to reflect current Pawjai pricing model. No free tier exists; single Pawjai Premium plan with intro-first-month pricing on monthly cycle, plus quarterly and yearly options. Canon source: pawjai-public/src/lib/subscription/pricing.ts.

## Files Updated

1. **three-tier-billing-plan.md**
   - Added top-level supersession banner noting 2026-10-02 pricing model change
   - Clarified: intro first-month (79 THB / 3.99 USD) renews to 199 / 9.99 USD
   - Quarterly (499 THB / 24.99 USD) and yearly (1790 THB / 79.99 USD) are plain prices
   - Category: Dated plan (superseded, kept for historical reference)

2. **pricing-constants-migration-plan.md**
   - Added top-level supersession banner noting obsolete multi-tier context
   - Noted current single-plan model with no discount tiers
   - Category: Dated plan (superseded, kept for historical reference)

3. **pricing-model-prep-round1-packet.md**
   - Added top-level supersession banner explaining pricing model change
   - Noted no trial model (previously referred to 7-day trial)
   - Noted pricing is intro-first-month on monthly only, not quarterly
   - Category: Dated plan (superseded, kept for historical reference)

## Pricing Canon Confirmed
- Monthly: 79 THB first month / 3.99 USD first month; renews 199 THB / 9.99 USD
- Quarterly: 499 THB / 24.99 USD (no trial, plain price)
- Yearly: 1790 THB / 79.99 USD (no trial, plain price)
- No discount language on quarterly/yearly (plain prices, not derived savings)
- No free tier or free plan
- No trial offer in current model

## Files Not Modified (No Pricing Content)
- README.md: No pricing references
- ORCHESTRATOR_HANDOFF.md: No pricing amounts mentioned
- ADR-pawjai-public-cutover.md: No pricing amounts mentioned
- CODEX_REPAIR_REPORT_round2.md: No pricing amounts mentioned
- CODEX_HANDOFF_AUDIT.md: No pricing amounts mentioned
- CODEX_REPORT_deepseek_chat_stabilization.md: No pricing amounts mentioned
- daily-record-limit-decision-brief.md: No pricing amounts mentioned
- public-app-auth-migration-plan.md: Only references /tier page, not pricing data
- DOC_HYGIENE_AUDIT_2026-08-26.md: No pricing amounts mentioned
- timeline-pet-improvement-plan-2026-08-18.md: References "trial" as UX testing, not billing

## Notes
- All updated files carry "Superseded" notices pointing to pawjai-public/src/lib/subscription/pricing.ts as canon
- Living documents (ORCHESTRATOR_HANDOFF, etc.) retained without pricing edits since they don't state amounts
- No changes to any code files or submodule directories

## Coordinator note (2026-10-02)
- output/daily-record-limit-decision-brief.md was left untouched; check whether its daily record limit is a free-tier entitlement before the code cleanup.
