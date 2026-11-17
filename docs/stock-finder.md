# ZIP stock finder and first free alert

The checker at `/stock` accepts an exact product/configuration, a US ZIP or ZIP+4, city/store text, or optional device coordinates. Apple products use the pickup view by default. PlayStation and NVIDIA default to online listings. Manual checking requires no account. Home and product pages link to the checker and preserve the selected configuration.

## Location data and inventory are separate

`src/config/stores.json` contains **269 US Apple Stores**, imported on November 17, 2026 from the [official Apple directory](https://www.apple.com/retail/storelist/) and each store's public structured data. It includes official store IDs, addresses, coordinates and links, but no inventory. The repeatable importer is `node scripts/import-apple-stores.mjs`; it uses two concurrent ordinary requests and stops on failed responses. Its download cache stays in ignored `.local/store-directory`.

ZIP coordinates come from `https://api.zippopotam.us/us/{zip}` with a six-second timeout and a one-day bounded in-process cache. ZIP+4 normalizes to the first five digits; leading zeroes are retained. The lookup checks country, postal code, coordinate ranges and response size. Distances are Haversine straight-line distances from the ZIP centroid or supplied coordinates. They are not driving distances. City/store-only searches do not invent a distance.

Device location is requested only after clicking **Use my location**. The browser sends coordinates to this app's search endpoint; the endpoint does not persist the search or coordinates in the user's account. Search responses are private/no-store. The optional directions link opens Google Maps. The privacy page explains these data flows.

An inventory adapter must explicitly supply `RadarSource.fulfillment = "pickup"`, `locationId` matching a directory ID (for example `apple-r095`), the exact `variantId`, and a truthful pickup observation. The database migration adds these fields; existing sources default to `online`. A generic online listing is never a pickup observation. Only approved active sources are alertable. On-demand observations become stale after 60 seconds; approved background observations use the larger of two minutes or three poll intervals. Errors make either stale. Missing, paused and mock observations do not count as verified stock. An on-demand source can display fresh stock without becoming alertable.

The endpoint returns the bounded complete matching directory (at most 269 entries). The client filters before paginating in groups of 30, so an in-stock result cannot disappear merely because it was outside the first page. Rapid requests abort and discard old responses. Product/configuration changes clear old results. A missing inventory connection is shown as unknown, not sold out.

US Apple is the implemented physical-store coverage. There is no PlayStation/NVIDIA physical-store inventory integration or international directory. Official manufacturer links remain available. Official adapters now support exact Apple pickup configuration, PlayStation Direct product parsing and NVIDIA product API responses, with the upstream restrictions described in the [integration report](official-store-integrations.md). Configured core products are checked directly on request with a 30-second result cache. Actual endpoint protection blocks stop further checks. Background polling and external alerts remain separate; the competitor's inventory API is not reused.

## Free offer and activation

- One claim per verified account email: one exact configuration, one eligible source, 14 days from activation, $0, no card and no renewal.
- `POST /api/radar/free-alert` validates the source and creates/reuses an unverified draft. It sends a ten-minute, single-use confirmation link. An authenticated owner can activate directly.
- Loading the confirmation page does not start monitoring. Its explicit button calls `PUT /api/radar/free-alert`, validates the token hash and purpose, rechecks source eligibility, creates the free entitlement and sets the normal account session.
- A per-email database transaction lock and unique `free:{userId}` provider reference prevent concurrent or repeated claims. Resending replaces the old token. Pausing or expiry does not replenish the offer.
- Failed or unconnected source selection does not consume the offer. No Stripe checkout, charge or payment row is created for the free plan. Paid checkout still accepts only paid plan IDs, and a free entitlement does not interfere with paid upgrades.
- This is an email-based limit, not a verified-person limit; someone with multiple addresses can create multiple accounts. Production abuse monitoring may justify additional controls later.

Email transport and a strong `RADAR_AUTH_SECRET` are required. The isolated lab uses captured emails; a hosted service needs a configured sender. Browser push still requires VAPID keys and explicit browser consent. The free offer uses the existing worker/delivery/expiry rules.

## Verification

The automated coverage includes ZIP validation and provider failures, distance/radius filtering, exact store/source matching, freshness, token scope/expiry, verification before entitlement, concurrent/replayed confirmations, invalidated resend links, source pauses and non-renewable claims. Browser checks cover ZIP and city search, pagination, in-stock filtering, configuration continuity, free activation and a captured simulated restock. See [the lab guide](local-testing.md) for commands and scope.
