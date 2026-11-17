import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { brands, getLaunchProduct, isRecentLaunch, launchDateLabel, launchProducts, launchWindow, productItemId, productVariantId } from "../src/config/launch-catalog";
import { previewCatalog } from "../src/config/radar-catalog";
import { chooseConfiguration, configurationValues } from "../src/lib/radar/configuration";
import { categoryContent, getProductContent } from "../src/lib/radar/product-content";
import { productVisuals } from "../src/lib/radar/product-visuals";

type SeedWrite = { where: Record<string, unknown>; create: Record<string, unknown> & { id: string }; update: Record<string, unknown> };
const seedDb = vi.hoisted(() => {
  const upsert = () => vi.fn(async (args: SeedWrite) => args.create);
  return {
    radarCategory: { upsert: upsert() }, radarItem: { upsert: upsert() }, radarVariant: { upsert: upsert() },
    radarSource: { upsert: upsert() }, radarPlan: { upsert: upsert() }, $disconnect: vi.fn(async () => undefined),
  };
});
vi.mock("../src/lib/db", () => ({ prisma: seedDb }));

const existingSlugs = new Set(["iphone-duo", "playstation-5-pro", "rtx-5090"]);
const officialHosts = ["apple.com", "nvidia.com", "playstation.com"];
function expectHttpsReference(value: string, official = false) {
  const url = new URL(value);
  expect(url.protocol).toBe("https:");
  expect(url.username + url.password).toBe("");
  if (official) expect(officialHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))).toBe(true);
}

