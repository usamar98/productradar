# Restock Radar verification

Verified locally on 2026-11-17. The existing GPU-only application was preserved in the baseline commit and extended with a generic catalog and alert system.

## Passing checks

- `npm test`: **70 tests**, ten suites. Covers stock-period transitions, plan limits, duplicate delivery identities, exact-variant JSON-LD parsing, robots rules, blocked/private addresses, signed capabilities, stable notification retry URLs, Stripe signature validation, webhook idempotency, refunds, purchased pricing snapshots, and admin cookie security. Includes retained legacy regression tests, six SEO tests, and five exact-variant selection tests.
- `npm run test:integration`: **23 tests**, six suites, on the isolated local `restock_radar_test` PostgreSQL database. No skipped suites. Includes concurrent fenced stock writes, period open/close/reopen, notification uniqueness, duplicate payment commits, signed retailer click expiry, account isolation, paused-pass replay, grandfathered pricing, cancellation, and refund ledger dates. Provider responses are fixtures; no external messages or charges are sent.
- `npm run typecheck`: TypeScript strict check passes.
- `npm run build`: Next.js production build succeeds with all new product, retailer, guide, history, alert, admin, policy, and SEO routes.
- Five Prisma migrations applied successfully to both new local databases; seed succeeds and is idempotent. New and legacy tables have RLS enabled without public API policies.
- `npm run worker:once`: one local cycle completed with all seeded sources paused.

## HTTP and browser checks

HTTP 200 verified for `/`, `/playstation-5-pro`, `/playstation-5-pro/restocks`, `/playstation-5-pro/at/best-buy`, `/how-to-get-playstation-5-pro`, `/proof`, `/alerts`, `/alerts/manage`, `/admin`, `/terms`, `/privacy`, `/refunds`, `/contact`, `/sitemap.xml`, `/robots.txt`, and `/llms.txt`. Hidden RTX 5090 and unknown item routes correctly return 404.

Unauthenticated admin writes return 401, cross-origin admin requests return 403, and authenticated admin renders source controls and metrics. Anonymous account access returns 401. Credentials were not printed or committed.

Browser review confirmed desktop and 390px mobile layouts, mobile navigation, account sign-in presentation, and the alert creation form. Selecting a third retailer on Starter leaves two selected and displays the limit message. The setup message correctly says Stripe is not connected. Tablet header retains access to My alerts. The browser was restored to its original viewport and left on the homepage.

The application database was checked after tests: **zero stock events, notifications, payments, and customer posts**. Synthetic activity exists only inside isolated tests and is removed by those fixtures.

The `pg` driver emits a deprecation notice about query concurrency during an existing legacy integration fixture; all tests pass on the pinned version. Upgrade/migration work is not claimed here.

## External acceptance still required

The following are implemented but cannot be verified against real services without configuration:

- Approved retailer integrations and observed real stock data. PS5 source URLs are storefront placeholders. The eight Apple configuration URLs are verified catalog references, but Apple Store pickup monitoring is not configured. All newly seeded sources are paused and unapproved.
- Supabase deployment/connection; the connected account had unrelated projects, which were left unchanged. Verification used local PostgreSQL.
- Stripe hosted **test** Checkout, portal cancellation, and actual webhook delivery. Live keys/events are rejected.
- Resend verified sender and real inbox delivery.
- VAPID configuration and real browser/OS push delivery. Browser permission was not requested during QA.
- Final domain, support/operator details, organizer traffic script, and production hosting.
- Worker Docker/Railway/Fly deployment. Configuration is supplied; no cloud worker was launched or paid plan activated.

Do not describe this local verification as live retailer or provider acceptance. The README documents setup, deployment limits, catalog records and the editorial content needed before indexing new product pages.

## November 17 competitor-informed catalog and SEO expansion

- Case study completed before implementation, with public source links and explicit evidence limits in `docs/store-stock-checker-case-study.md`.
- Added iPhone Duo, eight variants and exact Apple configuration links. The idempotent seed creates no stock, payment or notification activity.
- Added product/guide directories, category hubs, variant routes, contextual links, original guidance and monitoring methodology. Retailer pages distinguish configurations instead of using the first source as a retailer-wide status. Event logs retain variant identity.
- HTTP checks passed on 27 public pages, including all eight Apple variants. Confirmed canonical/OG URLs, Twitter cards and parseable JSON-LD. Unknown product/category/variant and hidden RTX routes return 404.
- Sitemap excludes pending variant, retailer and history routes; these render `noindex, follow`. Catalog/guide/category pages remain discoverable. Legacy support/cancellation routes redirect to current destinations.
- `/opengraph-image` returns a valid 1200×630 PNG. `llms.txt` includes the new product and methodology while disclosing pending coverage.
- Browser verified catalog → iPhone Duo → 512GB Star White → Apple alert setup. Both the variant and source remain selected; pending-source and unconfigured-checkout notices remain visible. Mobile product directory reviewed at 390px.
