# Official store integrations — 17 November 2026

The app now has separate connectors for Apple Store pickup, PlayStation Direct US online stock and NVIDIA Marketplace US structured offers. **Live inventory and real alert delivery are not enabled or verified.** No Best Buy account or key is used by these connectors.

## Evidence and current limits

| Source | What was verified from public material | What remains unavailable |
| --- | --- | --- |
| Store Stock Checker | Its [public client](https://storestockchecker.com/app.js) calls its own catalog, store, stock and notification APIs. The [website](https://storestockchecker.com/) describes configuration-specific Apple pickup alerts. | Its upstream collector is private. The frontend does not establish which Apple endpoint or commercial permission it uses. Its robots-disallowed APIs were not queried or reused. |
| Apple | The [exact iPhone Duo purchase page](https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-256gb-star-white-unlocked) contains SKU `MK1E4LL/A+unlocked`, the fulfillment bootstrap `/shop/fulfillment-messages?fae=true`, and a pickup URL adding `pl=true`. The linked storefront client serializes `parts.0` and store/location inputs. The identity parser was checked against the downloaded page. | [Apple's site terms](https://www.apple.com/legal/internet-services/terms/site.html) restrict automated monitoring. The user has no retailer permission. No fulfillment request or ongoing poll was made, so the pickup response parser is contract-tested only. |
| PlayStation Direct | The [PS5 Pro page](https://direct.playstation.com/en-us/buy-consoles/playstation5-pro-console) exposes hero product code `1000050805` and the `api.direct.playstation.com` product-list route. Its public client refers to anonymous users, `stock.stockLevelStatus`, `purchasable`, preorder and membership gates. The identity parser was checked against the downloaded page. | [The API's robots.txt](https://api.direct.playstation.com/robots.txt) returned `User-agent: *` and `Disallow: /`. No inventory API request was made. The response-envelope/parser contract has not been verified against a live response. |
| NVIDIA | The [RTX 5090 Founders Edition listing](https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/) is the exact official storefront link. A normal server request returned an Access Denied page; requests stopped. | No usable inventory response or public live API contract was obtained. The adapter accepts only an unambiguous exact-product JSON-LD offer if NVIDIA serves one in future. It is not a verified NVIDIA API integration. [NVIDIA's terms, §3.2](https://www.nvidia.com/en-us/about-nvidia/terms-of-service/) also restrict automated extraction and monitoring. |

The original product brief requires respecting retailer terms and robots.txt and stopping on protection. These are actual observed limits, not a claim that legitimate stock monitoring is inherently prohibited. Public frontend endpoints are not automatically licensed third-party APIs. No cookies, account sessions, challenge solvers, proxies or disguised user agents are used.

## Implemented behavior

- `apple-pickup` resolves the exact US part from the selected purchase page, selects a known Apple Store ID and its ZIP, and constructs the storefront fulfillment request. It accepts only the requested store and part. A missing store, missing part or unknown pickup state raises an error, never an out-of-stock or in-stock guess.
- `playstation-direct` resolves the primary product code, constructs the public client's anonymous product-list request, and independently checks the API origin's robots.txt. It requires exact identity and public orderability. Preorders, login gates and membership gates cannot become public in-stock alerts.
- `nvidia-store` checks only the exact US Founders Edition storefront page. Marketing text or the presence of an Add to Cart button never counts as stock.
- The shared HTTP boundary preserves public HTTPS/DNS validation, pinned DNS, response-size and timeout limits, same-origin robots review, and protection detection. Each source requires the existing operator approval. Setup never grants it.
- Official sources have a minimum five-minute interval. A PostgreSQL advisory lock and shared next-check scheduling permit at most one check per provider per minute across worker processes. Each check can include a product lookup and an availability request. This conservative starting cadence is not a five-second monitoring promise.
- A protection/robots block stops all active sources for that connector, cancels their leases and prevents stale workers from committing stock. Failed checks do not change the last successful observation timestamp. Existing delivery checks reject blocked, stale or unavailable sources.
- Successful observations use the existing stock-period, entitlement, deduplication, email and web-push queue. No new synthetic customer observations are installed.
- The public stock finder prioritizes official listings and displays connection status separately from stock. ZIP search finds Apple Stores. PlayStation Direct and NVIDIA represent US **online** availability; their shipping ZIP eligibility is not verified by these adapters.

## Local setup and review

```powershell
# Report configuration only; makes no retailer requests and sends no messages.
npm run sources:official

# Prepare all eight Duo variants at up to five stores near a chosen US ZIP,
# and configure the exact PS5 Pro and RTX 5090 official source records.
npm.cmd run sources:official -- --setup --zip 10001 --limit 5
```

Setup creates paused, unapproved Apple sources and records the observed Sony/NVIDIA blocks. It preserves already approved, active, blocked or historically observed sources. It never clears a block or activates monitoring. Repeat with another ZIP to prepare additional stores; `--limit` is bounded to 1–20. This is a source-configuration command, not an inventory import. Other catalog products need their exact selected purchase URL and a validated response before being connected; catalog metadata alone is insufficient.

`/admin` supports all three connectors, fulfillment type and a US Apple Store selector. A source with stock history cannot change its product, connector or pickup location. A renderer or parser change can be inspected with fixture tests before any permitted live check. Do not enable a source while permission or the source's robots/protection restriction remains unresolved.

Email still needs a configured provider and sender. With no owned domain, Resend's default sender can only be used for limited account-owner testing; it is not a customer email launch configuration. Presence of environment values does not establish successful delivery.

## Verification boundaries

Automated tests use explicitly synthetic contract responses, including wrong SKUs/stores, unknown states, preorders, gated Sony products, blocked requests, and NVIDIA pages containing both button states. PostgreSQL integration tests cover shared provider throttling, a parsed stock observation opening one period and queuing one notification, duplicate commits, and provider blocking fencing a second worker. No test contacts a retailer or sends a real email.

Public product-page identity extraction succeeded for the downloaded Apple and PlayStation pages. No real inventory endpoint response, live restock, or real customer alert has been verified. NVIDIA remains blocked at the product-page request.

Local checkpoint: 40 paused Apple pickup records cover eight Duo variants at West 14th Street, Grand Central, SoHo, Fifth Avenue and Upper West Side. The PS5 Pro and RTX 5090 records retain the observed blocks. Browser checks confirmed ZIP 10001 results, correct official product links, and unknown/blocked status without false alert buttons for all three brands. The unit suite passed (123 tests), the added online-to-pickup rejection test passed with the official connector suite (11 tests), and all 29 PostgreSQL integration tests passed: 153 distinct passing tests. Type checking and the production build passed. Email credentials were absent; no real message was sent.
