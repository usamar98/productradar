import { describe, expect, it, vi } from "vitest";
import { appleProductIdentity, applePickupUrl, parseApplePickup, playStationProductIdentity, playStationProductUrl, parsePlayStationProducts, createOfficialConnectors, validateOfficialSource } from "../src/lib/radar/official-connectors";
import { BlockedSourceError } from "../src/lib/radar/source-http";
import { isOfficialListing, officialConnection } from "../src/lib/radar/official-status";
import { jsonldConnector } from "../src/lib/radar/connectors";

// Contract fixtures, not captured stock. They must never be seeded into customer data.
const appleUrl = "https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-256gb-star-white-unlocked";
const part = "MK1E4LL/A";
const appleHtml = (url = appleUrl, sku = `${part}+unlocked`) => `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", url, offers: [{ "@type": "Offer", sku, price: 1999, priceCurrency: "USD" }] })}</script>`;
const applePayload = (state = "available", store = "R095", sku = part) => ({ head: { status: "200" }, body: { content: { pickupMessage: { stores: [{ storeNumber: store, partsAvailability: { [sku]: { pickupDisplay: state } } }] } } } });
const source = { id: "test", connector: "apple-pickup", productUrl: appleUrl, locationId: "apple-r095", fulfillment: "pickup", approved: true };
const sony = (patch: Record<string, unknown> = {}) => ({ products: [{ code: "1000050805", purchasable: true, stock: { stockLevelStatus: "inStock" }, price: { value: 899, currencyIso: "USD" }, ...patch }] });

