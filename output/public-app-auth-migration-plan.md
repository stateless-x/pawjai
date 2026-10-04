# Pawjai public/app separation and authentication migration

Status: revised proposal; planning only, no application or infrastructure changes made. Supersedes the initial single-frontend recommendation; separate repositories are now the preferred direction, Better Auth in Fastify is accepted, Astro/React SPA/native iOS remain proposed technology choices.
Updated: 2026-09-13. Owner: Purin; implementation owner to be assigned.
Evidence: frontend `d7f6131`, backend `672fc17`, plus the current dirty working trees. Code wins over older docs. Live configuration and user data were not inspected.

## Recommendation

Target separate repositories and deployments: **Astro public site**, **React web app**, **Fastify API with Better Auth**, and later **native SwiftUI iOS**. Reach that target through independent releases: extract public pages and separate domains, migrate auth, then replace the app's Next.js runtime if the SPA prototype passes. Keep the application database in place throughout.

Confirmed direction: Better Auth library hosted in Fastify. Proposed scope is Supabase Auth first; complete Supabase removal is a later decision based on actual dependencies and billing. A fresh login at auth cutover is proposed, not yet confirmed; preserving passwords and ownership is mandatory.

Confirmed blog boundary: the blog will be a separate project on another domain, with links back to `pawjai.co`. Blog implementation, content migration, hosting and publishing are excluded from this plan and from the new public repository. Its domain is not yet specified. Preserve existing `/blog` links during the public-site cutover until the separate blog project defines their destination; do not delete existing blog content or backend/admin functionality as part of this migration.

The smallest useful release is a separate public repository at `pawjai.co` and the existing app at `app.pawjai.co/dashboard`, retaining Next.js temporarily in the app. Reuse the existing `pawjai-fe` history for the app; a later rename to `pawjai-app` is optional. Create only the public repository initially. Do not combine database relocation, app runtime replacement and auth cutover in one release.

| Decision | Recommendation | Why |
|---|---|---|
| Frontend boundary | Separate public and app repositories/builds/deployments | Matches the user's preference for independent concerns and lets content and product UI use different rendering models |
| Public rendering | Astro, predominantly prerendered HTML with selective interactive islands | Marketing and research content remains discoverable without bootstrapping the product app; blog is a separate project |
| App rendering | React + Vite + React Router (Data Mode), existing TanStack Query/Zustand; no runtime SSR initially | Existing major product flows already fetch client-side; Fastify owns server functionality |
| Auth owner | Better Auth inside existing Fastify backend, using Drizzle/Postgres | Web, iOS and Android already share this backend; identity belongs alongside existing account lifecycle operations |
| Browser transport | Same-origin `/api/*` proxy on the app domain; app-host-only session cookie | Avoids making browser sessions depend on cookies sent to the Railway hostname |
| Account identity | Retain every existing Pawjai UUID | Pets, records, billing and device associations depend on it |
| Cutover | Supported mobile clients first; staged auth rollout, then legacy retirement | Old binaries directly call Supabase and cannot be fixed by a web-only release |

## What users will experience

| URL/surface | Intended behavior |
|---|---|
| `pawjai.co/` and public pages | Public site remains accessible, including when signed in; “Open app” leads to app domain |
| `app.pawjai.co/` | Go to `/dashboard`; unauthenticated visitors sign in and then resume their destination |
| `pawjai.co/dashboard`, `/chat`, other product links | Temporary redirect to same path on app domain after compatibility checks; permanent redirects only after stabilization |
| `app.pawjai.co/auth/*` | Canonical sign-in, signup, recovery and onboarding flows |
| Existing auth callbacks/recovery emails | Complete the original provider flow on its original origin during a bounded compatibility period; do not blindly redirect PKCE callbacks |
| Existing vet/helper share links | Compatibility redirects reach guest routes in the app; no customer login required, token validation still applies |
| Installed mobile apps | Domain-compatible release first, then a release supporting the new auth protocol; old versions continue during the legacy window and may require an update at retirement |

