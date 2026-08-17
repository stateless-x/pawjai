# RELEASE PACKET: v1.8.0 to production (paste to the worker; Round 1 standing rules remain in force)

**This packet touches PRODUCTION.** It is split into stages with hard stops. Each stage after Stage 1 needs a fresh "go" from the user relayed through the orchestrator. Do not chain stages. If anything looks wrong at any point, STOP and report rather than proceeding or working around it.

## What is being released

All 6 PRs are merged; staging is ready in both repos.
- pawjai-be `origin/staging` = `dc6f831`, prod `origin/master` = `aa05ade`
- pawjai-fe `origin/staging` = `e7888f6`, prod `origin/main` = `b29f79e`

Contents: Phase 2.3C (helper history localization), 2.3D (chat receipt identity), 2.3E (vet-visibility enforcement + vet share localization + Thai PDF), the rate-limit test fix, the APNs/Apple-Sign-In doc correction, plus earlier unreleased work (concept catalog API, catalog content rollout, quick-log changes, rebrand/Mixpanel).

**Verified by the orchestrator: ZERO pending migrations in either repo.** This is a code-only deploy. If you find a pending migration at any point, STOP immediately -- that would contradict this analysis and must be resolved before anything ships.

## STAGE 1: Staging verification (READ-ONLY, no writes anywhere)

Two surfaces are new and user-facing and have never run outside a test suite. Exercise them against **staging** (not production):

1. **Vet share.** Generate or open a vet-share link. Confirm: record labels render localized (not raw legacy names), and the PDF export opens with **Thai glyphs rendering correctly, not boxes or blanks** -- this is the one the orchestrator most wants confirmed, since it was verified only via an html2canvas harness, never a real export. Also confirm no withheld-count notice appears (expected: zero withheld records exist today).
2. **Chat receipt.** Log something through Pepe. Confirm the receipt card shows a real subtype label, then switch UI language and confirm the label **re-localizes** rather than staying frozen.

Report what you observed. Screenshots or plain description both fine. **Do not fix anything you find** -- report it and stop; a defect here cancels the release rather than triggering a patch.

**HARD STOP. Report Stage 1 and wait for explicit authorization before Stage 2.**

## STAGE 2: Version bumps (needs fresh authorization)

User-approved versions: **both repos to 1.8.0** (realigns them onto one number).

1. pawjai-be: bump `package.json` version `1.7.6` -> `1.8.0` on a fresh checkout of `staging`. Commit directly to `staging` (this is the documented flow -- no PR for release bumps). Stage `package.json` by name only. Never `--no-verify`.
2. pawjai-fe: bump `package.json` version `1.7.5` -> `1.8.0` on `staging`, same way.
3. Push both `staging` branches.
4. Report both commit SHAs and confirm both pushes succeeded.

**HARD STOP. Report Stage 2 and wait for explicit authorization before Stage 3.**

## STAGE 3: Merge staging to production (needs fresh authorization -- IRREVERSIBLE)

This is the step that ships. Per the documented flow: merge staging directly into prod, no PR.

1. **pawjai-be**: merge `staging` into `master`, push `master`.
2. **pawjai-fe**: merge `staging` into `main`, push `main`.
3. Deploy order does not matter (verified in code for both 2.3D and 2.3E: no coupling, both directions degrade gracefully). Do them in whichever order is convenient, but report which you did first.
4. If either merge produces a conflict, STOP and report. Do not resolve a production merge conflict without a fresh packet.
5. Never force-push. Never `git add -A`.

After both merges, watch the deploys. Report the deploy status for each service and confirm the backend `/health` endpoint returns ok/healthy with `pendingMigrations: []`.

**HARD STOP. Report Stage 3 and wait for explicit authorization before Stage 4.**

## STAGE 4: Tag, sync, and bump submodules (needs fresh authorization)

1. Tag both repos `v1.8.0` at the released commit and push tags.
2. Sync `staging` and prod branches so they do not drift.
3. Parent repo `/Users/purin/dev/pawjai` (on `main`): update the `pawjai-be` and `pawjai-fe` submodule pointers to the newly released commits. Stage exactly those two paths by name. **Do not touch the `pawjai-admin`, `pawjai-android`, or `pawjai-ios` pointers** -- they show as modified but are unrelated to this release and out of scope.
4. Report the parent commit SHA. Do not push the parent repo without confirming that is wanted.

## STAGE 5: Post-release verification (read-only)

Repeat Stage 1's two checks **against production**: vet share (labels + Thai PDF) and a chat receipt (label + re-localization). Also confirm the backend `/health` is still healthy.

If either surface misbehaves in prod, STOP and report immediately with exactly what you observed. Do not attempt a fix, a revert, or a hotfix without a fresh packet -- a production rollback decision belongs to the user.

## RETURN TO ORCHESTRATOR (report after EACH stage separately)

State the stage number, what you did, the exact SHAs/tags involved, what you observed, and anything unexpected. Then stop.

Never proceed past a stage boundary on your own initiative, even if the next step seems obvious and safe.
