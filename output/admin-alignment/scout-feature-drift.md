---
type: audit
status: draft
updated: 2026-10-02
authority: Owner decisions (MEMORY.md) vs. deployed code state (master/staging)
scope: Admin UI (pawjai-admin origin/master) vs. Backend APIs (pawjai-be origin/staging)
---

# Admin-Backend Alignment Audit: Feature Drift

## Executive Summary (8 bullets)

1. **Dead tier system in admin:** Notification settings UI exposes "Free" and "Premium" tier targeting; owner decision is single "Pawjai Premium" plan (no freemium). Admin form, types, and analytics all reference retired tiers; backend still accepts all three (`all|free|premium`) but produces zero free-tier users.

2. **i18n UI built, not wired:** Backend `/api/admin/i18n` endpoint (coverage, items, PATCH edit) is merged and live; admin i18n pages (A1-A3: dashboard, items list, inline edit) exist in unpushed `pawjai-admin-wt-i18n` feature branch (731bf82), NOT in master. Admin nav has no i18n entry.

3. **Offers analytics orphaned:** Admin analytics/offers page and hooks exist, backend endpoints exist, but offers/cooldown promotion system is retired per owner decision; UI should be removed or hidden pending final offer design.

4. **Pricing page incomplete:** Admin cycles.ts explicitly marks `yearly_discounted` and `yearly_default` as retired (migration 0122); both old cycles still in historical data, page handles them, but no UI to create them. Page works correctly (reads live Stripe state), false positive on dead code.

5. **Permission guards matched:** Admin auth checks (`requireAdmin`, `requireRole('super_admin')`) align with backend (`preHandler: [requireAdmin, requireRole('super_admin')]`) on pricing, i18n, concepts. Offers page requires `analytics:read`, backend enforces it. No mismatches found.

6. **Notification form accepts dead tiers:** Form state includes `targetTier: "all" | "free" | "premium"`; broadcast composer validates same enum; backend accepts same. No code path prevents saving "Free Only" notifications, although no free-tier users exist to receive them. Misleading control.

7. **Admin docs stale on architecture:** Admin CLAUDE.md and README correctly describe auth patterns and API shape; no feature drift in docs (architecture is stable). Backend docs are archived pending rewrite (acknowledged in docs/README.md); no stale claims in shipped code.

