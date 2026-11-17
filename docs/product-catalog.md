# Product catalog: implementation and maintenance

The catalog snapshot reviewed on **November 17, 2026** contains **49 products and 290 curated configurations**. The inclusive launch window is **November 17, 2025–November 17, 2026**; it is a recorded research window, not a date range that advances automatically.

| Brand | Products | Configurations | Launches within the window |
| --- | ---: | ---: | ---: |
| Apple | 24 | 251 | 24 |
| PlayStation | 18 | 31 | 10 |
| NVIDIA | 7 | 8 | 0 |
| Total | 49 | 290 | 34 |

Older core PlayStation models and the NVIDIA desktop RTX 50-series lineup retain their actual launch dates and appear as earlier releases. NVIDIA partner board designs and software feature updates are not relabeled as new GPU models. A launch date does not establish current retailer availability.

## Customer flow

The product directory leads to `/brands/apple`, `/brands/playstation` and `/brands/nvidia`. Each brand hub supports product-family and launch-period filters, product/feature search, and comparison of up to three products. A product page then presents its features, launch reference and configuration choices.

Configuration controls select an explicit, documented variant. Changing an option preserves as many of the other selected values as possible while choosing a valid combination. The selected product and variant slugs are carried to `/alerts?item=…&variant=…`; an unrelated product's variant or source cannot silently become the selected source. Checkout still requires an eligible configured source. Choosing a product does not activate monitoring or reserve stock.

These configurations are a curated set, not the manufacturer's complete configure-to-order catalog. Do not generate variants by freely multiplying independent option lists: memory, chip, size, glass, connectivity or accessory choices may constrain one another. Catalog variant slugs are application identifiers, not manufacturer part numbers. Confirm additional custom choices with the manufacturer.

## Files and stable identities

- `src/config/launches/{apple,playstation,nvidia}.json` stores product identity, category, dated launch evidence, features, official references, image provenance, options and valid variant tuples. A variant can supply its own documented image.
- `src/config/launch-catalog.ts` combines these records and supplies brand metadata, date formatting, launch-window checks and stable database ID helpers.
- `src/lib/radar/configuration.ts` resolves valid configuration changes. `src/components/radar/brand-catalog.tsx` and `product-experience.tsx` render discovery and selection.
- `src/config/radar-catalog.ts` supplies metadata previews when the database is unavailable or empty. `src/lib/radar/product-content.ts` and `product-visuals.ts` supply guides, category descriptions and imagery.
- `prisma/seed.ts` registers catalog items and variants without creating stock observations. Reruns preserve existing source settings and relations.

Keep existing identifiers stable: the eight `iphone-duo-*` variant IDs, `ps5-pro` / `ps5-pro-standard`, and `rtx-5090` / `rtx-5090-standard`. The RTX 5090 variant slug remains `founders-edition`; its older database ID intentionally remains unchanged.

All **46 added products have no stock sources**. The original three products retain **14 ordinary sources, paused and unapproved** at this checkpoint. Manufacturer product references are informational links, not exact-variant inventory feeds. The seed does not turn those references into active sources, prices, offers, stock history, payments or notifications. The separate Stripe lab continues to use eight controlled iPhone Duo sources; see [local testing](local-testing.md).

## Updating the catalog

1. Verify a product's identity, US launch evidence, features and valid option combinations against manufacturer sources. Record exceptions such as order dates versus retail dates in the brand research document.
2. Add or update the brand JSON record with stable slugs and explicit variant attributes. Keep every option represented in each variant, and avoid duplicate attribute combinations.
3. Preserve date precision. RTX 5050 uses `2025-07-01` only as a month sorting anchor with `launchDatePrecision: "month"` and `launchLabel: "July 2025"`; never present July 1 as its verified release day. Keep any other documented date labels and qualifications.
4. Save an appropriate official image under `public/images/launches`, recording its source URL and meaningful alt text. A promotional scene must not imply that pictured accessories or a whole PC are included. Do not substitute another model's photograph.
5. Add specific category guidance in `product-content.ts` when introducing a category. If advancing the research window, update `launchWindow`, the displayed window text, tests and research notes together.
6. Run `npm run typecheck`, `npm test`, `npm run test:integration` against the dedicated integration database, and `npm run build`. Inspect the affected hub, product, configuration and alert-selection flow. Apply `npm run db:seed` to the intended application database after reviewing the metadata changes; do not delete existing catalog rows to refresh them.

Inventory integration is a separate step: it needs a suitable source mapped to the exact variant and fulfillment being checked. Adding catalog metadata alone cannot establish stock or permit checkout for an unconfigured product.

## Research references

- [Apple launch research](apple-launch-research.md): 24 products, configuration constraints and date exceptions.
- [PlayStation launch research](playstation-launch-research.md): recent editions, older core hardware and compatibility notes.
- [NVIDIA launch research](nvidia-launch-research.md): seven GPU models, documented memory/edition choices and partner-board scope.

## Verification checkpoint

The November 17, 2026 expansion passed TypeScript checking, a production build, **104 unit tests and 23 integration tests (127 total)**. HTTP verification covered all three brand routes, all 49 product pages and one variant route for each product, the complete sitemap, canonical metadata, Product JSON-LD and images. Structured data did not fabricate offers. Database checks validated all 290 configurations and confirmed the source counts above.

Browser verification covered Apple Mac filtering and comparison, brand-navigation state reset, the PlayStation recent-launch filter showing 10 products, and the DualSense Wolverine controller's Adamantium configuration/image switch. Selecting M5 Ultra on Mac Studio selected the valid 96GB / 1TB combination and carried it to the exact alert form. RTX 5060 Ti 16GB / 8GB selections produced the matching alert links. NVIDIA's past-year filter correctly showed no verified launches. The Apple hub and NVIDIA configuration page had no horizontal overflow at 390px, and no browser console errors were observed. A local screenshot is saved at `.local/expanded-product-catalog.jpg`; the app was left open at `/products`.

This checkpoint does not claim that every configuration was exercised interactively. Earlier Stripe checkout, webhook and notification verification is recorded separately in [local testing](local-testing.md).
