# Pawjai 🐾

Pet wellness SaaS platform. This is the **monorepo navigator** — each service has its own repo, history, and CI/CD pipeline. Use this parent for overview, cross-service setup, and onboarding.

---

## Architecture

```
pawjai/
├── pawjai-be/        Backend API          → port 4000
├── pawjai-client/    Web app (user-facing) → port 3000
├── pawjai-admin/     Admin dashboard       → port 3001
└── PawjaiMobile/     iOS native app        → wraps pawjai-client via WKWebView
```

**Infrastructure:** Supabase (auth + DB) · PostgreSQL · Stripe (payments) · Polygon (on-chain)

---

## Services

### [pawjai-be](https://github.com/stateless-x/pawjai-be) — Backend API
REST API for pet management, health records, AI chat, subscriptions, and push notifications.

**Stack:** Bun · Fastify 5 · PostgreSQL · Drizzle ORM · Zod · TypeScript

```bash
cd pawjai-be
bun install
cp env.example .env   # fill DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
bun run db:migrate
bun run dev           # → http://localhost:4000
```

---

### [pawjai-client](https://github.com/stateless-x/pawjai-client) — Web App
User-facing web client. Auth, onboarding, pet management, and dashboard.

**Stack:** Next.js 16 · React 19 · TypeScript · TanStack Query · Zustand · Tailwind · Supabase SSR · Stripe

```bash
cd pawjai-client
bun install
cp .env.example .env.local   # fill NEXT_PUBLIC_API_URL=http://localhost:4000
bun run dev                  # → http://localhost:3000
```

> ⚠️ `pawjai-be` must be running first.

---

### [pawjai-admin](https://github.com/stateless-x/pawjai-admin) — Admin Dashboard
Business ops: user management, subscriptions, analytics, breeds, blog, audit trail.

**Stack:** Next.js 16 · React 19 · TypeScript · TanStack Query · Zustand · Tailwind · Tiptap · Recharts

```bash
cd pawjai-admin
bun install
# .env.local → NEXT_PUBLIC_API_URL=http://localhost:4000
bun run dev   # → http://localhost:3001
```

> Login: `admin@pawjai.co` — see `pawjai-be/ADMIN_CREDENTIALS.md` for password.

---

### [PawjaiMobile](https://github.com/stateless-x/PawjaiMobile) — iOS App
Native iOS shell that wraps `pawjai-client` in a WKWebView. Handles auth via native Keychain + handoff bridge.

**Stack:** Swift · SwiftUI · WKWebView · Supabase Swift SDK

```bash
open PawjaiMobile/PawjaiMobile.xcodeproj
# Build & run on simulator or device
```

> ⚠️ `pawjai-client` must be deployed (or running locally) for the WebView to work.  
> Auth bridge rules are documented in `PawjaiMobile/CLAUDE.md` — read before touching auth flow.

---

## Full Local Setup (run everything)

```bash
# 1. Clone with all submodules
git clone --recurse-submodules https://github.com/stateless-x/pawjai.git
cd pawjai

# 2. Start backend
cd pawjai-be && bun install && bun run db:migrate && bun run dev &

# 3. Start web client
cd ../pawjai-client && bun install && bun run dev &

# 4. Start admin
cd ../pawjai-admin && bun install && bun run dev &

# 5. iOS → open Xcode
open ../PawjaiMobile/PawjaiMobile.xcodeproj
```

Ports: BE `4000` · Client `3000` · Admin `3001`

---

## For Individual Developers

You don't need this parent repo. Clone only what you need:

```bash
# Backend
git clone git@github.com:stateless-x/pawjai-be.git

# Web frontend
git clone https://github.com/stateless-x/pawjai-client.git

# Admin
git clone git@github.com:stateless-x/pawjai-admin.git

# Mobile
git clone https://github.com/stateless-x/PawjaiMobile.git
```

Your push/PR/CI workflow stays exactly the same. This parent repo is invisible to daily work.

---

## Keeping Parent in Sync

After a child repo merges to `main`, update the pointer here:

```bash
git submodule update --remote pawjai-be   # replace with changed repo
git add pawjai-be
git commit -m "chore: update pawjai-be to latest"
git push
```

Or update all at once:
```bash
git submodule update --remote --rebase
git add .
git commit -m "chore: sync all submodules to latest"
git push
```
