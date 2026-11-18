import { afterEach, describe, expect, it, vi } from "vitest";
import products from "../src/config/official-products.json";
import { parseSonyFeed, listSonyFeeds } from "../src/lib/radar/partnerize-feed";
import { partnerizeStockConfig, sonyPartnerRetailer } from "../src/lib/radar/partnerize-config";
import { sourceCanAlert } from "../src/lib/radar/inventory-feed-auth";

const sony = products.playstation[0];
const columns = { sku: "sku", availability: "availability", link: "official link", observedAt: "stock checked" };
const now = Date.parse("2026-11-18T10:00:00Z");
const header = "sku,official link,availability,stock checked,description\n";
const row = (sku = sony.productCode, url = sony.productUrl, stock = "in stock", time = "2026-11-18T05:00:00-05:00") =>
  [sku, url, stock, time, '"Console, disc edition"'].join(",");
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Sony's publisher feed", () => {
  it("reads quoted delimited data and requires both the exact Sony SKU and US store listing", () => {
    const records = [row(), row("different"), row(sony.productCode, "https://example.org/item"),
      row(sony.productCode, sony.productUrl, "preorder"), row(sony.productCode, sony.productUrl, "in stock", "2026-11-18T09:54:59Z")];
    expect(parseSonyFeed(header + records.join("\n"), "us.csv", columns, now)).toEqual([
      { item: sony.itemSlug, variant: sony.variantSlug, inStock: true, observedAt: new Date(now).toISOString() },
    ]);
    expect(parseSonyFeed(header + row(sony.productCode, sony.productUrl, "https://schema.org/OutOfStock"), "us.csv", columns, now)[0].inStock).toBe(false);
  });
  it("rejects ambiguous, missing or conflicting fields and skips undated inventory", () => {
    expect(() => parseSonyFeed(header + row(), "uk.xml", columns, now)).toThrow("uncompressed");
    expect(() => parseSonyFeed(header.replace("stock checked", "downloaded") + row(), "us.csv", columns, now)).toThrow("columns");
    expect(() => parseSonyFeed(header + row() + "\n" + row(sony.productCode, sony.productUrl, "out of stock"), "us.csv", columns, now)).toThrow("conflicting");
    expect(parseSonyFeed(header + row(sony.productCode, sony.productUrl, "in stock", ""), "us.csv", columns, now)).toEqual([]);
  });
  it("queries only the authenticated publisher and selects the specified active campaign", async () => {
    const entry = { campaign_id: "us", campaign_feeds_id: "PS1", filename: "us.tsv", location: "https://example.test/private" };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ campaigns: [
      { campaign: { campaign_id: "other", feeds: [entry] } },
      { campaign: { campaign_id: "us", feeds: [entry, { ...entry, campaign_id: "other" }] } },
    ] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await listSonyFeeds({ publisher: "p1", campaign: "us", application: "app", userKey: "key" })).toEqual([entry]);
    expect(String(fetcher.mock.calls[0][0])).toBe("https://api.partnerize.com/user/publisher/p1/feed?campaign_id=us&active=y");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Basic " + Buffer.from("app:key").toString("base64") } });
  });
  it("requires the selected partner's own access even if a signed webhook key exists", () => {
    const source = { connector: "inventory-playstation", status: "feed", approved: false, retailer: sonyPartnerRetailer };
    vi.stubEnv("RADAR_PLAYSTATION_FEED_SECRET", "s".repeat(36)); vi.stubEnv("PARTNERIZE_APPLICATION_KEY", "");
    expect(sourceCanAlert(source)).toBe(false);
    for (const key of ["PARTNERIZE_APPLICATION_KEY", "PARTNERIZE_USER_API_KEY", "PARTNERIZE_PUBLISHER_ID", "PARTNERIZE_PLAYSTATION_CAMPAIGN_ID", "PARTNERIZE_PLAYSTATION_FEED_ID"]) vi.stubEnv(key, "test");
    vi.stubEnv("RADAR_LOCAL_TEST_MODE", "false"); vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("PARTNERIZE_STOCK_COLUMNS", JSON.stringify(columns));
    expect(sourceCanAlert(source)).toBe(true);
    vi.stubEnv("RADAR_LOCAL_TEST_MODE", "true"); expect(partnerizeStockConfig()).toBeNull();
  });
});
