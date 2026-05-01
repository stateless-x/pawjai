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
| [pawjai-android](https://github.com/stateless-x/pawjai-android) | Android app. Native shell that wraps the web client. | n/a |

## How the system fits together

```
iOS / Android  ──WebView──▶  Web Client  ──API──▶  Backend  ──▶  PostgreSQL
                                                            ──▶  Supabase (auth)
                                                            ──▶  Stripe (payments)
```

The backend is the single source of truth. Web and mobile both depend on it. The mobile apps are not standalone, they wrap the web client through a WebView bridge.

---

## Running locally (the easy way)

A single script `pawjai.sh` orchestrates everything via Docker (OrbStack on macOS). All local dev points at the **staging Railway database** and **staging Supabase project**, so you never touch prod data while developing.

### Prerequisites

- [OrbStack](https://orbstack.dev) (recommended on macOS) or Docker Desktop
- All submodules cloned: `git submodule update --init --recursive`

### One-time setup

```bash
./pawjai.sh setup
```

This copies `.env.dev.example` to `.env.dev` in each of `pawjai-be`, `pawjai-fe`, `pawjai-admin`. The templates already include staging Supabase keys and Stripe **test** keys. Open each file and fill in any extras you need (Bunny, Mixpanel, etc.).

### Daily use

```bash
./pawjai.sh dev      # web app + backend     => :3000 / :4000
./pawjai.sh admin    # admin app + backend   => :3001 / :4000
./pawjai.sh stop     # stop everything
./pawjai.sh logs     # tail all logs
./pawjai.sh logs pawjai-be   # tail one service
./pawjai.sh status   # what's running
./pawjai.sh restart  # bounce containers
./pawjai.sh rebuild dev      # nuke caches and rebuild images
./pawjai.sh help     # show all commands
```

`Ctrl-C` from `dev` or `admin` stops the containers cleanly. Source code on the host is bind-mounted into the containers, so editing files triggers hot reload (HMR for Next.js, `bun --watch` for the backend).

### What it actually runs

- `docker-compose.yml` defines three services with two profiles (`dev`, `admin`).
- `pawjai-be` runs in **both** profiles, it's the shared backend.
- `pawjai-fe` runs only in profile `dev`; `pawjai-admin` only in `admin`.
- Each service has a `Dockerfile.dev` (Bun-based, dev-mode only) in its own repo.
- `node_modules` and `.next` live in named volumes, not on the host. Keeps macOS file-watching fast.

### What you can still do without the script

Each submodule still has its own `README.md` and runs standalone with `bun install && bun run dev`. The script doesn't replace that, it just removes the "open three terminals and start things in the right order" tax.

---

## Running locally (the manual way)

If you'd rather run services on the host without Docker, follow each repo's quickstart in order:

1. **Backend first.** Nothing else works without it.
2. **Web client.** Depends on the backend.
3. **Admin.** Depends on the backend.
4. **iOS / Android.** Depends on the web client being reachable.

You'll need a Postgres available locally too. The shared OrbStack config at `~/dev/docker-compose.yml` provides one on `localhost:5432`:

```bash
cd ~/dev && docker compose up -d
```

Then point `pawjai-be/.env.local` at it (`postgresql://dev:dev@localhost:5432/pawjai_dev`) or at your Railway staging DB.

---

## Stack

Bun · Fastify · Next.js · SwiftUI · Kotlin · PostgreSQL · Drizzle ORM · Supabase · Stripe

## Deployment

Backend goes to Railway. Web client and admin go to Vercel. iOS goes to TestFlight / App Store. Android goes to Play Console.

Each service's repo owns its deploy config. Local dev (this script) is intentionally decoupled from how things ship to prod.
