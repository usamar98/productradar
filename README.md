# Restock Radar

A generic restock-alert MVP: browse stock without an account, select an exact item/variant and retailers, pay through Stripe test Checkout, and receive Resend email and browser push when an observed stock period opens. Catalog: **49 products and 290 configurations** across Apple, PlayStation and NVIDIA, with US availability checks and USD pricing.

The app is implemented for local use and provider setup. **Direct official-store checks are implemented for iPhone Duo pickup, PS5 Pro and RTX 5090.** These checks run when requested; automatic monitoring, external customer alerts, real payments and a hosted deployment are not claimed. Other retailer URLs remain inactive placeholders. The seed inserts catalog metadata and plans only. Public metrics and history come from PostgreSQL; empty states say no data yet. A database outage displays an explicit connection notice and metadata-only preview.

A separate [local test lab](docs/local-testing.md) at **http://localhost:3001/local-test** combines Stripe sandbox checkout, the normal webhook/worker pipeline, controlled stock signals and a local email inbox. Its inventory is explicitly simulated and its database is separate from the main app on port 3000. The temporary Stripe sandbox expires **November 24, 2026** unless claimed.

## Local setup

Requires Node 22.12+, npm, and PostgreSQL 17. Copy `.env.example` to `.env`, then set `DATABASE_URL`, `APP_URL`, a random `RADAR_AUTH_SECRET` (32+ characters), and `ADMIN_PASSWORD` (16+ characters). Generate each secret separately:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm ci --include=dev
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. In a second terminal run `npm run worker`. `npm run worker:once` performs one cycle for diagnostics. Never run the old `src/worker` entrypoint for Restock Radar.

