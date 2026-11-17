import { afterEach, describe, expect, it, vi } from "vitest";
import { readOfficialResource } from "../src/lib/radar/official-api";
import { BlockedSourceError } from "../src/lib/radar/source-http";
import { reviewedAppleIdentity } from "../src/lib/radar/official-connectors";
import products from "../src/config/official-products.json";

vi.mock("../src/lib/radar/source-http", async importOriginal => ({
  ...await importOriginal<typeof import("../src/lib/radar/source-http")>(),
  validatePublicUrl: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => vi.unstubAllGlobals());
const url = "https://api.nvidia.partners/edge/product/search?locale=en-us";

describe("fixed public inventory HTTP boundary", () => {
  it("uses a normal identified JSON request with no redirects, credentials or automatic retries", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}', { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await readOfficialResource(url)).toBe('{"ok":true}');
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(url, expect.objectContaining({ method: "GET", redirect: "error", credentials: "omit", cache: "no-store", headers: { "User-Agent": "RestockRadar/1.0", Accept: "application/json" } }));
  });
  it("stops on protection and never falls back to another endpoint", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const status of [401, 403, 429]) {
      fetcher.mockResolvedValueOnce(new Response("Access denied", { status }));
      await expect(readOfficialResource(url)).rejects.toBeInstanceOf(BlockedSourceError);
    }
    fetcher.mockResolvedValueOnce(new Response("<html>Verify you are human</html>"));
    await expect(readOfficialResource(url)).rejects.toBeInstanceOf(BlockedSourceError);
    expect(fetcher).toHaveBeenCalledTimes(4);
    await expect(readOfficialResource("https://api.store.nvidia.com/partner/v1/feinventory")).rejects.toBeInstanceOf(BlockedSourceError);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("bounds the response body and keeps upstream failures as errors", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("x".repeat(2_000_001))).mockResolvedValueOnce(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(readOfficialResource(url)).rejects.toThrow("size limit");
    await expect(readOfficialResource(url)).rejects.toThrow("HTTP 503");
  });
  it("retains all eight Duo identities while resolving the expanded reviewed Apple catalog", () => {
    const duo = products.apple.filter(product => product.itemSlug === "iphone-duo");
    expect(duo).toHaveLength(8);
    expect(new Set(duo.map(product => product.partNumber)).size).toBe(8);
    for (const product of products.apple) expect(reviewedAppleIdentity(product.productUrl)).toEqual({ partNumber: product.partNumber });
    expect(() => reviewedAppleIdentity(products.apple[0].productUrl + "-other")).toThrow("no verified");
  });
});
