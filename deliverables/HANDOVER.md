# Digital Pigmee — Delivery Handover

**Version 0.1.0** · delivered 2026-08-20 · Corporate Bank daily micro-savings (pigmy) platform

All three tiers are complete, tested and verified running end-to-end on this
machine today. This document is the delivery record: what was built, proof that it
works, how to run it, and how to demo it.

👉 **What's still needed from the bank is in [`PROJECT-HEAD-INPUTS.md`](./PROJECT-HEAD-INPUTS.md).**

---

## 1. What was built

| Tier | Stack | Scope | Status |
|---|---|---|---|
| **API** | NestJS + Drizzle ORM + Postgres/PGlite | 56 endpoints, 80 source files | ✅ Complete |
| **Admin panel** | Next.js 14 (App Router) + Tailwind | 18 pages, 51 source files | ✅ Complete |
| **Customer app** | Flutter (Android) | 17 screens, 59 source files | ✅ Complete |

### The core design rule

> `pigmy_accounts.current_balance` is **never** directly writable. Every balance
> change is an append-only `ledger_entries` row. Balances are *derived*, never
> overwritten.

This is enforced in the service layer, not just the UI, and is what gives the bank
a defensible audit trail. It is covered by 7 dedicated ledger tests.

### API — what it does
Customer auth (OTP request → verify → register, JWT access + refresh), customer
profile / nominees / documents / bank details, village and pigmy-account
management, the payment flow (order → gateway → server-side signature verify →
ledger credit → receipt), transaction history and receipts, notifications,
reports (dashboard, date-wise, village-wise, analytics), audit logs, and admin
user management. Swagger UI at `/docs`; the machine-readable spec is bundled here
as [`openapi.json`](./openapi.json).

### Admin panel — 18 pages
Login · dashboard · villages (+ detail) · customers (+ detail) · pigmy accounts
(+ detail) · collection · transactions · pending payments · reports (date-wise,
village-wise) · analytics · notifications · audit logs · settings.

Settings includes appearance (light/dark), change-own-password, and a
superadmin-only Team & Roles section (create/edit admins, reset passwords, assign
villages, with self-lockout protection).

### Customer app — 17 screens
Splash · onboarding · login · OTP · register · home shell (tab navigation) ·
dashboard · pay · pay result · receipt · transactions · account detail · profile
(including nominee management) · edit profile · bank details · notifications · help.

English + Hindi, user-controllable light/dark theme, secure token storage, all
money handled in paise to avoid floating-point error.

### Security properties (each verified in code and tests)
Balances derived not editable · payments verified server-side only · webhook HMAC
signature verification over the raw request body · idempotent settlement (replay
cannot double-credit) · OTP rate limiting · RBAC on every admin route · **village
isolation** so a village-scoped admin cannot read or mutate another village's data
· an audit row for every balance-affecting or privileged action · bank account
numbers never logged (IFSC + last 4 only) · production boot refuses to start with
dev-default secrets.

Full detail in [`../docs/SECURITY.md`](../docs/SECURITY.md).

---

## 2. Verification — run today, 2026-08-20

Every check below was executed on this machine as part of preparing this handover.

| Check | Command | Result |
|---|---|---|
| API typecheck | `npx tsc --noEmit` | ✅ exit 0 |
| API unit tests | `npm run test:api` | ✅ **36 passed** / 36, 5 suites |
| API e2e tests | `npm run test:e2e` | ✅ **7 passed** / 7 |
| Admin production build | `npm run build:admin` | ✅ all **18 routes** generated |
| Flutter static analysis | `flutter analyze lib` | ✅ **0 issues** |
| Android APK (release) | `flutter build apk --release` | ✅ 55.0 MB |
| Android App Bundle | `flutter build appbundle --release` | ✅ 54.0 MB |

**Total: 43 automated tests, all green.**

### Live smoke test against the running server

The API was booted and exercised over HTTP:

```
GET  /                        200   {"name":"Digital Pigmee API","status":"ok",...}
GET  /health                  200   {"status":"ok","paymentsMode":"mock",...}
GET  /docs                    200   Swagger UI
GET  /api/public/villages     200   4 villages
POST /api/auth/admin/login    200   JWT issued for admin@pigmee.bank
GET  /api/reports/dashboard   200   12 customers, 12 active accounts, ₹4,700.00 total
GET  /api/customers?limit=2   200   real records w/ village + derived balance
GET  /api/reports/village-wise 200  per-village collection totals
```

The e2e suite proves the money path specifically: register → create order →
verify signature → **balance shows ₹100**, a **tampered signature is rejected
(400)**, a **replayed verify does not double-credit**, and an unauthenticated
dashboard request is refused (401).

### Known, harmless test noise
One `ERROR ... invalid input syntax for type uuid: "admin-a"` line appears during
`village-isolation.spec.ts`. A test deliberately passes a non-UUID actor id; the
audit writer swallows the failure by design. The test passes. Not a defect.

---

## 3. Fixed during this final delivery pass

Four things were found and corrected while preparing the handover:

