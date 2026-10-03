---
status: in progress, code complete on local branches (see §10)
updated: 2026-10-03
scope: Bunny CDN static assets + user-upload storage hygiene across pawjai-fe, pawjai-public, pawjai-react-native, pawjai-be
evidence: inventory-2026-10-02.tsv (every fe manifest URL fetched with Referer, real bytes)
---

# CDN assets: reorganize Bunny, shrink the art, stop leaking storage

## 1. Summary

| # | Phase | User impact | Cost | Touches prod data? |
|---|---|---|---|---|
| 0 | Re-encode oversized lookup + species icons **in place** (same URLs) + fix the `vitamins.webp` 404 | High: about 4.4 of 5.6 MB less on a cold device's first login | Small, no client deploy | Bunny writes only (originals archived first) |
| 1 | Stop orphaning old avatars on replace (be) | None visible; stops storage leak | Small | No |
| 2 | One canonical manifest + codegen; new `static/` tree created by **copy** | None visible; kills drift between 4 copies | Medium | Bunny writes only |
| 3 | Switch fe / public / RN to generated manifest; move fe local heavy files to Bunny; prune dead repo files | Medium (Feliway ad 4.7 MB, memorial bg 2 MB) | Medium | No |
| 4 | Migrate `pet_record_types.icon_url` + seed to new paths | None visible | Small, staging then prod | Yes (UPDATE, reversible) |
| 5 | Orphan reconciliation report (read-only), then owner-approved cleanup | None visible | Small | Bunny deletes only with approval |
| later | Bunny Optimizer, relative keys in DB, `cdn.pawjai.co` hostname, chat image retention, retire old `WebAssets/` | Low at ~300 users | | |

Rule for the whole plan: **old `WebAssets/...` paths are copied, never moved or deleted**, until Bunny traffic stats show zero hits and the owner approves. Frozen pawjai-ios (`PawjaiMobile/Core/Assets/CDNAssets.swift`, 70 refs), shipped binaries, DB rows, blog bodies and emails all hardcode them.

## 2. Measured facts (2026-10-02)

Static art (from `inventory-2026-10-02.tsv`, fetched with `Referer: https://pawjai.co/`):

- Icons are **1024x1024 px** (`clock`, `dog-walk`, `male`) or 1080 (`Lookups/Main/*`) but render at 16 to 96 px (`ResponsiveIcon` sizes). 150 to 220 KB each.
- sharp re-encode test, WebP q80 at 288 px: `clock` 216 KB to 13 KB; `dog-walk` 153 to 12; `activity` 111 to 7; `male` 158 to 10. About **95 percent smaller**. (About-page art belongs to a larger size class and is not in this sample.)
- fe `lib/utils/imagePreloader.ts` warms after login: critical set (avatars, species, main lookups, 3 home icons, 5 health icons) about **1.8 MB**; idle set (30 lookup subtype icons) about **3.8 MB**. Total about **5.6 MB on a cold device's first login** (4G/5G only). Bunny serves `cache-control: max-age=25600000` (~296 days), so warm devices do not re-pay it, and a purge does not evict browser caches: existing devices keep the old bytes until expiry, which is harmless.
- Homepage "SVGs" are base64 PNGs: `Pepe create profile 1.svg` 1.75 MB, `Pepe Review.svg` 1.63 MB, `... 2.svg` 1.05 MB (already flagged in `~/codemaps/pawjai-fe-seo-speed.md` P1 round 2).
- About page PNGs 280 to 735 KB each; upgrade banners 8.8 MB (mobile PNG) and 1.1 MB (desktop).
- `WebAssets/Video/ice3000.webm` is 210 MB but **not rendered**: `VideoShowcaseSection` is imported nowhere. No user cost; dead code.
- **Bug:** `WebAssets/Lookups/Medication/vitamins.webp` returns **404**. Referenced by fe `lib/constants/cdnImages.ts:109`, preloaded at `imagePreloader.ts:229`, and seeded into DB at `pawjai-be/src/seed/petRecordLookups.ts:490,532`.
- Bunny Optimizer is **off**: `?width=64` returns the original bytes.
- Hotlink protection 403s requests without a pawjai Referer, including social and image crawlers (seo audit P2). Consequence: og:image and anything crawlers must fetch stays **same-origin**, not on Bunny.

Duplicated manifests (drift risk):

- fe `lib/constants/cdnImages.ts` (113 URLs), public `src/lib/constants/cdnImages.ts` (copy, ~44 used), RN `src/design-system/assets/cdnAssets.ts` (26 URLs + Referer helper), be seed `src/seed/petRecordLookups.ts` + `src/db/concepts/catalogContentPlan.ts:198`, frozen iOS `CDNAssets.swift`.

