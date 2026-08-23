# Free deployment — the short path

Deploys all three tiers on free plans, no card required. Budget ~20 minutes,
most of it waiting for builds.

| Tier | Host | Free plan reality |
| --- | --- | --- |
| API (`apps/api`) | Render, Docker | Sleeps after ~15 min idle; first request then takes ~50 s |
| Database | Neon Postgres | Autosuspends when idle, wakes on connect; data persists |
| Admin panel (`apps/admin`) | Vercel | Always on |
| Customer app (`apps/customer`) | Vercel, Flutter web | Always on. The Android APK is in `deliverables/` |

There is one ordering loop: the API needs to know the Vercel origins for CORS,
and Vercel needs to know the API URL. Deploy the API first with CORS left blank,
then the two Vercel projects, then come back to step 5. Skipping step 5 is the
single most common cause of "the site loads but every request fails".

---

## 1. Database — Neon (2 min)

1. [neon.com](https://neon.com) → sign in with GitHub → **Create project**.
2. Copy the connection string. **Take the direct (non-pooled) one** — the label
   without `-pooler` in the host. Migrations run DDL on boot, which is unreliable
   over the pooled endpoint.
3. It must end in `?sslmode=require`. Add it if the copied string lacks it.

Keep it on the clipboard for step 2.

---

## 2. API — Render

A service already exists at `https://banking-system-zhtb.onrender.com`. **Update
it rather than creating a second one**, or you will have two services fighting
over the same database.

Render dashboard → the `pigmee-api` service → **Environment** → set every row
below, then **Save changes** (Render redeploys automatically).

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DEMO_MODE` | `true` |
| `DATABASE_URL` | the Neon direct URL from step 1 |
| `PAYMENTS_MODE` | `mock` |
| `SMS_PROVIDER` | `console` |
| `OTP_DEV_ECHO` | `false` |
| `OTP_MAX_PER_HOUR` | `50` |
| `DEMO_OTP` | `424242` |
| `DEMO_OTP_PHONES` | `91000000*` |
| `SEED_ON_BOOT` | `true` |
| `SEED_SUPERADMIN_EMAIL` | your email |
| `SEED_SUPERADMIN_PASSWORD` | a strong password you choose — **not** `Admin@12345` |
| `JWT_ACCESS_SECRET` | fresh random, see below |
| `JWT_REFRESH_SECRET` | fresh random |
| `RAZORPAY_WEBHOOK_SECRET` | fresh random |
| `CORS_ORIGINS` | leave blank for now — step 5 |

Generate the three secrets:

```bash
node -e "for(const k of ['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','RAZORPAY_WEBHOOK_SECRET'])console.log(k+'='+require('crypto').randomBytes(32).toString('base64url'))"
```

> **Why `NODE_ENV=production` and not `staging`.** Under `staging` the API accepts
> requests from *any* website (`main.ts` sets `origin: true`) and `OTP_DEV_ECHO`
> defaults to **on**, so a public URL hands out a working OTP for any phone
> number entered. `production` + `DEMO_MODE=true` keeps the strict CORS
> allow-list and OTP secrecy while still permitting the mock gateway and console
> SMS. It is the correct posture for a demo.

`SEED_ON_BOOT=true` creates the superadmin, 4 villages, 12 customers and their
deposits on first start — free plans give you no shell, so this is the only way
to seed. It is idempotent and runs *after* the port opens, so a slow seed cannot
fail the health check. Set it to `false` once the data exists.

Confirm before moving on:

```bash
curl https://banking-system-zhtb.onrender.com/health     # {"status":"ok","env":"production",...}
curl https://banking-system-zhtb.onrender.com/api/public/villages   # 4 villages, not []
```

An empty array means the seed did not run — check the Render logs for
`SEED_ON_BOOT`.

### Starting from scratch instead

`render.yaml` is a Blueprint with all of the above already filled in. Render →
**New → Blueprint** → pick this repo → **Apply**; it prompts only for
`DATABASE_URL`, `CORS_ORIGINS`, and the two `SEED_SUPERADMIN_*` values, and
generates the JWT secrets itself.

---

## 3. Admin panel — Vercel

1. [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project**
   → import `Banking-system`.
2. **Root Directory** → `apps/admin`. Vercel detects Next.js and installs from
   the repo-root lockfile on its own — npm workspaces are handled natively, so
   leave the build and install commands alone.
3. **Environment Variables** → add:

   ```
   NEXT_PUBLIC_API_BASE_URL = https://banking-system-zhtb.onrender.com/api
   ```

   The `/api` suffix is required. Every route lives under that prefix; without it
   every call 404s.
4. **Deploy**. Note the resulting `https://….vercel.app` URL.

> `NEXT_PUBLIC_*` is inlined into the browser bundle **at build time**. Setting it
> in the dashboard later does nothing until you redeploy — and an admin built
> before it was set still calls `http://localhost:4000/api`, which looks exactly
> like "the API is down".

---

## 4. Customer web app — Vercel

1. **Add New → Project** → same repo again → **Root Directory** → `apps/customer`.
2. `apps/customer/vercel.json` drives the build; leave the framework preset as
   **Other**. It clones the Flutter SDK and runs `flutter build web`, so expect
   4–8 minutes for the first build.
3. Optional env var — the build falls back to the Render URL above if you skip it:

   ```
   API_BASE_URL = https://banking-system-zhtb.onrender.com/api
   ```
4. **Deploy**. Note the URL.

On the web build, deposits work end to end because the demo runs the **mock**
gateway. Live Razorpay checkout is Android-only: `razorpay_flutter` has no web
implementation, so `PAYMENTS_MODE=live` needs the APK in `deliverables/`.

---

## 5. Close the loop — CORS

Back to Render → **Environment** → set `CORS_ORIGINS` to both Vercel URLs,
comma-separated, scheme included, **no trailing slash**:

```
CORS_ORIGINS=https://pigmee-admin.vercel.app,https://pigmee-customer.vercel.app
```

Save. Render redeploys. Until this is done, both sites load fine and every API
call fails in the browser console with a CORS error.

Preview deployments get their own hostnames and are therefore **not** in the
allow-list. Demo on the production URLs, or add the preview hostname too.

---

## Verify

```bash
API=https://banking-system-zhtb.onrender.com

curl $API/health                        # status ok, env production, paymentsMode mock
curl $API/api/public/villages           # 4 villages
curl -s -o /dev/null -w '%{http_code}\n' $API/api/me     # 401 — protected routes reject

curl -X POST $API/api/auth/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_SEED_EMAIL","password":"YOUR_SEED_PASSWORD"}'   # accessToken
```

Then in a browser: open the admin URL, log in with the seed credentials, and
check that the dashboard shows customers. Open the customer URL and log in with
any seeded mobile — `9100000000` through `9100000011`. The OTP field prefills
with `424242`.

The first request after idle takes ~50 s while Render wakes the container. That
is the free plan, not a bug. Hit `/health` once before a live demo.

---

## Demo credentials

| Who | Credentials |
| --- | --- |
| Admin | the `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` you set in step 2 |
| Customer | mobile `9100000000`–`9100000011`, OTP `424242` |
| New customer | register any mobile starting `91000000`, OTP `424242` |

`424242` works **only** for numbers matching `DEMO_OTP_PHONES`. Every other
number gets a real random OTP that is written to the Render log and nowhere else,
so the fixed code is not a way into an arbitrary account.

---

## What this deployment is not

- **Not real money.** `PAYMENTS_MODE=mock` self-signs payments. Going live needs
  Razorpay keys, `PAYMENTS_MODE=live`, `DEMO_MODE=false`, and the webhook pointed
  at `POST /api/payments/webhook`.
- **Not real OTP delivery.** `SMS_PROVIDER=console` only logs. MSG91 and Twilio
  are both fully implemented — supply credentials and switch the provider.
- **`DEMO_OTP` cannot survive go-live.** With `DEMO_MODE=false` the API refuses to
  boot while it is set. That is deliberate.
- **KYC uploads are lost on redeploy.** Render's free filesystem is ephemeral.
  Real customer KYC needs a persistent disk or object storage.
- **The APK is debug-signed.** Installable and sideloadable; the Play Store will
  reject it. See `docs/DEPLOYMENT.md` for the upload-keystore steps.

`docs/DEPLOYMENT.md` covers the full production path, Docker Compose,
self-hosting, and the release checklist. `docs/SECURITY.md` covers the security
model these settings enforce.
