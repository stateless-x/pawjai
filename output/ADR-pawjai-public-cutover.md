# ADR: pawjai-fe and pawjai-public URL direction, and the cutover contract

Date: 2026-09-18, updated 2026-09-19 · Status: **all decisions made.** D1 decided, D2 decided (apex). Execution pending.
Mode: `decision` (software-architect). No code written.

## Context

Two repos serve `pawjai.co` content today:

- **pawjai-fe** (Next.js, Vercel, branch `staging`, `d7f6131`) serves the live
  site: 9 public marketing routes on unprefixed paths (`/about`, `/tier`), and
  the signed-in app on the SAME host (`www.pawjai.co/dashboard`). Locale is a
  `NEXT_LOCALE` cookie, falling back to `x-vercel-ip-country` +
  `accept-language`. No URL prefix for any locale.
- **pawjai-public** (Astro, Cloudflare Pages, `main` @ `b3f9663`) is the
  intended replacement for those 9 routes: every locale prefixed (`/en/*`,
  `/th/*`), Accept-Language negotiated at the edge, not yet deployed.

The ask: are the two in conflict right now, and should pawjai-fe move toward
Astro's URL direction.

## Evidence gathered (all verified live, 2026-09-18)

| # | Finding | How verified |
|---|---|---|
| E1 | `app.pawjai.co` **does not resolve** (NXDOMAIN). The app is served from `www.pawjai.co/dashboard`. | `host app.pawjai.co`, `curl` |
| E2 | The built Astro site contains **86 links to `https://app.pawjai.co`** (46 signup, 36 signin, 4 tier-flow). | `grep` over `dist/` |
| E3 | Production `sitemap.xml` returns **404** (23 KB of HTML) on `www`, while `robots.txt` advertises it. Source `app/sitemap.ts` is valid and returns 11 pages. | `curl -w %{http_code}` |
| E4 | Both repos set `SITE_URL = https://pawjai.co` (apex), but production 307s apex to **www**. Every canonical points at a redirecting URL. | `curl`, `grep` both registries |
| E5 | On one fresh uncached response, pawjai-fe `/about` serves `<html lang="en">` and English body copy but a **Thai `<title>`**, and emits **no canonical tag**. | `curl` with `NEXT_LOCALE=en`, `x-vercel-cache: MISS` |
| E6 | pawjai-fe marketing pages are `cache-control: private, no-cache, no-store` — never CDN-cached. | `curl -D-` |
| E7 | English marketing content IS reachable and correct in the body via the cookie. The earlier read that English was unreachable was wrong; only the title is mislocalized. | `curl` h1 comparison, both cookies |

## Decision 0 — Target architecture (agreed 2026-09-18)

One repo per concern, no overlap:

| Host | Repo | Serves |
|---|---|---|
| `pawjai.co` | pawjai-public (Astro, Cloudflare) | **all** public/marketing content, the main public domain |
| `app.pawjai.co` | pawjai-fe (Next.js, Vercel) | the signed-in app **only** |

pawjai-fe's 9 public marketing routes are **deleted from that codebase**, not
migrated. Public content lives in the Astro repo and nowhere else.

**This strengthens Decision 1 below:** fe's marketing URLs should not be
prefixed to match Astro because they are being removed, not carried forward.
Any prefix work there would be thrown away.

### Migration risk assessment (verified 2026-09-18, not assumed)

The riskiest part of moving an app to a subdomain is usually auth. Checked:

- **Session cookies already span subdomains.** `getCookieDomain()`
  (`lib/supabase/cookieStorage.ts:18`) returns **`.pawjai.co`** (leading dot)
  for any `*.pawjai.co` hostname. Sessions survive the move to
  `app.pawjai.co`; users are not logged out. This is the single biggest
  thing that could have gone wrong and it is already handled.
- **Auth redirects follow the host automatically.** `getClientBaseUrl()`
  (`lib/config/env.ts:1`) derives from `window.location.origin` unless
  `NEXT_PAWJAI_CLIENT_URL` overrides it, so `/auth/callback`, email
  confirmation and password recovery all resolve against whichever host
  served the page.
- **No code coupling to delete around.** No app/signed-in code imports
  anything from the marketing routes (`app/{about,features,tier,mission,
  research,contact}`), so removing them is a deletion, not a refactor.
  `components/{home,about,features,tier}` are marketing-only and go with them.

**Remaining auth checks owed before the app moves** (not yet verified):
Supabase's allowed redirect/callback URL list must include the
`app.pawjai.co` origin, and any OAuth provider console (Google) needs that
origin added. Neither is visible from this repo.

## Decision 1 — Do NOT migrate pawjai-fe's marketing URLs to `/en` + `/th`

**Chosen:** retire pawjai-fe's marketing routes at cutover; leave their URL
shape untouched until then.

