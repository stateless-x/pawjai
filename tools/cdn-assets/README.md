# cdn-assets

Owns every static image Pawjai serves from Bunny (`https://pawjai.b-cdn.net/static/...`)
and generates the URL constants each app imports. User uploads (`users/`, `blog/`) are owned
by pawjai-be (`src/utils/storagePaths.ts`), never by this tool.

## Layout on Bunny

```
static/brand/                     logos, wordmark, app-store badge, social icons
static/ui/icons/                  small UI icons (rendered at <=96pt), 288px
static/ui/illustrations/          larger art (cards, empty states), <=512-1024px
static/ui/animations/
static/pets/default-avatars/      paw-{color}.webp (FROZEN order, see fe/RN)
static/pets/species/              dog.webp, cat.webp
static/records/types/             activity, symptom, medication, vet-visit
static/records/{activity,symptom,medication,vet-visit}/   one file per catalog concept, -dog/-cat when art differs
static/marketing/{home,about,stickers,blog}/
static/ads/{upgrade,partners/*}/
static/_source/                   originals the outputs were built from (never referenced by apps)
WebAssets/, ads/                  LEGACY, read-only, kept until Bunny stats show no traffic
```

Names are lowercase kebab-case. Sizes per class live in `src/lib.ts` (`SIZE_RULES`).

## Everyday tasks

```bash
bun install
bun run build              # local only: out/ + out/build-report.json
bun --env-file=../../pawjai-be/.env.local src/upload.ts            # dry run
bun --env-file=../../pawjai-be/.env.local src/upload.ts --apply    # write (never deletes)
bun run codegen            # write constants into fe, public, RN, be checkouts
bun run check              # exit 1 if any generated file is stale
```

The env file is process input only: never print or inspect it. `codegen` accepts
`--fe= --public= --rn= --be=` to target worktrees.

**Replace a placeholder or redraw art:** drop the file at `source/<path without extension>.<png|webp|jpg|svg>`
(for example `source/static/records/activity/bathing.png`), then build and upload. Same URL,
no code change. Overwritten paths stay cached at the edge until purged: set
`BUNNY_ACCOUNT_API_KEY` (account key, not the storage key) and upload purges them, or purge
the printed URLs in the Bunny dashboard.

**Add a new asset:** add an entry to `src/manifest.ts` (`keys` = the exported constant names),
build, upload, codegen, then commit the regenerated files in each app.

`src/list-remote.ts [dir/]` lists a storage directory and marks files the manifest does not cover.
