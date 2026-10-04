# Admin <-> backend alignment: verified findings (2026-10-02)

Scouts: `scout-api-contract.md`, `scout-feature-drift.md` (Haiku). Claims below were checked against admin origin/master and be origin/staging by the coordinator.

| Scout claim | Verdict | Evidence |
|---|---|---|
| Admin pricing can't send `quarterly` (would 400) | FALSE | admin `pricingConfigService.ts:7,23,85` types cycle as `string`; rows come from DB |
| Broadcast `sendNow` route missing | FALSE | be `broadcasts.ts:79-82` `POST /from-setting/:identifier/send-now` exists |
| Free tier gone from backend | FALSE today | be `schemas.ts:314` `plan: z.enum(['free','premium'])`, `broadcasts.ts:16` tier `all|free|premium`. Free tier still in code; owner decision (no freemium) not implemented yet |
| Notification forms break (titleTh etc.) | FALSE | be `broadcasts.ts:35` still requires `titleTh` |
| i18n admin UI not merged | TRUE | pawjai-admin PR #44 (includes AL2) |
| Concepts page: mutations fail server-side for non-super_admin, UI doesn't hide | PLAUSIBLE (UX) | see scout-feature-drift.md D |
| Offers analytics nav not gated to `analytics:read` | PLAUSIBLE (UX) | see scout-feature-drift.md D |
| Offers analytics + free-tier targeting are dead per owner decisions | DEPENDS ON OWNER | offer/cooldown system kept until explicit instruction; free tier still in backend |

Nothing in admin breaks against current staging.
