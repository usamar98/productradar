# Retailer source verification

Researched **2026-11-16**. Product identity and documentation were verified on official pages. **No credentialed live inventory request has been verified.** Neither retailer is enabled in the default configuration, and this project must not sell live stock tracking until the provider acceptance checks below pass. Search-engine snippets and manually viewed product pages are not inserted into inventory history.

## Product identity

| Source | Exact identifier | Official purchase page |
| --- | --- | --- |
| Best Buy US | SKU `6614151`; model `900-1G144-2530-000` | [RTX 5090 Founders Edition](https://www.bestbuy.com/product/nvidia-geforce-rtx-5090-founders-edition-32gb-gddr7-pci-express-5-0-graphics-card-dark-gun-metal/J3GWYHGPCP/sku/6614151) |
| NVIDIA US Marketplace | MPN `NVGFT590`; title explicitly identifies Founders Edition | [RTX 5090 Founders Edition](https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/) |

These two retailers use different identifiers. The application does not treat arbitrary RTX 5090 cards as equivalent and has no third-party-card adapters.

## Best Buy: documented candidate, disabled until approved and tested

The [official Products API documentation](https://bestbuyapis.github.io/api-documentation/) documents a single-product JSON endpoint, API-key authentication, SKU/model fields, `salePrice`, `priceRestriction`, `onlineAvailability`, `orderable`, `releaseDate`, shipping cost/free shipping, and pickup eligibility. Store-specific availability needs a Stores API query; this MVP only reports general pickup eligibility. An online purchase flag does not guarantee delivery to a specific address.

The implementation requests `GET https://api.bestbuy.com/v1/products/6614151.json` with a server-held key. It verifies SKU, model, manufacturer and edition. Preorder/future-release and backorder indicators take precedence; only `onlineAvailability=true` with a recognized positive ordering status becomes in stock. Unexpected ordering values remain unknown until real-response contract review. Restricted or missing prices stay unknown. Source errors preserve the previous observation.

The [API terms and operational policy](https://developers.bestbuy.com/legal) publish 50,000 calls/day and 5 calls/second, require source attribution and their provided logo, and generally limit cached content to 72 hours. Developer registration is necessary. This paid-alert product's storage/history use needs provider confirmation before operation. Configuration `BESTBUY_USAGE_APPROVED=true` is an operator attestation that the required permission, including retention, has been obtained; it is not itself permission.

Project scheduling is deliberately conservative: one shared request every 300 seconds by default, configurable with a 60-second minimum. HTTP 403/429 trigger backoff; no proxies, key rotation, private cart APIs, or challenge bypass are implemented. The quoted quota is a ceiling, not a freshness or availability guarantee. Account-specific quotas and provider guidance take priority.

Required configuration: `BESTBUY_API_KEY`, `BESTBUY_USAGE_APPROVED=true`, and approved retention requirements recorded by the operator. Before making that attestation, verify required attribution and the official [provided Best Buy logo](https://developer.bestbuy.com/images/bestbuy-logo.png) render beside API data. Keep the source disabled if permission is denied or required branding cannot be displayed. Do not turn it on merely to populate a demo.

## NVIDIA: disabled

The [official product page](https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/) confirmed the exact edition and MPN. Its extracted page contained both “Add to Cart” and “Out of Stock”; therefore the cart text is not reliable inventory evidence. This research found no documented, approved public inventory API for this product. No pickup or shipping availability is asserted.

NVIDIA's [current official terms](https://www.nvidia.com/en-us/about-nvidia/legal-info/) restrict automated monitoring in section 3.2. The adapter deliberately performs no requests and remains disabled pending written authorization or an approved feed. Marketplace frontend endpoints are not treated as public APIs. Checking cadence, credentials, price and fulfillment semantics must be established with the provider before implementing an approved integration.

## Activation and verification checklist

1. Obtain Best Buy developer credentials and confirmation that paid alerts and the implemented retention are permitted. Apply any required retention/branding conditions before activation.
2. Configure the approved adapter and run the separate worker. Examine a genuine stored response and compare the exact identifier, orderability, price, shipping and pickup fields to the official purchase page. Unknown statuses require adapter review, never guessing.
3. Verify a genuine unavailable-to-available transition through event matching, one durable notification job per recipient/channel, delivery, and dashboard history. Test provider denial, expiry, recovery and rate limiting in the provider-supported environment.
4. Complete authentication, Stripe test webhooks, email-domain and Web Push verification. Record operational approval before enabling live checkout.

Unit-test fixtures are synthetic and isolated under `tests/`. They validate logic only, and are not evidence that either live retailer integration has been established. Until credentials and approval are available, the full genuine-observation-to-delivery acceptance test remains blocked.
