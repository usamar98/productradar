import { describe, expect, it, vi } from "vitest";
import products from "../src/config/official-products.json";
import { launchProducts } from "../src/config/launch-catalog";
import { officialCatalog, officialCatalogProduct, officialConfiguration } from "../src/lib/radar/official-catalog";
import { appleProductIdentity, applePickupUrl, lookupApplePickup, reviewedAppleIdentity, validateOfficialSource } from "../src/lib/radar/official-connectors";

describe("reviewed official inventory catalog", () => {
  it("accounts for every Apple configuration and connects every Apple product", () => {
    const apple = launchProducts.filter(product => product.brand === "apple");
    expect(apple).toHaveLength(24);
    for (const item of apple) {
      expect(products.apple.some(product => product.itemSlug === item.slug)).toBe(true);
      for (const variant of item.variants) {
        const mapped = products.apple.filter(product => product.itemSlug === item.slug && product.variantSlug === variant.slug);
        const custom = products.unsupportedApple.filter(product => product.itemSlug === item.slug && product.variantSlug === variant.slug);
        expect(mapped.length + custom.length, `${item.slug}/${variant.slug}`).toBe(1);
      }
    }
    expect(products.apple).toHaveLength(242);
    expect(products.unsupportedApple).toHaveLength(9);
  });

  it("rejects ambiguous identities and requires official evidence for each configuration", () => {
    const keys = new Set<string>(), urls = new Set<string>();
    for (const mapping of officialCatalog) {
      const key = `${mapping.itemSlug}/${mapping.variantSlug}`;
      expect(keys.has(key), key).toBe(false); keys.add(key);
      expect(urls.has(mapping.productUrl), mapping.productUrl).toBe(false); urls.add(mapping.productUrl);
      const item = launchProducts.find(item => item.slug === mapping.itemSlug);
      expect(item?.variants.some(variant => variant.slug === mapping.variantSlug), key).toBe(true);
      expect(new URL(mapping.sourceUrl).hostname).toBe(mapping.connector === "apple-pickup" ? "www.apple.com" : mapping.connector === "playstation-direct" ? "direct.playstation.com" : "marketplace.nvidia.com");
      expect(() => validateOfficialSource({ connector: mapping.connector, fulfillment: mapping.fulfillment, productUrl: mapping.productUrl, locationId: mapping.fulfillment === "pickup" ? "apple-r095" : null })).not.toThrow();
    }
  });

  it.each([
    ["ipad-air-m4", "11-inch-blue-128gb-wi-fi"],
    ["macbook-air-m5", "13-inch-silver-16gb-512gb"],
    ["apple-watch-series-12", "42mm-dark-bronze-gps"],
    ["airpods-max-2", "midnight"],
    ["apple-tv-4k-2026", "128gb-wi-fi-plus-ethernet"],
    ["homeview", "wall-mounted-silver"],
  ])("uses the exact reviewed %s configuration in its pickup request", async (item, variant) => {
    const mapping = officialCatalogProduct(item, variant)!;
    const { partNumber } = reviewedAppleIdentity(mapping.productUrl);
    const read = vi.fn().mockResolvedValue(JSON.stringify({ head: { status: "200" }, body: { stores: [{ storeNumber: "R095", partsAvailability: { [partNumber]: { partNumber, pickupDisplay: "available" } } }] } }));
    const result = await lookupApplePickup(mapping.productUrl, "10001", read);
    expect(result.observations).toEqual([{ locationId: "apple-r095", result: { inStock: true, raw: `Apple pickup: R095 / ${partNumber}` }, error: null }]);
    expect(new URL(read.mock.calls[0][0]).searchParams.get("parts.0")).toBe(partNumber);
    expect(new URL(read.mock.calls[0][0]).searchParams.get("location")).toBe("10001");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("supports reviewed US Watch and audio suffixes without accepting arbitrary Watch URLs", () => {
    for (const part of ["MJG44LS/A", "MHWM4AM/A"]) {
      expect(new URL(applePickupUrl(part, "R095", "10001")).searchParams.get("parts.0")).toBe(part);
      const url = "https://www.apple.com/shop/buy-airpods/airpods-max-2/blue";
      const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", url, offers: [{ "@type": "Offer", sku: part, priceCurrency: "USD", price: 549 }] })}</script>`;
      expect(appleProductIdentity(html, url).partNumber).toBe(part);
    }
    expect(() => validateOfficialSource({ connector: "apple-pickup", fulfillment: "pickup", locationId: "apple-r095", productUrl: "https://www.apple.com/shop/buy-watch/apple-watch?product=UNVERIFIED&step=select" })).toThrow("reviewed");
  });

  it("keeps custom Macs and partner GPUs distinct from a base model or NVIDIA inventory", () => {
    expect(officialCatalogProduct("macbook-pro-m6", "silver-24gb-2tb")).toBeUndefined();
    expect(officialConfiguration("macbook-pro-m6", "silver-24gb-2tb")).toMatchObject({ checkable: false, reason: expect.stringContaining("custom configuration") });
    expect(officialCatalogProduct("macbook-pro-m6", "silver-24gb-1tb")).toBeDefined();
    expect(officialConfiguration("rtx-5070-ti", "16gb")).toMatchObject({ checkable: false, reason: expect.stringContaining("partner listings") });
    expect(products.nvidia.map(product => product.itemSlug).sort()).toEqual(["rtx-5070", "rtx-5080", "rtx-5090"]);
  });

  it("identifies the Watch band and size that each stock result actually covers", () => {
    for (const item of launchProducts.filter(product => product.slug.startsWith("apple-watch"))) {
      for (const variant of item.variants) {
        const mapped = officialCatalogProduct(item.slug, variant.slug)!;
        expect(variant.attributes.band).toBeTruthy();
        expect(variant.attributes.bandSize).toBeTruthy();
        expect(mapped.configurationLabel).toContain(variant.attributes.band);
      }
    }
  });
});
