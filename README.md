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

### Prerequisites

- [OrbStack](https://orbstack.dev) — runs the local PostgreSQL database (lightweight Docker for Mac)

### 1. Start the database

The shared database config lives at `~/dev/docker-compose.yml`. Run once (OrbStack auto-starts on login after that):

```bash
cd ~/dev
docker compose up -d
```

This starts PostgreSQL 16 on `localhost:5432` with `pawjai_dev` pre-created.

Use this connection string in `pawjai-be/.env`:
```
DATABASE_URL="postgresql://dev:dev@localhost:5432/pawjai_dev"
```

Useful commands:
```bash
docker compose up -d    # start
docker compose down     # stop
docker ps               # check running containers
```

### 2. Start services in order

1. Backend first. Nothing else works without it.
2. Web client. Depends on the backend.
3. Admin. Depends on the backend.
4. iOS. Depends on the web client being reachable.

Each repo's README has its own quickstart instructions.

## Stack

Bun · Fastify · Next.js · SwiftUI · PostgreSQL · Drizzle ORM · Supabase · Stripe
