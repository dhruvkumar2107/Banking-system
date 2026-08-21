# Digital Pigmee — API

NestJS REST API for the Digital Pigmee daily micro-savings platform. It owns the
data model, the **append-only ledger** (the heart of the system), authentication
for both customers and bank staff, payment verification, receipts, notifications
and reports.

- **Global prefix:** `/api`
- **OpenAPI / Swagger:** `http://localhost:4000/docs` (source of truth for every
  endpoint, request/response shape and auth requirement)
- **Stack:** NestJS 10 · Drizzle ORM · PostgreSQL (or embedded **PGlite**) · JWT ·
  Razorpay · PDFKit

## Quick start (zero external services)

```bash
# from the repo root
npm install
cp .env.example apps/api/.env
npm run seed        # builds, then seeds villages, customers, admin (idempotent)
npm run dev:api     # http://localhost:4000  — Swagger at /docs
```

By default `DATABASE_URL` is empty, so the API runs on **PGlite** — a full
Postgres compiled to WebAssembly, in-process, with a file store at
`apps/api/.data/pigmee`. Set `DATABASE_URL` to point at a real Postgres for
staging/production. Migrations are applied automatically on boot (idempotent).

Seeded superadmin: `admin@pigmee.bank` / `Admin@12345` (override via `.env`).

## Scripts

| Script                 | What it does                                             |
| ---------------------- | -------------------------------------------------------- |
| `npm run dev:api`      | Watch-mode dev server (`nest start --watch`)             |
| `npm run build:api`    | `nest build` → `dist/`                                   |
| `npm run migrate`      | Apply migrations via `tsx src/db/migrate.ts`             |
| `npm run seed`         | `nest build && node dist/db/seed.js` (sample data)       |
| `npm run test:api`     | Jest unit tests (incl. the ledger engine)                |
| `npm run test:e2e`     | End-to-end tests incl. the payment flow (`--runInBand`)  |

> **Why `seed` builds first:** `tsx` cannot bootstrap Nest's dependency-injection
> container, so seeding runs against compiled JS (`dist/db/seed.js`). `migrate`
> is a standalone script and runs fine under `tsx`.

## Modules (`src/modules`)

| Module          | Responsibility                                                        |
| --------------- | --------------------------------------------------------------------- |
| `auth`          | Customer mobile-OTP + JWT (access/refresh); admin email/password login|
| `me`            | Customer self-service: dashboard, profile, accounts, ledger, nominees, KYC docs, bank details |
| `customers`     | Admin customer management + KYC review                                |
| `villages`      | Village master data (admin CRUD; public list for registration)        |
| `admins`        | Bank staff accounts + RBAC roles                                      |
| `pigmy`         | Pigmy account lifecycle (open/activate/close)                         |
| `ledger`        | **The ledger engine** — append-only entries; balances are *derived*   |
| `payments`      | Razorpay order creation, **server-side verification**, webhook, receipts (PDF) |
| `notifications` | Customer inbox + broadcasts; mark-read                                |
| `reports`       | Date-wise and village-wise collection reports                         |
| `audit`         | Immutable audit log of every balance-affecting / privileged action    |

### Customer-facing endpoints (consumed by the Flutter app)

```
POST /api/auth/otp/request        POST /api/auth/otp/verify
POST /api/auth/register           POST /api/auth/refresh        POST /api/auth/logout
GET  /api/me/dashboard            GET/PATCH /api/me/profile
GET  /api/me/accounts             GET  /api/me/accounts/:id/ledger
GET/POST /api/me/nominees         DELETE /api/me/nominees/:id
GET/POST /api/me/documents        GET/PUT /api/me/bank-details
POST /api/payments/order          POST /api/payments/verify
GET  /api/payments/transactions   GET  /api/payments/transactions/:id
GET  /api/payments/transactions/:id/receipt   (PDF bytes)
GET  /api/villages
```

Admin endpoints (customers, pigmy accounts, collections, reports, audit,
notifications, villages) are grouped under the same prefix and documented in
Swagger. See `docs/SECURITY.md` for the RBAC + village-isolation model.

## The golden rule (ledger design)

> `pigmy_accounts.current_balance` is **never** directly writable.

Every balance change is a `ledger_entries` row written by `LedgerService`;
the balance is derived from the ledger. This is enforced in the service layer,
not just the UI, and gives a complete, tamper-evident audit trail. Money is
stored and transported as integer **paise**; the API returns
`{ paise, rupees, display }` (see `src/common/money.ts`).

## Database

- Schema: `src/db/schema.ts` (Drizzle). Migrations in `src/db/migrations`.
- `src/db/client.ts` selects Postgres vs PGlite from `DATABASE_URL`.
- **PGlite is single-connection**: never issue a query on the base handle inside
  an open transaction — it deadlocks. Service methods therefore accept an optional
  executor and callers inside a transaction pass the `tx` handle.

## Configuration

All settings come from `apps/api/.env` (see `.env.example` for annotated dev
defaults): JWT secrets/TTLs, OTP TTL + rate limit + dev echo, Razorpay keys +
`PAYMENTS_MODE` (auto-forced to `mock` when keys are absent), CORS origins,
throttle limits, and the seed admin credentials. **All default secrets are
labelled dev-only and must be replaced in production.**
