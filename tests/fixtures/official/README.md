# Official response fixtures

Minimal fields retained from successful anonymous HTTPS responses observed on 17 November 2026:

- Apple: `www.apple.com/shop/retail/pickup-message`, US ZIP 10001, exact part `MK1E4LL/A`, store `R095`. The current schema is `body.stores`, not the older fulfillment message wrapper.
- PlayStation: `api.direct.playstation.com/commercewebservices/ps-direct-us/users/anonymous/products/productList`, product `1000050805`.
- NVIDIA: `api.nvidia.partners/edge/product/search`, locale `en-us`, GPU `RTX 5090`, manufacturer `NVIDIA`. Only the official seller entry is retained.

All three captured responses reported unavailable stock. These are historical parser fixtures, never live stock or database seed inputs. Positive stock cases are explicitly synthetic tests. No account data, cookies or authentication tokens are retained.

The reviewed Apple part mapping in `src/config/official-products.json` comes from the unlocked entries in `PRODUCT_SELECTION_BOOTSTRAP.productSelectionData.products` on Apple's exact iPhone Duo 256GB Star White purchase page. `seoUrlToken`, `dimensionCapacity`, `dimensionColor` and `partNumber` identify all eight configurations independently. The PlayStation code comes from that console's primary `productHero-component` attribute. These are stable product identities, not stored availability.
