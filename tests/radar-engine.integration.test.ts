import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { recordObservation } from "../worker/runtime";

const connectionString = process.env.TEST_DATABASE_URL;
const safe = connectionString && /_test$/.test(new URL(connectionString).pathname);
if (connectionString && !safe) throw new Error("Radar integration tests require a dedicated database ending in _test.");

describe.skipIf(!safe)("Radar period transactions and notification uniqueness (real PostgreSQL)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
  const id = "radar-engine-fixture";
  async function cleanup() {
    await db.radarNotification.deleteMany({ where: { alertId: id } });
    await db.radarAlert.deleteMany({ where: { id } });
    await db.radarSubscription.deleteMany({ where: { id } });
    await db.radarUser.deleteMany({ where: { id } });
    await db.radarStockEvent.deleteMany({ where: { sourceId: id } });
    await db.radarSource.deleteMany({ where: { id } });
    await db.radarVariant.deleteMany({ where: { id } });
    await db.radarItem.deleteMany({ where: { id } });
    await db.radarCategory.deleteMany({ where: { id } });
    await db.radarPlan.deleteMany({ where: { id } });
  }
  beforeAll(async () => {
    await cleanup();
    await db.radarCategory.create({ data: { id, slug: id, name: "Test category" } });
    await db.radarItem.create({ data: { id, slug: id, categoryId: id, name: "Test item", hidden: true } });
    await db.radarVariant.create({ data: { id, itemId: id, slug: "standard", label: "Test edition" } });
    await db.radarSource.create({ data: { id, itemId: id, variantId: id, retailer: "test", label: "Synthetic fixture", productUrl: "https://example.com/item", connector: "jsonld", status: "active", approved: true } });
    await db.radarPlan.create({ data: { id, name: "Test", priceCents: 500, alertLimit: 2, type: "subscription" } });
    await db.radarUser.create({ data: { id, email: "radar-engine@example.test" } });
    await db.radarSubscription.create({ data: { id, userId: id, planId: id, providerRef: id, status: "active", currentPeriodEnd: new Date(Date.now() + 86400000) } });
    await db.radarAlert.create({ data: { id, userId: id, itemId: id, variantId: id, planId: id, subscriptionId: id, sourceIds: [id], status: "active", activeUntil: new Date(Date.now() + 86400000) } });
  });
  afterAll(async () => { await cleanup(); await db.$disconnect(); });
  async function claim() {
    const leaseUntil = new Date(Date.now() + 60000);
    const source = await db.radarSource.update({ where: { id }, data: { leaseUntil } });
    return { source, leaseUntil };
  }
  it("fences concurrent commits, closes actual periods and queues each event only once", async () => {
    let claimResult = await claim();
    await recordObservation(claimResult.source, claimResult.leaseUntil, { inStock: false }, new Date(), db);
    expect(await db.radarStockEvent.count({ where: { sourceId: id } })).toBe(0);
    claimResult = await claim();
    await Promise.all([1, 2].map(() => recordObservation(claimResult.source, claimResult.leaseUntil, { inStock: true, priceCents: 69900 }, new Date(), db)));
    expect(await db.radarStockEvent.count({ where: { sourceId: id } })).toBe(1);
    expect(await db.radarNotification.count({ where: { alertId: id } })).toBe(1);
    const job = await db.radarNotification.findFirstOrThrow({ where: { alertId: id } });
    await expect(db.radarNotification.create({ data: { alertId: id, stockEventId: job.stockEventId, channel: "email", target: "email" } })).rejects.toMatchObject({ code: "P2002" });
    claimResult = await claim();
    await recordObservation(claimResult.source, claimResult.leaseUntil, { inStock: true }, new Date(), db);
    expect(await db.radarNotification.count({ where: { alertId: id } })).toBe(1);
    claimResult = await claim();
    const end = new Date();
    await recordObservation(claimResult.source, claimResult.leaseUntil, { inStock: false }, end, db);
    expect((await db.radarStockEvent.findUniqueOrThrow({ where: { id: job.stockEventId } })).endedAt).toEqual(end);
    claimResult = await claim();
    await recordObservation(claimResult.source, claimResult.leaseUntil, { inStock: true }, new Date(), db);
    expect(await db.radarStockEvent.count({ where: { sourceId: id } })).toBe(2);
    expect(await db.radarStockEvent.count({ where: { sourceId: id, endedAt: null } })).toBe(1);
    expect(await db.radarNotification.count({ where: { alertId: id } })).toBe(2);
  });
});
