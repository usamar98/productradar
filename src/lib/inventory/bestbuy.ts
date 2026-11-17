import { checkInterval } from "./domain";
import { PRODUCT, type CheckResult, type InventoryAdapter, type InventoryObservation } from "./types";

type BestBuyProduct = Record<string, unknown>;

export class ProductIdentityError extends Error {
  constructor() { super("Provider returned a product other than the verified RTX 5090 Founders Edition."); }
}

export function retryAfterSeconds(header: string | null, now = new Date()): number | undefined {
  if (!header) return undefined;
  const numeric = /^\d+$/.test(header.trim()) ? Number(header) : NaN;
  const seconds = Number.isFinite(numeric) ? numeric : Math.ceil((Date.parse(header) - now.getTime()) / 1000);
  return Number.isFinite(seconds) && seconds > 0 && Number.isFinite(new Date(now.getTime() + seconds * 1000).getTime()) ? seconds : undefined;
}

/** Exact SKU AND model match; broad RTX 5090 name matching is intentionally insufficient. */
export function normalizeBestBuy(input: unknown, checkedAt = new Date()): InventoryObservation {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ProductIdentityError();
  const product = input as BestBuyProduct;
  if (String(product.sku) !== PRODUCT.bestBuySku || product.modelNumber !== PRODUCT.bestBuyModel) throw new ProductIdentityError();
  const name = typeof product.name === "string" ? product.name : "";
  if (!/5090/i.test(name) || !/founders\s+edition/i.test(name) || !/^nvidia\b/i.test(name)) throw new ProductIdentityError();

  const orderable = typeof product.orderable === "string" ? product.orderable.trim().toLowerCase() : "";
  const releaseDate = typeof product.releaseDate === "string" ? Date.parse(product.releaseDate) : NaN;
  const futureRelease = Number.isFinite(releaseDate) && releaseDate > checkedAt.getTime();
  let state: InventoryObservation["state"] = "UNKNOWN";
  // The documented field is an ordering-status string, so unfamiliar values fail closed.
  if (/pre[\s_-]?order/.test(orderable) || futureRelease) state = "PREORDER";
  else if (/back[\s_-]?order/.test(orderable)) state = "BACKORDER";
  else if (/coming\s*soon/.test(orderable)) state = "UNKNOWN";
  else if (product.onlineAvailability === false || /sold\s*out|out\s*of\s*stock|not\s*available|not\s*orderable/.test(orderable)) state = "OUT_OF_STOCK";
  else if (product.onlineAvailability === true && ["available", "orderable"].includes(orderable)) state = "IN_STOCK";

  const rawPrice = product.salePrice;
  const priceCents = typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0 && !product.priceRestriction ? Math.round(rawPrice * 100) : null;
  const shipping = product.freeShipping === true ? "Free shipping indicated by retailer" : typeof product.shippingCost === "number" ? `Shipping from $${product.shippingCost.toFixed(2)}` : null;
  const pickup = product.inStorePickup === true ? "Pickup eligible; check your store at Best Buy" : product.inStorePickup === false ? "Pickup not indicated" : null;
  return {
    retailerId: "bestbuy", productIdentifier: PRODUCT.bestBuySku, sourceUrl: PRODUCT.bestBuyUrl,
    state, priceCents, currency: "USD", checkedAt, shipping, pickup,
    evidence: { source: "Best Buy Products API", sku: PRODUCT.bestBuySku, modelNumber: PRODUCT.bestBuyModel,
      onlineAvailability: typeof product.onlineAvailability === "boolean" ? product.onlineAvailability : null,
      orderable: orderable || null, releaseDate: typeof product.releaseDate === "string" ? product.releaseDate : null,
      availabilityUpdatedAt: typeof product.onlineAvailabilityUpdateDate === "string" ? product.onlineAvailabilityUpdateDate : null,
      priceRestriction: typeof product.priceRestriction === "string" ? product.priceRestriction : null },
  };
}

export function bestBuyAdapter(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): InventoryAdapter {
  const key = env.BESTBUY_API_KEY;
  const approved = env.BESTBUY_USAGE_APPROVED === "true";
  const enabled = Boolean(key && approved && env.DEMO_MODE !== "true");
  const disabledReason = env.DEMO_MODE === "true" ? "Demo mode disables all retailer requests." : !key ? "A Best Buy developer API key is required." : !approved ? "Best Buy usage and retained stock-history approval is required." : null;
  return {
    id: "bestbuy", name: "Best Buy", sourceUrl: PRODUCT.bestBuyUrl, enabled, disabledReason,
    intervalSeconds: checkInterval(env.BESTBUY_CHECK_INTERVAL_SECONDS),
    async check(): Promise<CheckResult> {
      const checkedAt = new Date();
      if (!enabled) return { ok: false, retailerId: "bestbuy", checkedAt, errorCode: "SOURCE_DISABLED" };
      // Key is server-side only. Never return/log the request URL or upstream error body.
      const url = new URL(`https://api.bestbuy.com/v1/products/${PRODUCT.bestBuySku}.json`);
      url.searchParams.set("apiKey", key!);
      url.searchParams.set("show", "sku,name,modelNumber,salePrice,priceRestriction,onlineAvailability,onlineAvailabilityUpdateDate,orderable,releaseDate,inStorePickup,freeShipping,shippingCost");
      try {
        const response = await fetcher(url, { signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error", headers: { Accept: "application/json" } });
        if (!response.ok) {
          return { ok: false, retailerId: "bestbuy", checkedAt, errorCode: response.status === 401 || response.status === 403 ? "PROVIDER_ACCESS_DENIED" : response.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_HTTP_ERROR", retryAfterSeconds: retryAfterSeconds(response.headers.get("retry-after")) };
        }
        return { ok: true, observation: normalizeBestBuy(await response.json(), checkedAt) };
      } catch (error) {
        return { ok: false, retailerId: "bestbuy", checkedAt, errorCode: error instanceof ProductIdentityError ? "PRODUCT_IDENTITY_MISMATCH" : "PROVIDER_REQUEST_FAILED" };
      }
    },
  };
}