User uploads (pawjai-be `src/utils/bunny.ts`):

- Paths are already sane: `users/{userId}/profile-{uuid}.webp`, `users/{userId}/pets/{petId}/profile-{uuid}.webp`, `users/{userId}/chat/{petId}/{uuid}.webp`, `blog/{postId}/...`. Server re-encodes with sharp (avatars 512 px q80, chat 1024 px q85). **Keep as is.**
- DB stores **full URLs** (`pets.image_url`, `user_profiles.profile_image`, `pet_chat_messages.image_urls`, `blog_posts.featured_image_url`, `pet_record_types.icon_url`).
- **Leak, root cause:** `petService.updatePetProfileImage` (`src/services/petService.ts:441`) and the user profile upload (`src/routes/users-profile.ts:53`) write the new URL without deleting the previous object, and the uuid filename means every re-upload adds a file. Blog featured replace already deletes the old file (`src/routes/admin/blog.ts:323`). Hard delete already covers `profileImage` (`scripts/hard-delete-user.ts:187,310`).
- fe sends the original photo (up to 10 MB) with no client resize; RN downscales to 2048 px JPEG natively before upload.

## 3. Target layout

```
static/                         # app-owned art, written only by the asset tool
  brand/                        # logos, wordmark, app-store badge
  ui/icons/                     # small UI glyphs: clock, heart, male, check ...
  ui/illustrations/             # not-found, thinking-cat, crying-pets, cat-support ...
  ui/animations/                # success-check.webm
  pets/default-avatars/         # default-paw-{color}.webp (FROZEN order, see fe+RN hash)
  pets/species/                 # dog.webp, cat.webp
  records/types/                # activity, symptom, medication, vet-visit
  records/activity/ records/symptom/ records/medication/ records/vet-visit/
  marketing/home/ marketing/about/ marketing/stickers/ marketing/blog/
  ads/upgrade/ ads/partners/{petkit,feliway,kong,gentle-paw}/
  _source/                      # full-res originals, never referenced by apps
  _archive/2026-10-xx/          # pre-re-encode backups of WebAssets/ bytes
users/{userId}/...              # unchanged (be uploads)
blog/{postId}/...               # unchanged (admin uploads)
dev/mock/                       # RN mock URLs (was mock/)
WebAssets/ ads/                 # legacy, read-only, kept until traffic is zero
```

Naming rules: lowercase kebab-case, no spaces, no `%20`, no version suffixes. Typos fixed in the new tree only (`diahrrea` to `diarrhea`, `diagosis` to `diagnosis`); legacy names stay. Output sizes are fixed per folder:

| Folder | Max px (longest edge) | Format |
|---|---|---|
| `ui/icons`, `records/*`, `pets/species` | 288 (3x of 96) | WebP q80 |
| `pets/default-avatars` | keep current 384 (54 KB total, already fine) | WebP |
| `ui/illustrations`, `marketing/about`, `marketing/stickers` | 2x display width, cap 640 | WebP q80 |
| `marketing/home` | 2x display width, cap 960 | WebP q82 (alpha kept) |
| `ads/*` | exact slot size x2 | WebP q82 |
| `brand` | SVG when true vector, else 2x | SVG / WebP |

## 4. Design decisions (ADR-lite)

**D1. Migration style: copy-then-switch.** Chosen over (b) move plus Bunny Edge Rule redirects and (c) leave paths and only shrink bytes. (b) is rejected because RN and old iOS send a spoofed Referer and redirect handling under hotlink protection is untested, and Edge Rules are config outside git. (c) is Phase 0 anyway but never fixes naming or drift. Cost of copy: a few MB of duplicate storage.

**D2. Single source of truth: a manifest in the parent repo plus codegen**, at `tools/cdn-assets/`. Chosen over a shared npm package (5 separate submodule repos, publish overhead) and a runtime-fetched JSON manifest (network dependency for every icon). The manifest maps a stable key (`records.symptom.dogVomit`) to a path and a size class. Codegen writes `cdnImages.generated.ts` into fe, public and RN with a do-not-edit header; each repo keeps its hand-written helpers (RN `headersFor`, fe `getDefaultPetAvatar`) importing the generated file. A `--check` mode fails if any generated file is stale.

**D3. Image sizing: pre-sized at build, not Bunny Optimizer.** Optimizer is a flat monthly fee per zone and would make the fe loader and RN append `?width=`. At ~300 users and a fixed set of sizes, sharp at build time gets the same 95 percent win for free. Revisit if user photos need multiple display sizes (Phase "later").

**D4. Keep full URLs in DB for now.** Moving to relative keys means an API serialization layer plus a backfill of 5 columns; only worth it when the hostname changes (`cdn.pawjai.co`). Listed under later.

