# Pawjai 🐾

Pawjai is a pet wellness platform for pet owners and clinics.

This repo is the central navigator. Each service lives in its own repository with its own setup guide and deployment pipeline. Start here to understand the system, then go to the repo that matches your role.

## Services

| Repo | What it does | Port |
|---|---|---|
| [pawjai-be](https://github.com/stateless-x/pawjai-be) | REST API. Pets, health records, subscriptions, AI chat. | 4000 |
| [pawjai-fe](https://github.com/stateless-x/pawjai-fe) | Web app. The user-facing product. | 3000 |
| [pawjai-admin](https://github.com/stateless-x/pawjai-admin) | Admin dashboard. Ops, analytics, content management. | 3001 |
| [pawjai-ios](https://github.com/stateless-x/pawjai-ios) | iOS app. A native shell that wraps the web client. | n/a |

## How the system fits together

```
iOS App  ──WebView──▶  Web Client  ──API──▶  Backend  ──▶  PostgreSQL
                                                       ──▶  Supabase (auth)
                                                       ──▶  Stripe (payments)
```

The backend is the single source of truth. Web and mobile both depend on it. The iOS app is not a standalone app — it wraps the web client through a WebView bridge.

## Running locally

If you need the full system running on your machine, start in this order.

1. Backend first. Nothing else works without it.
2. Web client. Depends on the backend.
3. Admin. Depends on the backend.
4. iOS. Depends on the web client being reachable.

Each repo's README has its own quickstart instructions.

## Stack

Bun · Fastify · Next.js · SwiftUI · PostgreSQL · Drizzle ORM · Supabase · Stripe