Keep existing product pathnames. The request does not require changing `/dashboard` to `/` internally. Each repository owns its routes; deployment ingress owns old-path redirects and temporary compatibility routing.

## Current implementation that drives this plan

Paths below are relative to `/Users/purin/dev/pawjai/`.

| Observed code | Consequence |
|---|---|
| `pawjai-fe/app/layout.tsx:41,77,102` reads cookies, checks Supabase claims and mounts auth/session providers above all pages | Domain separation alone does not remove app initialization from public pages; move providers into the appropriate route layout |
| `pawjai-fe/middleware.ts:12,188` maintains public routes and an explicit matcher; `/chat` is missing from that matcher | Use one complete route inventory for host policy and route tests; backend authorization remains mandatory |
| `pawjai-fe/lib/supabase/cookieStorage.ts:21` scopes a legacy cookie to `.pawjai.co`; `lib/supabase/server.ts:14` supplies no explicit shared domain for SSR cookies | Some existing browser state may cross subdomains, some may not; test both cookie mechanisms and tolerate reauthentication |
| `pawjai-fe/app/api/auth/session/route.ts:20` accepts the current Supabase session; `lib/api/client.ts:62` attaches Bearer tokens | Retire this session bridge deliberately; Better Auth is not a drop-in replacement for its token shape |
| `pawjai-fe/lib/api/chatService.ts:396` uses a separate raw streaming fetch path | Update and test SSE transport as well as the ordinary API client |
| `pawjai-fe/app/dashboard/page.tsx:1,26`, `app/chat/page.tsx:12,29` are client components using hooks/client auth | A SPA is plausible; this does not prove that SSR provides zero first-load benefit |
| Scoped scan across `app`, `components`, `lib`: 53 files reference `next/navigation`, 45 `next/link`, 82 `next/image`; server action at `app/auth/actions.ts:1` | Runtime migration involves many adapters/imports, not just switching build tools; counts include public and app code, not just app migration work |
| `pawjai-be/src/utils/jwt.ts:47` verifies Supabase claims; `src/middleware/auth.ts:33` reads Bearer tokens | Introduce a provider boundary while preserving the normalized `request.user` contract |
| `pawjai-be/src/db/schema/users.ts:8` uses a UUID profile ID; `schema/subscriptions.ts:28` links billing to it | Retain UUIDs and Stripe objects; do not recreate profiles or subscriptions during import |
| `pawjai-be/src/routes/auth.ts:43` initializes missing profile/config rows | Extract idempotent account initialization so both providers can safely use it |
| `pawjai-be/src/services/adminUserService.ts:72,550`, `adminSubscriptionService.ts:238`, `routes/admin/dev-tools.ts:275` use Supabase account lookup/reset/deletion | Customer lifecycle tooling is part of migration; admin login itself uses separate auth (`middleware/adminAuth.ts:84`) |
| `pawjai-be/src/index.ts:78` defaults CORS without the app domain; FE `lib/config/env.ts:27` defaults to Railway API | Validate deployed overrides, app proxy, trusted origins and proxy forwarding; local defaults are not proof of production config |
| iOS `PawjaiMobile/Configuration.swift:27`, Android `app/src/main/java/co/pawjai/app/Configuration.kt:33` target `pawjai.co` | Both native clients need configuration and auth changes |
| iOS `WebView.swift:280,527` accepts bridge messages without an origin check and permits general navigation | Restrict native bridge/navigation origins as part of changing the auth bridge |
| Backend `src/db/index.ts:14` uses generic `DATABASE_URL`; media uses `src/utils/bunny.ts` | Production DB host is unknown. No backend Supabase storage/realtime usage was found in the scoped search |

Live `auth.users` triggers, RLS, extensions and cross-schema foreign keys remain unknown. A historical initialization script references `auth.users`; it is not proof of a deployed trigger. Its marketing-consent default also differs from today's schema: do not reuse it as the new signup initializer.

## Options and decision record

### Frontend separation

