# SMALL PACKET: finish vet-share page i18n (paste to the worker; ORCHESTRATOR_HANDOFF.md standing rules in force)

**Refreshed 2026-08-16 post-v1.8.0:** all 2.3E PRs merged and released; every line number below re-verified against `origin/main` = `origin/staging` content. Rounds: implement+verify → report → commit round → push/PR round, each needing fresh authorization.

Scope is deliberately tiny: 6 hardcoded English strings left on the vet-share page after Phase 2.3E. No logic changes, no new patterns. Do not expand beyond this list.

## Base

`git fetch origin`, branch off fresh `origin/staging` (post-release; staging == main content).

Worktree `/Users/purin/dev/pawjai/pawjai-fe-vet-share-i18n-cleanup`, branch `codex/vet-share-i18n-cleanup-staging`.

## The strings

`components/share/VetShareView.tsx`:
- `:441` "Generating PDF..."
- `:467` "Download PDF"
- `:487` "Most Frequent Symptoms (Last 7 Days)" -- note the embedded `7`, which comes from `getFrequentSymptoms`'s `days` param. Interpolate it (`{{days}}`) rather than baking "7" into the translated string, so the two cannot drift apart.
- `:538` "History Period:"
- `:542` "This link expires on" -- **the priority one.** It currently renders English text immediately before a localized Thai date, which is the most visibly wrong string on the page.

`components/share/RecordCard.tsx`:
- `:47` "Severity: {vibe}/5"

Also check the PDF's own copy of the "Most Frequent Symptoms" heading (there is a second occurrence around `:321` inside `generatePdfHtml`) and localize it consistently if it is still English.

## How

- Extend the existing `lib/i18n/locales/pages/{en,th}/vetShare.ts` files. Do not create new locale files.
- Use the flat `t("pages.vetShare.*")` lookup with `{{var}}` interpolation. Do not invent pluralization; match the existing `"record(s)"` precedent if a count needs it.
- Thai translations should match the register already used in that file.

## Verify

`bunx tsc --noEmit`, `bun run lint`, `bun run build`. **Report exit codes, not just printed counts.** Confirm by grep that no hardcoded English remains in the two files beyond the product name "Pawjai" and any deliberate technical strings.

## Authorization

Commit is authorized (stage exact files by name; never `git add -A`, never `--no-verify`). Push and open a PR against `staging` is authorized. **Do NOT merge, do NOT enable auto-merge.**

## RETURN TO ORCHESTRATOR

1. Which base you branched from and why.
2. Files touched, path:line, plus the new locale keys.
3. Grep evidence that no hardcoded English remains in those two files.
4. tsc/lint/build with exit codes.
5. Commit SHA, PR URL/number, target branch.
6. Anything unexpected.

Stop after this report.
