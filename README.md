# GPU Stock Watch

A focused TypeScript app for one product: **NVIDIA GeForce RTX 5090 Founders Edition, United States**. Next.js, Tailwind, PostgreSQL/Prisma, a persistent background worker, Better Auth email links, Stripe-hosted billing, Resend and standard Web Push.

## Current operational status

The application and its account, billing, inventory, notification and audit paths are implemented. **Live inventory tracking is not established and live checkout is disabled.** Best Buy's documented Products API needs a developer key and approval for this service's paid-alert use, retention and branding. NVIDIA collection remains disabled because no approved feed was established. See [the source verification record](docs/retailer-sources.md) for exact product identifiers, official documentation, quotas, evidence semantics and required approval.

No stock observations, customer counts, testimonials or revenue are fabricated. An empty database displays unknown stock and an honest pending-connection message. Retailer links lead to the official exact-edition product pages. This service is independent of NVIDIA and retailers.

## Run locally

Use Node.js 22.12+ (a current Node 22 LTS patch is recommended), npm, and a locally installed PostgreSQL 17 server. No paid provider account is needed to explore the public interface. Provider features remain unavailable until configured.

1. Install dependencies: `npm ci --include=dev --include=optional`.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL` to your PostgreSQL database. Create an empty `gpu_stock_watch` database and a role that owns it. The example credentials are for local development only; use your own password. Generate `BETTER_AUTH_SECRET` with the command in the example.
3. Run `npm run db:generate`, `npm run db:migrate`, then `npm run db:seed`. The seed only registers retailer metadata; it creates no inventory or customer data.
4. Start `npm run dev` and open **http://localhost:3000**.
5. In a second terminal run `npm run worker`.

For example, with `psql` connected as a PostgreSQL administrator:

```sql
CREATE ROLE gpu LOGIN PASSWORD 'replace-with-your-local-password';
CREATE DATABASE gpu_stock_watch OWNER gpu;
CREATE DATABASE gpu_stock_watch_test OWNER gpu;
```

Set `DATABASE_URL=postgresql://gpu:YOUR_PASSWORD@localhost:5432/gpu_stock_watch` and the analogous `TEST_DATABASE_URL` ending in `/gpu_stock_watch_test`. URL-encode special characters in passwords. The database port in `.env.example` can be changed to match your installation.

Production build: `npm run build`, then `npm start`. Run the worker as a separate always-on Node process under your process manager. Set HTTPS `APP_URL`/`BETTER_AUTH_URL`, secure database connectivity, secret storage and restart policies in your hosting environment. Nothing in this task registers a domain, buys a service or deploys publicly.

## Provider configuration

**Inventory:** read `docs/retailer-sources.md` first. `BESTBUY_API_KEY` and `BESTBUY_USAGE_APPROVED=true` enable the candidate adapter. The latter is an operator attestation of actual approval, including retention and required branding; it is not a grant of permission. Verify a genuine API response before selling the service. The exact SKU and model must both match; a broad “RTX 5090” name is insufficient. NVIDIA has no enabled adapter. Never use a frontend cart endpoint or bypass a retailer challenge.

**Email sign-in:** configure `BETTER_AUTH_SECRET` (at least 32 random characters), `RESEND_API_KEY`, and `EMAIL_FROM` using a verified Resend sending domain. Set the application origin exactly to the browser origin. Magic links expire in ten minutes and tokens are hashed at rest. Password registration is disabled. The app does not print sign-in links or credentials to logs. Configure `SUPPORT_EMAIL` before launch.

**Stripe:** use a test secret key during development. Create one USD monthly recurring price, default **799 cents**, and set `STRIPE_PRICE_ID`. `NEXT_PUBLIC_PLAN_PRICE_CENTS` must match the Stripe price; it also sets displayed pricing at build time. Rebuild after changing it. Configure your hosted Checkout terms/privacy URLs and enable cancellation in Customer Portal. Set the webhook signing secret for `/api/billing/webhook`. A success URL alone never grants access. The SDK pins its supported API version; configure Stripe snapshot events to match it.

Subscribe the endpoint to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_failed
invoice.voided
invoice.marked_uncollectible
charge.refunded
refund.created
refund.updated
refund.failed
```

The optional Stripe CLI can forward test events with `stripe listen --forward-to localhost:3000/api/billing/webhook`. Copy its `whsec_` secret into `.env`. Complete an actual hosted test checkout and test renewal, failed payment, cancellation and refunds. Unit fixtures do not replace provider test-mode acceptance. A fully refunded current paid period loses alert access. Refunds do not automatically cancel future renewals; cancellation is managed in the portal.

**Browser push:** generate VAPID keys with `npx web-push generate-vapid-keys`, then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:` or HTTPS contact). Connect a browser from the dashboard through an explicit click. Push requires a secure context; localhost is supported for development. Browser support and OS notification settings vary. Subscription endpoint hosts are restricted to known Web Push providers to prevent arbitrary outbound requests.

## Live checkout gate

Test checkout requires configured authentication, Stripe test price and signed webhooks. Live checkout additionally requires all of:

- `ENABLE_LIVE_CHECKOUT=true`, a permitted enabled source, and a recent successful known-state observation with no current provider error.
- Operational Resend and VAPID configuration.
- `AUTH_FLOW_VERIFIED`, `EMAIL_DELIVERY_VERIFIED`, `PUSH_DELIVERY_VERIFIED`, and `BILLING_FLOW_VERIFIED` after completing those real acceptance checks.
- In `HACKATHON_MODE`, the organizer's actual HTTPS `TRAFFIC_VERIFICATION_SCRIPT_URL` and `TRAFFIC_VERIFICATION_VERIFIED=true` after verification.

