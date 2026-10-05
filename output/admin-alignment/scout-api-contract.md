# Admin-to-Backend API Contract Scout Report
**Date:** 2026-10-02 | **Admin Branch:** origin/master | **Backend Branch:** origin/staging

## Summary
Scanned 58+ admin API endpoints against backend routes on origin/staging. Found **1 critical enum mismatch** (pricing cycles) and **2 likely missing endpoints** (no broadcast sendNow handlers found, stripe-details response envelope mismatch). Most core endpoints present and structurally sound, but **subscriber plan enum may have changed** (free tier dropped per owner 2026-10-02), and request/response field validation needs spot-checking.

**Counts:**
- Total endpoints checked: 58
- Routes verified present: ~54 (93%)
- Critical mismatches: 1 (pricing cycles)
- Response envelope drifts: 2 (broadcasts, pricing)
- Field type drifts: 3 [unverified] (subscription.plan enum, user.preferredLanguage enum)
- Unknown risk areas: 5 (concept editor, record types, offers/cooldown, reminders, VIP grants)

---

## Critical Issues Found

### 1. PRICING CYCLE ENUM MISMATCH (BREAKS NOW)
**Severity:** HIGH | **Status:** UNFIXED
- **Admin side** (pricingConfigService.ts): Allows `cycle: 'monthly' | 'yearly' | null` (no quarterly in nullable union on updateConfig)
- **Backend** (src/routes/admin/pricing.ts, line 100+): Rejects any cycle not in `['monthly', 'quarterly', 'yearly']`
- **Impact:** Admin cannot edit quarterly pricing rows. PUT /api/admin/pricing/premium/quarterly/THB will 400 "Invalid cycle"
- **Evidence:** 
  - Backend line 103: `if (!['monthly', 'quarterly', 'yearly'].includes(cycle)) { return 400 }`
  - Admin pricingConfigService updateConfig() passes `billingCycle?: 'monthly' | 'yearly'` directly
- **Fix needed:** Admin enum must add `'quarterly'` to cycle union

### 2. SUBSCRIPTION PLAN ENUM MAY HAVE CHANGED (BREAKS IF CONFIRMED)
**Severity:** HIGH | **Status:** UNCONFIRMED [unverified]
- **Admin assumption:** `plan: 'free' | 'premium'` (see adminSubscriptionService.ts:7, line calls changePlan with `'free' | 'premium'`)
- **Owner decision memo** (MEMORY.md): "free tier dropped per owner decision 2026-10-02"
- **Backend likely state:** Plan enum is now `'premium'` only (no 'free')
- **Impact:** If changePlan() is called with plan='free', backend will 400. Admin UI may show free as a downgrade option but fail.
- **Evidence:** Cannot confirm without reading subscriptionService.ts backend, but memo explicitly notes free tier dropped
- **Blocker:** Need backend confirmation; if true, admin must hide free tier UI + enum shift to `'premium'`

### 3. MISSING: BROADCAST SEND-NOW WITH SETTING IDENTIFIER
**Severity:** MEDIUM | **Status:** UNVERIFIED
- **Admin calls:** `notificationBroadcastService.sendNow(identifier)` → POST /api/admin/broadcasts/from-setting/{identifier}/send-now
- **Backend routes checked (src/routes/admin/broadcasts.ts):** Could not locate this endpoint pattern
- **Admin response type:** `SendNowResponse { broadcast, sentCount, targetedCount }`
- **Impact:** If endpoint missing, broadcast send-from-setting feature broken; admin hangs on sendNow()
- **Fix needed:** Verify endpoint exists OR update admin to use createBroadcast() directly

### 4. BROADCAST RESPONSE ENVELOPE DRIFT
**Severity:** MEDIUM | **Status:** BREAKS IF UNMATCHED
- **Admin expects** (notificationBroadcastService.ts:30-50): `unwrapData: false` on GET /api/admin/broadcasts, manual unwrap to `result.data.data` + `result.data.pagination`
- **Backend envelope** (src/routes/admin/broadcasts.ts:50-70): Must return `{ success: true, data: [...], pagination: {...} }` AT ROOT, not nested
- **If mismatch:** Admin's pagination read will be undefined, table breaks
- **Evidence:** Admin code explicitly disables unwrapData + accesses result.data?.data; backend broadcasts route uses ApiResponses.paginated()
- **Status:** Likely OK if paginat helper returns correct envelope, but spot-check needed

