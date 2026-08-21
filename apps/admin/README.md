# Digital Pigmee — Admin Panel

Corporate bank staff dashboard for the Digital Pigmee platform. Bank
administrators manage villages, customers and KYC, monitor collections and
pending payments, browse the transaction ledger, run reports, send broadcasts,
and review the audit log — all scoped by role and village.

- **Stack:** Next.js 14 (App Router) · React 18 · TanStack Query · Tailwind CSS ·
  Recharts · lucide-react
- **Talks to:** the API at `NEXT_PUBLIC_API_BASE_URL` (default
  `http://localhost:4000/api`)

## Quick start

```bash
# from the repo root (npm workspace)
npm install
npm run dev:admin        # http://localhost:3000
```

Make sure the API is running and seeded first (`npm run seed && npm run dev:api`).
Sign in at `/login` with the seeded superadmin: `admin@pigmee.bank` / `Admin@12345`.

Set the API base URL via an env var when it isn't the default:

```bash
# apps/admin/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
```

## Scripts

| Script                | What it does                    |
| --------------------- | ------------------------------- |
| `npm run dev:admin`   | Next dev server on port 3000    |
| `npm run build:admin` | Production build (`next build`) |
| `start` (in app dir)  | Serve the production build      |
| `lint` / `typecheck`  | ESLint / `tsc --noEmit`         |

## Pages (`src/app`)

Everything sits behind an authenticated `(dashboard)` route group with a shared
sidebar layout; `/login` is the only public route.

| Route                          | Purpose                                             |
| ------------------------------ | --------------------------------------------------- |
| `/dashboard`                   | KPIs: today's collection, active customers, balances|
| `/villages`, `/villages/[id]`  | Village master data + drill-down                    |
| `/customers`, `/customers/[id]`| Customer directory, profile, KYC review             |
| `/pigmy-accounts`, `/[id]`     | Pigmy accounts + per-account passbook               |
| `/collection`                  | Daily collection view                               |
| `/transactions`                | Global transaction ledger                           |
| `/pending-payments`            | Payments awaiting reconciliation                    |
| `/reports/date-wise`           | Collections by date                                 |
| `/reports/village-wise`        | Collections by village                              |
| `/analytics`                   | Charts (Recharts) over collections & growth         |
| `/notifications`               | Compose broadcasts / customer notifications         |
| `/audit-logs`                  | Immutable audit trail of privileged actions         |

## Structure

```
src/
├── app/          App Router routes (see table above)
│   ├── (dashboard)/  authenticated group + layout.tsx (sidebar)
│   └── login/        public sign-in
├── components/   shared UI (tables, cards, charts, forms)
└── lib/          API client, auth/session, query hooks, formatters
```

## Conventions

- **Money is displayed from the server.** The API returns `{ paise, rupees,
  display }`; the panel renders `display` and never re-derives currency.
- **Read-mostly + guarded writes.** Balances are never edited directly; staff
  actions that affect balances go through API endpoints that write ledger + audit
  rows. The UI exposes only what the caller's **role** and **village scope** allow
  — enforcement lives in the API (see `docs/SECURITY.md`).
- **Server state via TanStack Query** with the bearer token attached by the
  `lib` API client; a `401` clears the session and returns to `/login`.
