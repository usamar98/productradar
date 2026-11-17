import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Catalog, PublicItem, PublicSource } from "../src/lib/radar/catalog";

const getCatalog = vi.hoisted(() => vi.fn<() => Promise<Catalog>>());
vi.mock("@/lib/radar/catalog", () => ({ BRAND: "Restock Radar", siteUrl: "https://radar.example", getCatalog }));

import { hasObservations, isCatalogPublished, pageMetadata } from "../src/lib/radar/seo";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";

const source = (overrides: Partial<PublicSource> = {}): PublicSource => ({
  id: "source-1", itemId: "item-1", variantId: "variant-1", retailer: "official-store", label: "Official store",
  productUrl: "https://retailer.example/product", connector: "jsonld", pollSeconds: 60, status: "paused", approved: false,
  inStock: null, priceCents: null, lastCheckedAt: null, lastError: null, createdAt: new Date("2026-11-17T00:00:00Z"), events: [], ...overrides,
});
const item = (overrides: Partial<PublicItem> = {}): PublicItem => ({
  id: "item-1", slug: "playstation-5-pro", name: "PlayStation 5 Pro", msrpCents: null, imageUrl: null, hidden: false,
  category: { name: "Consoles", slug: "consoles" }, variants: [{ id: "variant-1", slug: "standard", label: "Standard" }], sources: [source()], ...overrides,
});
const published = (items = [item()]): Catalog => ({ available: true, seeded: true, items });

describe("publication and evidence controls", () => {
  it("does not publish unavailable, fallback or hidden-only catalogs", () => {
    expect(isCatalogPublished(published())).toBe(true);
    expect(isCatalogPublished({ ...published(), available: false })).toBe(false);
    expect(isCatalogPublished({ ...published(), seeded: false })).toBe(false);
    expect(isCatalogPublished(published([item({ hidden: true })]))).toBe(false);
  });

  it("distinguishes configured sources from real checks and rejects mock/preview evidence", () => {
    const observed = source({ inStock: false, lastCheckedAt: new Date("2026-11-17T01:00:00Z") });
    expect(hasObservations([source()])).toBe(false);
    expect(hasObservations([observed])).toBe(true);
    expect(hasObservations([{ ...observed, inStock: null }])).toBe(false);
    expect(hasObservations([{ ...observed, lastCheckedAt: new Date("invalid") }])).toBe(false);
    expect(hasObservations([{ ...observed, connector: "mock" }])).toBe(false);
    expect(hasObservations([{ ...observed, id: "preview-store" }])).toBe(false);
    expect(hasObservations([source({ events: [{ id: "event-1", sourceId: "source-1", inStock: true, priceCents: null, seenAt: new Date("2026-11-16T00:00:00Z"), endedAt: null }] })])).toBe(true);
  });
});

describe("search discovery", () => {
  beforeEach(() => getCatalog.mockReset());

  it("publishes curated hubs and guides while holding empty variants, histories and retailers out of the sitemap", async () => {
    getCatalog.mockResolvedValue(published());
    const result = await sitemap();
    const urls = result.map(entry => entry.url);
    expect(urls).toContain("https://radar.example/products");
    expect(urls).toContain("https://radar.example/guides");
    expect(urls).toContain("https://radar.example/playstation-5-pro");
    expect(urls).toContain("https://radar.example/how-to-get-playstation-5-pro");
    expect(urls.some(url => /\/restocks|\/variants\/|\/at\//.test(url))).toBe(false);
    expect(result.every(entry => entry.lastModified === undefined)).toBe(true);
  });

  it("exposes observed pages without hidden products or unrelated variants", async () => {
    getCatalog.mockResolvedValue(published([
      item({ sources: [source({ lastCheckedAt: new Date("2026-11-17T01:00:00Z"), inStock: false })], variants: [{ id: "variant-1", slug: "standard", label: "Standard" }, { id: "variant-2", slug: "special", label: "Special" }] }),
      item({ id: "hidden", slug: "iphone-duo", hidden: true }),
    ]));
    const urls = (await sitemap()).map(entry => entry.url);
    expect(urls).toContain("https://radar.example/playstation-5-pro/restocks");
    expect(urls).toContain("https://radar.example/playstation-5-pro/variants/standard");
    expect(urls).toContain("https://radar.example/playstation-5-pro/at/official-store");
    expect(urls.some(url => url.includes("iphone-duo") || url.includes("/variants/special"))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("keeps preview product routes out of discovery when the database is unavailable", async () => {
    getCatalog.mockResolvedValue({ ...published(), available: false, seeded: false });
    const urls = (await sitemap()).map(entry => entry.url);
    expect(urls).toContain("https://radar.example/methodology");
    expect(urls.some(url => url.includes("playstation") || url.endsWith("/products") || url.endsWith("/guides"))).toBe(false);
  });

  it("provides a route canonical, social preview and crawlable noindex for empty-data pages", () => {
    const metadata = pageMetadata({ title: "A product", description: "A description", path: "/a-product", indexable: false });
    expect(metadata.alternates?.canonical).toBe("https://radar.example/a-product");
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.openGraph).toMatchObject({ url: "https://radar.example/a-product", images: [{ url: "https://radar.example/opengraph-image", width: 1200, height: 630 }] });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(robots().rules).toMatchObject({ allow: "/", disallow: expect.arrayContaining(["/api/", "/admin", "/alerts"]) });
  });
});
