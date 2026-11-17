# Verification record — 2026-11-16

## Passed locally

- **26 unit tests**: exact product rejection, preorder/backorder precedence, failed requests, rate limiting, stale observations, price filters, eligibility, cooldown, delivery content/idempotency, live-checkout policy and security validation.
- **16 PostgreSQL integration tests** across inventory, billing, checkout and authentication suites. The tests used a separate disposable test database and synthetic provider fixtures with captured delivery. They exercised durable fanout, concurrent checks, retries, history joins, cancellations, signed/replayed webhooks, individual refunds, concurrent checkout reservation, recovery after an external-success/database-save failure, single-use email links and user isolation.
- `npm run typecheck` completed successfully.
- `npm run build` completed successfully with Next.js's supported Webpack builder. Turbopack production compilation encountered a host-specific CSS subprocess failure; the project build script uses Webpack. Development preview was tested with Turbopack.
- `npm audit` reported **0 vulnerabilities** after upgrading Vitest to the current compatible stable version.
- Browser checks: desktop 1440px and mobile 390px, no document overflow, navigation, public stock/empty history, protected unauthenticated dashboard controls, sign-in page, source links and explicit consent controls.
- Public home and `/api/stock` returned HTTP 200. With no credentials, sources were disabled, states unknown, prices/timestamps null, history empty and readiness false.
- Migrations applied successfully to application and isolated test databases. Seed creates only retailer configuration.

## External acceptance remains incomplete

No real retailer API credential was available. Neither adapter has been certified with a genuine inventory response; no genuine stock transition or external alert delivery was claimed. Best Buy requires its API key and actual usage/retention/branding approval. NVIDIA remains disabled pending permission or an approved feed.

Authentication integration tests captured the email transport; they did not prove real inbox delivery. Billing tests used mocked Stripe responses and locally signed test webhook payloads; they did not complete a Stripe-hosted test-mode purchase. Browser push delivery needs VAPID credentials and a supported browser. These provider acceptance checks and the optional organizer verification script must be completed before live-checkout flags are enabled.

## Local handoff

The project uses Node.js and a separately configured PostgreSQL connection. Container setup files were removed at the user's request; the temporary database container used during verification was stopped and removed. The local `.env` intentionally leaves `DATABASE_URL` blank so the public preview starts without assuming a database installation. Configure a local PostgreSQL instance using `.env.example` and the README before starting the worker or authenticated features.

No domain, hosting, paid service, advertisement or public deployment was created.