**Over:** adding locale-prefix routing to pawjai-fe now so both repos match.

**Because** pawjai-public already owns the target shape, and prefixing fe
first would migrate the same 9 pages twice (unprefixed → fe-prefixed →
Cloudflare-prefixed), doubling the redirect debt and the ranking risk, for
pages that are scheduled for deletion. The alignment wanted is convergence at
cutover, not parallel implementation.

**Third option considered and rejected:** run both shapes simultaneously with
fe 301ing to Astro. Rejected because one host answers for a domain at a time;
this would require fe and Cloudflare to both hold `pawjai.co`, which is not a
state DNS can express cleanly.

**What fe SHOULD take from the Astro direction:** the pure, host-agnostic
negotiation modules in `src/lib/i18n-negotiation/` (`negotiate.ts`,
`redirect-target.ts`). They survived a Vercel-to-Cloudflare port with zero
changes. When fe eventually needs locale-prefixed APP routes (`/en/dashboard`),
those port directly. That is the real reuse, and it is additive rather than a
migration.

## Decision 2 — Blockers that must be settled BEFORE any DNS cutover

### D1 — DECIDED 2026-09-18: create `app.pawjai.co`, change nothing else

**Owner's decision:** create `app.pawjai.co` now pointing at the existing
Vercel deployment. `pawjai.co` / `www.pawjai.co` stay on pawjai-fe as they
are. pawjai-public stays built but unhosted, unchanged. pawjai-fe's own
internal links and auth redirects are NOT moved: the app keeps working at
`www.pawjai.co/dashboard`, and `app.pawjai.co` simply becomes a second valid
entry point.

**Why this is the right sequencing:** it makes the 86 Astro CTAs valid
*before* Cloudflare ever touches the apex, so the riskiest dependency is
resolved while the live site is untouched and nothing is time-pressured. It
also splits one hard cutover into two reversible steps.

**Code impact: none, in either repo.** Verified 2026-09-18: every CTA in
pawjai-public routes through `appUrl()` / `APP_URL`
(`src/lib/config/urls.ts:9`), nothing hardcodes the host, and the default is
already `https://app.pawjai.co`. The moment the DNS record exists, the
existing build is correct with no edit, no rebuild-config change, and no
redeploy of anything.

**Only follow-up:** once the record resolves, confirm `app.pawjai.co/auth/signin`
returns 200 (it is currently NXDOMAIN, E1). No other verification is owed by
this step.

### D1 original analysis (superseded by the decision above): the app host does not exist

E1 + E2. Every conversion path on the new marketing site points at
`app.pawjai.co`, which is NXDOMAIN. If Cloudflare took `pawjai.co` today,
all 86 sign-in/sign-up links would be dead, and the marketing site's entire
purpose is to route people into the app.

Two ways out, and this is a product/infra decision, not a code one:

- **(a) Create `app.pawjai.co`** pointing at the Vercel deployment, and keep
  `PUBLIC_APP_URL` as is. Cleanest separation: marketing on Cloudflare, app on
  Vercel, two hosts, no path collisions.
- **(b) Keep the app on `www.pawjai.co`** and set `PUBLIC_APP_URL` to
  `https://www.pawjai.co`. Then Cloudflare cannot own `www`, and the marketing
  site needs its own hostname or must live at the apex with www staying on
  Vercel. Path-level splitting of one host across two providers is possible but
  is the most fragile of the options.

(a) is the lower-risk path and matches what both codebases already assume.

### D2 — DECIDED 2026-09-19: apex (`pawjai.co`) is canonical

**Owner's decision:** `pawjai.co` (apex), not `www.pawjai.co`.

**Why apex wins here specifically:**
- Both repos already emit `SITE_URL = "https://pawjai.co"`, so **zero code
  change** in either. Verified 2026-09-19.
- Cloudflare does CNAME flattening natively, so the usual apex DNS objection
  does not apply to the target host.
- The main apex drawback, that apex cookies reach every subdomain, is
  load-bearing here rather than a cost: the session cookie is already scoped
  `.pawjai.co` (`lib/supabase/cookieStorage.ts:18`), and that is precisely
  what keeps users signed in when the app moves to `app.pawjai.co`.
  Choosing www and isolating cookies would have broken that.

**Code impact: none.** Both `SITE_URL` constants, `PUBLIC_SITE_URL` and the
Astro `site` default already point at the apex.

**ACTION REQUIRED, and it is NOT a code change.** Production currently does
the opposite of this decision: `https://pawjai.co/about` 307s to
`https://www.pawjai.co/about` (verified 2026-09-19). That redirect lives in
the Vercel dashboard's domain settings, not in `next.config.mjs`, `vercel.json`
(absent) or `middleware.ts` (no www logic). It must be inverted so www
redirects to apex.