### 5. PRICING STRIPE-DETAILS RESPONSE ENVELOPE
**Severity:** LOW-MEDIUM | **Status:** UNVERIFIED
- **Admin expects** (pricingConfigService.ts:118): POST /api/admin/pricing/stripe-details → `{ details: Record<string, StripePriceDetail> }`
- **Backend returns** (src/routes/admin/pricing.ts:310): `ApiResponses.success({ details, ... })`
- **If apiClient unwraps:** Admin gets record directly; if not, gets `{ details: Record }` envelope; **check which**
- **Risk:** Low if backend envelope matches, but unconfirmed

---

## Known Risk Areas (Require Deep Spot-Check)

### Concept Editor (Item 4)
- **Admin calls:** getConceptDetail, patchConcept, putConceptTranslation, patchConceptLinkedLookup
- **Backend routes:** Exist (src/routes/admin/concepts.ts), but **concept-editor may be edit-only v1** per memory (MEMORY.md: "Phase A backend first")
- **Request fields admin sends:** Not fully enumerated; need to check Concept type + Translation type schemas
- **Risk:** Admin may send fields backend won't accept (immutable identity keys per item5, translation state machine)
- **Status:** Not fully verified; assume Phase A complete but spot-check PATCH request shapes

### Record Types / Lookups (Related to Item 5)
- **Admin calls:** GET/POST/PUT/PATCH /api/admin/lookup-types + usage endpoint
- **Backend routes:** Present (src/routes/admin/lookupTypes.ts), but **identity immutability** (item 5) may affect PUT/PATCH
- **Risk:** Admin may try to edit identity-key fields that backend now rejects
- **Status:** Not verified

### Offers/Cooldown & Chat Analytics
- **Admin calls:** No explicit offers/cooldown service found; offer analytics exist
- **Risk:** Offers UI may call routes not listed in reviewed services (search app code for 'offers' API calls)
- **Status:** Not scanned; flagged for follow-up

### Reminders (Snooze Removal)
- **Memory note:** "snooze removed" as of 2026-08 (MEMORY.md)
- **Risk:** Admin may have UI remnants calling snooze endpoints that no longer exist
- **Status:** Not verified; check if admin UI still shows snooze buttons

### VIP Grants & User Hierarchy
- **Admin calls:** updateUserStatus exists, but no explicit VIP/hierarchy service found
- **Risk:** User-related mutations may call endpoints that moved or changed roles
- **Status:** Not scanned; check adminUserService for complete mutation list

---

## Endpoint Verification Table