Do not set verification flags merely to remove a disabled button. Source and credential checks are enforced on the server. `DEMO_MODE=true` blocks source requests, authentication emails, billing and customer delivery, displays a banner, and does not seed invented stock history.

## Worker and stock correctness

`src/lib/inventory` contains provider adapters and pure rules. `src/worker` owns the scheduler, durable jobs and delivery. Inventory is checked once per retailer across all accounts. Best Buy defaults to a 300-second interval, with a 60-second floor; retailer-specific limits and approval take priority. The five-second worker tick is a queue wakeup, **not** a five-second inventory or notification promise. This requires a continuously running process; serverless cron is not assumed.

The database represents in stock, out of stock, preorder, backorder, unknown and check failed. Failures update check health while preserving the last successful observation. Public results show stale data honestly. Preorder/backorder/future-release evidence takes precedence over order buttons. A restock event needs an observed unavailable-to-available transition; first-ever/unknown discovery does not create an invented restock.

Per-source leases and fenced commits protect overlapping workers. Observations, stock events and matching jobs commit together. Jobs have unique recipient/event/channel/target keys, cooldowns, retries, expiry and leases. Price filters reject missing prices when a cap is configured. Paid access, current preferences, source health and observation freshness are checked again immediately before delivery. Unknown or failed states cannot trigger stock alerts.

Resend retries use a stable idempotency key within its 24-hour window; jobs expire much sooner. Web Push is at-least-once, with persistent browser event-ID deduplication and notification tags. No distributed delivery system can promise purchase availability; notifications explicitly say stock is not reserved.

## Privacy, attribution and administration

Optional acquisition measurement is recorded only after opt-in: actual campaign parameters, referring domain, landing path and timestamps. Missing attribution remains null. The first available consented record is linked to the signed-in account and payment. No visitor fingerprint is invented. The optional verification script loads only after consent. The account page allows consent withdrawal.

`GET /api/admin/export` requires a signed-in, verified email explicitly listed in `ADMIN_EMAILS`. It exports payments, refunds, acquisition records and recorded marketing expenses, with CSV formula escaping and private/no-store headers. It is not a public dashboard. The current export has a documented 10,000-record per-category cap. Add genuine expenses directly to `MarketingExpense` with your database administration tooling; no fictional ad spend is seeded.

For an eventual deployment, configure your trusted reverse proxy to overwrite forwarding headers, apply appropriate ingress/body limits, set verified support/operator details, establish approved retention and backups, and schedule rate-limit/expired-session cleanup. Secrets stay server-side. The public stock endpoint returns no customer records. User data queries always derive ownership from the authenticated session.

## TrustMRR

There is no custom TrustMRR revenue-writing API in this app. Connect the real Stripe account through TrustMRR's **Dashboard → My Startups / Add startup** flow. Create a separate restricted **read-only** Stripe key with the permissions currently requested by TrustMRR; their published terms specify charges, subscriptions and account information. Supply it directly to TrustMRR, never to this repository or a public environment variable. Do not submit development/test charges as real revenue. Review the current [TrustMRR FAQ](https://trustmrr.com/faq) and [credential requirements](https://trustmrr.com/terms) when connecting. TrustMRR's separate public-data API is not the payment-provider verification connection.

## Verification

```text
npm test
npm run typecheck
npm run build
npm run test:integration
```

Integration tests require an isolated `gpu_stock_watch_test` PostgreSQL database with all migrations applied. Set `TEST_DATABASE_URL`; temporarily use that same URL as `DATABASE_URL` when running `npm run db:migrate` for the test database, then restore the application URL. The suites refuse an unsuitable database or skip without a test URL. They use synthetic retailer/Stripe responses and captured email transport; they do not send customer messages or charge money.

Covered cases include exact-edition rejection, preorder precedence, access denial/timeouts, stale results, failure recovery, price filtering, cooldowns, concurrent duplicate checks, retry delivery, subscription changes, duplicate/signed webhooks, payment/refund lifecycle, single-use authentication links and cross-account isolation. The real PostgreSQL pipeline test follows a fixture observation through matching, durable notification generation, captured delivery and the same persisted history joins used by the dashboard.

**Still required externally:** approved Best Buy key/usage/retention; a genuine observation-to-delivery acceptance run; verified Resend sender and real inbox test; browser push delivery test; Stripe hosted test checkout and portal acceptance; support/operator information; organizer verification script when applicable. None of those checks is claimed complete merely because local tests pass.

## Structure

```text
prisma/                 schema, migrations, metadata seed
src/app/                pages and HTTP routes
src/components/         responsive interface and consent/push onboarding
src/lib/inventory/      verified identities, adapters, stock rules
src/lib/billing/        paid access, readiness, Stripe projections
src/worker/             persistent scheduler and notification delivery
tests/                  unit and isolated PostgreSQL integration tests
docs/retailer-sources.md official-source research and acceptance requirements
```

Dependency baseline checked against official documentation: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Prisma 7 driver adapters](https://www.prisma.io/docs/orm/v7), [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma). Exact installed versions are locked in `package-lock.json`.

