import { afterEach, describe, expect, it, vi } from "vitest";
import { inventoryReport } from "../src/lib/radar/inventory-feed";
import { feedSecret, maxFeedAgeMs, signInventory, sourceCanAlert, verifyInventory } from "../src/lib/radar/inventory-feed-auth";
import { POST } from "../src/app/api/radar/inventory/[brand]/route";
import { recordStockPeriod } from "../src/lib/radar/stock-period";
import { latestEvidence, preferredSource } from "../src/lib/radar/stock-finder";
import type { Prisma, RadarSource } from "@prisma/client";

const key = "independent-test-secret".repeat(2);
const timestamp = "1763400000";
const now = Number(timestamp) * 1000;
const apple = { item: "macbook-air-m5", variant: "13-inch-sky-blue-16gb-512gb", storeId: "apple-r095", observedAt: new Date(now).toISOString(), inStock: true };
const nvidia = { item: "rtx-5090", variant: "founders-edition", observedAt: apple.observedAt, inStock: true };
afterEach(() => vi.unstubAllEnvs());

describe("supplier inventory reports", () => {
  it("authenticates the exact request body, timestamp and brand", () => {
    const body = JSON.stringify(apple);
    const headers = new Headers({ "X-Radar-Timestamp": timestamp, "X-Radar-Signature": signInventory("apple", key, timestamp, body) });
    expect(() => verifyInventory("apple", key, headers, body, now)).not.toThrow();
    expect(() => verifyInventory("nvidia", key, headers, body, now)).toThrow(/signature/);
    expect(() => verifyInventory("apple", key, headers, body + " ", now)).toThrow(/signature/);
    expect(() => verifyInventory("apple", key, headers, body, now + maxFeedAgeMs + 1)).toThrow(/expired/);
    expect(() => verifyInventory("apple", key, new Headers(), body, now)).toThrow(/signature/);
  });
  it("permits exact configurations and known pickup stores, deriving the official URL on the server", () => {
    expect(inventoryReport("apple", apple, now).store?.name).toBe("Apple Fifth Avenue");
    expect(inventoryReport("nvidia", nvidia, now).product.productUrl).toContain("marketplace.nvidia.com/");
    expect(() => inventoryReport("playstation", nvidia, now)).toThrow(/brand/);
    expect(() => inventoryReport("apple", { ...apple, variant: "unknown" }, now)).toThrow(/catalog/);
    expect(() => inventoryReport("apple", { ...apple, storeId: undefined }, now)).toThrow(/pickup store/);
    expect(() => inventoryReport("apple", { ...apple, storeId: "apple-r99999" }, now)).toThrow(/pickup store/);
    expect(() => inventoryReport("nvidia", { ...nvidia, storeId: apple.storeId }, now)).toThrow(/online/);
    expect(() => inventoryReport("nvidia", { ...nvidia, productUrl: "https://example.test", email: "other@example.test" }, now)).toThrow();
    expect(() => inventoryReport("apple", apple, now - 1)).toThrow(/five minutes/);
    expect(() => inventoryReport("apple", apple, now + maxFeedAgeMs + 1)).toThrow(/five minutes/);
  });
  it("only enables the registered brand feed and honors key removal, pauses and lab isolation", () => {
    vi.stubEnv("RADAR_LOCAL_TEST_MODE", "false"); vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("RADAR_APPLE_FEED_SECRET", key); vi.stubEnv("RADAR_NVIDIA_FEED_SECRET", "");
    const source = { status: "feed", approved: false, connector: "inventory-apple" };
    expect(sourceCanAlert(source)).toBe(true);
    expect(sourceCanAlert({ ...source, connector: "inventory-nvidia" })).toBe(false);
    expect(sourceCanAlert({ ...source, status: "paused" })).toBe(false);
    expect(sourceCanAlert({ ...source, connector: "local-test", retailer: "feed-apple-r095" })).toBe(false);
    vi.stubEnv("RADAR_APPLE_FEED_SECRET", "");
    expect(sourceCanAlert(source)).toBe(false);
    vi.stubEnv("RADAR_APPLE_FEED_SECRET", key); vi.stubEnv("RADAR_LOCAL_TEST_MODE", "true");
    expect(feedSecret("apple")).toBeNull();
  });
  it("rejects unsigned requests before writing any inventory and limits the signed payload", async () => {
    vi.stubEnv("RADAR_LOCAL_TEST_MODE", "false"); vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("RADAR_APPLE_FEED_SECRET", key);
    const params = Promise.resolve({ brand: "apple" });
    const req = (body: string) => new Request("http://localhost/api/radar/inventory/apple", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    expect((await POST(req("{}"), { params })).status).toBe(401);
    expect((await POST(req("a".repeat(8193)), { params })).status).toBe(413);
    vi.stubEnv("RADAR_APPLE_FEED_SECRET", "");
    expect((await POST(req("{}"), { params })).status).toBe(503);
  });
  it("records initial in-stock history without sending a restock on enrollment", async () => {
    vi.stubEnv("RADAR_LOCAL_TEST_MODE", "false"); vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("RADAR_APPLE_FEED_SECRET", key);
    const findMany = vi.fn();
    const create = vi.fn().mockResolvedValue({ id: "event" });
    const tx = { radarStockEvent: { create }, radarAlert: { findMany } } as unknown as Prisma.TransactionClient;
    const source = { id: "source", inStock: null, approved: false, connector: "inventory-apple", status: "feed" } as RadarSource;
    await recordStockPeriod(tx, source, { inStock: true }, new Date(now));
    expect(create).toHaveBeenCalledOnce();
    expect(findMany).not.toHaveBeenCalled();
  });
  it("uses the newer direct store reading while keeping the customer's feed selection", () => {
    vi.stubEnv("RADAR_LOCAL_TEST_MODE", "false"); vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("RADAR_APPLE_FEED_SECRET", key);
    const manual = { id: "lookup", status: "on_demand", approved: false, connector: "apple-pickup", lastCheckedAt: new Date(),
      inStock: true, lastError: null, pollSeconds: 300 };
    const feed = { ...manual, id: "supplier", inStock: false, status: "feed", connector: "inventory-apple", lastCheckedAt: new Date(0) };
    const matches = [feed, manual];
    expect(preferredSource(matches)).toBe(feed);
    expect(latestEvidence(matches, feed)).toBe(manual);
  });
});
