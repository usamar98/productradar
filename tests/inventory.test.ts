import { describe, expect, it, vi } from "vitest";
import { bestBuyAdapter, normalizeBestBuy, ProductIdentityError, retryAfterSeconds } from "../src/lib/inventory/bestbuy";
import { applyCheck, checkInterval, eligibleForAlert, isRestock, isStale, notificationDedupeKey } from "../src/lib/inventory/domain";
import { inventoryAdapters } from "../src/lib/inventory";
import { PRODUCT } from "../src/lib/inventory/types";

// Test-only fixtures. These are never imported into runtime or seeded as observations.
const now = new Date("2026-11-16T12:00:00Z");
const product = { sku: 6614151, modelNumber: PRODUCT.bestBuyModel, name: "NVIDIA - GeForce RTX 5090 Founders Edition", onlineAvailability: true, orderable: "Available", salePrice: 1999.99, releaseDate: "2025-01-30" };
const stock = () => normalizeBestBuy(product, now);

describe("verified identity and availability", () => {
  it("accepts only the verified SKU, model, manufacturer and edition", () => {
    expect(stock().state).toBe("IN_STOCK");
    expect(stock().priceCents).toBe(199999);
    for (const wrong of [{ sku: 123 }, { modelNumber: "ROG-STRIX-RTX5090" }, { name: "NVIDIA RTX 5090" }, { name: "ASUS RTX 5090 Founders Edition" }]) {
      expect(() => normalizeBestBuy({ ...product, ...wrong }, now)).toThrow(ProductIdentityError);
    }
  });
  it("gives preorder, future release, backorder, and coming soon precedence over online availability", () => {
    expect(normalizeBestBuy({ ...product, orderable: "PreOrder" }, now).state).toBe("PREORDER");
    expect(normalizeBestBuy({ ...product, releaseDate: "2027-01-01" }, now).state).toBe("PREORDER");
    expect(normalizeBestBuy({ ...product, orderable: "Backorder" }, now).state).toBe("BACKORDER");
    expect(normalizeBestBuy({ ...product, orderable: "Coming Soon" }, now).state).toBe("UNKNOWN");
  });
  it("does not infer availability from a button or an unknown ordering status", () => {
    expect(normalizeBestBuy({ ...product, orderable: undefined, addToCartUrl: "https://example.com/cart" }, now).state).toBe("UNKNOWN");
    expect(normalizeBestBuy({ ...product, orderable: "Unknown provider change" }, now).state).toBe("UNKNOWN");
    expect(normalizeBestBuy({ ...product, onlineAvailability: false }, now).state).toBe("OUT_OF_STOCK");
  });
  it("does not publish restricted or invalid prices", () => {
    expect(normalizeBestBuy({ ...product, priceRestriction: "MAP" }, now).priceCents).toBeNull();
    expect(normalizeBestBuy({ ...product, salePrice: -1 }, now).priceCents).toBeNull();
  });
});