describe("researched launch catalog", () => {
  it("uses unique product identities, real calendar dates and attributable manufacturer metadata", () => {
    expect(launchProducts.length).toBeGreaterThan(3);
    expect(new Set(launchProducts.map(product => product.slug)).size).toBe(launchProducts.length);
    expect(new Set(launchProducts.map(product => product.name.toLowerCase())).size).toBe(launchProducts.length);
    expect(new Set(launchProducts.map(product => productItemId(product.slug))).size).toBe(launchProducts.length);
    for (const product of launchProducts) {
      expect(product.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(Object.hasOwn(brands, product.brand)).toBe(true);
      expect(product.name.trim().length).toBeGreaterThan(2);
      expect(product.family.trim()).not.toBe("");
      expect(product.launchDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${product.launchDate}T00:00:00Z`).toISOString().slice(0, 10)).toBe(product.launchDate);
      expect(product.launchDate <= launchWindow.to).toBe(true);
      expect(product.features.length).toBeGreaterThanOrEqual(3);
      for (const feature of product.features) {
        for (const value of Object.values(feature)) expect(value.trim()).not.toBe("");
      }
      expectHttpsReference(product.officialUrl, true);
      expectHttpsReference(product.launchSourceUrl, true);
      expectHttpsReference(product.image.sourceUrl);
    }
  });

  it("serves every product's actual local image and editorial category/guide content", () => {
    const publicRoot = resolve(process.cwd(), "public");
    for (const product of launchProducts) {
      expect(product.image.src).toMatch(/^\/images\/.+\.(?:png|jpe?g|webp|avif)$/i);
      const localImage = resolve(publicRoot, product.image.src.slice(1));
      expect(localImage.startsWith(`${publicRoot}${sep}`)).toBe(true);
      expect(existsSync(localImage), product.image.src).toBe(true);
      expect(product.image.alt.trim().length).toBeGreaterThan(10);
      expect(productVisuals[product.slug]?.theme).toBe(product.brand);
      expect(existsSync(resolve(publicRoot, productVisuals[product.slug].src.slice(1)))).toBe(true);
      const content = getProductContent(product.slug);
      expect(content?.brand).toBe(brands[product.brand].name);
      expect(content?.guideSections.length).toBeGreaterThanOrEqual(4);
      expect(content?.officialLinks.some(link => link.url === product.officialUrl || link.url.startsWith(`${product.officialUrl}specs/`))).toBe(true);
      expect(categoryContent[product.category.slug]?.buyingNotes.length, product.category.slug).toBeGreaterThanOrEqual(3);
      if (!existingSlugs.has(product.slug)) {
        expect(content?.coverage).toContain("Automated inventory is not configured");
        expect(content?.guideSections[0].body).toContain(product.features[0].value);
      }
    }
  });

  it("offers only complete, unique configurations and valid option values", () => {
    const variantIds: string[] = [];
    for (const product of launchProducts) {
      const optionKeys = product.options.map(option => option.key);
      expect(optionKeys.length).toBeGreaterThan(0);
      expect(new Set(optionKeys).size).toBe(optionKeys.length);
      expect(product.variants.length).toBeGreaterThan(0);
      expect(new Set(product.variants.map(variant => variant.slug)).size).toBe(product.variants.length);
      const combinations = product.variants.map(variant => {
        expect(variant.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(variant.label.trim()).not.toBe("");
        expect(Object.keys(variant.attributes).sort()).toEqual([...optionKeys].sort());
        for (const key of optionKeys) {
          expect(variant.attributes[key].trim()).not.toBe("");
          expect(configurationValues(product.variants, key)).toContain(variant.attributes[key]);
        }
        variantIds.push(productVariantId(product.slug, variant.slug));
        return JSON.stringify(Object.entries(variant.attributes).sort(([a], [b]) => a.localeCompare(b)));
      });
      expect(new Set(combinations).size, product.slug).toBe(combinations.length);
    }
    expect(new Set(variantIds).size).toBe(variantIds.length);
  });

  it("distinguishes the rolling launch window from older models and preserves month-only precision", () => {
    expect(isRecentLaunch({ launchDate: "2025-11-16" })).toBe(false);
    expect(isRecentLaunch({ launchDate: "2025-11-17" })).toBe(true);
    expect(isRecentLaunch({ launchDate: "2026-11-17" })).toBe(true);
    expect(isRecentLaunch({ launchDate: "2026-11-18" })).toBe(false);
    expect(launchProducts.filter(product => product.brand === "nvidia").every(product => !isRecentLaunch(product))).toBe(true);
    expect(isRecentLaunch(getLaunchProduct("playstation-5-pro")!)).toBe(false);
    const rtx5050 = getLaunchProduct("rtx-5050")!;
    expect(rtx5050.launchDatePrecision).toBe("month");
    expect(launchDateLabel(rtx5050)).toBe("July 2025");
  });

  it("keeps a valid configuration while changing an option and rejects unknown values safely", () => {
    const duo = getLaunchProduct("iphone-duo")!;
    const current = duo.variants.find(variant => variant.slug === "512gb-star-white")!;
    expect(chooseConfiguration(duo.variants, current, "storage", "1TB")?.slug).toBe("1tb-star-white");
    expect(chooseConfiguration(duo.variants, current, "color", "Night Sky")?.slug).toBe("512gb-night-sky");
    expect(chooseConfiguration(duo.variants, current, "storage", "999TB")).toBeUndefined();
    expect(chooseConfiguration(duo.variants, current, "unknown-option", "1TB")).toBeUndefined();
    expect(chooseConfiguration([], undefined, "storage", "1TB")).toBeUndefined();
    expect(configurationValues(duo.variants, "unknown-option")).toEqual([]);
    for (const slug of ["missing-product", "constructor", "__proto__"]) {
      expect(getLaunchProduct(slug)).toBeUndefined();
      expect(getProductContent(slug)).toBeUndefined();
    }
  });
});

describe("catalog integration and preserved references", () => {
  it("keeps original product and variant IDs while making new previews metadata-only", () => {
    expect(previewCatalog).toHaveLength(launchProducts.length);
    const duo = previewCatalog.find(item => item.slug === "iphone-duo")!;
    expect(duo.id).toBe("iphone-duo");
    expect(duo.variants).toHaveLength(8);
    for (const variant of duo.variants) expect(variant.id).toBe(`iphone-duo-${variant.slug}`);
    expect(previewCatalog.find(item => item.slug === "playstation-5-pro")).toMatchObject({ id: "ps5-pro", variants: [{ id: "ps5-pro-standard", slug: "standard" }] });
    expect(previewCatalog.find(item => item.slug === "rtx-5090")).toMatchObject({ id: "rtx-5090", variants: [{ id: "rtx-5090-standard", slug: "founders-edition" }] });
    for (const item of previewCatalog.filter(item => !existingSlugs.has(item.slug))) {
      const product = getLaunchProduct(item.slug)!;
      expect(item).toMatchObject({ name: product.name, category: product.category, imageUrl: product.image.src, msrpCents: null, sources: [] });
      expect(item.variants.map(variant => variant.id)).toEqual(product.variants.map(variant => productVariantId(product.slug, variant.slug)));
    }
    for (const item of previewCatalog) {
      for (const source of item.sources) expect(source).toMatchObject({ approved: false, status: "paused", inStock: null, priceCents: null, lastCheckedAt: null, events: [] });
    }
  });

  it("seeds every new item and variant without creating new inventory sources or replacing operator settings", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await import("../prisma/seed");
    } finally {
      log.mockRestore();
    }
    const newProducts = launchProducts.filter(product => !existingSlugs.has(product.slug));
    const itemWrites = seedDb.radarItem.upsert.mock.calls.map(([args]) => args);
    const variantWrites = seedDb.radarVariant.upsert.mock.calls.map(([args]) => args);
    for (const product of newProducts) {
      const item = itemWrites.find(write => write.create.id === productItemId(product.slug));
      expect(item?.create).toMatchObject({ slug: product.slug, name: product.name, imageUrl: product.image.src });
      expect(Object.keys(item!.update).sort()).toEqual(["categoryId", "imageUrl", "name"]);
      for (const variant of product.variants) {
        const write = variantWrites.find(entry => entry.create.id === productVariantId(product.slug, variant.slug));
        expect(write?.create).toMatchObject({ itemId: productItemId(product.slug), slug: variant.slug, label: variant.label });
        expect(write?.update).toEqual({ label: variant.label });
      }
    }
    expect(variantWrites.filter(write => write.create.itemId === "iphone-duo")).toHaveLength(8);
    expect(variantWrites.some(write => write.create.id === "ps5-pro-standard")).toBe(true);
    expect(variantWrites.some(write => write.create.id === "rtx-5090-standard" && write.create.slug === "founders-edition")).toBe(true);
    for (const [source] of seedDb.radarSource.upsert.mock.calls) {
      expect(["iphone-duo", "ps5-pro", "rtx-5090"]).toContain(source.create.itemId);
      expect(source.create).toMatchObject({ approved: false, status: "paused" });
      expect(source.update).toEqual({});
    }
    expect(seedDb.$disconnect).toHaveBeenCalledOnce();
  });
});
