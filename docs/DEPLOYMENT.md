# Deployment

How to deploy the three tiers of Digital Pigmee. The stack is intentionally
portable: the API is a standard Node process, the admin panel is a standard
Next.js app, and the customer app builds to an Android APK/AAB or a static web
bundle.

```
Customer app (APK / web)  ──►  API (Node/NestJS)  ──►  PostgreSQL (managed)
Admin panel (Next.js)     ──►        │                      ▲
                                     └── Razorpay ───────────┘ (webhook)
```

---

## 0. One command: Docker Compose (self-hosted)

The whole backend + admin stack (Postgres + API + Admin panel) runs from the repo
root with a single command. Good for on-prem, a company VM, or a quick full
demo — no external accounts or Razorpay keys required (payments stay in mock
mode, OTPs are echoed in the API response).

```bash
docker compose up --build           # builds images, starts db + api + admin
docker compose exec api node dist/db/seed.js   # one-time: create the superadmin
```

Then open:

- **Admin panel** — http://localhost:3000 (log in with the seeded superadmin,
  default `admin@pigmee.bank` / `Admin@12345`)
- **API docs (Swagger)** — http://localhost:4000/docs

The API auto-applies migrations on boot and connects to the bundled Postgres
(`DATABASE_URL` is wired for you). To run only Postgres and develop the apps on
the host instead, use `docker compose up -d db`.

**Configuration.** Every value defaults to a dev-safe setting so it runs with
zero config. To change ports, URLs, or (critically) secrets, copy
`.env.docker.example` to `.env` and edit it — `docker compose` picks it up
automatically. `NEXT_PUBLIC_API_BASE_URL` is baked into the admin bundle **at
build time**, so change it *before* `--build` (or rebuild after). For a real
public deployment, set strong secrets, `OTP_DEV_ECHO=false`, a real
`SMS_PROVIDER`, and live Razorpay keys — see the release checklist below.

> Docker builds fetch the Inter web font at build time (Next.js `next/font`), so
> the admin image build needs network access. The runtime containers do not.

The sections below cover deploying each tier **without** Docker (managed PaaS,
Vercel, Play Store), which is the recommended path for production.

---

## 1. API (`apps/api`)

A single Node service. Any host that runs Node ≥ 20 works (Railway, Render,
Fly.io, a VM, a container).

### Build & run

```bash
npm install
npm run build:api            # -> apps/api/dist
node apps/api/dist/main.js   # or: npm --workspace apps/api run start:prod
```

Migrations are applied automatically on boot (idempotent), so no separate
migrate step is required in the release command. To seed reference data once:
`npm run seed`.

### Database

Set `DATABASE_URL` to a managed Postgres connection string. When it is **unset**
the API falls back to embedded **PGlite** with a file store — fine for demos and
local dev, **not** for production (single-process, local file). Use a real
Postgres (Neon, Supabase, RDS, Railway PG, etc.) in staging/production.

```
DATABASE_URL=postgres://user:pass@host:5432/pigmee?sslmode=require
PGLITE_PATH=          # ignored when DATABASE_URL is set
```

### Required production environment

Copy `.env.example` and replace **every** dev-labelled secret:

| Variable                                        | Notes                                        |
| ----------------------------------------------- | -------------------------------------------- |
| `NODE_ENV=production`                            |                                              |
| `PORT`, `API_BASE_URL`                           | Public URL of the API                        |
| `DATABASE_URL`                                   | Managed Postgres (TLS)                       |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`        | **Long random values** — rotate on leak      |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`              | Defaults 15m / 14d                           |
| `OTP_TTL`, `OTP_MAX_PER_HOUR`, `OTP_DEV_ECHO=false` | **Disable dev echo in prod**              |
| `SMS_PROVIDER`                                   | Wire a real provider (only `console` shipped)|
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`         | Live keys                                    |
| `RAZORPAY_WEBHOOK_SECRET`                        | Must match the Razorpay dashboard webhook    |
| `PAYMENTS_MODE=live`                             | Auto-forced to `mock` if keys are absent     |
| `CORS_ORIGINS`                                   | Admin + app origins, comma-separated         |
| `THROTTLE_TTL`, `THROTTLE_LIMIT`                 | Rate limiting                                |
| `SEED_SUPERADMIN_EMAIL/PASSWORD`                 | Change before first seed                     |

### Razorpay webhook

Point the Razorpay dashboard webhook at `POST /api/payments/webhook` and set
`RAZORPAY_WEBHOOK_SECRET` to the same value. The API reads the **raw request
body** (enabled in `main.ts`) to verify the HMAC signature, and payment credits
are **idempotent** on the order id.

### Example: Railway / Render

- Build command: `npm install && npm run build:api`
- Start command: `node apps/api/dist/main.js`
- Add a managed Postgres plugin and set `DATABASE_URL` from it.
- Set the environment variables above. Health/docs: `GET /docs`.

---

## 2. Admin panel (`apps/admin`)

Standard Next.js 14 app — deploy to Vercel, or self-host with `next start`.

```bash
npm install
npm run build:admin
npm --workspace apps/admin run start   # or deploy to Vercel
```

Set **`NEXT_PUBLIC_API_BASE_URL`** to the public API URL (including the `/api`
suffix), e.g. `https://api.pigmee.bank/api`. Add the admin's own origin to the
API's `CORS_ORIGINS`.

---

## 3. Customer app (`apps/customer`)

### Android (APK / Play Store)

Requires the Android SDK + JDK 17 (see `apps/customer/README.md`).

```bash
cd apps/customer
flutter build apk --release \
  --dart-define=API_BASE_URL=https://api.pigmee.bank/api
#   -> build/app/outputs/flutter-apk/app-release.apk

flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://api.pigmee.bank/api
#   -> build/app/outputs/bundle/release/app-release.aab  (upload to Play Console)
```

**Signing (required before publishing).** The release build is currently signed
with the debug keystore. Create an upload keystore and wire a real signing config:

```bash
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA \
  -keysize 2048 -validity 10000 -alias upload
```

Add `android/key.properties` (keep it out of version control) and reference it
from `android/app/build.gradle.kts`'s `signingConfigs`, then point the `release`
build type at it.

### Web

```bash
flutter build web --release \
  --dart-define=API_BASE_URL=https://api.pigmee.bank/api
#   -> build/web   (serve as static files behind any CDN/host)
```

Add the web origin to the API's `CORS_ORIGINS`.

---

## Release checklist

- [ ] `DATABASE_URL` points at managed Postgres (not PGlite).
- [ ] All JWT / webhook / admin secrets replaced with strong random values.
- [ ] `OTP_DEV_ECHO=false` and a real `SMS_PROVIDER` configured.
- [ ] `PAYMENTS_MODE=live` with live Razorpay keys + webhook secret set.
- [ ] `CORS_ORIGINS` lists exactly the admin + app origins.
- [ ] Customer app built with the production `API_BASE_URL` and a real signing key.
- [ ] Seed superadmin password changed; extra admins created with least-privilege roles.
- [ ] Backups configured on the Postgres instance.

See `docs/SECURITY.md` for the security model these settings enforce.
