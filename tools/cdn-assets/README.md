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
static/placeholders/              stand-in art until real art exists (separate URLs on purpose)
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

**Caching rule that drives everything below:** Bunny serves `cache-control: max-age=25600000`
(~296 days). A purge clears Bunny's edge, never a browser. So never overwrite a URL a client
has already loaded: new art goes to a new URL.

**Art for a placeholder:** placeholders live under `static/placeholders/`. Remove
`placeholder` from the manifest entry and give it a source (`from`, `file`, or a file at
`source/<real path without extension>.<png|webp|jpg|svg>`). Build, upload, run codegen, ship
the apps, then run pawjai-be `scripts/migrate-record-type-icons.ts`, which moves DB rows from
the placeholder URL to the real one.

**Redraw existing art:** give it a new filename in the manifest (for example `walk-v2.webp`),
then the same build, upload, codegen, ship, migrate steps. Uploading over an existing path
updates storage but leaves old bytes at the edge until purged: set `BUNNY_ACCOUNT_API_KEY`
(account key, not the storage key) and upload purges updated paths, or purge the printed
URLs in the Bunny dashboard.

**Add a new asset:** add an entry to `src/manifest.ts` (`keys` = the exported constant names),
build, upload, codegen, then commit the regenerated files in each app.

`src/list-remote.ts [dir/]` lists a storage directory and marks files the manifest does not cover.
