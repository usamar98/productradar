# Official store integrations — 17 November 2026

The stock finder now connects directly to public Apple pickup, PlayStation Direct and NVIDIA product APIs. These integrations do not use Best Buy or the competitor's inventory. A lookup records the response's actual observation time; automatic monitoring and external alert delivery are separate capabilities.

## What Store Stock Checker reveals

Its [terms](https://storestockchecker.com/legal) describe checking Apple's online store for the selected product and store's pickup availability. Its [public client](https://storestockchecker.com/app.js) calls its own catalog, store and stock APIs. The upstream collector is private: neither its specific Apple endpoint nor its permission arrangements can be established from that client. Polling Apple's pickup data and caching results is a plausible implementation, not a verified description of its backend. No competitor inventory API is reused.

## Direct operations and exact identity

| Provider | Implemented source | Interpretation |
| --- | --- | --- |
| Apple | `www.apple.com/shop/retail/pickup-message?pl=true&location=10001&parts.0=MK1E4LL%2FA` | The current response uses `body.stores`. Match the exact store number and part number. A ZIP lookup returns a limited set of stores, not every store in a radius. |
| PlayStation | `api.direct.playstation.com/commercewebservices/ps-direct-us/users/anonymous/products/productList?fields=BASIC&productCodes=1000050805` | Exact product code, `stock.stockLevelStatus`, `purchasable` and preorder state determine online stock. Sign-in or Plus requirements are purchase conditions, not missing inventory. |
| NVIDIA | `api.nvidia.partners/edge/product/search?page=1&limit=12&locale=en-us&gpu=RTX%205090&manufacturer=NVIDIA` | Require the exact US Founders Edition listing and NVIDIA's own matching seller offer. `productAvailable`, `prdStatus` and official-offer `stock` must agree. `retailers[].isAvailable` alone is listing visibility, not stock. |

All three returned usable HTTP 200 stock responses during research, reporting unavailable stock for the tested configuration at that time. Historical response fixtures do not stand in for live results. Subsequent app verification is recorded below.

NVIDIA's separate `api.store.nvidia.com/partner/v1/feinventory` request returned HTTP 403 and is not used or retried. A denied HTML page or an API gateway's missing `/robots.txt` route does not establish the behavior of every separate operation on that provider. The product API has its own successful response evidence.

`src/config/official-products.json` contains all eight iPhone Duo US unlocked part numbers, extracted from `PRODUCT_SELECTION_BOOTSTRAP.productSelectionData.products` on the [exact Apple purchase page](https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-256gb-star-white-unlocked). Each entry pairs the actual `seoUrlToken` with its part number; IDs are not guessed. Sony's code comes from the primary hero on its [PS5 Pro page](https://direct.playstation.com/en-us/buy-consoles/playstation5-pro-console). Runtime stock checks use these reviewed identities, without repeatedly fetching product HTML. Added catalog products still need reviewed exact identities and connector coverage.

## Request and persistence behavior

- `/api/radar/stock-search` performs an on-demand check for a configured exact variant. Apple supports ZIP, city and device-location searches; PlayStation and NVIDIA provide US online stock. Their APIs do not establish shipping eligibility for an individual ZIP.
- Only three fixed HTTPS API paths are allowed. Requests use the openly identified `RestockRadar/1.0` client, ordinary JSON headers, no authentication or cookies, no redirects, public DNS validation, a 20-second timeout and a 2 MB body limit. No browser impersonation, proxy rotation or challenge solving is used. Generic source crawling retains its separate DNS-pinned, robots-aware client.
- Concurrent identical searches share their work. Apple searches make at most five ZIP lookups to cover requested stores; individual-store checks use one. Shared ZIP responses are cached separately so overlapping searches do not repeat the same request. Successful results are reused for 30 seconds, retaining the original observation time. A database rate limit bounds each provider to 12 on-demand lookups per minute across application processes. This is not a five-second monitoring promise.
- HTTP 401/403/429 or a challenge response stops that connector. The error is persisted with `Inventory endpoint blocked:`; subsequent searches do not retry it. Operator review is required to resume. A failure never advances a successful stock timestamp or becomes an out-of-stock guess.
- A later transient failure preserves successful earlier batches and their individual timestamps; a protection block still stops the provider. Sources checked only by a search use `on_demand`, not `active`, and do not acquire background approval. Fresh stock is displayed for 60 seconds; the open browser then marks the snapshot stale using a local timer, without an automatic network request. An administrator pause is respected by manual checks as well. The UI states that automatic alerts are not enabled.
- Real successful responses enter the existing source/history store. Database leases and provider locks fence stale responses and blocked providers. An on-demand in-stock observation cannot enqueue a customer notification. Only an approved active source can do that.

## Background monitoring and email

The original brief requires respecting retailer terms and robots, as well as stopping on protection. Apple's site terms restrict automated monitoring; Sony's API robots disallows crawling. Public technical access alone is not a license or retailer approval. Background polling has not been enabled. A user-approved single Apple diagnostic exception after a 403 is not permission for repeated polling.

For an approved background source, the worker enforces at least five minutes between that source's polls and coordinates at most one check per provider per minute. Actual availability transitions use the existing deduplicated notification pipeline. Email still requires a configured provider and sender. No external alert delivery or restock latency is claimed by the live-check work. With no owned domain, Resend's default sender is limited to account-owner testing.

## Local setup

```powershell
npm run sources:official
npm.cmd run sources:official -- --setup --zip 10001 --limit 5
```

Setup prepares all eight Duo variants near that ZIP and the exact PS5 Pro and RTX 5090 records for on-demand checks. It does not grant background approval, overwrite history or clear an actual protection block. The stock finder adds matching Apple source records for recognized stores returned by a successful lookup. Existing research-only HTML/robots annotations can be superseded by a successful inventory operation; real inventory-operation blocks cannot.

Try `/stock?item=iphone-duo&variant=256gb-star-white&zip=10001`, `/stock?item=playstation-5-pro&variant=standard`, or `/stock?item=rtx-5090&variant=founders-edition`. Other products without mapped sources remain explicitly unknown.

## Verification

132 unit tests and 30 PostgreSQL integration tests passed. Tests cover minimal actual response shapes, synthetic positive stock, wrong products/stores, conflicting NVIDIA signals, Sony purchase gates, response limits, protection stops, provider coordination, stale-write fencing and on-demand observations not sending customer alerts. Automated tests do not contact retailers or send emails. The production build and browser checks passed. The approved single Apple diagnostic succeeded through the app: iPhone Duo 256GB Star White, ZIP 10001, 12 recognized stores returned unavailable stock at 18:44:38 UTC. The directory listed 31 stores within 50 miles; the other stores remained unknown. PS5 Pro returned out of stock at 18:45:44 UTC; RTX 5090 returned out of stock at 18:45:55 UTC. A repeated NVIDIA refresh displayed the original timestamp and “recent cached response.” Database inspection confirmed all 14 real observations, zero errors, no background approval, and zero notifications. These are observations at those times, not permanent availability claims.

All eight Duo part identities are mapped, but only the Star White 256GB configuration was live-tested in this run. 47 Apple source records and the two official online source records are prepared for on-demand use. No other catalog products are presented as verified integrations. Email credentials were absent. The isolated Stripe lab remains available separately at port 3001.

The final browser run also verified that an open NVIDIA result changes to “Check again for current stock” after 60 seconds while retaining its observation time. No browser console errors were reported. The main app and isolated test lab were left running on ports 3000 and 3001.


## Coverage verification — November 18, 2026

The expanded ZIP 10001 search returned **31 of 31 listed stores** with fresh direct Apple observations for iPhone Duo 256GB Star White, versus 12 of 31 previously. The combined responses contained 33 distinct store observations, with two outside the requested radius. All requested stores reported out of stock at the observed time. No missing store was inferred to be sold out. The browser verified pagination to all 31 stores, an individual Garden State Plaza refresh with a new timestamp, and preservation of the original search area. A final full refresh again covered 31 of 31 stores. No browser console errors were reported.

139 unit tests and 31 PostgreSQL integration tests passed, along with type checking and the production build. New tests cover geographic query planning, the five-lookup bound, missing-store reporting, immediate protection stops, partial transient failures, individual-store checks, per-request rate-limit accounting, real persistence of synthetic exact-store responses in the test database, and cache timestamps. The live app still records only actual retailer observations; background polling and external alerts remain separate.