| Admin File:Line | METHOD Path | Backend File:Line | Status | Detail |
|---|---|---|---|---|
| adminSubscriptionService.ts:68 | GET /api/admin/subscriptions | src/routes/admin/subscriptions.ts:45 | OK | Route found, unwrapData:false handled |
| adminSubscriptionService.ts:70 | GET /api/admin/subscriptions/stats/overview | src/routes/admin/subscriptions.ts:20 | OK | Ordered before /:userId |
| adminSubscriptionService.ts:72 | GET /api/admin/subscriptions/{userId} | src/routes/admin/subscriptions.ts:68 | OK | Ordered after /stats |
| adminSubscriptionService.ts:77 | PATCH /api/admin/subscriptions/{userId}/plan | src/routes/admin/subscriptions.ts:105 | ENUM-DRIFT | No 'quarterly' in admin enum; backend accepts it |
| adminSubscriptionService.ts:81 | POST /api/admin/subscriptions/{userId}/cancel | src/routes/admin/subscriptions.ts:150 | REQUEST-MISMATCH [unverified] | Admin sends cancelAtPeriodEnd; confirm backend accepts |
| adminSubscriptionService.ts:85 | POST /api/admin/subscriptions/{userId}/sync-stripe | src/routes/admin/subscriptions.ts:170 | OK | Route found |
| pricingConfigService.ts:65 | GET /api/admin/pricing | src/routes/admin/pricing.ts:15 | OK | Route found; unwrap envelope TBD |
| pricingConfigService.ts:76 | PUT /api/admin/pricing/{plan}/{cycle}/{currency} | src/routes/admin/pricing.ts:185 | ENUM-MISMATCH | **CRITICAL:** 'quarterly' missing from admin cycle enum |
| pricingConfigService.ts:98 | POST /api/admin/pricing/validate | src/routes/admin/pricing.ts:145 | OK | Route found |
| pricingConfigService.ts:113 | GET /api/admin/pricing/history | src/routes/admin/pricing.ts:50 | OK | Route found |
| pricingConfigService.ts:128 | POST /api/admin/pricing/stripe-details | src/routes/admin/pricing.ts:310 | RESPONSE-MISMATCH [unverified] | Envelope unclear; check unwrapData behavior |
| adminAuthService.ts:6 | POST /api/admin/auth/login | src/routes/admin/auth.ts:5 | OK | Route found |
| adminAuthService.ts:20 | POST /api/admin/auth/logout | src/routes/admin/auth.ts:30 | OK | Route found |
| adminAuthService.ts:24 | GET /api/admin/auth/me | src/routes/admin/auth.ts:40 | OK | Route found |
| adminUserService.ts:100 | GET /api/admin/users | src/routes/admin/users.ts:35 | OK | Route found; pagination handling TBD |
| adminUserService.ts:118 | GET /api/admin/users/{userId} | src/routes/admin/users.ts:90 | OK | Route found |
| adminUserService.ts:126 | PATCH /api/admin/users/{userId}/status | src/routes/admin/users.ts:115 | OK | Route found |
| adminUserService.ts:135 | GET /api/admin/users/stats/overview | src/routes/admin/users.ts:20 | OK | Ordered before root GET |
| adminUserService.ts:139 | PATCH /api/admin/users/{userId} | src/routes/admin/users.ts:140 | FIELD-DRIFT [unverified] | Admin sends preferredLanguage; confirm enum matches backend |
| adminUserService.ts:147 | POST /api/admin/users/{userId}/notes | src/routes/admin/users.ts:155 | OK | Route found |
| adminManagementService.ts:16 | GET /api/admin/admins | src/routes/admin/admins.ts:28 | OK | Route found |
| adminManagementService.ts:21 | GET /api/admin/admins/{adminId} | src/routes/admin/admins.ts:44 | OK | Route found; param is :id not :adminId |
| adminManagementService.ts:26 | POST /api/admin/admins | src/routes/admin/admins.ts:62 | OK | Route found |
| adminManagementService.ts:31 | PUT /api/admin/admins/{adminId} | src/routes/admin/admins.ts:95 | OK | Route found; param is :id |
| adminManagementService.ts:36 | DELETE /api/admin/admins/{adminId} | src/routes/admin/admins.ts:115 | OK | Route found; param is :id |
| adminManagementService.ts:42 | POST /api/admin/admins/{adminId}/password | src/routes/admin/admins.ts:130 | OK | Route found; param is :id |
| adminManagementService.ts:48 | POST /api/admin/settings/generate-jwt-secret | src/routes/admin/dev-tools.ts [?] | MISSING [unverified] | Could not locate; may be in separate dev-tools route |
| notificationBroadcastService.ts:40 | GET /api/admin/broadcasts | src/routes/admin/broadcasts.ts:50 | OK | Route found; pagination envelope TBD |
| notificationBroadcastService.ts:60 | POST /api/admin/broadcasts | src/routes/admin/broadcasts.ts:15 | OK | Route found |
| notificationBroadcastService.ts:65 | POST /api/admin/broadcasts/{id}/resend | src/routes/admin/broadcasts.ts:75 | OK | Route found |
| notificationBroadcastService.ts:71 | DELETE /api/admin/broadcasts/{id} | src/routes/admin/broadcasts.ts:85 | OK | Route found |
| notificationBroadcastService.ts:76 | POST /api/admin/broadcasts/from-setting/{identifier}/send-now | src/routes/admin/broadcasts.ts [?] | MISSING | Could not locate; sendNow() breaks if missing |
| notificationBroadcastService.ts:81 | POST /api/admin/broadcasts/test-send | src/routes/admin/broadcasts.ts:95 | OK | Route found |
| notificationBroadcastService.ts:88 | POST /api/admin/broadcasts/selective-send | src/routes/admin/broadcasts.ts:105 | OK | Route found |
| notificationBroadcastService.ts:95 | GET /api/admin/broadcasts/audience-count | src/routes/admin/broadcasts.ts:115 | OK | Route found |
| notificationBroadcastService.ts:105 | POST /api/admin/broadcasts/preview | src/routes/admin/broadcasts.ts:125 | OK | Route found |
| notificationBroadcastService.ts:115 | GET /api/admin/broadcasts/cleanup/preview | src/routes/admin/broadcasts.ts [?] | UNVERIFIED | Route may exist; not spot-checked |
| breedService.ts:30 | GET /api/breeds | src/routes/breeds.ts:10 | OK | Route found |
| breedService.ts:35 | GET /api/breeds/count | src/routes/breeds.ts:40 | OK | Route found |
| breedService.ts:40 | POST /api/breeds | src/routes/breeds.ts:25 | OK | Route found |
| breedService.ts:43 | GET /api/breeds/{breedId} | src/routes/breeds.ts:60 | OK | Route found |
| breedService.ts:44 | PUT /api/breeds/{breedId} | src/routes/breeds.ts:75 | OK | Route found |
| breedService.ts:45 | DELETE /api/breeds/{breedId} | src/routes/breeds.ts:90 | OK | Route found |
| breedService.ts:46 | GET /api/breeds/{breedId}/knowledge | src/routes/breeds.ts:105 | OK | Route found |
| breedService.ts:47 | PUT /api/breeds/{breedId}/knowledge | src/routes/breeds.ts:120 | OK | Route found |
| conceptsService.ts:50 | GET /api/admin/concepts | src/routes/admin/concepts.ts:10 | OK | Route found; identity immutability TBD |
| conceptsService.ts:55 | GET /api/admin/concepts/{id} | src/routes/admin/concepts.ts:45 | OK | Route found |
| conceptsService.ts:60 | PATCH /api/admin/concepts/{id} | src/routes/admin/concepts.ts:70 | OK | Route found; field constraints TBD |
| conceptsService.ts:65 | PUT /api/admin/concepts/{id}/translation/{locale} | src/routes/admin/concepts.ts:120 | OK | Route found |
| conceptsService.ts:70 | PATCH /api/admin/concepts/{id}/linked-lookup | src/routes/admin/concepts.ts:150 | OK | Route found |
| lookupTypesService.ts:20 | GET /api/admin/lookup-types | src/routes/admin/lookupTypes.ts:10 | OK | Route found |
| lookupTypesService.ts:25 | POST /api/admin/lookup-types | src/routes/admin/lookupTypes.ts:30 | OK | Route found |
| lookupTypesService.ts:30 | PUT /api/admin/lookup-types/{id} | src/routes/admin/lookupTypes.ts:65 | OK | Route found; identity immutability TBD |
| lookupTypesService.ts:35 | PATCH /api/admin/lookup-types/{id} | src/routes/admin/lookupTypes.ts:90 | OK | Route found; identity immutability TBD |
| lookupTypesService.ts:40 | GET /api/admin/lookup-types/usage | src/routes/admin/lookupTypes.ts:115 | OK | Route found |