**This is live and costing something now.** The sitemap shipped on
2026-09-19 advertises 10 apex URLs, every one of which currently 307s. Google
is being handed a list of redirects rather than final URLs. Inverting the
redirect resolves it; no redeploy is needed, since the sitemap is already
correct.

### D3 (independent P0 on the LIVE site): sitemap 404

E3. Google currently has no sitemap for pawjai.co. Source is valid, so this is
a deploy/runtime issue in pawjai-fe, not a logic bug. Reported, not diagnosed.
Worth noting this makes the Astro cutover a net SEO improvement rather than a
migration risk, since there is no working sitemap to lose.

### D4 (pre-existing defect in fe, low urgency): title/body locale split

E5. `generateMetadata` and the page component resolve locale differently, so a
reader can get English content under a Thai title, with no canonical tag.
Dies with the marketing routes at cutover; only worth fixing if cutover slips.

## Cutover contract (once D1 and D2 are settled)

Ordered so each step is independently reversible and no step depends on a
later one:

**Step 1 (in progress).** Create `app.pawjai.co` -> existing Vercel
deployment. Add that origin to Supabase's allowed redirect URLs and the OAuth
provider console. Nothing else changes; `pawjai.co` keeps serving fe. Verify:
sign in at `app.pawjai.co`, confirm the session persists and `/auth/callback`
resolves.

**Step 2.** Point `pawjai.co` at pawjai-public on Cloudflare. Settle D2
(apex vs www) first, since it decides what `SITE_URL` must be. At this moment
the legacy redirects built into `functions/_middleware.ts` become live and
`/about` starts resolving to `/th/about/` or `/en/about/`.

**Step 3.** Delete the 9 marketing routes and their components from
pawjai-fe. Safe to do only after step 2, and safe to defer: once Cloudflare
owns the domain, fe's copies are unreachable regardless. Deleting is hygiene,
not part of the cutover's critical path.

Invariants across all three:

1. Ownership is exclusive: one host answers for a given hostname at a time.
   There is no window where both serve `/about`.
2. pawjai-public's legacy redirects (`/about` → `/th/about/` or `/en/about/`)
   are **inert until DNS moves**. They are built and tested, but not in the
   request path today.
3. pawjai-fe's marketing routes are removed or 301'd **as part of** cutover,
   not before and not after.
4. Verify after cutover: sitemap 200, canonical host matches D2, a sample of
   legacy URLs 307 to the right locale in one hop, and the app CTAs resolve.

## Consequences

- pawjai-fe keeps its cookie-based, unprefixed marketing URLs until deletion.
  That is deliberate, not drift.
- The two repos will disagree on URL shape for as long as the cutover takes.
  That disagreement is harmless while only one of them serves the domain, and
  it is the reason no fe work is proposed here.
- The shared i18n negotiation modules are the intended convergence point, not
  the URL scheme.

## Open

- **D1 decided** 2026-09-18: create `app.pawjai.co`, leave both sites as they
  are. No code change in either repo. Verify the host resolves, then stop.
- **D2 still open** (apex vs www). Not blocking today, because nothing new is
  being served. It becomes blocking at the moment Cloudflare takes a hostname,
  so settle it before that step rather than during it.
- Decision 1 (do not prefix pawjai-fe's marketing URLs) stands unchanged and
  is reinforced by D1: fe is now explicitly frozen, not evolving toward the
  Astro shape.
- Parent repo submodule still points at `ce72b00`, needs a bump to `b3f9663`
  (unrelated to this decision, carried over from the previous round).

## Addendum 2026-10-01: app paths on the apex (vet share, helper, deep links)

pawjai-public PR stateless-x/pawjai-public#2 (branch `feat/app-path-handoff`) makes Astro return a
308 for every pawjai-fe app route (`/vet/share/*`, `/helper/*`, `/auth/*`,
`/notifications`, `/dashboard`, `/thank-you`, ...) to the same path and query on
`PUBLIC_APP_URL` (default `https://app.pawjai.co`). Without it, the locale
redirect turns every vet share link and printed QR code into a
`/th/vet/share/...` 404. It also serves `/.well-known/apple-app-site-association`,
which excludes `/vet/*`, `/helper/*` and `/api/*` (the fe version claims `/*`).

Added cutover blockers:
- `app.pawjai.co` still did NOT resolve on 2026-10-01. The handoff targets it.
- pawjai-be `FRONTEND_URL=https://app.pawjai.co`, so new vet and helper links skip
  the hop (`src/routes/pets.ts:286,342`), and `app.pawjai.co` must be in `ALLOWED_ORIGINS`
  (the defaults in `src/index.ts:81` and `pet-chat.ts:20` do not include it).
- Push deep links are concatenated to `https://pawjai.co` by the apps
  (`notifications.ts:74`). The handoff covers them, at the cost of one hop.
