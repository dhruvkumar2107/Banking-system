# What I need from the Project Head

**Digital Pigmee v0.1.0** · prepared 2026-08-20

The platform is **built, tested and running end-to-end**. Nothing below blocks a
demo — the system runs today with mock payments and console OTPs. Everything here
is what's needed to turn a working build into a **live banking product**.

Items are ordered by urgency. **A / B / C** = how much it blocks go-live:

| | Meaning |
|---|---|
| **A** | Hard blocker — production cannot launch without it |
| **B** | Scope/decision — changes what we build next |
| **C** | Polish — needed before Play Store / public launch |

---

## A1. Razorpay live account 🔴 *hard blocker*

Payments currently run in **mock mode**: the full flow works (order → checkout →
signature verify → ledger credit → receipt) but no real money moves. Signature
verification and idempotency are real code paths, already tested — only the keys
are missing.

**Need from you:**
- `RAZORPAY_KEY_ID` (live, `rzp_live_…`)
- `RAZORPAY_KEY_SECRET`
- A webhook secret **you choose**, then registered in the Razorpay dashboard
- Webhook URL to register: `https://<api-domain>/api/payments/webhook`
  — subscribe to `payment.captured` and `payment.failed`
- Confirmation of the **settlement account** the collections land in

**Also decide:** who pays the gateway fee (~2%) — the bank, or is it deducted
from the customer's deposit? This changes the ledger math and must be settled
before go-live, because it affects what balance the customer is shown.

## A2. SMS gateway for OTP 🔴 *hard blocker*

Login is OTP-based. Both **MSG91** (India) and **Twilio** are fully implemented —
pick one and give me credentials. Today OTPs are printed to the server log.

**If MSG91 (recommended for India):** auth key, approved 6-character sender ID
(e.g. `PIGMEE`), and a **TRAI DLT registered template**. The DLT registration is
usually the slowest item on this whole list — *please start it first.* Indian
carriers will silently drop transactional SMS whose text doesn't match an
approved template.

**If Twilio:** account SID, auth token, sending number.

## A3. Production database 🔴 *hard blocker*

Runs today on **PGlite** (embedded Postgres, zero setup) — great for demos, not
for production: single-connection, local file, no backups or failover.

**Need:** a managed **Postgres 14+** connection string. Any of Railway, Render,
AWS RDS, Azure Database, or the bank's own Postgres. No code changes — set
`DATABASE_URL` and the app switches over.

**Also confirm:** backup schedule and retention. This is a **ledger** — the
append-only transaction history is the system of record, so point-in-time
recovery matters more than for a normal app.

## A4. Hosting, domains and who operates it 🔴 *hard blocker*

**Need:**
- Two domains/subdomains — e.g. `api.yourbank.com` + `admin.yourbank.com`
- TLS certificates (or a platform that terminates TLS for you)
- A decision on where it runs (see options in `docs/DEPLOYMENT.md`):
  - **Self-hosted Docker** — `docker compose up --build`, everything included
  - **Managed platform** (Railway/Render) — fastest path
  - **Bank's own infra / on-prem** — likely if IT security requires it
- Who owns operations day-to-day: monitoring, restarts, upgrades

⚠️ The admin panel's API URL is compiled in **at build time**
(`NEXT_PUBLIC_API_BASE_URL`). I need the final API domain *before* building the
production admin bundle — it can't be changed by editing a config file later.

---

## B1. Withdrawals and maturity — genuinely missing, needs your decision 🟠

**This is the most important item on the page.** The system currently handles
**deposits only**. There is no endpoint for a customer to withdraw, close an
account, or receive maturity proceeds.

The ledger schema already supports debits (`ledger_type = 'credit' | 'debit'`),
so the foundation is there — but no withdrawal flow was in the build plan, so
none was built.

**Please confirm how the scheme actually works:**

1. **Maturity** — do pigmy accounts have a fixed term (e.g. 12 months / 220
   days)? What happens at the end?
2. **Interest** — is interest paid? At what rate, and compounded how? Right now
   no interest is calculated anywhere.
3. **Withdrawal** — can a customer withdraw before maturity? Full or partial?
   Any penalty?
4. **Payout channel** — when money goes out, does it go to the customer's saved
   bank account (we already collect account + IFSC), or is it cash at the branch?
5. **Who authorises it** — customer self-service in the app, or must an admin
   approve? For a bank, I'd expect maker-checker approval; that's a meaningful
   piece of work and I'd rather build it right than guess.

Until this is answered the product is a **collection-only** system. That may be
exactly right for phase 1 — I just need you to say so explicitly, because it's
the difference between "done" and "half a savings product".

