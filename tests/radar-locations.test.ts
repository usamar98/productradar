import { describe, expect, it, vi } from "vitest";
import { distanceMiles, lookupZip, nearbyStores, normalizeZip, storeDirectory } from "../src/lib/radar/locations";
import { pickupSource, stockReading } from "../src/lib/radar/stock-finder";

describe("ZIP and nearby-store discovery", () => {
  it("preserves leading zeroes and accepts ZIP+4 without accepting arbitrary URLs", () => {
    expect(normalizeZip(" 02108-1234 ")).toBe("02108");
    for (const input of ["1234", "100001", "https://localhost/", "ABCDE"]) expect(() => normalizeZip(input)).toThrow("ZIP");
  });
  it("ranks real store coordinates and respects distance and city filters", () => {
    const fifth = storeDirectory.stores.find(store => store.id === "apple-r095")!;
    expect(distanceMiles(fifth,fifth)).toBe(0);
    const found = nearbyStores(fifth,25);
    expect(found[0].id).toBe(fifth.id);
    expect(found.every(store => store.distance! <= 25)).toBe(true);
    expect(found.map(store => store.distance)).toEqual(found.map(store => store.distance).sort((a,b) => a! - b!));
    expect(nearbyStores(undefined,50,"Fifth Avenue").map(store => store.id)).toEqual([fifth.id]);
    expect(nearbyStores({latitude:0,longitude:0},25)).toEqual([]);
  });
  it("imports only distinct, complete official store identities", () => {
    expect(storeDirectory.stores.length).toBe(269);
    expect(new Set(storeDirectory.stores.map(store => store.id)).size).toBe(269);
    for (const store of storeDirectory.stores) { expect(store.url).toMatch(/^https:\/\/www.apple.com\/retail\/[a-z0-9]+\/$/); expect(Number.isFinite(store.latitude) && Number.isFinite(store.longitude)).toBe(true); expect(store.address.length).toBeGreaterThan(0); }
  });
  it("uses a fixed geocoding host and validates the returned ZIP", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({"country abbreviation":"US","post code":"02108",places:[{"latitude":"42.357","longitude":"-71.065","place name":"Boston","state abbreviation":"MA"}]})));
    expect(await lookupZip("02108",fetcher)).toMatchObject({city:"Boston",zip:"02108",latitude:42.357});
    expect(fetcher.mock.calls[0][0]).toBe("https://api.zippopotam.us/us/02108");
    await expect(lookupZip("10002",vi.fn().mockResolvedValue(new Response(JSON.stringify({"country abbreviation":"US","post code":"99999",places:[]}))))).rejects.toMatchObject({status:503});
  });
  it("distinguishes unknown ZIPs from service errors", async () => {
    await expect(lookupZip("00000",vi.fn().mockResolvedValue(new Response("",{status:404})))).rejects.toMatchObject({status:404});
    await expect(lookupZip("00001",vi.fn().mockRejectedValue(new Error("offline")))).rejects.toMatchObject({status:503});
    await expect(lookupZip("00002",vi.fn().mockResolvedValue(new Response("not json")))).rejects.toMatchObject({status:503});
  });
});
describe("store-specific stock evidence", () => {
  const source = {id:"source",locationId:"apple-r095",fulfillment:"pickup",approved:true,status:"active",connector:"store-feed",inStock:true,lastCheckedAt:new Date(),lastError:null,pollSeconds:15};
  it("never uses an online or different-store reading as nearby pickup stock", () => {
    expect(pickupSource([{...source,fulfillment:"online"}],"apple-r095")).toBeUndefined();
    expect(pickupSource([source],"another-store")).toBeUndefined();
    expect(pickupSource([source],"apple-r095")).toBe(source);
  });
  it("does not present missing, paused, stale, failed or mock observations as in stock", () => {
    expect(stockReading().state).toBe("unknown");
    expect(stockReading({...source,approved:false}).alertable).toBe(false);
    expect(stockReading({...source,status:"blocked"}).state).toBe("unknown");
    expect(stockReading({...source,lastCheckedAt:new Date(0)}).state).toBe("stale");
    expect(stockReading({...source,lastError:"failed"}).state).toBe("stale");
    expect(stockReading({...source,connector:"mock"}).alertable).toBe(false);
    expect(stockReading(source).state).toBe("in_stock");
  });
});
