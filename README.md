# Pawjai 🐾

Pet wellness platform for pet owners and clinics. This repo is the **central navigator** — each service lives in its own repository. Start here to understand the system, then go to the repo that matters to you.

---

## Services

| Repo | Role | Port |
|---|---|---|
| [pawjai-be](https://github.com/stateless-x/pawjai-be) | REST API — pets, health records, subscriptions, AI chat | 4000 |
| [pawjai-client](https://github.com/stateless-x/pawjai-client) | Web app — user-facing product | 3000 |
| [pawjai-admin](https://github.com/stateless-x/pawjai-admin) | Admin dashboard — ops, analytics, content | 3001 |
| [PawjaiMobile](https://github.com/stateless-x/PawjaiMobile) | iOS app — native shell wrapping the web client | — |

Each repo has its own README, setup guide, and deployment pipeline. **Click the repo that matches your role and follow its instructions.**

---

## How the system fits together

```
iOS App  ──WebView──▶  Web Client  ──API──▶  Backend  ──▶  PostgreSQL
                                                       ──▶  Supabase (auth)
                                                       ──▶  Stripe (payments)
```

The backend is the single source of truth. Web and mobile both depend on it. The iOS app wraps the web client — it's not a standalone app.

---

## Local development order

If you need everything running locally:

1. **Backend first** — nothing else works without it
2. **Web client** — depends on backend
3. **Admin** — depends on backend
4. **iOS** — depends on web client being reachable

Each repo's README has its own quickstart. Ports: `4000` · `3000` · `3001`

---

## Infrastructure at a glance

- **Runtime:** Bun
- **Framework:** Fastify (BE) · Next.js (web + admin) · SwiftUI (iOS)
- **Database:** PostgreSQL via Drizzle ORM
- **Auth:** Supabase
- **Payments:** Stripe