describe("official store contracts", () => {
  it("extracts the exact selected Apple SKU, builds a store-specific request and ignores no variants", () => {
    expect(appleProductIdentity(appleHtml(), appleUrl)).toEqual({ partNumber: part, priceCents: 199900 });
    expect(() => appleProductIdentity(appleHtml(appleUrl.replace("star-white", "night-sky")), appleUrl)).toThrow("exact product");
    expect(() => appleProductIdentity(appleHtml(appleUrl, "unknown"), appleUrl)).toThrow("not supported");
    expect(() => appleProductIdentity(appleHtml() + appleHtml(), appleUrl)).toThrow();
    const url = new URL(applePickupUrl(part, "R095", "10001"));
    expect(url.origin).toBe("https://www.apple.com");
    expect(url.searchParams.get("parts.0")).toBe(part);
    expect(url.searchParams.get("location")).toBe("10001");
    expect(url.searchParams.get("store")).toBe("R095");
    expect(() => applePickupUrl(part, "R095", "10001&store=R001")).toThrow();
  });
  it("only reports the exact part at the exact store and keeps unknown states unknown", () => {
    expect(parseApplePickup(applePayload(), part, "R095").inStock).toBe(true);
    expect(parseApplePickup(applePayload("unavailable"), part, "R095").inStock).toBe(false);
    expect(() => parseApplePickup(applePayload("available", "R001"), part, "R095")).toThrow("selected store");
    expect(() => parseApplePickup(applePayload("available", "R095", "OTHERLL/A"), part, "R095")).toThrow("selected part");
    expect(() => parseApplePickup(applePayload("ships-to-store"), part, "R095")).toThrow("unrecognized");
    expect(() => parseApplePickup({ body: {} }, part, "R095")).toThrow();
  });
  it("reads the PlayStation hero code instead of a recommendation", () => {
    const html = '<div class="productHero-component row" data-product-code="1000050805"></div><div data-product-code="1000000001"></div>';
    expect(playStationProductIdentity(html)).toBe("1000050805");
    expect(() => playStationProductIdentity('<div data-product-code="1000000001"></div>')).toThrow();
    expect(new URL(playStationProductUrl("1000050805")).pathname).toContain("/users/anonymous/products/productList");
  });
  it("requires exact Sony identity and public orderability, excluding preorders and gated products", () => {
    expect(parsePlayStationProducts(sony(), "1000050805")).toMatchObject({ inStock: true, priceCents: 89900 });
    expect(parsePlayStationProducts(sony({ preOrderProduct: true }), "1000050805").inStock).toBe(false);
    expect(parsePlayStationProducts(sony({ purchasable: false }), "1000050805").inStock).toBe(false);
    expect(parsePlayStationProducts(sony({ stock: { stockLevelStatus: "outOfStock" } }), "1000050805").inStock).toBe(false);
    for (const patch of [{ loginGated: true }, { psPlusGated: true }, { stock: {} }, { code: "1000000001" }, { purchasable: undefined }]) expect(() => parsePlayStationProducts(sony(patch), "1000050805")).toThrow();
  });
  it("rejects wrong hosts, unselected products and fabricated pickup locations before HTTP", () => {
    expect(() => validateOfficialSource(source)).not.toThrow();
    for (const patch of [{ productUrl: "https://evil.example/shop/buy-iphone/iphone-duo/variant" }, { locationId: "apple-r999999" }, { fulfillment: "online" }, { productUrl: "https://www.apple.com/shop/buy-iphone/iphone-duo" }]) expect(() => validateOfficialSource({ ...source, ...patch })).toThrow();
    expect(() => validateOfficialSource({ connector: "playstation-direct", productUrl: "https://direct.playstation.com/en-us/buy-consoles/playstation5-pro-console", fulfillment: "pickup", locationId: "apple-r095" })).toThrow();
  });
  it("does not contact any site for unapproved sources", async () => {
    const read = vi.fn();
    await expect(createOfficialConnectors(read)["apple-pickup"].check({ ...source, approved: false })).rejects.toBeInstanceOf(BlockedSourceError);
    expect(read).not.toHaveBeenCalled();
  });
  it("does not allow an online JSON-LD offer to stand in for Apple pickup", async () => {
    await expect(jsonldConnector.check({ ...source, connector: "jsonld" })).rejects.toThrow("cannot verify store pickup");
  });
  it("passes a matched Apple response through the connector without inventing a fallback", async () => {
    const read = vi.fn().mockResolvedValueOnce(appleHtml()).mockResolvedValueOnce(JSON.stringify(applePayload()));
    await expect(createOfficialConnectors(read)["apple-pickup"].check(source)).resolves.toMatchObject({ inStock: true, priceCents: 199900 });
    expect(read).toHaveBeenCalledTimes(2);
    expect(new URL(read.mock.calls[1][0]).searchParams.get("store")).toBe("R095");
  });
  it("propagates a protection stop without retrying or choosing another endpoint", async () => {
    const read = vi.fn().mockRejectedValue(new BlockedSourceError("Access denied"));
    await expect(createOfficialConnectors(read)["apple-pickup"].check(source)).rejects.toThrow("Access denied");
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("does not treat NVIDIA add-to-cart text as confirmed availability", async () => {
    const read = vi.fn().mockResolvedValue("<h1>RTX 5090</h1><button>Add to cart</button><p>Out of stock</p>");
    await expect(createOfficialConnectors(read)["nvidia-store"].check({ id: "nvidia", connector: "nvidia-store", productUrl: "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/", fulfillment: "online", approved: true })).rejects.toThrow();
  });
  it("distinguishes an official retailer, a blocked connection, and fresh observations", () => {
    expect(isOfficialListing("apple", appleUrl)).toBe(true);
    expect(isOfficialListing("apple", "https://www.apple.com.evil.example/anything")).toBe(false);
    expect(isOfficialListing("playstation", "https://www.bestbuy.com/product")).toBe(false);
    const reading = { ...source, status: "blocked", inStock: null, lastCheckedAt: null, lastError: "Blocked", pollSeconds: 300 };
    expect(officialConnection("apple", [reading])?.state).toBe("blocked");
    expect(officialConnection("apple", [{ ...reading, status: "active", lastError: null }])?.state).toBe("waiting");
    expect(officialConnection("apple", [{ ...reading, status: "active", lastError: null, inStock: false, lastCheckedAt: new Date() }])?.state).toBe("connected");
    expect(officialConnection("apple", [{ ...reading, status: "active", lastError: null, inStock: true, lastCheckedAt: new Date(0) }])?.state).toBe("waiting");
  });
});
