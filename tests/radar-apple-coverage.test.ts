import { describe, expect, it, vi } from "vitest";
import { collectAppleCoverage, maxAppleCoverageLookups } from "../src/lib/radar/apple-coverage";
import { distanceMiles, nearbyStores, storeDirectory } from "../src/lib/radar/locations";
import { BlockedSourceError } from "../src/lib/radar/source-http";
import { pickupStockReading } from "../src/lib/radar/stock-finder";

const ny = { latitude: 40.7506, longitude: -73.9972 };
const targets = nearbyStores(ny, 50);
const observed = new Date("2026-11-17T20:00:00.000Z");
function batch(zip: string, checkedAt = observed) {
  const center = zip === "10001" ? ny : storeDirectory.stores.find(store => store.postalCode.slice(0, 5) === zip)!;
  const nearest = [...storeDirectory.stores].sort((a, b) => distanceMiles(center, a) - distanceMiles(center, b)).slice(0, 12);
  return { checkedAt, partNumber: "MK1E4LL/A", observations: nearest.map(store => ({ locationId: store.id, result: { inStock: false }, error: null })) };
}

describe("Apple search coverage with synthetic responses", () => {
  it("expands a twelve-store response to cover the 31-store NYC search without guessing stock", async () => {
    const read = vi.fn(async (zip: string) => batch(zip, new Date(observed.getTime() + read.mock.calls.length * 1000)));
    const result = await collectAppleCoverage(targets, "10001", read);
    expect(targets).toHaveLength(31);
    expect(result.unresolvedStoreIds).toEqual([]);
    expect(read.mock.calls.length).toBeGreaterThan(1);
    expect(read.mock.calls.length).toBeLessThanOrEqual(maxAppleCoverageLookups);
    expect(new Set(read.mock.calls.map(call => call[0])).size).toBe(read.mock.calls.length);
    expect(new Set(result.observations.map(row => row.locationId)).size).toBe(result.observations.length);
    for (const row of result.observations) {
      const lastBatch = [...read.mock.calls].map((call, index) => batch(call[0], new Date(observed.getTime() + (index + 1) * 1000))).reverse().find(value => value.observations.some(value => value.locationId === row.locationId))!;
      expect(row.checkedAt).toEqual(lastBatch.checkedAt);
      expect(row.result).toEqual({ inStock: false });
    }
  });
  it("caps broad searches and reports omitted stores without creating readings for them", async () => {
    const original = batch("10001");
    const read = vi.fn(async () => original);
    const result = await collectAppleCoverage(targets, "10001", read, 2);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.observations).toHaveLength(12);
    expect(result.unresolvedStoreIds).toHaveLength(19);
    expect(result.observations.every(row => row.checkedAt === observed)).toBe(true);
  });
  it("performs only one ZIP lookup for an individual store", async () => {
    const store = targets[targets.length - 1];
    const read = vi.fn(async (zip: string) => batch(zip));
    const result = await collectAppleCoverage([store], store.postalCode.slice(0, 5), read, 1);
    expect(read).toHaveBeenCalledExactlyOnceWith(store.postalCode.slice(0, 5));
    expect(result.unresolvedStoreIds).toEqual([]);
  });
  it("stops immediately on protection without trying another area's ZIP", async () => {
    const read = vi.fn().mockResolvedValueOnce(batch("10001")).mockRejectedValueOnce(new BlockedSourceError("HTTP 403; stopped"));
    await expect(collectAppleCoverage(targets, "10001", read)).rejects.toBeInstanceOf(BlockedSourceError);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("preserves successful batches and timestamps when a later request fails", async () => {
    const read = vi.fn().mockResolvedValueOnce(batch("10001")).mockRejectedValueOnce(new Error("Request timed out"));
    const result = await collectAppleCoverage(targets, "10001", read);
    expect(result.observations).toHaveLength(12);
    expect(result.checkedAt).toEqual(observed);
    expect(result.warning).toContain("timed out");
    expect(result.unresolvedStoreIds).toHaveLength(19);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe("actionable pickup coverage labels", () => {
  const source = { id: "source", connector: "apple-pickup", status: "on_demand", approved: false, inStock: false, lastCheckedAt: new Date(), lastError: null, pollSeconds: 300 };
  it("distinguishes omitted results from unconnected configurations, paused sources and blocks", () => {
    expect(pickupStockReading(undefined, { connected: true, blocked: false })).toMatchObject({ state: "unknown", label: "Not checked yet", canCheckStore: true });
    expect(pickupStockReading(undefined, { connected: true, blocked: false, omitted: true })).toMatchObject({ label: "Not returned by Apple", canCheckStore: true });
    expect(pickupStockReading(undefined, { connected: false, blocked: false })).toMatchObject({ label: "Configuration not connected", canCheckStore: false });
    expect(pickupStockReading({ ...source, status: "paused" }, { connected: true, blocked: false })).toMatchObject({ label: "Checks paused", canCheckStore: false });
    expect(pickupStockReading(source, { connected: true, blocked: true })).toMatchObject({ state: "unknown", alertable: false, label: "Check blocked", canCheckStore: false });
  });
  it("keeps exact fresh stock visible and never upgrades an omitted result to sold out", () => {
    expect(pickupStockReading(source, { connected: true, blocked: false, omitted: true })).toMatchObject({ state: "out_of_stock", alertable: false });
    expect(pickupStockReading(undefined, { connected: true, blocked: false, omitted: true }).state).toBe("unknown");
  });
});