| Option | Benefits | Costs / risks |
|---|---|---|
| A. One codebase/deployment, distinct layouts and host policy | Least movement, shared components stay shared, easy domain rollback | Releases remain coupled; no longer meets the preferred repository boundary |
| B. Two deployable apps in one frontend workspace | Independent public/app builds, dependencies and releases | Workspace/build migration, shared package boundaries and two pipelines; worthwhile when release independence becomes a real need |
| C. Separate public and app repositories — revised recommendation | Strong ownership/release separation; Astro content and React product can evolve independently | Two pipelines; API/content contracts and shared branding need explicit ownership |

Context: the user prefers separate repositories and is considering Astro, a React SPA and future native iOS.
Decision: C because independent ownership/builds now matter more than minimizing repository movement. The prior A recommendation is superseded.
Consequences: explicit API and content boundaries become essential. Temporarily retain Next.js in the extracted app to avoid coupling repo extraction to runtime/auth replacement.
Rollback: restore public-host traffic to the retained previous deployment and disable redirects. Keep legacy app/auth handlers reachable until their compatibility window ends; do not delete the old deployment during extraction.

### App rendering: does a private app need SSR?

**No SEO requirement does not imply no possible SSR benefit.** SSR can show an initial shell or data sooner and avoid some browser request waterfalls. A SPA needs JavaScript before its interactive UI works, so initial bundle size, connection latency and query scheduling matter. Neither SSR nor hiding a screen is an authorization boundary: Fastify must verify every protected request.

| Option | Fit for Pawjai | Tradeoff |
|---|---|---|
| Keep Next.js permanently | Lowest conversion cost; SSR remains available | Retains a frontend server/runtime boundary whose remaining jobs increasingly overlap with Fastify |
| React + Vite + React Router Data Mode — recommended target | Explicit browser routes, lazy route modules, existing TanStack Query cache, Fastify APIs | Must replace Next routing/image/auth conveniences, configure deep-link hosting and manage first-load behavior |
| React Router Framework Mode with runtime SSR disabled | Structured route modules/build tooling, root prerendering and a later SSR path | More framework conventions; build-time rendering still requires SSR-safe code |

