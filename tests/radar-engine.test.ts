import { describe, expect, it } from "vitest";
import { canDeliver, notificationIdentity, pollDelayMs, stockTransition, withinPlanLimit } from "../src/lib/radar/domain";
import { assertUnblockedResponse, parseJsonLd, publicAddress, robotsAllows } from "../src/lib/radar/connectors";

describe("observed stock periods", () => {
  it("opens once on availability, closes once on loss and reopens on a subsequent period", () => {
    expect([stockTransition(null, false), stockTransition(false, true), stockTransition(true, true), stockTransition(true, false), stockTransition(false, false), stockTransition(false, true)])
      .toEqual(["unchanged", "open", "unchanged", "close", "unchanged", "open"]);
    expect(stockTransition(null, true)).toBe("open");
  });
  it("deduplicates the same event and delivery destination without merging distinct events", () => {
    const keys = new Set([notificationIdentity("a", "e", "email"), notificationIdentity("a", "e", "email"), notificationIdentity("a", "e2", "email"), notificationIdentity("a", "e", "push", "device")]);
    expect(keys.size).toBe(3);
  });
  it("enforces distinct retailer selection and every plan limit", () => {
    for (const limit of [1, 2, 5, 10]) {
      expect(withinPlanLimit(Array.from({ length: limit }, (_, i) => String(i)), limit)).toBe(true);
      expect(withinPlanLimit(Array.from({ length: limit + 1 }, (_, i) => String(i)), limit)).toBe(false);
    }
    expect(withinPlanLimit(["a", "a"], 2)).toBe(false);
    expect(withinPlanLimit([], 2)).toBe(false);
  });
  it("backs off exponentially with bounded jitter and a minimum interval", () => {
    expect(pollDelayMs(1, 0, () => 0.5)).toBe(15000);
    expect(pollDelayMs(15, 2, () => 0.5)).toBe(60000);
    expect(pollDelayMs(15, 99, () => 0.5)).toBe(3600000);
  });
  it("rechecks paid access, expiry and caught passes before delivery", () => {
    const now = new Date("2026-11-17T00:00:00Z"), future = new Date("2026-11-18T00:00:00Z");
    const active = { status: "active", activeUntil: future, caughtAt: null, plan: { type: "one_time_pass" }, subscription: { status: "active", currentPeriodEnd: future } };
    expect(canDeliver(active, now)).toBe(true);
    expect(canDeliver({ ...active, caughtAt: now }, now)).toBe(false);
    expect(canDeliver({ ...active, subscription: null }, now)).toBe(false);
    expect(canDeliver({ ...active, activeUntil: now }, now)).toBe(false);
  });
});

describe("polite exact-product JSON-LD connector", () => {
  const page = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
  const product = (availability: string) => ({ "@type": "Product", offers: { "@type": "Offer", availability: `https://schema.org/${availability}`, price: "699.99", priceCurrency: "USD" } });
  it("extracts a confirmed in-stock offer and integer cents", () => {
    expect(parseJsonLd(page(product("InStock")))).toMatchObject({ inStock: true, priceCents: 69999 });
    expect(parseJsonLd(page(product("PreOrder"))).inStock).toBe(false);
    expect(parseJsonLd(page(product("BackOrder"))).inStock).toBe(false);
  });
  it("rejects missing, ambiguous, and unrecognized data instead of reporting available", () => {
    expect(() => parseJsonLd("<html>Buy now</html>")).toThrow();
    expect(() => parseJsonLd(page([product("InStock"), product("OutOfStock")]))).toThrow();
    expect(() => parseJsonLd(page(product("Maybe")))).toThrow();
  });
  it("uses an exact URL to disambiguate product nodes", () => {
    expect(parseJsonLd(page([{ ...product("InStock"), url: "https://shop.example/item" }, { ...product("OutOfStock"), url: "https://shop.example/recommendation" }]), "https://shop.example/item").inStock).toBe(true);
  });
  it("does not assume multiple in-stock offers are the exact chosen variant", () => {
    expect(() => parseJsonLd(page({ "@type": "Product", offers: [product("InStock").offers, product("InStock").offers] }), "https://shop.example/item")).toThrow("Multiple offers");
  });
  it("preserves variant query parameters and rejects mismatching single Product or Offer URLs", () => {
    const red = "https://shop.example/item?variant=red", blue = "https://shop.example/item?variant=blue";
    expect(() => parseJsonLd(page({ ...product("InStock"), url: red }), blue)).toThrow("Product URL does not match");
    expect(() => parseJsonLd(page({ ...product("InStock"), offers: { ...product("InStock").offers, url: red } }), blue)).toThrow("Offer URL does not match");
    const offers = [{ ...product("InStock").offers, url: red }, { ...product("OutOfStock").offers, url: blue }];
    expect(parseJsonLd(page({ "@type": "Product", offers }), blue).inStock).toBe(false);
    expect(parseJsonLd(page({ ...product("InStock"), url: "?variant=red" }), red).inStock).toBe(true);
  });
  it("stops on a robots captcha response before checking the product", () => {
    expect(() => assertUnblockedResponse({ status: 200, text: "<!doctype html><title>Captcha</title>Verify you are human" }, true)).toThrow("Retailer protection detected");
    expect(() => assertUnblockedResponse({ status: 200, text: "User-agent: *\nDisallow: /captcha" }, true)).not.toThrow();
    expect(() => assertUnblockedResponse({ status: 429, text: "Slow down" }, true)).toThrow();
  });
  it("honors longest robots rule, group specificity and allow ties", () => {
    const robots = "User-agent: *\nDisallow: /\nUser-agent: RestockRadar\nDisallow: /shop\nAllow: /shop/product\n";
    expect(robotsAllows(robots, "/shop/other")).toBe(false);
    expect(robotsAllows(robots, "/shop/product/one")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /*?secret=*", "/item?secret=abc")).toBe(false);
  });
  it("rejects private, loopback, mapped and reserved source addresses", () => {
    for (const address of ["127.0.0.1", "10.1.1.1", "172.16.1.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fd00::1", "2001:db8::1"]) expect(publicAddress(address)).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("2606:4700::1111")).toBe(true);
  });
});