## B2. Is there a field agent / collector role? 🟠

The build plan has customers paying from their own phones. In most real pigmy
schemes an **agent walks the village collecting cash daily**.

**Confirm:** is cash-in-person collection in scope? If yes we need an agent role,
an agent-facing collection screen, cash-vs-digital reconciliation, and an agent
settlement report. Currently there are exactly two roles: **admin** (village-scoped)
and **superadmin**.

## B3. Business rules to pin down 🟠

Small but they need real answers before go-live:

- **Deposit limits** — min/max per day? Any per-customer cap? Currently the daily
  amount is set per account with no enforced bounds.
- **Missed days** — a reminder currently fires after 3 missed days
  (`MISSED_PIGMY_DAYS`). Is 3 right? Is there a penalty, or only a nudge?
- **Multiple accounts** — a customer can hold several pigmy accounts today. Intended?
- **KYC** — which documents count as valid, and who is authorised to approve
  them? Any Aadhaar/PAN verification API the bank already licenses?
- **Refunds/reversals** — if a payment is charged wrongly, what's the process?
  Reversals are currently possible only via a manual ledger debit.
- **Audit retention** — how long must audit logs be kept? (RBI-driven, likely 8–10
  years.) Affects storage sizing.

---

## C1. Branding and app-store assets 🟡

Everything is currently generic "Digital Pigmee" placeholder branding.

**Need:** the real bank name, logo (SVG preferred), app icon (1024×1024),
brand colours, and the Android package name if `bank.pigmee.pigmee_customer`
isn't what you want — ⚠️ **the package name is permanent once published to Play
Store**, so confirm it before the first upload.

**For the Play Store listing:** app title, short + long description, feature
graphic (1024×500), phone screenshots, support email, and a **publicly hosted
privacy policy URL** (Google will reject the listing without one — and since the
app handles financial data, expect the Data Safety form to be scrutinised).

## C2. Android upload keystore 🟡

The signing mechanism is wired and ready (`android/key.properties`, see
`key.properties.example`). The APK in this handover is **debug-signed** — installs
fine for testing, but Play Store will reject it.

**Decide who generates and holds the upload keystore.** I deliberately did *not*
create one: whoever holds it controls all future updates to the listing, and
losing it means you can never update the app again. That's a custody decision for
the bank, not something I should invent. It belongs in the company secret vault
with an offline backup. The generation command is in `key.properties.example` —
happy to run it with you, or take one you provide.

## C3. Hindi copy review 🟡

The app ships **English + Hindi** (`apps/customer/lib/l10n/`). The Hindi strings
are my translations and have **not** been reviewed by a native speaker. Banking
terminology especially ("pigmy", "maturity", "nominee", "ledger") deserves a
review by someone who talks to these customers. Also confirm whether any other
regional language is needed for the target villages.

## C4. Legal and compliance sign-off 🟡

Out of my hands, needs bank counsel:

- Terms & Conditions and Privacy Policy text (also required for Play Store)
- Data residency — must customer data stay in India? Constrains hosting choice
- RBI/NPCI obligations for collecting deposits through an app
- Whether the bank's InfoSec team requires a **penetration test** before launch —
  worth scheduling early, as it can gate go-live by weeks
- Nominee rules — legal requirements around nominee changes and payouts

## C5. Real seed data 🟡

The demo has **4 fictional villages and 12 fictional customers**.

**Need:** the real village list (name + code), the real admin users with their
village assignments and roles, and — if pigmy accounts already exist on paper or
in another system — the existing customer and balance data plus a decision on how
to migrate opening balances. Importing historical balances into an append-only
ledger needs a deliberate opening-balance entry per account; tell me if this is
needed and I'll build the importer.

---

## Fastest path to a live pilot

If you want to move quickly, these four unlock the most:

1. **Start the MSG91 DLT template registration today** — longest external lead time
2. **Answer B1 (withdrawals/maturity)** — decides whether scope is complete
3. **Provision Postgres + confirm the two domains** — unblocks a real deploy
4. **Razorpay live keys** — flips payments to real money

With 1–4 answered, a UAT deployment on real infrastructure with mock money is
about a day's work. Go-live then waits only on Razorpay activation and your
sign-off on B1.

## What needs nothing from you

Already done and verified — no input required: the API and its 55 endpoints, the
admin panel (18 pages), the customer app (17 screens, APK + AAB built), the
append-only ledger, RBAC and village isolation, audit logging, OTP rate limiting,
webhook signature verification and idempotency, scheduled reminders and payment
reconciliation, Docker Compose packaging, the 43 automated tests, and all
developer documentation.