**D5. Crawler-facing images stay same-origin.** og:image, favicon and anything Googlebot-Image must fetch stays in the app's `public/` (or a generated route), because hotlink protection 403s crawlers.

## 5. Phases

Each phase is a separate PR or a separate Bunny run, revertable on its own.

### Phase 0: shrink in place, fix the 404 (no client deploy)

1. `tools/cdn-assets/archive.ts --dry-run`: list every `WebAssets/` object that will be overwritten; then copy each to `static/_archive/2026-10-xx/<same path>`.
2. Re-encode in place at the same path and extension **only where the largest render size is known to be <=96 pt on every client** (fe `ResponsiveIcon`, public Tailwind classes, RN frames, frozen iOS frames): `Lookups/**` (35 files, 4.2 MB) and `Pet-icons` (176 KB) after a frame check. `Common/icons/*` is gated: build a per-asset table of max render size across fe, public, RN and iOS first; <=96 pt goes to 288 px, larger goes to the illustration class, unknown stays out of Phase 0. Likely larger: `cute-brain` (public chat avatar), homepage feature-card icons, `dog-profile-2` / `cat-profile-2` (add-pet cards), `employees-dogs`, `not-found`. Skip `pet-avatar/` and `Landing/Stickers/` (frozen art per RN `docs/DESIGN.md`) unless the owner approves. Reason for the gate: in-place bytes reach the frozen iOS app too, which cannot be patched if an icon turns blurry.
3. Upload a `Lookups/Medication/vitamins.webp` (needs source art from owner, see §8).
4. Purge pull zone cache for the touched paths.
5. Homepage SVGs and About PNGs cannot keep their extension honestly (`.svg` holding WebP is wrong content-type). They move to `static/marketing/...webp` in Phase 2 and the URL switch ships with Phase 3.

Acceptance: re-fetch every touched URL with Referer, all 200, `content-type: image/webp`, each icon-class file under 20 KB; icon visual check in fe at 96 px on a retina screen; preload set re-measured, target under 700 KB total.
Rollback: copy `_archive/` back, purge.

### Phase 1: stop the avatar leak (pawjai-be)

- In `updatePetProfileImage` and the user profile upload: read the previous URL, update the row, and after the update succeeds call `bunnyService.deleteByUrl(previous)` best-effort (it already never throws). Only delete when `previous` is on our pull zone and under `users/{userId}/`.
- Tests: replace twice, assert one delete call with the first URL; DB failure path asserts no delete.
- Verify: `bun test` in pawjai-be plus the route test for `POST /api/pets/:petId/image`.

### Phase 2: tooling + new tree (parent repo, Bunny writes)