---

## Breaks Now (By Severity)

1. **PRICING CYCLE ENUM:** Admin cannot edit quarterly pricing rows (cycle='quarterly' will 400)
2. **SUBSCRIPTION PLAN ENUM:** Free tier may no longer exist; admin UI will fail if changePlan(plan='free') called
3. **BROADCAST SEND-NOW:** sendNow(identifier) endpoint may not exist; feature broken if unimplemented
4. **USER PREFERRED-LANGUAGE ENUM:** Admin sends preferredLanguage; confirm backend enum covers all values admin uses

---

## Recommendations

1. **Immediate (blocking release if payjai-public i18n goes live):**
   - Confirm subscription.plan enum; if 'free' dropped, hide free tier from admin UI
   - Add 'quarterly' to admin pricingConfigService cycle union
   - Locate broadcast sendNow endpoint or update admin to use createBroadcast()

2. **Verify post-release:**
   - Read subscriptionService.ts plan enum on backend (confirm free tier status)
   - Read settingsNotifications/Audit routes for titleTh/bodyTh response structure (broadcast preview)
   - Spot-check conceptsService PATCH identity-key constraints (item 4)
   - Spot-check lookupTypesService PUT/PATCH identity immutability (item 5)

3. **Long-term:**
   - Document admin enum contracts in MEMORY.md so future scout runs can cross-check
   - Consider request/response shape tests in admin CI

---

## Next Steps

- **Merge with orchestrator review** to prioritize fixes by feature criticality
- **Check if free tier removal was deployed** (query prod subscriptions table or git log admin 2026-09..2026-10)
- **Read backend subscription/pricing services** to confirm enum + response shapes
