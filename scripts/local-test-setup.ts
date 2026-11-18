import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolve } from "node:path";
import { isLocalTestMode, setLocalStock } from "../src/lib/radar/local-test";
import { localFeedSamples } from "../src/lib/radar/local-feed";
import { getLaunchProduct, productItemId, productVariantId } from "../src/config/launch-catalog";

const loaded = config({ path: resolve(process.cwd(), ".env.local-test"), override: true, quiet: true });
if (loaded.error) throw new Error("Create .env.local-test for the isolated lab before running setup.");
if (!["NODE_ENV", "RADAR_LOCAL_TEST_MODE", "APP_URL", "DATABASE_URL"].every(key => Object.hasOwn(loaded.parsed || {}, key))) throw new Error("The lab environment file must explicitly define every isolation setting; inherited application settings are not accepted.");
if (!isLocalTestMode()) throw new Error("Refusing setup: development mode, a loopback APP_URL and a database ending in _local_test are required.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 2, connectionTimeoutMillis: 3000 }) });
const sourceIds: string[] = [];
try {
  await db.$transaction(async tx => {
    // This only runs after the separate-database guard; no ordinary retailer is polled in the lab.
    await tx.radarSource.updateMany({ where: { connector: { not: "local-test" } }, data: { status: "paused", approved: false, leaseUntil: null } });
    await tx.radarCategory.upsert({ where: { id: "smartphones" }, create: { id: "smartphones", slug: "smartphones", name: "Smartphones" }, update: {} });
    await tx.radarItem.upsert({ where: { id: "iphone-duo" }, create: { id: "iphone-duo", slug: "iphone-duo", categoryId: "smartphones", name: "iPhone Duo", hidden: false }, update: { hidden: false } });
    for (const capacity of ["256GB", "512GB", "1TB", "2TB"]) {
      for (const color of ["Night Sky", "Star White"]) {
        const slug = `${capacity.toLowerCase()}-${color.toLowerCase().replaceAll(" ", "-")}`;
        const variantId = `iphone-duo-${slug}`;
        const sourceId = `local-test-iphone-duo-${slug}`;
        const productUrl = `https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-${slug}-unlocked`;
        await tx.radarVariant.upsert({ where: { id: variantId }, create: { id: variantId, itemId: "iphone-duo", slug, label: `${capacity} ${color}` }, update: {} });
        const existing = await tx.radarSource.findUnique({ where: { id: sourceId } });
        if (existing && (existing.connector !== "local-test" || existing.itemId !== "iphone-duo" || existing.variantId !== variantId || existing.productUrl !== productUrl)) throw new Error("An existing source does not match the isolated local-test configuration.");
        await tx.radarSource.upsert({
          where: { id: sourceId },
          create: { id: sourceId, itemId: "iphone-duo", variantId, retailer: "apple-local-test", label: "Apple Fifth Avenue · LOCAL TEST", locationId: "apple-r095", fulfillment: "pickup", productUrl, connector: "local-test", approved: true, status: "active", pollSeconds: 15 },
          update: { label: "Apple Fifth Avenue · LOCAL TEST", locationId: "apple-r095", fulfillment: "pickup", approved: true, status: "active", pollSeconds: 15, nextCheckAt: new Date(), leaseUntil: null, failureCount: 0, lastError: null },
        });
        sourceIds.push(sourceId);
      }
    }
  });
  for (const sourceId of sourceIds) await setLocalStock(sourceId, false, { initializeOnly: true });
  const { receiveInventory } = await import("../src/lib/radar/inventory-feed");
  for (const { brand, item, variant, storeId, priceCents } of localFeedSamples) {
    const product = getLaunchProduct(item)!;
    const category = await db.radarCategory.upsert({ where: { slug: product.category.slug }, create: { id: product.category.slug, ...product.category }, update: {} });
    const saved = await db.radarItem.upsert({ where: { slug: item }, create: { id: productItemId(item), slug: item, name: product.name, imageUrl: product.image.src, categoryId: category.id }, update: {} });
    const sku = await db.radarVariant.upsert({ where: { itemId_slug: { itemId: saved.id, slug: variant } }, create: {
      id: productVariantId(item, variant), itemId: saved.id, slug: variant, label: product.variants.find(option => option.slug === variant)!.label,
    }, update: {} });
    const existing = await db.radarSource.findUnique({ where: { variantId_retailer: { variantId: sku.id, retailer: "feed-" + (storeId || brand) } } });
    if (!existing) await receiveInventory(brand, { item, variant, storeId, priceCents, inStock: false, observedAt: new Date().toISOString() }, db);
  }
  console.log(`Prepared ${localFeedSamples.length} signed inventory samples and ${sourceIds.length} worker-polled iPhone configurations in the isolated lab.`);
} finally { await db.$disconnect(); }
