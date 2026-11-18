import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import products from "../src/config/official-products.json";
import { sonyPartnerRetailer } from "../src/lib/radar/partnerize-config";
import { pollSonyPartnerFeed, resumeSonyPartnerFeed } from "../worker/partnerize";

// Both network boundaries are controlled here. PostgreSQL, parsing and alert creation run normally.
const fixture = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("../src/lib/radar/source-http", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/radar/source-http")>(), safeFetch: fixture.download }));

const connectionString = process.env.TEST_DATABASE_URL;
const safe = connectionString && new URL(connectionString).pathname.endsWith("_test");
if (connectionString && !safe) throw new Error("The partner worker test requires an isolated test database.");
describe.skipIf(!safe)("background campaign stock without a visitor", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
  const sony = products.playstation[0], id = "radar-partner-worker-test", feedId = sonyPartnerRetailer;
  let itemId: string, variantId: string;
  const tick = async () => {
    await db.radarFeedSync.updateMany({ where: { id: feedId }, data: { nextCheckAt: new Date(0) } });
    await pollSonyPartnerFeed(db);
  };
  async function cleanup() {
    await db.radarNotification.deleteMany({ where: { alertId: id } });
    await db.radarAlert.deleteMany({ where: { id } });
    await db.radarSubscription.deleteMany({ where: { id } });
    await db.radarUser.deleteMany({ where: { id } });
    const where = { retailer: feedId, item: { slug: sony.itemSlug }, variant: { slug: sony.variantSlug } };
    await db.radarStockEvent.deleteMany({ where: { source: where } });
    await db.radarSource.deleteMany({ where });
    await db.radarFeedSync.deleteMany({ where: { id: feedId } });
    await db.radarVariant.deleteMany({ where: { id } }); await db.radarItem.deleteMany({ where: { id } });
    await db.radarCategory.deleteMany({ where: { id } }); await db.radarPlan.deleteMany({ where: { id } });
  }
  beforeAll(async () => {
    await cleanup();
    await db.radarCategory.create({ data: { id, slug: id, name: "Partner worker test" } });
    const item = await db.radarItem.upsert({ where: { slug: sony.itemSlug }, update: {}, create: { id, categoryId: id, slug: sony.itemSlug, name: "Test Sony item" } });
    itemId = item.id;
    const variant = await db.radarVariant.upsert({ where: { itemId_slug: { itemId, slug: sony.variantSlug } }, update: {}, create: { id, itemId, slug: sony.variantSlug, label: "Test SKU" } });
    variantId = variant.id;
    vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("RADAR_LOCAL_TEST_MODE", "false");
    for (const key of ["PARTNERIZE_APPLICATION_KEY", "PARTNERIZE_USER_API_KEY", "PARTNERIZE_PUBLISHER_ID", "PARTNERIZE_PLAYSTATION_CAMPAIGN_ID", "PARTNERIZE_PLAYSTATION_FEED_ID"]) vi.stubEnv(key, "fixture");
    vi.stubEnv("PARTNERIZE_STOCK_COLUMNS", JSON.stringify({ sku: "sku", link: "url", availability: "stock", observedAt: "observed" }));
  });
  afterAll(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await cleanup(); await db.$disconnect(); });
  it("schedules one email for a confirmed restock, deduplicates an unchanged edition, and stops across restarts after a denial", async () => {
    let revision = 1, available = false, denied = false;
    const discovery = vi.fn(async () => denied ? new Response("", { status: 403 }) : Response.json({ campaigns: [{ campaign: { campaign_id: "fixture", feeds: [
      { campaign_id: "fixture", campaign_feeds_id: "fixture", filename: "us.csv", location: "https://fixture.invalid/private", last_processed: revision },
    ] } }] }));
    vi.stubGlobal("fetch", discovery);
    fixture.download.mockImplementation(async () => ({ status: 200, text: "sku,url,stock,observed\n" + [sony.productCode, sony.productUrl, available ? "in stock" : "out of stock", new Date().toISOString()].join(",") }));
    await pollSonyPartnerFeed(db);
    expect(discovery).toHaveBeenCalledOnce();
    expect(fixture.download).toHaveBeenCalledOnce();
    const initial = await db.radarFeedSync.findUniqueOrThrow({ where: { id: feedId } });
    expect(initial.message).toContain("Updated: 1.");
    const store = await db.radarSource.findFirstOrThrow({ where: { retailer: feedId, variantId } });
    expect(store.inStock).toBe(false);
    const until = new Date(Date.now() + 86400000);
    await db.radarPlan.create({ data: { id, name: "Test subscription", priceCents: 0, alertLimit: 1, type: "subscription" } });
    await db.radarUser.create({ data: { id, email: id + "@example.test" } });
    await db.radarSubscription.create({ data: { id, userId: id, planId: id, providerRef: id, status: "active", currentPeriodEnd: until } });
    await db.radarAlert.create({ data: { id, userId: id, itemId, variantId, sourceIds: [store.id], planId: id, subscriptionId: id, status: "active", activeUntil: until } });
    available = true; revision++;
    await tick(); await tick();
    expect(await db.radarNotification.count({ where: { alertId: id, channel: "email", status: "pending" } })).toBe(1);
    expect(fixture.download).toHaveBeenCalledTimes(2);
    denied = true; await tick();
    expect((await db.radarSource.findUniqueOrThrow({ where: { id: store.id } })).status).toBe("blocked");
    const requests = discovery.mock.calls.length;
    await tick(); expect(discovery).toHaveBeenCalledTimes(requests);
    denied = false; await resumeSonyPartnerFeed(db); await tick();
    expect((await db.radarSource.findUniqueOrThrow({ where: { id: store.id } })).inStock).toBe(true);
    expect(await db.radarNotification.count({ where: { alertId: id } })).toBe(1);
  });
});