describe("state transitions and delivery policy", () => {
  it("preserves the last valid state on provider failure and never creates a false recovery restock", () => {
    const previous = stock();
    const failed = applyCheck(previous, { ok: false, retailerId: "bestbuy", checkedAt: now, errorCode: "TIMEOUT" });
    expect(failed.lastValid).toBe(previous);
    expect(failed.checkState).toBe("CHECK_FAILED");
    expect(failed.restocked).toBe(false);
    const recovery = applyCheck(failed.lastValid, { ok: true, observation: stock() });
    expect(recovery.restocked).toBe(false);
    expect(isRestock("OUT_OF_STOCK", "IN_STOCK")).toBe(true);
    expect(isRestock("UNKNOWN", "IN_STOCK")).toBe(false);
    expect(isRestock(null, "IN_STOCK")).toBe(false);
  });
  it("price, paid access, retailer and cooldown filters suppress unsuitable alerts", () => {
    const base = { observation: stock(), retailerIds: ["bestbuy"], maxPriceCents: 200000, enabled: true, paid: true, cooldownSeconds: 1800, now };
    expect(eligibleForAlert(base)).toBe(true);
    expect(eligibleForAlert({ ...base, maxPriceCents: 190000 })).toBe(false);
    expect(eligibleForAlert({ ...base, observation: { ...stock(), priceCents: null } })).toBe(false);
    expect(eligibleForAlert({ ...base, paid: false })).toBe(false);
    expect(eligibleForAlert({ ...base, retailerIds: ["nvidia"] })).toBe(false);
    expect(eligibleForAlert({ ...base, lastAlertAt: new Date(now.getTime() - 1000) })).toBe(false);
    expect(eligibleForAlert({ ...base, observation: { ...stock(), state: "PREORDER" } })).toBe(false);
  });
  it("dedupes retries using persisted event, recipient and channel identities", () => {
    expect(notificationDedupeKey("event-1", "user-1", "EMAIL")).toBe(notificationDedupeKey("event-1", "user-1", "EMAIL"));
    expect(notificationDedupeKey("event-1", "user-1", "EMAIL")).not.toBe(notificationDedupeKey("event-1", "user-2", "EMAIL"));
  });
  it("bounds scheduling and rejects disabled source activity", async () => {
    expect(checkInterval("5")).toBe(60);
    expect(checkInterval("invalid")).toBe(300);
    const fetcher = vi.fn();
    const adapter = bestBuyAdapter({}, fetcher);
    expect(adapter.enabled).toBe(false);
    expect((await adapter.check()).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(inventoryAdapters({}).every((source) => !source.enabled)).toBe(true);
    expect(bestBuyAdapter({ BESTBUY_API_KEY: "test", BESTBUY_USAGE_APPROVED: "true", DEMO_MODE: "true" }, fetcher).enabled).toBe(false);
  });
  it("converts access errors to sanitized failures and honors Retry-After", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("secret upstream content", { status: 429, headers: { "retry-after": "900" } }));
    const result = await bestBuyAdapter({ BESTBUY_API_KEY: "secret", BESTBUY_USAGE_APPROVED: "true" }, fetcher).check();
    expect(result).toMatchObject({ ok: false, errorCode: "PROVIDER_RATE_LIMITED", retryAfterSeconds: 900 });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(retryAfterSeconds("Mon, 16 Nov 2026 14:00:00 GMT", now)).toBe(7200);
    expect(retryAfterSeconds("172800", now)).toBe(172800);
    expect(retryAfterSeconds("garbage", now)).toBeUndefined();
  });
  it("keeps access denial, timeout, and identity errors separate from stock status", async () => {
    const env = { BESTBUY_API_KEY: "never-print-this-key", BESTBUY_USAGE_APPROVED: "true" };
    const denied = bestBuyAdapter(env, vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 403 })));
    expect(await denied.check()).toMatchObject({ ok: false, errorCode: "PROVIDER_ACCESS_DENIED" });
    const timeout = bestBuyAdapter(env, vi.fn().mockRejectedValue(new Error("timeout URL containing never-print-this-key")));
    const timeoutResult = await timeout.check();
    expect(timeoutResult).toMatchObject({ ok: false, errorCode: "PROVIDER_REQUEST_FAILED" });
    expect(JSON.stringify(timeoutResult)).not.toContain(env.BESTBUY_API_KEY);
    const wrong = bestBuyAdapter(env, vi.fn().mockResolvedValue(Response.json({ ...product, sku: 123 })));
    expect(await wrong.check()).toMatchObject({ ok: false, errorCode: "PRODUCT_IDENTITY_MISMATCH" });
  });
  it("marks absent and old observations stale without changing their stock state", () => {
    expect(isStale(null, 300, now)).toBe(true);
    expect(isStale(new Date(now.getTime() - 601000), 300, now)).toBe(true);
    expect(isStale(new Date(now.getTime() - 1000), 300, now)).toBe(false);
    expect(isStale(new Date(now.getTime() - 700000), 600, now)).toBe(false);
  });
});
