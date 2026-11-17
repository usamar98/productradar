import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { claimSource, recordObservation, recordSourceFailure } from "../worker/runtime";
import { BlockedSourceError } from "../src/lib/radar/source-http";
import { parseApplePickup } from "../src/lib/radar/official-connectors";

const connectionString = process.env.TEST_DATABASE_URL;
const safe = connectionString && /_test$/.test(new URL(connectionString).pathname);
if (connectionString && !safe) throw new Error("Official worker tests require a dedicated database ending in _test.");

describe.skipIf(!safe)("official provider coordination (real PostgreSQL, synthetic response)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
  const id = "official-worker-fixture", ids = [`${id}-1`, `${id}-2`, `${id}-other`];
  async function cleanup() {
    await db.radarNotification.deleteMany({ where: { alertId: id } });
    await db.radarAlert.deleteMany({ where: { id } });
    await db.radarSubscription.deleteMany({ where: { id } });
    await db.radarUser.deleteMany({ where: { id } });
    await db.radarStockEvent.deleteMany({ where: { sourceId: { in: ids } } });
    await db.radarSource.deleteMany({ where: { id: { in: ids } } });
    await db.radarVariant.deleteMany({ where: { id } });
    await db.radarItem.deleteMany({ where: { id } });
    await db.radarCategory.deleteMany({ where: { id } });
    await db.radarPlan.deleteMany({ where: { id } });
  }
  beforeAll(async () => {
    await cleanup();
    await db.radarCategory.create({ data: { id, slug: id, name: "Fixture" } });
    await db.radarItem.create({ data: { id, slug: id, categoryId: id, name: "Fixture", hidden: true } });
    await db.radarVariant.create({ data: { id, itemId: id, slug: "fixture", label: "Fixture" } });
    for (const sourceId of ids) await db.radarSource.create({ data: { id: sourceId, itemId: id, variantId: id, retailer: sourceId, label: "Synthetic contract fixture", connector: sourceId.endsWith("other") ? "nvidia-store" : "apple-pickup", productUrl: "https://example.com/fixture", approved: true, status: "active", pollSeconds: 15 } });
    await db.radarPlan.create({ data: { id, name: "Fixture", priceCents: 0, alertLimit: 2, type: "subscription" } });
    await db.radarUser.create({ data: { id, email: "official-worker@example.test" } });
    const future = new Date(Date.now() + 86400000);
    await db.radarSubscription.create({ data: { id, userId: id, planId: id, providerRef: id, status: "active", currentPeriodEnd: future } });
    await db.radarAlert.create({ data: { id, userId: id, itemId: id, variantId: id, planId: id, subscriptionId: id, sourceIds: ids.slice(0, 2), status: "active", activeUntil: future } });
  });
  afterAll(async () => { await cleanup(); await db.$disconnect(); });

  it("serializes provider checks, records a matched signal, queues once, and fences work after a block", async () => {
    const sources = await db.radarSource.findMany({ where: { id: { in: ids.slice(0, 2) } }, orderBy: { id: "asc" } });
    const leases = await Promise.all(sources.map(source => claimSource(source, db)));
    expect(leases.filter(Boolean)).toHaveLength(1);
    const index = leases.findIndex(Boolean), source = sources[index], lease = leases[index]!;
    const part = "MK1E4LL/A";
    const result = parseApplePickup({ head: { status: "200" }, body: { content: { pickupMessage: { stores: [{ storeNumber: "R095", partsAvailability: { [part]: { pickupDisplay: "available" } } }] } } } }, part, "R095");
    const observed = new Date();
    await Promise.all([1, 2].map(() => recordObservation(source, lease, result, observed, db)));
    expect(await db.radarStockEvent.count({ where: { sourceId: source.id } })).toBe(1);
    expect(await db.radarNotification.count({ where: { alertId: id } })).toBe(1);
    const saved = await db.radarSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(saved.nextCheckAt.getTime() - observed.getTime()).toBeGreaterThanOrEqual(300000);

    // A different worker may have an old lease when retailer protection is discovered.
    const blockedLease = new Date(Date.now() + 180000), otherLease = new Date(Date.now() + 180001);
    await db.radarSource.update({ where: { id: source.id }, data: { leaseUntil: blockedLease } });
    const other = await db.radarSource.update({ where: { id: sources[1 - index].id }, data: { leaseUntil: otherLease } });
    await recordSourceFailure(saved, blockedLease, new BlockedSourceError("Retailer protection detected (403); no further polling."), db);
    const blocked = await db.radarSource.findMany({ where: { id: { in: ids.slice(0, 2) } } });
    expect(blocked.every(value => value.status === "blocked" && value.leaseUntil === null)).toBe(true);
    expect(blocked.find(value => value.id === source.id)?.lastCheckedAt?.getTime()).toBe(observed.getTime());
    expect((await db.radarSource.findUniqueOrThrow({ where: { id: ids[2] } })).status).toBe("active");
    expect(await recordObservation(other, otherLease, { inStock: true }, new Date(), db)).toBeNull();
    expect(await db.radarNotification.count({ where: { alertId: id } })).toBe(1);
    expect(await claimSource(source, db)).toBeNull();
  });
});