Run only one Next development server in this checkout. For the main app and local lab together, stop the main development server, build with `npm run build`, then use `npm run start` for port 3000 and `npm run local-test` for port 3001. Concurrent main/lab development servers caused reload loops through shared generated files despite their separate build directories. Build before starting the lab; see [the lab restart sequence](docs/local-testing.md#start-the-configured-workspace-again).

This workspace has an isolated local cluster at `.local/postgres`, listening on **127.0.0.1:55432**, and `restock_radar`, `restock_radar_test` and `restock_radar_local_test` databases. The ignored environment files contain their URLs and generated application/admin secrets. The cluster uses local development trust authentication and binds only to loopback; do not expose it to a network. To restart it on Windows:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' -D 'D:\productfind\.local\postgres' -l 'D:\productfind\.local\postgres-server.log' -o '-p 55432 -h 127.0.0.1' start
```

## Configure the product

- Plans and refund wording: `src/config/pricing.ts`. Starter $5/month, 2 retailer alerts; Plus $10, 5; Max $20, 10; until-caught pass $9, one retailer, at most 14 days. Each chosen retailer consumes one slot across the plan.
- Brand and canonical origin: default name **Restock Radar**; set `APP_URL` to the final HTTPS origin. Update branding in `src/components/radar` if changing the name. No domain is purchased.
- Admin: `/admin`; password is `ADMIN_PASSWORD` in `.env`. Sessions are signed, HTTP-only, same-site, and expire after 8 hours. Changing the password revokes them. Login rate limits persist in PostgreSQL.
- Source setup: seed, sign in to admin, edit the placeholder exact product URLs, select JSON-LD, set polling interval, review retailer terms/permission, check approval, activate. URLs with existing stock history cannot be reassigned. The worker stops on access denial, rate limits, CAPTCHA, or disallowed robots rules.
- Support: set `SUPPORT_EMAIL`. Review supplied legal text and operator details before accepting customers.
- The root layout `<head>` contains the **HACKATHON TRAFFIC TRACKER SLOT**. Add the organizer script there; no tracker is loaded by default.

## Stripe test billing

Set `STRIPE_SECRET_KEY` to a Stripe test key (`sk_test_`, `rk_test_` or temporary sandbox `rkcs_test_`) and `STRIPE_WEBHOOK_SECRET=whsec_...`. The payment boundary is `src/lib/payments.ts`. It creates inline USD prices from the pricing constants; no Stripe price IDs are required. Live keys and live webhook events are rejected. Card details are entered only on Stripe-hosted Checkout.

```sh
stripe listen --all-snapshot --forward-to http://localhost:3000/api/radar/webhook
```

Register that endpoint in Stripe for these snapshot events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.expired
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
charge.updated
refund.created
refund.updated
refund.failed
```

Enable cancellation in the Stripe Customer Portal. The account dashboard opens an owned portal session. Webhooks verify signatures and commit event markers with payment/subscription changes atomically. Database locks serialize concurrent updates; current Stripe state handles delayed events. A success redirect never grants access. Full refunds of the current paid period deactivate alerts. Renewals restore access only after a confirmed paid period. Refund requests are handled manually in Stripe under the editable 14-day policy; each refund retains its original date for reporting.

Checkout requires configured transactional email (or the explicit development-only local inbox), a secure session secret, and active approved sources. Placeholder retailers cannot be purchased. After checkout, customers request a secure email link to manage alerts and enable push. Login links last 10 minutes and are single use; sessions last 30 days. Notification clicks record `caught_at`; for one-time passes, clicking ends the pass even if the customer does not purchase. This is explained in the interface and terms. Set `STRIPE_PORTAL_CONFIGURATION_ID` to use a specific test portal configuration.

## Email and browser push

Set `RESEND_API_KEY` and `EMAIL_FROM` using a verified sending domain. Set `SUPPORT_EMAIL` separately. Generate VAPID keys with `npx web-push generate-vapid-keys`, and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Share `RADAR_AUTH_SECRET` and `APP_URL` between the worker and web app. Public VAPID changes require rebuilding.

Push uses an explicit button on `/alerts/manage`, `/sw.js`, and HTTPS (or localhost). Expired endpoints are removed. Email sends use stable Resend idempotency keys. Push uses per-alert/event tags and persistent browser deduplication. Transport delivery can be at-least-once after a network failure; stock is never reserved and no purchase is automated.

For local testing, `RADAR_LOCAL_MAILBOX=true` with development mode and a loopback `APP_URL` captures email at `/local-inbox`. Captures are stored under ignored `.local/mailbox`, expire after 24 hours and never count as delivered-email proof. This mode is disabled in production. The separate lab requires it so simulated stock notifications cannot reach Resend or browser push.

## Worker

`/worker` is a continuously running TypeScript process. Sources have individual intervals (15 seconds default), jitter, exponential backoff, and fenced database leases. It opens one event per in-stock period and closes it on an out-of-stock observation. An initial genuine in-stock observation opens an observed period; it does not claim when inventory first became available. Database uniqueness prevents multiple open periods and duplicate alert/event/channel/target jobs. Detection-to-send latency is recorded.

JSON-LD checks use a clear Restock Radar User-Agent, robots rules, public HTTPS addresses only, pinned validated DNS, timeouts, response-size limits, and no redirects. Ambiguous offers are rejected instead of guessing a variant. Terms and polling permissions need operator review. Bot protections are never evaded. Hidden development-only mock sources require `ALLOW_MOCK_CONNECTOR=true` and a non-production runtime; their events never trigger customer delivery or enter public reports. `DEMO_MODE=true` disables polling and stock notification delivery.

## Add another item with data

Use Prisma Studio (`npx prisma studio`) or a SQL administration tool:

1. Insert a category if needed.
2. Insert an item with its category, unique slug, name, optional MSRP/image, and `hidden=true` during preparation.
3. Insert one or more variants belonging to it.
4. In `/admin`, add exact retailer sources linked to the item/variant. Review permissions and connector output before activation.
5. Add reviewed product guidance and official references to `src/lib/radar/product-content.ts`, plus category guidance when needed. Set `hidden=false`. Product, variant, retailer, guide, restock and alert-selection routes discover the catalog data automatically. Curated product/guide/category pages enter the sitemap; variant/history/retailer pages enter only after their sources have actual observations. Uncurated product and guide pages remain `noindex` until their editorial content is ready.

## Product discovery and SEO

The public catalog contains 49 products and 290 configurations across Apple, PlayStation and NVIDIA. Run `npm run db:seed` to add missing catalog rows; existing source settings are preserved. The [official-store adapters](docs/official-store-integrations.md) resolve selected purchase-page identities and distinguish pickup from online stock. The stock finder requests direct on-demand availability for configured exact products; background monitoring remains separately gated. A generic product-page offer cannot be used as store-specific pickup inventory.

Browse `/products`, `/guides`, `/categories/consoles` and `/categories/smartphones`. Product pages link variants, retailers, buying guides and recorded history. Variant URLs use `/{item}/variants/{variant}`; alert links preserve product, variant and retailer selection. `/methodology` explains coverage, freshness, counting and duration limits.

Metadata includes unique canonical URLs, Open Graph/Twitter previews, visible breadcrumbs and matching JSON-LD. `/opengraph-image` supplies a 1200×630 share image. Empty observation pages remain available to users but are `noindex` and excluded from `/sitemap.xml`; mock, hidden and preview catalog entries are excluded. `/llms.txt` documents the same coverage boundaries. Set `APP_URL` to the final public origin before deploying. These improvements establish usable discovery paths, not guaranteed rankings, traffic or sales.

The evidence, source links and implementation decisions are recorded in [the Store Stock Checker case study](docs/store-stock-checker-case-study.md). It distinguishes revenue from MRR/profit and does not attribute unmeasured growth to SEO.

Prisma `Radar*` model names map to the brief’s lowercase tables. Existing GPU-only models/data remain for legacy compatibility; new flows use `/api/radar/*`. All tables have RLS enabled with no public Data API policies. Access is through the trusted server database connection only; never expose it or a Supabase service key to browsers.

## Deployment

No paid resources are provisioned. An always-on paid-alert business cannot be promised indefinitely free: check provider terms and quotas. [Railway Free](https://docs.railway.com/pricing/plans) provides limited monthly credit; [Fly Machines incur usage charges](https://docs.fly.io/about/cost-management). [Supabase Free](https://supabase.com/pricing) limits active projects to two. Use local execution while credentials or free capacity are unavailable. Stripe test mode does not charge real cards; live processing would have fees and requires a later explicit change.

**Supabase:** select an appropriate free project, set its direct or session-pooler PostgreSQL URL in `DIRECT_URL` for migrations and `DATABASE_URL` for runtime, and require SSL as directed by its connection panel. Run `npm run db:migrate` then `npm run db:seed`. Do not reuse unrelated projects. See [Prisma connection guidance](https://supabase.com/docs/guides/database/prisma). Prisma migrations are authoritative; never reset a production database. Retain backups and protect the privileged server connection.

**Vercel:** import the repository as Next.js, Node 22; `vercel.json` supplies install/build commands. Configure web variables, run migrations as a deliberate release step, then deploy the tested commit. Set the final HTTPS origin, webhook URL, verified sender and support contact. Check current permitted use and quota before commercial launch. The worker is **not** a Vercel cron job.

**Railway worker:** create a service only if free capacity is available. Set configuration path to `worker/railway.json`, leave the repository root as build context, and supply worker secrets. Its Dockerfile generates Prisma and runs `npm run worker`. Use one replica; leases support overlapping restarts. Set spending limits and never upgrade automatically. If credits run out, run locally.

**Fly alternative:** `worker/fly.toml` and `worker/Dockerfile` provide a template. Choose a unique app name and configure secrets. From repository root: `fly deploy --config worker/fly.toml`. No HTTP service is needed. **Do not deploy under a free-only requirement without applicable credits.**

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run test:integration
```

Integration tests need `TEST_DATABASE_URL` pointing to a separate database ending in `_test`, with migrations applied. The runner loads `.env`; tests create/remove fixture rows. Never use the application database. Coverage includes period open/close/reopen, concurrent worker fencing, actual uniqueness, notification deduplication, plan limits, signed clicks, account isolation, duplicate/failed payment events, refunds and dated reporting. Synthetic provider fixtures send no customer messages or real charges.

Before launch, complete a real Stripe **test** checkout and cancellation/refund, a Resend inbox delivery, supported browser push delivery, and a permitted retailer observation-to-notification run. Local fixtures do not establish external acceptance. Check `/admin`, `/proof`, `sitemap.xml`, `robots.txt`, `/llms.txt` at the final origin. Results are in `docs/verification.md`.

Defaults: Restock Radar; localhost until a domain is assigned; US/USD; Apple, PlayStation and NVIDIA catalog; exact configuration and fulfillment matching; on-demand official checks and inactive other sources; UTC history; no invented activity; test-only billing; local database/worker until hosting and provider access are configured.

## Official Apple, PlayStation and NVIDIA sources

The [official-store integration report](docs/official-store-integrations.md) documents the public API research, direct availability lookups, exact SKU/store matching, protection stops and verification limits. These connectors do not use Best Buy. Real external alert delivery is not verified. Run `npm run sources:official` for local source and email configuration status. In PowerShell, prepare source records with `npm.cmd run sources:official -- --setup --zip 10001 --limit 5`; this does not activate monitoring.