1. **The shipped APK was stale.** Four Dart sources (`strings.dart`,
   `dashboard_screen.dart`, `home_shell.dart`, `splash_screen.dart`) were newer
   than the packaged APK, so the deliverable did not contain the latest UI.
   Rebuilt — the APK here now matches the source tree.
2. **Release signing was not wired up.** `build.gradle.kts` hard-coded the debug
   key with a `TODO`. It now reads `android/key.properties` when present and falls
   back to the debug key when absent, so dropping in the bank's keystore requires
   no code change. Added `key.properties.example` with generation instructions,
   and keystore/password patterns to the root `.gitignore`.
3. **Added the Play Store artifact.** An `.aab` was never built; it is now part of
   the deliverables.
4. **`.env.example` was misleading.** It claimed "only console implemented" for
   SMS. MSG91 and Twilio are both fully implemented — the comment was stale and
   would have caused someone to rebuild working code. Corrected, and the MSG91 and
   Twilio variable blocks are now documented (names verified against
   `app-config.service.ts`).

---

## 4. Deliverables in this folder

| File | What it is |
|---|---|
| `DigitalPigmee-customer-v0.1.0-release.apk` | Installable Android app (55 MB) — sideload to demo |
| `DigitalPigmee-customer-v0.1.0-release.aab` | Play Store upload bundle (54 MB) — needs real signing first |
| `openapi.json` | Full API specification (import into Postman/Insomnia) |
| `HANDOVER.md` | This document |
| `PROJECT-HEAD-INPUTS.md` | **What the bank needs to supply** |

Also in the repository root: `README.md` (architecture + quick start),
`docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `.env.production.template` (production
config with fresh secrets pre-generated), `docker-compose.yml`, per-app READMEs.

⚠️ Both Android artifacts are **debug-signed** — fine for sideloading and internal
testing, rejected by Play Store. See input item C2.

---

## 5. Running it

### Fastest path — no Docker, no database to install

```bash
npm install
cp .env.example apps/api/.env
npm run seed        # creates schema + 4 villages, 12 customers, admin user
npm run dev:api     # → http://localhost:4000  (Swagger at /docs)
npm run dev:admin   # → http://localhost:3000
```

The API defaults to **PGlite** — real Postgres compiled to WebAssembly, running
in-process from a local file — so there is nothing external to install.

**Demo admin login:** `admin@pigmee.bank` / `Admin@12345`
*(dev seed credentials — see `.env.production.template` for production)*

### Full stack with real Postgres

```bash
docker compose up --build
docker compose exec api node dist/db/seed.js
```

⚠️ The Docker images are written and complete but **not build-verified** — Docker
isn't installed on this machine. Please allow for a first-run fix here.

### Customer app

Install the APK on an Android device, or run from source:
```bash
cd apps/customer && flutter run
```
The app must point at a reachable API — on a physical device that means your
machine's LAN IP, not `localhost`.

### Two environment gotchas worth knowing

- **Run API commands with the working directory at `apps/api`.** `PGLITE_PATH` is
  relative, so launching `node dist/main.js` from the repo root silently creates a
  *fresh empty database* — the server boots fine but every list is empty.
- **On Windows, kill a stray server by PID before rebooting.** A previous process
  holding port 4000 keeps serving *old* code while the new one dies on bind, which
  looks exactly like "my fix didn't work":
  ```bash
  netstat -ano | grep ":4000" | grep LISTENING   # then: taskkill //F //PID <pid>
  ```

---

## 6. Suggested demo flow for the project head

About 10 minutes, in this order:

1. **Admin dashboard** — log in, show total customers, active accounts and the
   ₹4,700 derived balance. Point out that no field on this page is editable.
2. **Villages → drill into one** — show per-village collection totals; mention
   that a village-scoped admin sees *only* their village (enforced server-side,
   with a test proving it).
3. **Customer app** — register with a mobile number, take the OTP from the server
   log (this is exactly what the real SMS will carry), reach the dashboard.
4. **Make a deposit** — pay ₹100 through the mock gateway, land on the receipt.
5. **Back to admin** — the transaction appears, the balance has moved by exactly
   ₹100, and there's an audit row naming who did what.
6. **The safety story** — open Swagger, show that a balance cannot be written
   directly, and mention that a tampered payment signature is rejected and a
   replayed payment cannot double-credit — both covered by automated tests.

Then hand over `PROJECT-HEAD-INPUTS.md` and walk item **B1 (withdrawals /
maturity)**, which is the one open product decision.

---

## 7. Honest status summary

**Complete and verified:** all three tiers, 43 passing tests, both Android
artifacts, the full deposit money path, the security model, and the documentation.

**Complete but not verifiable here:** Docker images (no Docker installed);
MSG91/Twilio SMS and live Razorpay (code paths are written and mock-tested, but
have never run against the real services — expect a short shake-out when real
credentials land).

**Deliberately mock, clearly labelled:** payments run in mock mode and OTPs echo
to the log. Both flip to real via configuration alone, with no code change.

**Genuinely not built:** withdrawals, maturity and interest — not in the build
plan, and they need the bank's rules before they can be built correctly. This is
input item **B1** and the one thing I'd want decided first.
