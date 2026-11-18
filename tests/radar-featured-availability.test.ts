import { describe, expect, it } from "vitest";
import { previewCatalog } from "../src/config/radar-catalog";
import type { Catalog, PublicSource } from "../src/lib/radar/catalog";
import { featuredAvailability } from "../src/lib/radar/featured-availability";
import { availabilityLabel, reportFromSearch } from "../src/lib/radar/featured-report";
import { officialCatalogProduct } from "../src/lib/radar/official-catalog";
import type { StoreReading } from "../src/lib/radar/stock-search-result";

const now = Date.parse("2026-11-18T12:00:00Z");
const catalog: Catalog = { available: true, seeded: true, items: previewCatalog };
const iphone = previewCatalog.find(item => item.slug === "iphone-duo")!;
const listing = officialCatalogProduct("iphone-duo", "256gb-night-sky")!;
const source: PublicSource = {
  ...iphone.sources[0], variantId: iphone.variants.find(v => v.slug === "256gb-night-sky")!.id,
  connector: "apple-pickup", productUrl: listing.productUrl, fulfillment: "pickup", locationId: "apple-r095",
  status: "on_demand", inStock: true, lastCheckedAt: new Date(now - 5_000),
};

describe("featured availability tables", () => {
  it("publishes three distinct, checkable configurations per brand and keeps preview stock empty", () => {
    const groups = featuredAvailability({ ...catalog, available: false }, now);
    expect(groups.map(group => [group.brand, group.products.length])).toEqual([["apple", 3], ["playstation", 3], ["nvidia", 3]]);
    const products = groups.flatMap(group => group.products);
    expect(new Set(products.map(product => product.slug)).size).toBe(9);
    expect(products.every(product => product.report === null && officialCatalogProduct(product.slug, product.variant)?.productUrl === product.officialUrl)).toBe(true);
  });

  it("shows only the newest scoped official report and expires it without calling the retailer", () => {
    const sources = [
      source, { ...source, inStock: false, lastCheckedAt: new Date(now - 1_000) },
      ...[{ variantId: "unrelated" }, { connector: "mock" }, { connector: "local-test" }, { status: "blocked" },
        { fulfillment: "online" }, { locationId: "missing-store" }, { productUrl: "https://example.com" }]
        .map(change => ({ ...source, ...change, lastCheckedAt: new Date(now) })),
    ];
    const report = featuredAvailability({ ...catalog, items: [{ ...iphone, sources }] }, now)[0].products[0].report;
    expect(report?.location).toContain("Apple Fifth Avenue");
    expect(report?.observedAt).toBe(new Date(now - 1_000).toISOString());
    expect(availabilityLabel(report, now)).toBe("Out of stock");
    expect(availabilityLabel(report, now + 60_000)).toBe("Was out of stock");
  });

  it("never presents missing or hidden catalog products as checkable", () => {
    const groups = featuredAvailability({ ...catalog, items: [{ ...iphone, hidden: true }] }, now);
    expect(groups.every(group => group.products.length === 0)).toBe(true);
  });

  it("prefers a confirmed in-stock store without using a superseded reading from the same location", () => {
    const sources = [
      source,
      { ...source, inStock: false, lastCheckedAt: new Date(now - 1_000) },
      { ...source, locationId: "apple-r414", lastCheckedAt: new Date(now - 10_000) },
    ];
    const report = featuredAvailability({ ...catalog, items: [{ ...iphone, sources }] }, now)[0].products[0].report;
    expect(report).toMatchObject({ inStock: true, location: "Apple 4th Street · 94710" });
  });

  it("reports an individual confirmed pickup store even when other nearby stores have unknown stock", () => {
    const store: StoreReading = {
      id: "one", name: "Store One", city: "New York", region: "NY", postalCode: "10001", distance: 0, address: "", url: "", latitude: 0, longitude: 0,
      state: "out_of_stock", label: "Out of stock", sourceId: null, lastCheckedAt: new Date(now).toISOString(), expiresAt: now + 60_000,
      simulated: false, alertable: false,
    };
    const stale = { ...store, state: "in_stock", expiresAt: now - 1 };
    const unknown = { ...store, state: "unknown", lastCheckedAt: null };
    const result = { mode: "pickup" as const, stores: [stale, unknown, store], total: 3 };
    expect(reportFromSearch(result, now)).toMatchObject({ inStock: false, location: "Store One · 10001" });
    const available = { ...store, name: "Store Two", state: "in_stock" };
    expect(reportFromSearch({ ...result, stores: [...result.stores, available] }, now)).toMatchObject({ inStock: true, location: "Store Two · 10001" });
    expect(reportFromSearch({ ...result, stores: [stale, unknown] }, now)).toBeNull();
  });
});
