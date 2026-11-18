# Official store integrations — 17 November 2026

The stock finder now connects directly to public Apple pickup, PlayStation Direct and NVIDIA product APIs. These integrations do not use Best Buy or the competitor's inventory. A lookup records the response's actual observation time; automatic monitoring and external alert delivery are separate capabilities.

## Background inventory for US stores

Apple pickup and NVIDIA's US Founders Edition listings support shopper-initiated checks in this project. Their public website terms restrict automated monitoring. A merchant-supplied inventory stream can report changes through the existing signed endpoint without any visitor traffic. [Apple website terms](https://www.apple.com/legal/internet-services/terms/site.html) · [NVIDIA website terms](https://www.nvidia.com/en-us/about-nvidia/terms-of-service/) · [Inventory webhook](restock-emails.md)

PlayStation Direct offers approved partners a product feed. After joining the US campaign, set `PARTNERIZE_APPLICATION_KEY`, `PARTNERIZE_USER_API_KEY`, `PARTNERIZE_PUBLISHER_ID` and `PARTNERIZE_PLAYSTATION_CAMPAIGN_ID` in the web app and worker environments. Run `npm run sources:playstation -- --list` to list the active feeds available to that publisher. Download links and credentials stay private. [PlayStation Direct partner program](https://direct.playstation.com/en-us/playstation-affiliate-programme) · [Partnerize feed discovery API](https://api-docs.partnerize.com/partner/)

Select the US feed in `PARTNERIZE_PLAYSTATION_FEED_ID`. Set `PARTNERIZE_STOCK_COLUMNS` to a JSON object mapping `sku`, `link`, `availability` and `observedAt` to the actual merchant headers. If the feed uses different stock values, also map `inStock` and `outOfStock` to those exact strings. `observedAt` must be the merchant's inventory timestamp with a timezone. Confirm the feed provides explicit orderable stock for the exact Sony SKU before mapping the fields. Partnerize preserves the merchant's file format. This importer reads uncompressed CSV, TSV and PSV files up to 2 MB. [Partnerize feed formats](https://help.phgsupport.com/hc/en-us/articles/5274612958621-Onboarding-FAQ-s)

Apply migrations and run the worker. It discovers the assigned feed at the configured interval (five minutes by default), matches both SKU and US store link and records observations up to five minutes old. Feed processing time identifies a file edition. It cannot establish when Sony observed stock. A missing row, unknown stock value, stale timestamp or first in-stock snapshot cannot trigger a restock alert. Per-product pauses persist. `npm run sources:playstation` shows the scheduler result. After the provider restores access or a changed file schema has been reviewed, `npm run sources:playstation -- --resume` establishes a new baseline.

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

`src/config/official-products.json` contains all eight iPhone Duo US unlocked part numbers, extracted from `PRODUCT_SELECTION_BOOTSTRAP.productSelectionData.products` on the [exact Apple purchase page](https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-256gb-star-white-unlocked). Each entry pairs the actual `seoUrlToken` with its part number; IDs are not guessed. Sony's code comes from the primary hero on its [PS5 Pro page](https://direct.playstation.com/en-us/buy-consoles/playstation5-pro-console). Runtime stock checks use these reviewed identities, without repeatedly fetching product HTML. The November 18 catalog expansion below adds reviewed identities for every Apple product, more Sony listings and the other NVIDIA Founders Edition cards.

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

Setup prepares all reviewed configurations near that ZIP: 242 Apple configurations across 24 products, 19 Sony configurations and three NVIDIA Founders Edition cards. It does not grant background approval, overwrite history or clear an actual protection block. The stock finder adds matching Apple source records for recognized stores returned by a successful lookup. Existing research-only HTML/robots annotations can be superseded by a successful inventory operation; real inventory-operation blocks cannot.

Try `/stock?item=iphone-duo&variant=256gb-star-white&zip=10001`, `/stock?item=playstation-5-pro&variant=standard`, or `/stock?item=rtx-5090&variant=founders-edition`. Nine custom Mac configurations are explicitly directed to Apple because the pickup operation does not resolve their composite configuration identifiers. Other products without mapped sources show the coverage reason.

## Verification - initial three-product checkpoint, November 17

132 unit tests and 30 PostgreSQL integration tests passed. Tests cover minimal actual response shapes, synthetic positive stock, wrong products/stores, conflicting NVIDIA signals, Sony purchase gates, response limits, protection stops, provider coordination, stale-write fencing and on-demand observations not sending customer alerts. Automated tests do not contact retailers or send emails. The production build and browser checks passed. The approved single Apple diagnostic succeeded through the app: iPhone Duo 256GB Star White, ZIP 10001, 12 recognized stores returned unavailable stock at 18:44:38 UTC. The directory listed 31 stores within 50 miles; the other stores remained unknown. PS5 Pro returned out of stock at 18:45:44 UTC; RTX 5090 returned out of stock at 18:45:55 UTC. A repeated NVIDIA refresh displayed the original timestamp and “recent cached response.” Database inspection confirmed all 14 real observations, zero errors, no background approval, and zero notifications. These are observations at those times, not permanent availability claims.

All eight Duo part identities are mapped, but only the Star White 256GB configuration was live-tested in this run. 47 Apple source records and the two official online source records are prepared for on-demand use. No other catalog products are presented as verified integrations. Email credentials were absent. The isolated Stripe lab remains available separately at port 3001.

The final browser run also verified that an open NVIDIA result changes to “Check again for current stock” after 60 seconds while retaining its observation time. No browser console errors were reported. The main app and isolated test lab were left running on ports 3000 and 3001.


## Coverage verification — November 18, 2026

The expanded ZIP 10001 search returned **31 of 31 listed stores** with fresh direct Apple observations for iPhone Duo 256GB Star White, versus 12 of 31 previously. The combined responses contained 33 distinct store observations, with two outside the requested radius. All requested stores reported out of stock at the observed time. No missing store was inferred to be sold out. The browser verified pagination to all 31 stores, an individual Garden State Plaza refresh with a new timestamp, and preservation of the original search area. A final full refresh again covered 31 of 31 stores. No browser console errors were reported.

139 unit tests and 31 PostgreSQL integration tests passed, along with type checking and the production build. New tests cover geographic query planning, the five-lookup bound, missing-store reporting, immediate protection stops, partial transient failures, individual-store checks, per-request rate-limit accounting, real persistence of synthetic exact-store responses in the test database, and cache timestamps. The live app still records only actual retailer observations; background polling and external alerts remain separate.


## Full Apple catalog and online-store expansion — November 18, 2026

`official-products.json` now records 242 exact pickup identities across all 24 Apple products in this catalog. Each mapping records its product and variant slugs, selected purchase URL, part number, full configuration label, evidence URL and review date. Apple purchase-page bootstraps and exact selected-page Product/Offer metadata supply the identities. The official [Apple hardware catalog](https://www.apple.com/education/purchase/contracts/docs/NASPO_PSS_Apple_Branded.pdf) supplies independently matched MacBook Neo and factory Watch bundle identifiers. This document contains metadata, never live inventory.

Watches now expose the actual band and band size included in each checked configuration. US product parts include `LS/A` Watch and `AM/A` audio identifiers as well as `LL/A`. The connector accepts only exact reviewed purchase URLs, including Watch's selected-product query and Apple TV's single-product purchase page. Generic URLs and unreviewed query parameters cannot become inventory sources.

Nine documented Mac options have composite custom-order identifiers rather than a standard part: the six M6 MacBook Pro 2TB options and three 10-core iMac colors (yellow, purple, orange). A direct request for the selected custom Mac identifier returned HTTP 200 with empty content, not store availability. These options keep their exact Apple links and an explicit custom-configuration message. They never borrow stock from a standard Mac.

Sony mappings now include PS5 standard/disc/digital and Pro consoles, Portal, DualSense Edge, selected limited-edition controllers, audio, Access, monitor and a Wolverine cover configuration (19 configurations total). Identity comes from matching Sony's own catalog-card product code and purchase link to the exact API product name. NVIDIA's 5090, 5080 and 5070 Founders Editions use the official exact-offer stock contract. Partner-only GPUs are explicitly distinguished from NVIDIA's own stock; no aggregate retailer listing is counted as NVIDIA availability.

After seeding catalog metadata, run `npm.cmd run sources:official -- --setup --zip 10001 --limit 1`. One initial store is enough to register each Apple configuration; live searches add only stores actually returned by Apple. Setup preserves observations, history, provider blocks and operator pauses. It upgrades only untouched legacy catalog placeholders, and never approves automatic monitoring or sends an alert.


The expanded app passed **37 live checks**: one configuration from each of the 24 Apple products, ten Sony configurations and all three NVIDIA Founders Editions. A browser MacBook Air ZIP 10001 search checked all 31 nearby stores and returned 27 in stock. All results were actual direct observations, with no provider errors or notifications. **150 unit tests, 31 PostgreSQL integration tests and the production build passed.** See the [dated verification record](official-stock-verification-2026-11-18.md) for configurations, observation times, browser checks and limits.
