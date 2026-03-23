# Pawjai — Monorepo Navigator

Pet wellness SaaS platform. This repo is the **parent navigator** — each sub-repo has its own history, CI/CD, and remote. Developers work directly on their own repo; this parent is for overview and cross-repo navigation.

## Repositories

| Repo | Purpose | Stack |
|---|---|---|
| [pawjai-be](https://github.com/stateless-x/pawjai-be) | Backend API | Node.js |
| [pawjai-client](https://github.com/stateless-x/pawjai-client) | Web client | Next.js |
| [pawjai-admin](https://github.com/stateless-x/pawjai-admin) | Admin dashboard | Next.js |
| [PawjaiMobile](https://github.com/stateless-x/PawjaiMobile) | Mobile app | React Native |

---

## Quick Start

**Clone everything at once:**
```bash
git clone --recurse-submodules https://github.com/stateless-x/pawjai.git
cd pawjai
```

**If you already cloned without `--recurse-submodules`:**
```bash
git submodule update --init --recursive
```

**Update all submodules to latest:**
```bash
git submodule update --remote --rebase
```

---

## For Individual Developers

You don't need this parent repo to work. Clone only what you need:

```bash
# Backend dev
git clone git@github.com:stateless-x/pawjai-be.git

# Frontend dev
git clone https://github.com/stateless-x/pawjai-client.git

# Mobile dev
git clone https://github.com/stateless-x/PawjaiMobile.git
```

Push/PR/CI workflow stays exactly the same — parent repo is invisible to your day-to-day work.

---

## Keeping Parent in Sync

After a child repo merges to main, update the parent pointer:

```bash
git submodule update --remote pawjai-be   # or whichever changed
git add pawjai-be
git commit -m "chore: update pawjai-be to latest"
git push
```

---

## Structure

```
pawjai/               ← this repo (navigator only)
├── pawjai-be/        ← submodule → github.com/stateless-x/pawjai-be
├── pawjai-client/    ← submodule → github.com/stateless-x/pawjai-client
├── pawjai-admin/     ← submodule → github.com/stateless-x/pawjai-admin
├── PawjaiMobile/     ← submodule → github.com/stateless-x/PawjaiMobile
└── README.md
```
