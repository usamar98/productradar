# Store Stock Checker: case study and Restock Radar decisions

Research date: November 17, 2026. This is a public-source review, not access to the competitor's analytics, costs, customer records or source code.

## What the revenue claim establishes

TrustMRR currently displays **$34,544 all-time revenue**, **$34,545 monthly recurring revenue**, **4,529 active subscriptions**, an October 2026 founding date and verification through a Stripe API connection. Revenue, MRR and profit are different measures. Founding month does not establish the exact public launch day. The listing's acquisition-channel tags do not show how many paying customers came from search. We cannot conclude that SEO generated $34k, or that this amount is profit. [TrustMRR listing](https://trustmrr.com/startup/store-stock-checker)

## Product and commercial model

The company sells stock-monitoring subscriptions; customers buy hardware from Apple. Its homepage gives visitors a free availability check and offers alerts for a specific buying need. Our inference is that urgency and a clear purchase outcome make this a strong subscription entry point, but churn after a successful purchase, acquisition cost and margins are unknown. [Store Stock Checker](https://storestockchecker.com/)

The signup sequence retains the selected product and configuration, then asks for stores, email verification, notifications and a plan. Its $5/$10/$20 monthly plans offer 2/5/10 alerts. Restock Radar's retailer-slot pricing is a different unit and should keep its own explicit definition. [Signup](https://storestockchecker.com/start)

A November 16 announcement adds a $49/month Team plan with unlimited product alerts, 25 stores and Discord/Slack delivery. This expands the target customer beyond an individual shopper. It is a potential later feature, not evidence that chat integrations caused the reported growth. [Team plan announcement](https://storestockchecker.com/discord-slack-alerts)

## SEO architecture and why the pages are useful

| Search need | Observed competitor page | Decision for Restock Radar |
| --- | --- | --- |
| Find a product | The [iPhone Duo hub](https://storestockchecker.com/iphone-duo) connects stock, configurations, locations and history. | Add a visible products directory and product links across navigation, homepage and footer. |
| Find an exact configuration | A [variant page](https://storestockchecker.com/iphone-duo/256gb-star-white) has its own title, selected configuration, sibling links and stock results. | Add variant-specific views and preserve the choice through alert setup. Index only when there is useful independent content or observed data. |
| Buy from a particular source | The [Fifth Avenue page](https://storestockchecker.com/iphone-duo/near/fifth-avenue-new-york-ny) contains store history, variant availability and official directions. | Improve the existing retailer pages and keep each source paired with its actual variant. |
| Find nearby availability | The [New York City page](https://storestockchecker.com/iphone-duo/in/new-york-city) lists 24 stores, distances and local observations. | Defer geography pages until our database contains actual locations and inventory. A city-name substitution would not deliver this value. |
| Understand restock behavior | The [restock report](https://storestockchecker.com/iphone-duo/restocks) shows time patterns and durations, explains its sampling and event definition, and invites attribution. | Publish our own observation coverage, timestamps and counting method. Calculate patterns only from our own records. A useful dataset may earn citations; this review did not measure backlinks. |
| Decide how to buy | The [buying guide](https://storestockchecker.com/how-to-get-iphone-duo) connects practical steps with stock, stores and supporting evidence. | Write original product-specific guidance with manufacturer links and clear monitoring limits. |
| Compare tools | The [comparison page](https://storestockchecker.com/best-iphone-stock-tracker) discloses ownership and discusses alternatives. | Defer a public comparison until we can substantiate our own operating performance and maintain the claims. |

The second [MacBook product hub](https://storestockchecker.com/macbook-pro-proled) demonstrates how one service can expand its catalog while sharing onboarding and navigation. The [AI-readable directory](https://storestockchecker.com/llms.txt) is another discovery aid, but its existence alone proves no search ranking or AI citation benefit.

## Trust, links and acquisition

The competitor's [reviews page](https://storestockchecker.com/reviews) links claimed customer successes to original social posts. Restock Radar should use its own dated deliveries and customer evidence; competitor testimonials cannot become ours. Its [published terms](https://storestockchecker.com/legal) describe referral incentives and clarify inventory coverage. Those mechanisms are observable, but their conversion rate is not.

For our project, “add links” means useful internal paths between products, variants, retailers, guides and history, plus official manufacturer references. External link acquisition would require separate work: publish a genuinely useful dataset, make its definitions clear, then share it with relevant communities with appropriate disclosure. This change does not buy links, fabricate endorsements or post messages on the user's behalf.

## Additional product: iPhone Duo

Apple confirms Night Sky and Star White in 256GB, 512GB, 1TB and 2TB configurations: eight variants. [Apple specifications](https://www.apple.com/iphone-duo/specs/)

The US shop has distinct carrier-later configuration URLs. These identify catalog choices; a visible purchase page does not prove in-stock pickup availability. We will seed the eight exact URLs, link Apple's buying information, and show **tracking pending** until a validated inventory integration supplies the exact variant and fulfillment context. [Apple shop](https://www.apple.com/shop/buy-iphone/iphone-duo)

## Local implementation priorities

1. Discoverability: product directory, category navigation, homepage product cards, contextual links and visible breadcrumbs.
2. Accuracy: unique canonical metadata, social preview images, consistent structured data and indexability rules. Keep empty observation pages out of the sitemap until they have data.
3. Configuration continuity: exact variant pages, correct retailer/source pairing and selected variant retained in alert setup.
4. Editorial usefulness: product-specific buying guidance, official references and a public explanation of observation coverage and freshness.
5. Validation: test route behavior, canonical tags, sitemap membership, variant selection, hidden products, mobile layout and existing payment/worker regressions.

## What remains unproven and how to measure it

Rendered headings, page content and links were inspected. The initial review could not retrieve raw HTML, sitemap or robots reliably; the follow-up below subsequently retrieved selected public HTML, JavaScript and robots rules. It did not validate the entire sitemap or structured-data implementation. We did not measure traffic, rankings, backlinks, Core Web Vitals, conversion rates or retention. No numeric SEO score is justified by this evidence.

Once hosted with real inventory, use Search Console for indexed URLs and search impressions/clicks. Measure landing page → alert setup → checkout → first delivered alert and retain the original landing path with an appropriate privacy policy. Review failed checks, time to delivery, refunds and retention alongside revenue. These are proposed measures, not claims of instrumentation already installed or targets inferred from the competitor.

## Public-code inspection: November 17, 2026

Four ordinary public requests retrieved the [homepage](https://storestockchecker.com/), [client JavaScript](https://storestockchecker.com/app.js), [robots rules](https://storestockchecker.com/robots.txt) and [256GB Star White page](https://storestockchecker.com/iphone-duo/256gb-star-white). The client requests its own `/api/catalog`, `/api/stores`, `/api/stock` and `/api/near` routes. Its stock presentation uses product part numbers, store identifiers, availability states and check timestamps. Those interfaces show how the browser consumes inventory; they do not reveal how the server obtains it.

The frontend refreshes stock displays approximately every 20 seconds, but that is not evidence of the upstream collector's polling rate. Cloudflare response headers and worker-related comments suggest part of the serving infrastructure; they do not identify an inventory provider. Localhost-only mock paths in the script are development facilities, not evidence that public production data is simulated. [Public client script](https://storestockchecker.com/app.js)

Robots disallows `/api/`; no competitor inventory API was queried or reused. No direct Apple inventory endpoint, credentials or reusable authorized feed was found in the inspected public assets. The technical conclusion is limited: the competitor serves inventory through a private backend, and reverse-engineering its public interface does not provide our app with an equivalent data supply. [Robots rules](https://storestockchecker.com/robots.txt)

Restock Radar therefore keeps ordinary Apple sources paused. Its separate [local lab](local-testing.md) uses explicitly simulated stock alongside Stripe sandbox checkout and local email capture. A live connector still requires an appropriate inventory source and permission consistent with the original brief and [Apple's website terms](https://www.apple.com/legal/internet-services/terms/site.html).

## Functional walkthrough and gap review — November 17, 2026

The second review used the public homepage, product hub, restock report, signup and Team announcement. In a browser, the signup was advanced through iPhone Duo → Star White → 256GB → ZIP **10001** → nearby stores → email entry. The ZIP search returned ten nearby choices and selected the nearest three by default. No email, account or payment was submitted to the competitor. Its country selector contained 25 countries. Later signup steps and paid delivery behavior were reviewed from public descriptions; they were not exercised as a paying customer.

The distinction in the free offer matters: the competitor allows free manual stock checks, while its signup explicitly says **“No free trial.”** A free first alert is our requested offer, not a claim about its pricing. Restock Radar now grants one verified email a $0 alert for one exact configuration at one connected source for 14 days, with no card or renewal. [Competitor signup](https://storestockchecker.com/start)

| Capability | Public competitor behavior | Restock Radar after this change |
| --- | --- | --- |
| Location discovery | ZIP/postcode, city/store and device location; distance-sorted stores | US ZIP/ZIP+4, city/store search, explicit device-location action, four radii, directions and official links; 269 US Apple Stores |
| Exact product selection | Product, finish, capacity, then stores | Existing 49-product catalog feeds the checker; exact configuration and source continue into alert signup |
| Manual availability | Store-specific status and timestamps; in-stock filter | Free checker separates pickup from online inventory, filters all matching results, and displays fresh, stale or unknown states; core official products now have on-demand direct API checks |
| Store scope | Several stores selected in onboarding | First free alert covers one store/source; paid 2/5/10-slot plans retain multiple-source selection |
| Email verification | Six-digit email code before alert setup continues | Single-use, ten-minute email link with a deliberate confirmation button; monitoring starts only after verification |
| Free entry point | Manual checks free; no free trial advertised | Manual checks plus the requested first free 14-day alert |
| Notifications | Email, browser push and advertised speed claims | Existing email/push pipeline; free alert tested through the worker and local inbox. External delivery and timing have not been verified |
| Payments and account | Stripe plans and account management | Existing Stripe sandbox checkout, webhook activation, portal, alert pausing; free plan bypasses payment and never renews |
| Restock evidence | Store/configuration history and reports | Existing event history, coverage, freshness and proof pages; no simulated records presented as live customer proof |
| Search pages | Product/configuration/store/city guides and links | Existing product/configuration/retailer/guide links plus `/stock`; no empty city pages generated just to target keywords |
| International coverage | Country selection beyond the US | Not connected; the new physical-store directory is explicitly US Apple only |
| Team delivery | $49/month Discord/Slack integration with store limits | Not implemented; needs real OAuth apps, channel authorization and its own billing/entitlement work |

The most consequential remaining gap is inventory collection. A directory identifies a store; it does not prove that a particular configuration can be collected there. A ZIP also does not prove delivery eligibility. The implementation therefore matches pickup inventory only to an explicit store ID and exact variant. Paused sources cannot issue a free alert and do not consume the offer. No manufacturer-wide online result is reused as a physical store's stock.

The homepage's polling/delivery speed claims, customer anecdotes and TrustMRR figures do not establish our achievable performance or the competitor's private collection method. Full parity is not established by this review. Remaining work includes permitted continuous monitoring, broader product coverage, international data, external email/push delivery validation and Team integrations. [Homepage](https://storestockchecker.com/), [Team announcement](https://storestockchecker.com/discord-slack-alerts)

See [stock finder and free-alert implementation](stock-finder.md) for directory provenance, freshness rules, setup and maintenance, and [local testing](local-testing.md) for the reproducible flow.

The follow-up [official-store integration investigation](official-store-integrations.md) records the public Apple/PlayStation endpoint discovery, the competitor backend boundary, verified public API responses, exact matching, request limits, robots/protection constraints, and the direct checks now implemented. It does not establish how the competitor privately collects stock.