- `tools/cdn-assets/manifest.ts` (keys, legacy path, new path, size class), `build.ts` (sharp from `_source`, falling back to legacy bytes when no source exists), `upload.ts` (Bunny Storage PUT, skip when the stored checksum matches, `--dry-run` default, key read from env as process input only, never printed), `codegen.ts` (`--check`).
- Seed `_source/` from the best available originals (owner's art files where they exist, else the current 1024 px WebAssets bytes).
- Upload `static/` tree. Nothing references it yet.

Acceptance: `upload.ts --dry-run` lists the expected set; every manifest path returns 200 with Referer.

### Phase 3: switch the clients (fe, public, RN)

- Replace the hand-written URL tables with imports from `cdnImages.generated.ts`; keep exported names so call sites do not change.
- RN: move `mock/` URLs to `dev/mock/`.
- fe: move `public/ads/feliway-ads.png` (4.7 MB) and `public/memorial-bg.png` (2 MB) through the tool into `static/ads/partners/feliway/` and `static/ui/illustrations/`; delete files verified unused (logo PNGs, `blog-cover/*`, `images/step-3.svg`, `profiles/palo.png`, Next template SVGs). Verification before delete: `git grep` the basename in every repo **and** a read-only check of `blog_posts` content and `og_image_url` for `pawjai.co/<path>`.
- fe: downscale the photo client-side before upload (2048 px JPEG, matching RN) to cut mobile upload time.
- Delete dead `VideoShowcaseSection` + `VIDEOS` entry.
- Verify: `bun run build` in fe and public; RN typecheck + tests; browser pass on home, about, add-pet, record log sheet.

### Phase 4: DB icon URLs (staging, then prod)

- Rollout script in the existing catalog rollout style: `UPDATE pet_record_types SET icon_url = <new>` mapped from the manifest, dry-run prints the plan, empty-plan rerun proves idempotence. Update `petRecordLookups.ts` and `catalogContentPlan.ts:198` to new URLs.
- Rollback: same script with the map reversed (legacy files still exist).

### Phase 5: orphan report

- Read-only script: list `users/` objects in Bunny storage, diff against all URL columns in §2. Output counts and bytes, no deletes. Deletion is a separate owner-approved run.

## 6. Out of scope / do not do

- No redirects or Edge Rules. No deleting legacy paths on a timer.
- No change to user-upload paths or processing quality.
- No re-encode of default avatars or stickers without owner approval (frozen art).
- No Bunny Optimizer until Phase "later" says so.
- pawjai-public local files stay local on purpose: `public/social-media/*.svg`, `public/logo/pawjai-logo-horizon.webp` (og fallback), `favicon.ico`, `public/fonts/*`. Crawlers must reach them and Bunny hotlink protection 403s crawlers (D5).
- pawjai-react-native bundled assets stay in the binary: `ios/.../AppIcon-1024.png` (App Store requires the 1024 px master), splash JPGs, Android mipmaps, `src/assets/google-icon.png`. Only its 26 CDN URLs and `mock/` move through this plan.
- The WAV preload and `next.config.mjs` cache-header fixes belong to the SEO plan (`~/codemaps/pawjai-fe-seo-speed.md` steps 1 and 8); not duplicated here.

## 7. Later

Bunny Optimizer for user photos in lists; relative keys plus `cdn.pawjai.co`; chat image retention policy (product decision); retire legacy `WebAssets/` after Bunny stats show zero hits for 30 days and the owner approves; content-hash filenames for immutable caching if art starts changing often.

## 8. Owner decisions (answered 2026-10-03)

1. **No iOS or RN build is live.** Legacy `WebAssets/` paths matter only for fe prod, the Astro site, and DB rows. They can be retired once all three point at `static/` and Bunny stats show zero hits (deleting still needs owner OK).
2. **All art may be re-encoded**, avatars and stickers included. The owner will redraw assets later, so the priority is structure, not final art.
3. **Missing assets ship as placeholders.** Manifest entries carry `status: "placeholder"`; the tool uploads one shared placeholder image to the entry's *final* path. Real art later = drop the file in `_source/`, rerun upload, purge that path. No code change. `vitamins.webp` is the first one.
4. **Bunny writes approved once** for every non-delete write in this plan. Deletes and DB writes still need a separate OK.

## 9. Revised order (after §8)

Because nothing native is live, Phase 0 (in-place re-encode of legacy paths) shrinks to one step: put the placeholder at the legacy `vitamins.webp` path so fe prod stops 404ing today. Everything else goes straight to the new tree:

1. Phase 2 tooling + `static/` tree, re-encoded, placeholders for gaps (Bunny writes, approved).
2. Phase 3 switch fe, public, RN to the generated manifest (PRs per repo).
3. Phase 1 avatar orphan fix (be PR).
4. Phase 4 DB `icon_url` migration (needs DB OK, staging then prod).
5. Phase 5 orphan report, then retire legacy `WebAssets/` with owner OK.

## 10. Progress (2026-10-03)

Done and verified:
- `tools/cdn-assets` built (parent repo, branch feat/cdn-assets). 146 assets, 47.9 MB of sources to 2.9 MB. Uploaded to `static/` and `static/_source/`; every new URL returns 200 through the CDN.
- `vitamins.webp` 404 was a filename typo: the art exists at `vitamin.webp`. Real art now served at both the new path and the legacy `vitamins.webp` path.
- Real legacy art found for rest (dog, cat), play (dog), scratching, coughing (dog): placeholders replaced. 19 concepts still on placeholders.
- Clients switched to generated constants, each on `feat/cdn-static-assets` in a worktree, unpushed: fe (`pawjai-fe-wt-cdn`, build + 473 tests pass, 18 dead public files removed, photo downscale before upload), public (`pawjai-public-wt-cdn`, astro check + 71 tests + build pass), RN (`pawjai-react-native-wt-cdn`, typecheck + lint + 1023 tests pass).
- pawjai-be `feat/storage-hygiene` (`pawjai-be-wt-storage`): owner-scoped layout, scoped deletes (closes the cross-user delete), replace-deletes-old, directory delete on pet/account/blog delete, failed-turn chat cleanup, blog uploads re-encoded. tsc, build:ts, db:validate, 1328 unit tests pass.

Waiting on the owner:
- Edge cache purge for 4 overwritten URLs (needs Bunny account API key or dashboard).
- Bunny directory delete verified only in unit tests, not live (needs an approved test delete).
- DB: `scripts/migrate-record-type-icons.ts` dry run against staging, then prod (needs DB approval).
- Existing user photos stay on the legacy layout; moving them needs a DB-writing migration (not written; optional, deletes already cover both layouts).
- Self-service "delete account" only soft-deletes and keeps photos forever: product/privacy decision.
- `scripts/hard-delete-user.ts` was already broken on staging (imports dropped tables `admin_emails`, `user_personalization`): separate fix.
