import { describe, expect, it } from "vitest";
import { canVisitCatalogSource } from "../src/lib/radar/catalog-reference";

const nvidiaUrl = "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/";
const bestBuyUrl = "https://www.bestbuy.com/product/nvidia-geforce-rtx-5090-32gb-founders-edition/6614151";
const source = { connector: "jsonld", approved: false, retailer: "nvidia", productUrl: nvidiaUrl };

describe("manual catalog references", () => {
  it("exposes verified GPU links without changing monitoring approval or inventory", () => {
    const paused = Object.freeze({ ...source, status: "paused", inStock: null, lastCheckedAt: null });
    expect(canVisitCatalogSource("rtx-5090", paused)).toBe(true);
    expect(canVisitCatalogSource("rtx-5090", { ...paused, retailer: "best-buy", productUrl: bestBuyUrl })).toBe(true);
    expect(paused).toMatchObject({ approved: false, status: "paused", inStock: null, lastCheckedAt: null });
  });

  it("does not extend the GPU exception to another product, retailer or URL", () => {
    expect(canVisitCatalogSource("rtx-5080", source)).toBe(false);
    expect(canVisitCatalogSource("rtx-5090", { ...source, retailer: "best-buy" })).toBe(false);
    for (const productUrl of [nvidiaUrl.replace("5090", "5080"), `${nvidiaUrl}?redirect=elsewhere`, nvidiaUrl.replace("marketplace.nvidia.com", "marketplace.nvidia.com.example"), "https://www.bestbuy.com/"]) {
      expect(canVisitCatalogSource("rtx-5090", { ...source, productUrl })).toBe(false);
    }
  });

  it("keeps existing Apple configuration references without permitting other Apple paths", () => {
    const apple = { ...source, retailer: "apple", productUrl: "https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-256gb-star-white-unlocked" };
    expect(canVisitCatalogSource("iphone-duo", apple)).toBe(true);
    expect(canVisitCatalogSource("rtx-5090", apple)).toBe(false);
    expect(canVisitCatalogSource("iphone-duo", { ...apple, productUrl: "https://www.apple.com/shop/buy-iphone/iphone-18" })).toBe(false);
    expect(canVisitCatalogSource("iphone-duo", { ...apple, productUrl: apple.productUrl.replace("www.apple.com", "www.apple.com.example") })).toBe(false);
  });

  it("preserves HTTPS manual links for approved sources but rejects mock, unsafe and malformed URLs", () => {
    expect(canVisitCatalogSource("other-product", { ...source, approved: true, productUrl: "https://retailer.example/item" })).toBe(true);
    expect(canVisitCatalogSource("rtx-5090", { ...source, approved: true, connector: "mock" })).toBe(false);
    for (const productUrl of ["javascript:alert(1)", "http://retailer.example/item", "not-a-url", "https://user:password@retailer.example/item"]) {
      expect(canVisitCatalogSource("other-product", { ...source, approved: true, productUrl })).toBe(false);
    }
  });
});
