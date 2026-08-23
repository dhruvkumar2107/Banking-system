# Digital Pigmee

**Corporate Bank — Daily Micro-Savings (Pigmy) platform.**

A three-tier system that lets a corporate bank run a daily micro-savings ("pigmy")
programme: field customers deposit small amounts daily through a mobile app, and the
bank's staff manage villages, customers, KYC, collections and reports through an admin
panel. Every rupee is tracked through an **append-only ledger** — balances are *derived*,
never directly editable.

```
                     CORPORATE BANK
                           │
              ┌────────────┴────────────┐
        CUSTOMER APP              ADMIN PANEL
        (Flutter, Android)         (Next.js/React)
              │                         │
              └────────────┬────────────┘
                      API SERVER
                    (Node.js / NestJS)
                           │
              ┌────────────┴────────────┐
         PostgreSQL              Payment Gateway
          Database                (Razorpay)
              └────────────┬────────────┘
                   Transaction Ledger
```

## Repository layout (monorepo)

| Path            | Tier            | Stack                         |
| --------------- | --------------- | ----------------------------- |
| `apps/api`      | Backend API     | NestJS + Drizzle ORM + Postgres |
| `apps/admin`    | Admin panel     | Next.js (App Router) + React  |
| `apps/customer` | Customer app    | Flutter (Android first)       |

`apps/api` and `apps/admin` are npm workspaces. `apps/customer` is a standalone Flutter
project (uses `pub`, built with the Flutter SDK).

## The golden rule

> `pigmy_accounts.current_balance` is **never** directly writable. Every balance change
> happens through a `ledger_entries` row created by the ledger service. No manual
> overwrite, ever — this is what gives you the audit trail.

This is enforced in the service layer (`LedgerService`), not just the UI. See
`apps/api/src/modules/ledger`.

## Quick start (API — fully runnable, no Docker required)

```bash
npm install                 # installs api + admin workspaces
cp .env.example apps/api/.env
npm run migrate             # applies schema (PGlite embedded Postgres by default)
npm run seed                # sample villages, customers, admin
npm run dev:api             # http://localhost:4000  (Swagger at /docs)
```

By default the API uses **PGlite** — a full Postgres compiled to WebAssembly that runs
in-process with a local file store — so it runs with zero external services. To use a
real Postgres, set `DATABASE_URL` in `apps/api/.env` (and optionally `docker compose up -d`).

Seeded superadmin: `admin@pigmee.bank` / `Admin@12345` (change in `.env`).

## Run the whole stack with Docker (one command)

Prefer containers? Postgres + API + Admin panel come up together — no Node, no
Razorpay keys, no external accounts required (payments run in mock mode, OTPs are
echoed by the API for the demo):

```bash
docker compose up --build                       # db + api + admin
docker compose exec api node dist/db/seed.js     # one-time: seed the superadmin
```

Admin panel → http://localhost:3000 · API docs → http://localhost:4000/docs.
Copy `.env.docker.example` to `.env` to change ports, URLs, or secrets. See
`docs/DEPLOYMENT.md` for the production hardening checklist.

## Build order (from the plan) & status

- [x] 1. Project structure (monorepo, CI skeleton)
- [x] 2. Database schema + migrations
- [x] 3. Auth (OTP, JWT, admin login, role guards)
- [x] 4. Village + Admin base system
- [x] 5. Customer registration + profile system
- [x] 6. Pigmy account + Ledger engine (unit-tested in isolation)
- [x] 7. Payment gateway integration (sandbox/mock first)
- [x] 8. Transaction ledger wired end-to-end
- [x] 9. Receipts + notifications
- [x] 10. Reports (date-wise, village-wise)
- [x] 11. Admin panel UI
- [x] 12. Customer app UI
- [x] 13. Security pass + audit-log completeness
- [x] 14. Testing (unit + e2e payment flow)
- [x] 15. Deployment targets

## Documentation

- **`deliverables/HANDOVER.md` — start here: delivery record, verification results, demo flow**
- **`deliverables/PROJECT-HEAD-INPUTS.md` — what the bank must supply to go live**
- `deliverables/handover-brief.html` — the same handover as a shareable one-page brief (open in a browser)
- `deliverables/openapi.json` — full API spec (import into Postman/Insomnia)
- `.env.production.template` — production config, secrets pre-generated, `<<< FILL >>>` markers for the rest
- `apps/api/README.md` — API modules, endpoints, ledger design, security model
- `apps/admin/README.md` — admin panel pages & configuration
- `apps/customer/README.md` — Flutter app screens & build
- **`docs/DEPLOY-FREE.md` — deploy all three tiers on free plans in ~20 minutes (Render + Neon + Vercel)**
- `docs/DEPLOYMENT.md` — full deployment reference (Docker Compose, or Railway/Render/Vercel + managed Postgres)
- `docs/SECURITY.md` — the security requirements and how each is met