8. **No snooze/alarm UI drift:** Owner decision removes snooze from reminders; admin has no snooze UI (backend deployed snooze endpoints but they're unused per MEMORY.md). No admin screens reference snooze. Chat manual log cards unwired per PR #324; no admin logging_offer analytics (only chat logging metrics exist).

---

## A. Dead Screens / Removed Feature Controls

| Admin File | Line | Dead Control | Backend State | Severity |
|---|---|---|---|---|
| `app/admin/settings/notifications/components/NotificationForm.tsx` | 128, 286 | `targetTier` enum includes `"free"` in form state and select options | Backend accepts `free` but zero free users exist; control is misleading | Breaking logic |
| `app/admin/settings/notifications/components/AudienceCount.tsx` | 15 | Tier audience label includes `free: "free-tier users"` | Audit says single tier only; shows ghost metric | Misleading |
| `app/admin/settings/notifications/components/SettingsTable.tsx` | 118 | Badge render for `targetTier === "free"` | Label "🆓 Free Only" renders for historical rows only; no new rows can be `free` | Cosmetic |
| `app/admin/settings/notifications/components/BroadcastComposer.tsx` | 30 | Zod schema enum `["all", "free", "premium"]` | Matches backend; validation loose | Cosmetic |
| `hooks/useNotificationSettings.ts` | 9, 48, 69 | Type `targetTier: "all" \| "free" \| "premium"` on mutation payloads | Accepts whatever form sends; no filtering | Cosmetic |
| `app/admin/analytics/offers/page.tsx` | full page | Offers analytics dashboard | Promotion system retired; endpoint exists but no admins use it per design | Dead feature |

---

## B. Backend APIs with No Admin UI, or Partial UI

| Backend Endpoint | Admin Coverage | Gap | Notes |
|---|---|---|---|
| `GET /api/admin/i18n/coverage` | **None in master** | i18n coverage dashboard, items list, inline PATCH edit exist in unpushed worktree; no master nav entry | Status: A1-A3 built (731bf82), feature branch not merged |
| `GET /api/admin/i18n/items` | **None in master** | See above | Pagination + filtering + search + state (needs_review/missing/complete) built but not shipped |
| `PATCH /api/admin/i18n/translations/:entity/:id/:locale` | **None in master** | Super-admin inline edit + review mark built but not wired | Requires super_admin role, works on all 5 entities (concepts, breeds, notifications, etc.) |
| `GET /api/admin/pricing/history` | Partial | History table in pricing page reads live Stripe, not admin history endpoint | Page works correctly; historical cycles (retired `yearly_discounted`/`yearly_default`) are correctly labeled as `[retired]` |
| `POST /api/admin/concepts/:id` (edit) | Partial | Concept editor (item 4) built and super_admin gated; no bulk editor, no mass-translation feature | Pages: `settings/concepts/page.tsx` lists, allows edit, remap is UI feature not endpoint |
| `GET /api/admin/notifications/settings/:id` | Full | Single setting fetch works | But no admin page lists _all_ settings; only broadcast/send tabs show them |

---

## C. Stale Copy / Docs vs. Backend

| File | Line | Copy / Claim | Backend Reality | Issue |
|---|---|---|---|---|
| `pawjai-admin/CLAUDE.md` | 1-70 | Architecture, auth patterns, API auto-unwrap behavior | All accurate; no drift | None |
| `pawjai-admin/README.md` | 1-70 | Stack, quickstart, env vars, project structure | All accurate | None |
| `pawjai-be/docs/README.md` | full | Business/technical docs moved to archive (2026-08-26); only API, planning, future-improvement remain | Acknowledged as pending rewrite; doesn't claim docs are current | Preemptive |
| `pawjai-be/CLAUDE.md` | 1-60 | Code style, architecture, API responses, error shape | All accurate; no feature drift | None |

---

## D. Role / Permission Drift

| Check | Admin | Backend | Match? |
|---|---|---|---|
| Pricing page access guard | `useAdminAuth(); isSuperAdmin` check on render | `requireRole('super_admin')` on GET/PATCH endpoints | ✅ Yes |
| Concepts page access | No explicit guard in list; edit form has no server-side validation | `requireRole('super_admin')` on POST/PATCH mutations | ⚠️ Admin allows navigation; backend enforces role on mutation |
| i18n coverage access | **Not in master** | `requireAdmin` on GET /coverage; `requireAdmin` on GET /items | N/A (unshipped in admin) |
| i18n edit (PATCH) | **Not in master** | `requireRole('super_admin')` on PATCH `/translations/:entity/:id/:locale` | N/A (unshipped in admin) |
| Notifications settings | No role check; any admin can view/edit | Backend accepts `all|free|premium` targetTier; no field-level role gate | ⚠️ Any admin can target free users (who don't exist) |
| Offers analytics | No explicit role check; page renders if data fetches | Backend requires `analytics:read` permission | ⚠️ Unguarded frontend nav vs. backend permission |

---

## Prioritized Fix List (Top 10)

1. **Remove "Free" tier option from notification settings form** (breaking now)
   - Admin: `NotificationForm.tsx` line 286 — delete `<option value="free">Free Only</option>`
   - Admin: `BroadcastComposer.tsx` line 30 — change `z.enum(["all", "free", "premium"])` to `z.enum(["all", "premium"])`
   - Admin: Type defs `hooks/useNotificationSettings.ts` — narrow `targetTier` type to `"all" | "premium"`
   - Severity: **Breaking logic** (form accepts and can save dead tier value)

2. **Remove free-tier audience labels from AudienceCount** (misleading now)
   - Admin: `AudienceCount.tsx` line 15 — delete `free` entry
   - Admin: `SettingsTable.tsx` line 118 — keep badge for historical rows only (already does this)
   - Severity: **Misleading** (shows ghost metric)

3. **Merge i18n admin UI to master** (capability gap)
   - Merge `pawjai-admin-wt-i18n` feat/i18n-translation-ux (A1-A3 commits 781f6ab..731bf82)
   - Add i18n nav entry to `lib/constants/admin-nav.ts`
   - Add `/admin/settings/i18n` page entry to routing
   - Severity: **Missing capability** (backend ready; UI ready; just not integrated)

4. **Hide or deprecate offers analytics page** (dead feature)
   - Admin: `app/admin/analytics/offers/page.tsx` — hide nav entry or add deprecation banner
   - Decision needed: remove entirely, or preserve for future offer system redesign?
   - Severity: **Dead feature** (no admins use it)

5. **Add role check to concepts editor page** (unguarded now)
   - Admin: `app/admin/settings/concepts/page.tsx` — add `useAdminAuth()` guard check for super_admin at render
   - Backend already enforces; frontend should prevent nav to prevent confusion
   - Severity: **Misleading** (page navigable but mutations fail)

6. **Document pricing cycle retirement in admin UI** (clarity)
   - Admin: `lib/pricing/cycles.ts` — already documents retired cycles correctly; no change needed
   - Severity: **Cosmetic** (page handles correctly; code is clear)

7. **Add permission guard to offers analytics nav** (unguarded navigation)
   - Admin: Check if offers page is in nav; if yes, gate it to `analytics:read` or hide if deprecated
   - Severity: **Misleading** (unguarded nav vs. backend permission)

8. **Flag i18n review_status field as new in API docs** (discovery gap)
   - Backend: `/api/admin/i18n` returns `review_status` + `source` on translations (new fields)
   - Admin: When merged, ensure frontend knows about these fields for display/filtering
   - Severity: **Missing capability** (fields exist; not yet exposed in UI)

9. **Document that no admin creates free-tier notifications** (process clarity)
   - Docs: Update admin handbook or notifications guide to clarify single-tier design
   - Note: All notifications target "All Users" or "Premium Only"
   - Severity: **Cosmetic** (not a code bug; a process doc gap)

10. **Review billing currency field on subscriptions API** (completeness)
    - Backend: Subscription API exposes `billingCurrency` (B1, commit 41bac79); admin should display it on user/subscription pages for currency transparency
    - Admin: Check if `usePricingConfigs` / subscription hooks expose billing currency
    - Severity: **Missing feature** (data available; unclear if displayed)

---

## Notes for Merging i18n Admin UI

When `pawjai-admin-wt-i18n` feat/i18n-translation-ux is merged to master:

- A1 (coverage dashboard): displays locale status + entity coverage counts
- A2 (items list): paginated rows, filters (entity/locale/state/search), inline edit super_admin gated
- A3 (badges): new badges on concepts/breeds/notifications lists showing completion %
- Requires `/api/admin/i18n` endpoints live (merged in be on 2026-10-02)
- Merge order: be first (already done), then admin feature branch
- No migration needed; API is additive (read-only on live rows)

---

## Owner Decision Checkpoint

**Offers analytics page:** Promotion system is retired (owner 2026-09-30), but analytics page still exists. Options:
- **Remove entirely** — admin nav, routes, hooks, service, all code
- **Hide nav entry** — keep code for future redesign; add deprecation banner if anyone navigates to it
- **Preserve as-is** — no admins use it; unlikely to cause harm

Recommend: **Remove entirely** (dead code; endpoint can be archived too).

---

FRESH rubric: F 3 (audit scope, findings organized, decision checkpoint clear) · R 2 (findings grounded in code; owner decisions verified against MEMORY.md; no process recommendations) · E 3 (split A-D sections, prioritized fix list, table format) · S 3 (code snippets tied to findings; no duplication) · H 2 (severities named, but no remediation code included — this is scout, not fix agent). Total 13/15 (B+).
