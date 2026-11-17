import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { bestBuyAdapter, normalizeBestBuy } from "../src/lib/inventory/bestbuy";
import { PRODUCT } from "../src/lib/inventory/types";
import { dispatchNotifications, recordCheck } from "../src/worker/runtime";
import { DeliveryError } from "../src/worker/notifications";

const connectionString = process.env.TEST_DATABASE_URL;
const safeTestDatabase = connectionString && new URL(connectionString).pathname === "/gpu_stock_watch_test";
if (connectionString && !safeTestDatabase) throw new Error("Worker integration tests require an isolated gpu_stock_watch_test database.");

describe.skipIf(!safeTestDatabase)("durable inventory-to-notification flow (synthetic provider fixtures, real PostgreSQL)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
  const adapter = bestBuyAdapter({ BESTBUY_API_KEY: "test-fixture-not-a-real-key", BESTBUY_USAGE_APPROVED: "true" }, vi.fn());
  const prefix = "worker-test-";
  let clock = Date.now() - 30000;
  const observation = (available: boolean) => normalizeBestBuy({ sku: 6614151, modelNumber: PRODUCT.bestBuyModel, name: "NVIDIA GeForce RTX 5090 Founders Edition", onlineAvailability: available, orderable: "Available", salePrice: 1999.99 }, new Date(clock += 1000));
  async function cleanup() {
    // This suite has explicit ownership of the entire isolated test database's bestbuy fixture.
    await db.notificationJob.deleteMany({ where: { event: { retailerId: "bestbuy" } } });
    await db.stockEvent.deleteMany({ where: { retailerId: "bestbuy" } });
    await db.inventoryObservation.deleteMany({ where: { retailerId: "bestbuy" } });
    await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.retailer.deleteMany({ where: { id: "bestbuy" } });
  }
  async function claim() {
    const leaseUntil = new Date(Date.now() + 60000);
    await db.retailer.update({ where: { id: "bestbuy" }, data: { leaseUntil } });
    return leaseUntil;
  }
  beforeAll(async () => {
    vi.stubEnv("BESTBUY_API_KEY", "test-fixture-not-a-real-key");
    vi.stubEnv("BESTBUY_USAGE_APPROVED", "true");
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("ALERT_COOLDOWN_SECONDS", "1800");
    await cleanup();
    await db.retailer.create({ data: { id: "bestbuy", name: "Best Buy", sourceUrl: PRODUCT.bestBuyUrl, productIdentifier: PRODUCT.bestBuySku, enabled: true } });
    for (const [kind, maxPriceCents, status] of [["eligible", 200000, "active"], ["price-filtered", 190000, "active"], ["inactive", 200000, "past_due"]] as const) {
      await db.user.create({ data: { id: `${prefix}${kind}`, email: `${kind}@example.test`, name: kind, emailVerified: true, watch: { create: { retailers: ["bestbuy"], maxPriceCents, emailEnabled: true } }, subscription: { create: { status, currentPeriodEnd: new Date(Date.now() + 86400000) } } } });
    }
  });
  afterAll(async () => { try { await cleanup(); } finally { await db.$disconnect(); vi.unstubAllEnvs(); } });

  it("persists observations, failure recovery, matching, dedupe, retries and access changes", async () => {
    // Initial inventory establishes a baseline; it is not invented as a restock.
    await recordCheck(db, adapter, { ok: true, observation: observation(false) }, await claim());
    expect(await db.stockEvent.count({ where: { retailerId: "bestbuy" } })).toBe(0);
    const inStock = observation(true);
    const leaseUntil = await claim();
    // Concurrent commits from the same claimed check create only one durable event.
    await Promise.all([recordCheck(db, adapter, { ok: true, observation: inStock }, leaseUntil), recordCheck(db, adapter, { ok: true, observation: inStock }, leaseUntil)]);
    expect(await db.stockEvent.count({ where: { retailerId: "bestbuy" } })).toBe(1);
    expect(await db.notificationJob.count()).toBe(1);
    const job = await db.notificationJob.findFirstOrThrow();
    expect(job.userId).toBe(`${prefix}eligible`);
    expect(job.status).toBe("pending");
    await recordCheck(db, adapter, { ok: false, retailerId: "bestbuy", checkedAt: new Date(), errorCode: "PROVIDER_REQUEST_FAILED" }, await claim());
    expect((await db.retailer.findUniqueOrThrow({ where: { id: "bestbuy" } })).lastState).toBe("IN_STOCK");
    await recordCheck(db, adapter, { ok: true, observation: observation(true) }, await claim());
    expect(await db.stockEvent.count()).toBe(1);
    expect(await db.notificationJob.count()).toBe(1);

    const email = vi.fn().mockRejectedValueOnce(new DeliveryError("TEST_TEMPORARY_FAILURE")).mockResolvedValue(undefined);
    const push = vi.fn();
    await dispatchNotifications(db, { email, push });
    expect((await db.notificationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("retrying");
    await db.notificationJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await Promise.all([dispatchNotifications(db, { email, push }), dispatchNotifications(db, { email, push })]);
    expect(email).toHaveBeenCalledTimes(2);
    expect(email.mock.calls[0][0].jobId).toBe(email.mock.calls[1][0].jobId);
    expect(email.mock.calls[1][0]).toMatchObject({ priceCents: 199999, sourceUrl: PRODUCT.bestBuyUrl, retailerName: "Best Buy" });
    expect((await db.notificationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("delivered");
    await dispatchNotifications(db, { email, push });
    expect(email).toHaveBeenCalledTimes(2);
    // Dashboard history joins real persisted jobs to their exact observation.
    const history = await db.notificationJob.findMany({ where: { userId: `${prefix}eligible` }, include: { event: { include: { observation: true } } } });
    expect(history[0].event.observation.checkedAt).toEqual(inStock.checkedAt);
    expect(history[0].deliveredAt).toBeInstanceOf(Date);
    expect(await db.notificationJob.count({ where: { userId: `${prefix}inactive` } })).toBe(0);

    // A separate restock inside cooldown still records history but does not flood the user.
    await recordCheck(db, adapter, { ok: true, observation: observation(false) }, await claim());
    await recordCheck(db, adapter, { ok: true, observation: observation(true) }, await claim());
    expect(await db.stockEvent.count()).toBe(2);
    expect(await db.notificationJob.count()).toBe(1);
    // Change subscription after queuing: worker must recheck before delivering.
    await db.notificationJob.update({ where: { id: job.id }, data: { status: "pending", nextAttemptAt: new Date() } });
    await db.subscription.update({ where: { userId: `${prefix}eligible` }, data: { status: "canceled" } });
    await dispatchNotifications(db, { email, push });
    expect((await db.notificationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("skipped");
    expect(email).toHaveBeenCalledTimes(2);
  }, 30000);
});
