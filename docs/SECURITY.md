# Security model

This document lists the security requirements for Digital Pigmee and where each
is enforced. The recurring theme: **money integrity is enforced in the service
layer, never merely in the UI**, and **the server is the only authority** on
balances and payments.

---

## 1. Balances are derived, never editable

`pigmy_accounts.current_balance` is never directly writable. Every balance change
is an append-only `ledger_entries` row created by `LedgerService`; the balance is
computed from the ledger.

- **Where:** `apps/api/src/modules/ledger` (service layer). No controller, admin
  action, or SQL path overwrites a balance directly.
- **Money type:** integer **paise** everywhere (`src/common/money.ts`), transported
  as `{ paise, rupees, display }`. Clients render `display` and never re-derive
  currency — eliminating rounding/format drift as an attack/error surface.

## 2. Payments are verified server-side only

The client never decides a payment succeeded. Flow: `POST /payments/order` →
gateway checkout → `POST /payments/verify`, where the server re-checks the
Razorpay HMAC signature and only then writes the credit.

- Client-reported "success" is ignored as authoritative.
- In `mock` mode (no live keys) the same verification path runs against generated
  credentials, so the flow is fully testable without a real gateway.

## 3. Webhook signature verification + idempotency

`POST /api/payments/webhook` verifies the Razorpay signature over the **raw
request body** (`rawBody: true` in `main.ts`) using `RAZORPAY_WEBHOOK_SECRET`.
Credits are **idempotent on the order id**, so a replayed or duplicated webhook
never double-credits an account.

## 4. OTP rate limiting

OTP requests are limited per mobile number (`OTP_MAX_PER_HOUR`, default 5) with a
short TTL (`OTP_TTL`, default 5m). A global rate limiter (`@nestjs/throttler`,
`THROTTLE_TTL`/`THROTTLE_LIMIT`) protects all routes per IP. In production,
`OTP_DEV_ECHO` must be `false` so codes are never returned in API responses.

## 5. RBAC on admin routes

Bank-staff endpoints require a valid admin JWT and are gated by **role** guards
(`src/common/guards`, `src/common/auth`, `src/common/decorators`). Customer JWTs
cannot reach admin routes, and staff see only actions their role permits.

## 6. Village isolation on admin queries

Admin queries are scoped to the villages a staff member is assigned to
(`src/common/village-scope.ts`), so one branch's staff cannot read or mutate
another village's customers, accounts, or collections. Superadmins are the
explicit exception.

## 7. Audit row on every balance-affecting / privileged action

The `audit` module writes an immutable audit entry for every balance-affecting or
privileged operation (who, what, when, before/after). The append-only ledger plus
the audit log together give a tamper-evident trail. Audit logs are surfaced
read-only in the admin panel (`/audit-logs`).

## 8. Sensitive data handling

- **Bank account numbers are never logged or exposed in full.** Only the IFSC and
  the **last 4 digits** are retained/displayed; the customer app masks with
  `••••` + last4 (`Formatters.maskAccount`).
- **Passwords** are hashed with bcrypt (`bcryptjs`); OTPs are short-lived and
  single-use.
- **Tokens** on the client live in `flutter_secure_storage` (Keystore-backed on
  Android), not shared preferences.

## 9. Transport & input hardening

- **Helmet** security headers; **CORS** restricted to configured origins
  (`CORS_ORIGINS`).
- **Global `ValidationPipe`** with `whitelist` + `forbidNonWhitelisted` +
  `transform`: unknown properties are stripped/rejected and payloads are coerced
  to typed DTOs, closing over-posting and injection-shaped inputs.
- Short-lived **access tokens** (15m) with rotating **refresh tokens** (14d);
  logout revokes the refresh token server-side; an unrecoverable `401` clears the
  client session.

## 10. Secrets are dev-only by default

Every secret in `.env.example` is labelled a dev default and must be replaced for
production (see the release checklist in `docs/DEPLOYMENT.md`). Payments are
auto-forced to `mock` whenever live Razorpay keys are absent, so a misconfigured
deploy fails safe rather than pretending to charge real money.

---

### Summary table

| Requirement                              | Enforced in                                   |
| ---------------------------------------- | --------------------------------------------- |
| Balances derived / not editable          | `modules/ledger` (service layer)              |
| Payment verified server-side             | `modules/payments` verify flow                |
| Webhook signature + idempotency          | `payments` webhook (raw body HMAC, order id)  |
| OTP rate limiting                        | `auth` + `@nestjs/throttler`                  |
| RBAC on admin routes                     | `common/guards`, `common/auth`                |
| Village isolation                        | `common/village-scope.ts`                     |
| Audit row on balance-affecting actions   | `modules/audit`                               |
| Never log full bank account number       | mask to IFSC + last4 (API + app)              |
| Dev-only default secrets                 | `.env.example` + fail-safe `mock` payments    |