Decision: use the SPA target unless a representative prototype shows unacceptable cold-start/slow-device behavior. Keep TanStack Query as the product-data cache; router loaders may call its prefetch/ensure APIs, not create a second independent cache. React itself does not provide routing and data fetching. [React guidance](https://react.dev/learn/build-a-react-app-from-scratch), [React Router SPA modes](https://reactrouter.com/how-to/spa)

Before removing Next.js, compare cold load and repeat navigation for dashboard, chat, pet details and guest share pages on mobile Safari and a constrained network. Measure time to usable data, JavaScript transferred, request waterfalls, memory, error rate and navigation latency. Agree regression budgets from the measured baseline, not invented targets. Use route splitting, parallel fetching, prefetching and loading states first; reconsider SSR for measured unmet needs.

Server capabilities remain in Fastify: OAuth callbacks, cookie creation, session validation, secrets, billing and data authorization. A static SPA can use HttpOnly cookies through a same-origin ingress proxy without a Next.js server. A Vite development proxy is not production infrastructure.

### Repository ownership and future native iOS

| Repository (names proposed) | Owns | Does not own |
|---|---|---|
| `pawjai-public` (new) | Astro marketing/research pages, main-site SEO, copy and assets | Blog content/publishing, customer sessions, pet access rules, onboarding or subscription enforcement |
| `pawjai-fe` / optional `pawjai-app` rename | React product UI, guest sharing UI, route state, presentation and browser cache | Credentials, database access or authoritative entitlement rules |
| `pawjai-be` | Better Auth, authorization, account lifecycle, domain data, billing, public content/pricing APIs, API contracts | Platform-specific screens or navigation |
| `pawjai-ios` | Future SwiftUI screens, native navigation, accessibility, secure session storage, local cache and device integrations | Independent versions of business/access rules |

Astro can retain selected React components as islands, after replacing their Next-specific imports. Default main-site content to prerendered HTML; choose rebuild hooks for marketing/research updates or on-demand rendering where freshness requires it. Blog publishing belongs to the separate blog project. Specify how locale becomes stable page HTML: preserve current URL/redirect compatibility, and decide localized URLs/canonical/hreflang before rollout rather than copying cookie-dependent Next rendering into a static build. [Astro islands](https://docs.astro.build/en/concepts/islands/), [on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/)

Keep each repo independently buildable; no sibling-source imports or shared database reads. The backend owns prices/entitlements and API schemas. Reuse existing public content APIs instead of copying domain truth into Astro. Share brand assets/tokens through a small versioned package only when duplication warrants it; do not start with a cross-framework component platform. Swift does not consume React hooks or TypeScript types directly: publish language-neutral API schemas, including errors, pagination, date/time rules and SSE event contracts, and generate/validate clients where useful. Better Auth's OpenAPI plugin covers its auth API only; the Pawjai API contract still needs separate coverage. [Auth OpenAPI](https://better-auth.com/docs/plugins/open-api)

For the app, keep route files thin and organize product UI by feature (`auth`, `pets`, `timeline`, `chat`, `settings`), with shared UI primitives and one API/session transport boundary. Keep business decisions in Fastify and screen state in the client. Move existing components incrementally when the relevant feature migrates; a repository split is not a reason to rewrite working domain code or every component.

Native iOS is a later product migration, not a prerequisite to domain separation. Reuse the existing Swift project and assess current push/deep-link integration; audit old Supabase/bridge code before reusing it. Build one complete native flow first (sign-in → pet list → record creation), including session expiry, denied permission, network loss and retry. Then expand to timeline, reminders and chat. During mixed native/WebView operation, give each screen one owner and preserve deep links and compatible API behavior for released app versions.

Use system authentication for OAuth; evaluate `ASWebAuthenticationSession`, exact callback validation and a reviewed one-time exchange for native sessions. Better Auth in Fastify is not proof of a ready-made Swift SDK; validate Google/Apple login, refresh/revocation and account deletion on real devices. [Apple authentication sessions](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession)

Moving the website from Next.js to Vite will not itself fix WebView keyboard, navigation, cookie or OS integration issues. Native screens can address those directly, but introduce a second UI implementation and their own testing/release work. Do not require React Native merely to share React code; SwiftUI fits the stated iOS-native direction, with cross-platform mobile choices left for a later decision.

### Authentication placement

| Option | Benefits | Costs / risks |
|---|---|---|
| A. Keep Supabase Auth | Lowest migration effort; existing native protocol continues | Retains vendor dependency and current session coupling; may still be cheapest after measuring actual spend |
| B. Better Auth in Fastify — recommended, conditional on cost/ownership goal | Uses existing backend and Drizzle; one identity owner for all clients | Team owns delivery, abuse controls, patching, backups and session operations |
| C. Better Auth in Next.js server | Convenient frontend integration | Moves auth ownership to the frontend deployment while Fastify still owns customer lifecycle and authorization; mobile now depends on it too |

Context: backend already owns account status, profile initialization and customer administration.
Decision: B over C to keep account lifecycle together; defer the auth change if measured savings do not justify its operational cost.
Consequences: one new backend dependency plus a temporary Supabase adapter. Removal later requires replacing that adapter and migrating auth-owned tables, not changing every domain service.
Rollback: before new-provider credential writes, route login back to Supabase. After such writes, stop expansion and retain the working Better Auth path for migrated accounts; a global flip is unsafe without credential reconciliation.

Better Auth's framework is free and open source; hosting, Postgres, email delivery, monitoring and operations still require capacity. Savings must be estimated as current avoidable Supabase cost minus added running cost, with migration effort tracked separately. No paid platform add-on is assumed. [Official pricing](https://better-auth.com/pricing)

## Target contracts

### Frontend and URL ownership

- Astro owns a public layout without product/session providers. The app owns authenticated, auth and guest layouts. During extraction keep the existing Next root minimal; in the SPA target replace it with a browser entrypoint/router. Guest sharing pages live in the product repo because they expose product data, even though they require no customer login.
- Add proposed `lib/config/urls.ts` with explicit `PUBLIC_SITE_URL`, `APP_URL` and server-only API upstream configuration. Audit `FRONTEND_URL`, recovery templates, checkout success/cancel/portal URLs, notification deep links, analytics and mobile associated-domain files. Avoid one ambiguous “frontend URL”.
- Public routes: `/`, `/about`, `/mission`, `/features`, `/research`, `/longevity-research`, `/tier`, `/contact`, `/terms`, `/privacy`; preserve existing aliases such as `/tierview`. Do not port `/blog` or `/blog/**` into Astro.
- Existing `/blog` and `/blog/**` URLs need an explicit compatibility route to the retained legacy deployment until the separate blog project supplies destination mappings. Preserve this at ingress before the new public site's 404 handling. The blog domain and its migration are separate work; only legacy-link continuity is in scope here.
- App routes: `/dashboard/**`, `/chat`, `/my-pets`, `/timeline`, `/calendar`, `/add-pet`, `/add-entry`, `/pet/**`, `/settings/**`, `/notifications`, `/feedback`, `/personalization/**`, `/auth/**`.
- Move `/helper/[token]` and `/vet/share/[token]` rendering to guest app routes. Preserve existing public-host links through explicit temporary redirects, allowing only their expected share-token parameter/path shape. Use no-referrer policy and redact token paths from telemetry. Give token-bearing responses `noindex` and private/no-store; guest routes must not inherit the customer sign-in guard. Other credential-bearing auth URLs require their separate compatibility flow.
- Inspect `/thank-you` consumers before assigning it: it is currently public and may be a payment return. Preserve active payment flows and migrate newly generated return URLs deliberately.
- New public sitemap/canonical/llms entries describe the main site's own pages; the separate blog owns its discovery metadata and links back to relevant Pawjai pages. Audit inherited blog entries instead of copying them into Astro; retain legacy discovery/routing during the compatibility window and coordinate their retirement with the blog project. App/auth pages get `noindex` and no sitemap entries. Robots rules are not an authorization control.
- Unknown routes return 404. App-host requests for known marketing pages can redirect to their public canonical URL. Never redirect arbitrary POST bodies between hosts or forward credential-bearing URLs wholesale. Allowlist relative return paths; reject external/scheme-relative destinations.
- SPA hosting must serve the browser entry for known deep links and reloads while routing `/api/*`, assets and `/.well-known/*` before fallback; never return index HTML for a missing API or asset. Configure true ingress 404s where possible and an in-app not-found route. Keep AASA/Android association files on both relevant domains through mobile transition.

### Authentication and API

- Proposed backend `src/auth/` owns Better Auth configuration, legacy validation and a normalized identity `{ userId, provider, sessionId }`. Domain handlers continue receiving the existing Pawjai UUID through `request.user`; authorization/status che
cks stay server-side.
- Use distinct auth-owned tables (e.g. `auth_users`, `auth_accounts`, `auth_sessions`, `auth_verifications`) and explicitly map Better Auth models. Existing `user_profiles` remains domain-owned. Imported auth IDs equal existing UUIDs; new users also receive UUIDs. Review generated Drizzle SQL through the existing migration workflow. [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
- Mount the Better Auth handler under a noncolliding proposed prefix such as `/api/identity/*`; preserve existing `/api/auth/me`, `/api/auth/guard` and the legacy frontend session endpoint during transition. Fastify integration is documented, but its request/body/cookie forwarding must be tested with Pawjai's Bun runtime. [Fastify integration](https://better-auth.com/docs/integrations/fastify)
- Expose new browser auth and product requests through `https://app.pawjai.co/api/*`. The proxy forwards to Fastify, preserving separate `Set-Cookie` headers, status, streaming, cancellation and upload limits. Configure the externally visible auth URL explicitly; trust only expected proxy headers/hosts. Keep webhooks on their existing backend endpoint.
- New browser sessions use Secure, HttpOnly, host-only cookies, suitable SameSite policy, private/no-store responses and server-side session validation. Restrict origins and protect every cookie-authenticated mutation against CSRF, including product APIs. Do not share the new auth cookie with marketing or admin. [Cookie/proxy guidance](https://better-auth.com/docs/concepts/cookies)
- Native clients may use Better Auth's Bearer session support through the new API; validate with `auth.api.getSession`, not the Supabase JWT decoder. Reject ambiguous credentials or mismatched identities, and never interpret failed JWT verification as permission to trust an unverified fallback. [Bearer plugin](https://better-auth.com/docs/plugins/bearer)
- Native browser-to-WebView handoff uses a short-lived, single-use server exchange bound to the initiating flow/device and exact destination, redeemed to establish a WebView cookie. Keep durable tokens in platform secure storage; do not put access/refresh tokens in URLs or JS-readable shared cookies. Prototype Google and Apple on real devices before committing to the protocol.
- Move onboarding state reads/writes behind Pawjai's profile API. Current `lib/auth/redirects.ts` derives progress from Supabase metadata. Preserve completion/consent semantics and only migrate trusted fields; old metadata is not a new authorization policy.
- Keep existing admin sign-in, Stripe integration and share/helper token protocols outside this change. Replace their customer lookup/deletion/reset dependencies where necessary.

## Existing-account migration

1. **Inventory and backup.** Count users and provider identities, password users, verified/unverified accounts, disabled/deleted accounts, duplicates, MFA/phone/anonymous/SSO usage and active native versions. Verify export access to `auth.users`/`auth.identities`, app DB location, triggers/FKs/RLS, storage/realtime consumers and restore procedure. Report aggregates only; keep hashes/exports out of git, logs and this document.
2. **Import into additive tables.** Preserve UUIDs, creation timestamps, verified-email state, relevant metadata, provider subjects and account restrictions. Create credential records only where appropriate; preserve multiple providers on the same account. Stop on collisions or unsupported user classes rather than silently skipping them.
3. **Preserve passwords conditionally.** Supabase stores bcrypt hashes; Better Auth defaults to scrypt but supports custom verification. Use a reviewed bcrypt-compatible configuration initially and test actual exported hash variants with controlled accounts. If export or compatibility fails, plan explicit recovery for affected users. Hash modernization is separate. [Supabase password storage](https://supabase.com/docs/guides/auth/password-security), [Better Auth migration guide](https://better-auth.com/docs/guides/supabase-migration-guide)
4. **Preserve social identity.** Retain provider/subject associations. Validate Google clients and Apple team/service/bundle relationships and private-relay users. Do not merge accounts solely because an unverified email matches. New OAuth callback URLs and client configuration need a staging rehearsal. [Account linking](https://better-auth.com/docs/concepts/users-accounts)
5. **Make import resumable and auditable.** Transactional batches, stable keys, checksums/counts, a migration ledger and a failed-row report. Rerun must not duplicate users/accounts or overwrite newer target credentials. Before opening target writes, reconcile a final source delta under a short, explicit credential-write freeze. Preserve existing profile preferences and consent; initialization must be idempotent.
6. **Treat sessions separately.** The official migration does not retain active sessions. Default to a fresh login when switching an account to Better Auth; keep data/passwords intact. Do not promise transparent session conversion. Any optional legacy-session exchange is additional work requiring live validation, replay prevention and account-status checks. [Migration session limitation](https://better-auth.com/docs/guides/supabase-migration-guide)

### Coexistence and credential ownership

Before cutover, Supabase remains the sole production credential writer. Better Auth uses restored/staging data and controlled pilot accounts; it must not become an independently editable copy of all users' credentials. Ship native support before opening general Better Auth login/signup.

At cutover, designate Better Auth as writer for migrated users and new registrations. Disable/redirect legacy signup, reset and email-change entry points where possible, including old emails. Old binaries directly hit Supabase: backend flags alone cannot stop those upstream writes. Require their update before supporting new credential operations; do not claim indefinite compatibility.

During a limited legacy-session drain, the backend may accept validated Supabase sessions only for explicitly eligible, unchanged accounts. A migration login, password reset, account link/change, disable or deletion must invalidate legacy eligibility and relevant sessions; changed accounts cannot authenticate using stale Supabase credentials. Conflicts fail closed and use current recovery/update guidance.

If old native versions cannot be retired, delay the auth cutover and keep the domain improvement. Do not improvise bidirectional password synchronization. After target writes begin, rollback means stopping expansion and retaining access for migrated users, or a separately rehearsed reverse migration/recovery—not restoring an old database snapshot over live data.

## Mergeable implementation sequence

Each row can merge behind disabled flags before the next begins. Purin/release owner decides production advancement and rollback; implementation ownership is by repository responsibility.

| Step / owner | Change and acceptance | Verification level | Rollback |
|---|---|---|---|
| 0. Inventory / BE + ops | Actual provider/account counts, DB dependencies, costs, native-version distribution, route manifest and restored backup demonstrated | Read-only inventory + restore rehearsal | No user-facing changes |
| 1. URL/API boundary / FE + BE | Central URLs and route classification; app/guest ownership explicit, all product routes covered including chat; existing behavior initially unchanged | Unit route table + existing frontend build; public/app browser smoke | Revert config change |
| 2. App domain / ops + FE + native | Existing Next app at new DNS/TLS hostname; explicit CORS/callbacks; working Supabase login; domain-compatible mobile releases | Origin/callback integration; Chrome/Safari and iOS/Android restore/login/logout | Disable redirects/CTAs; preserve original origins/callbacks |
| 3. Astro public repo / public + ops | Independently buildable marketing/research preview, locale/main-site SEO parity, selected React islands; exclude blog porting; public DNS/ingress cutover preserves old app links, legacy blog routing and auth callbacks | Link/canonical/sitemap tests, main-site rebuild rehearsal, legacy-blog reachability, public page browser checks and production routing smoke | Restore prior public deployment; no auth-provider change |
| 4. Auth boundary / BE | Normalize Supabase identity; extract profile initialization, status and customer lookup operations; behavior unchanged | Unit identity/status tests + DB integration | Revert adapter while keeping old implementation |
| 5. Better Auth rehearsal / BE + FE | Add auth tables/handler/production proxy behind flag; controlled accounts pass import, cookies, recovery and provider login | Import rerun/restart and session integration; SSE/upload/proxy e2e | Disable new handler/cohort; additive tables remain |
| 6. Native auth compatibility / iOS + Android + BE | Existing shells support new protocol, secure handoff and strict bridge origins; supported-version policy established. Full native screens are not required | Real-device e2e and native builds; replay/foreign-origin negative checks | Stay on legacy provider via supported configuration; pause release expansion |
| 7. Account cutover / BE + ops | Final delta reconciled, target writer enabled; staff then small account cohort then broader rollout; no duplicate ownership/billing | Per-provider login/recovery plus ownership assertions, credential-change and old-client tests | Pause cohorts; keep migrated accounts on target; reverse only with rehearsed reconciliation |
| 8. Retire auth compatibility / all | Native adoption meets agreed policy; old callbacks/tokens drained or deliberately invalidated; customer admin operations use new owner | Confirm no legacy traffic in agreed observation window; recovery/deletion and zero-dependency checks | Retain legacy service through window; deletion is separately scheduled |
| 9. React SPA conversion / app + ops | In existing app repo, route/image/navigation adapters first; SPA preview next; remove Next server duties only when moved/retired; cut app deployment after parity and performance acceptance | Route/reload/404, auth/SSE/upload, slow-network/browser and representative product-flow tests; new project's declared build/typecheck/test scripts | Return to previous Next deployment using the same Better Auth backend/session contract |
| 10. Native iOS increment / iOS + BE | Ship one SwiftUI flow, then expand; preserve API compatibility, shared accounts and deep links with current web/Android | Native flow/device tests, offline/retry/permissions/session and upgrade-path QA | Pause native rollout; retain compatible web/old-native flows; already released versions need continued API support |
| 11. Optional DB exit / later decision | Remove remaining Supabase services only if inventory/cost justifies it | Separate migration plan | Keep outside auth/runtime rollback scope |

Do not use “waiting long enough” as proof of retirement: refresh sessions and old binaries may persist. Record token/session policies, active version telemetry and the selected forced-update policy.

## Acceptance, operations and rollback triggers

- New public homepage/marketing/research pages load without Supabase session initialization or app-only providers. Preserve Thai/English behavior and main-site SEO; compare output rather than assuming route groups make pages static. Blog pages are excluded from the new public build; existing blog links remain reachable through the explicit legacy route until their separate migration.
- All existing app links resolve; nested destinations and safe query parameters survive sign-in. Test old callback, password reset, checkout return, notification and share links explicitly. Auth/private cache headers must win over the existing general cache rule.
- Same account sees identical pet IDs, record/chat ownership, subscription/customer IDs and notification devices before/after login. No onboarding reset, duplicated welcome settings or changed consent.
- Test signup, password/Google/Apple login, verification, recovery, logout, session expiry, revoked session, disabled/deleted account, duplicate-email linking and interrupted import. MFA/other user classes discovered in inventory get explicit tests before inclusion.
- Account initialization must retry safely after a process crash. DB/session failures return a controlled retryable error without bypassing auth or creating a second profile. OAuth/email outages preserve the account and allow safe retry; do not turn unavailable email into “verified”.
- Add provider/client-version login success/failure, session validation latency, redirect-loop counts, import errors, legacy traffic and account-link conflicts. Correlate with request IDs; never log tokens, passwords, hashes or reset links. Rate limiting must work across backend replicas; account for the changed proxy hop count/client IP.
- Proposed stop triggers: any wrong-account access or ownership mismatch stops immediately; any provider systematically failing or repeatable mobile login loop pauses the rollout; login success dropping more than 2 percentage points from the measured baseline over 30 minutes pauses expansion. These are proposed thresholds, not existing SLOs; low-traffic cohorts also require manual checks.
- Account disable/deletion must block both providers during coexistence. Sign-out semantics must be explicit (this session versus all sessions); purge stale per-user browser caches on account switch. Keep recovery available even when rollout is paused.

Planned current-repository checks: in `pawjai-fe`, `bun run lint`, `bun run build`, and its existing Bun suites `bun test src/__tests__`; in `pawjai-be`, `bun run test`, `bun run build:ts`, `bun run db:validate`, plus the existing test wrapper's disposable DB migration checks. New Astro and SPA builds must declare their own build/typecheck/test scripts; these projects do not exist yet. Native checks require the configured Xcode/Android build environments and real-device OAuth/WebView QA. The current frontend has no package `test` script.

**Verification for this planning task:** code/manifest inspection and current official documentation only. No builds/tests, live configuration reads, DB exports or migration commands were run. The plan is not an implemented or verified migration.

## Decisions still needed before implementation

1. Confirm auth-only versus eventual complete Supabase exit; Better Auth in Fastify is accepted.
2. Establish current monthly Supabase spend, production DB host, user/provider counts and operational budget; no savings amount or delivery date is yet defensible.
3. Confirm one fresh login at auth cutover and a minimum-supported-mobile-version policy. Without an update path, retain Supabase longer.
4. Confirm Astro and React SPA after prototypes, public content/locale publishing strategy, and later native iOS scope. Separate repositories/deployments are the preferred direction; actual repo creation and application implementation have not been requested yet.

## FRESH self-score

FRESH before → after: **F2→2 · R3→3 · E2→2 · S3→3 · H2→2 = 12→12/15 (B)**. Named edits: excluded blog implementation/publishing from public-repo ownership and route scope; updated discovery, rollout and acceptance criteria; added separate-domain ownership and legacy-link continuity. No dimension increases: no index entry, cross-repo detail remains, and live inventory/prototype/policy decisions are still open. The document is current as a proposal, not verified implementation.
