import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { saveLiveObservation } from "../src/lib/radar/live-stock";

const connectionString = process.env.TEST_DATABASE_URL;
const safe = connectionString && /_test$/.test(new URL(connectionString).pathname);
if (connectionString && !safe) throw new Error("Live-stock tests require a dedicated database ending in _test.");

describe.skipIf(!safe)("on-demand observations (real PostgreSQL, synthetic stock)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
  const id = "live-stock-fixture";
  const input = { itemId: id, variantId: id, connector: "nvidia-store" as const, productUrl: "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/" };
  async function cleanup() {
    await db.radarNotification.deleteMany({ where: { alertId: id } });
    await db.radarAlert.deleteMany({ where: { id } });
    await db.radarSubscription.deleteMany({ where: { id } });
    await db.radarUser.deleteMany({ where: { id } });
    await db.radarStockEvent.deleteMany({ where: { source: { itemId: id } } });
    await db.radarSource.deleteMany({ where: { itemId: id } });
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
    await db.radarSource.create({ data: { id, ...input, retailer: "nvidia", label: "Synthetic test fixture", status: "blocked", approved: false, lastError: "Research 2026-11-17: HTML page inaccessible", fulfillment: "online", pollSeconds: 300 } });
    await db.radarPlan.create({ data: { id, name: "Fixture", priceCents: 0, alertLimit: 1, type: "subscription" } });
    await db.radarUser.create({ data: { id, email: "live-stock@example.test" } });
    const future = new Date(Date.now() + 86400000);
    await db.radarSubscription.create({ data: { id, userId: id, planId: id, providerRef: id, status: "active", currentPeriodEnd: future } });
    await db.radarAlert.create({ data: { id, userId: id, itemId: id, variantId: id, planId: id, subscriptionId: id, sourceIds: [id], status: "active", activeUntil: future } });
  });
  afterAll(async () => { await cleanup(); await db.$disconnect(); });

  it("saves a real-shaped lookup without approving monitoring or delivering an alert, and fences older data", async () => {
    const observed = new Date();
    const observation = { locationId: null, result: { inStock: true, priceCents: 199900 }, error: null };
    await saveLiveObservation(input, observation, observed, db);
    const saved = await db.radarSource.findUniqueOrThrow({ where: { id } });
    expect(saved).toMatchObject({ status: "on_demand", approved: false, inStock: true, lastError: null, leaseUntil: null });
    expect(saved.lastCheckedAt?.getTime()).toBe(observed.getTime());
    expect(await db.radarStockEvent.count({ where: { sourceId: id, endedAt: null } })).toBe(1);
    expect(await db.radarNotification.count({ where: { alertId: id } })).toBe(0);

    await saveLiveObservation(input, { ...observation, result: { inStock: false } }, new Date(observed.getTime() - 1), db);
    expect((await db.radarSource.findUniqueOrThrow({ where: { id } })).inStock).toBe(true);
    await saveLiveObservation(input, { locationId: null, result: null, error: "Unrecognized response" }, new Date(observed.getTime() + 1), db);
    expect(await db.radarSource.findUniqueOrThrow({ where: { id } })).toMatchObject({ inStock: true, lastCheckedAt: observed, lastError: "Unrecognized response" });

    await db.radarSource.update({ where: { id }, data: { status: "paused", lastError: null } });
    await saveLiveObservation(input, { ...observation, result: { inStock: false } }, new Date(observed.getTime() + 2), db);
    expect(await db.radarSource.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "paused", inStock: true, lastCheckedAt: observed });

    await db.radarSource.update({ where: { id }, data: { status: "blocked", lastError: "Inventory endpoint blocked: 403" } });
    await saveLiveObservation(input, observation, new Date(observed.getTime() + 2), db);
    expect((await db.radarSource.findUniqueOrThrow({ where: { id } })).status).toBe("blocked");
    expect(await db.radarNotification.count({ where: { alertId: id } })).toBe(0);
  });
});
