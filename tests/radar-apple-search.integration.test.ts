import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/db";
import { readOfficialResource } from "../src/lib/radar/official-api";
import { rateLimit } from "../src/lib/radar/access";
import { refreshLiveStock } from "../src/lib/radar/live-stock";
import { distanceMiles, nearbyStores, storeDirectory } from "../src/lib/radar/locations";

vi.mock("../src/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const connectionString = process.env.TEST_DATABASE_URL;
  if (connectionString && !/_test$/.test(new URL(connectionString).pathname)) throw new Error("Apple search tests require an isolated _test database.");
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString || "postgresql://localhost/not_configured_test" }) }) };
});
vi.mock("../src/lib/radar/official-api", () => ({ readOfficialResource: vi.fn() }));
vi.mock("../src/lib/radar/access", () => ({ rateLimit: vi.fn().mockResolvedValue(undefined) }));

describe.skipIf(!process.env.TEST_DATABASE_URL)("expanded Apple search persistence (synthetic inventory)", () => {
  const id = "apple-search-fixture";
  const center = { latitude: 40.7506, longitude: -73.9972 };
  const targets = nearbyStores(center, 50);
  const input = { itemId: id, variantId: id, connector: "apple-pickup" as const, productUrl: "https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-256gb-star-white-unlocked", zip: "10001", storeIds: targets.map(store => store.id) };
  async function cleanup() {
    await prisma.radarStockEvent.deleteMany({ where: { source: { itemId: id } } });
    await prisma.radarSource.deleteMany({ where: { itemId: id } });
    await prisma.radarVariant.deleteMany({ where: { id } });
    await prisma.radarItem.deleteMany({ where: { id } });
    await prisma.radarCategory.deleteMany({ where: { id } });
  }
  beforeAll(async () => {
    await cleanup();
    await prisma.radarCategory.create({ data: { id, slug: id, name: "Fixture" } });
    await prisma.radarItem.create({ data: { id, slug: id, name: "Fixture", categoryId: id, hidden: true } });
    await prisma.radarVariant.create({ data: { id, slug: "fixture", label: "Fixture", itemId: id } });
    vi.mocked(readOfficialResource).mockImplementation(async value => {
      const url = new URL(value), zip = url.searchParams.get("location")!, part = url.searchParams.get("parts.0")!;
      const point = zip === "10001" ? center : storeDirectory.stores.find(store => store.postalCode.slice(0, 5) === zip)!;
      const stores = [...storeDirectory.stores].sort((a, b) => distanceMiles(point, a) - distanceMiles(point, b)).slice(0, 12);
      return JSON.stringify({ head: { status: "200" }, body: { stores: stores.map(store => ({ storeNumber: store.id.slice(6).toUpperCase(), partsAvailability: { [part]: { partNumber: part, pickupDisplay: store.id === "apple-r095" ? "available" : "unavailable", storePickEligible: true } } })) } });
    });
  });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it("persists all requested stores, charges every actual lookup to the limiter, and reuses exact timestamps", async () => {
    const result = await refreshLiveStock(input);
    expect(result.unresolvedStoreIds).toEqual([]);
    expect(result.lookups).toBeGreaterThan(1);
    expect(rateLimit).toHaveBeenCalledTimes(vi.mocked(readOfficialResource).mock.calls.length);
    expect(rateLimit).toHaveBeenCalledWith("official-live:apple-pickup", 12, 60);
    const rows = await prisma.radarSource.findMany({ where: { itemId: id, locationId: { in: input.storeIds } } });
    expect(rows).toHaveLength(31);
    expect(rows.every(row => row.status === "on_demand" && !row.approved && row.lastCheckedAt && !row.lastError)).toBe(true);
    expect(rows.find(row => row.locationId === "apple-r095")?.inStock).toBe(true);
    const calls = vi.mocked(readOfficialResource).mock.calls.length;
    const cached = await refreshLiveStock(input);
    expect(cached).toMatchObject({ cached: true, checkedAt: result.checkedAt });
    expect(readOfficialResource).toHaveBeenCalledTimes(calls);

    // An individual check uses a returned store's ZIP, reuses its underlying batch,
    // and does not relabel cached observations as newly checked.
    const lastZip = new URL(vi.mocked(readOfficialResource).mock.calls.at(-1)![0]).searchParams.get("location")!;
    const store = targets.find(store => store.postalCode.slice(0, 5) === lastZip)!;
    const single = await refreshLiveStock({ ...input, zip: lastZip, storeIds: [store.id], singleStore: true });
    expect(single.lookups).toBe(1);
    expect(single.unresolvedStoreIds).toEqual([]);
    expect(readOfficialResource).toHaveBeenCalledTimes(calls);
    expect((await prisma.radarSource.findUniqueOrThrow({ where: { variantId_retailer: { variantId: id, retailer: store.id } } })).lastCheckedAt).toEqual(rows.find(row => row.locationId === store.id)?.lastCheckedAt);
  });
});
