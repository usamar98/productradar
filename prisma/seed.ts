import "dotenv/config";
import { prisma } from "../src/lib/db";
import { inventoryAdapters, PRODUCT } from "../src/lib/inventory";
for (const adapter of inventoryAdapters()) {
  await prisma.retailer.upsert({ where: { id: adapter.id }, create: {
    id: adapter.id, name: adapter.name, sourceUrl: adapter.sourceUrl,
    productIdentifier: adapter.id === "bestbuy" ? PRODUCT.bestBuySku : PRODUCT.nvidiaMpn,
    enabled: adapter.enabled, intervalSeconds: adapter.intervalSeconds,
  }, update: { name: adapter.name, sourceUrl: adapter.sourceUrl, enabled: adapter.enabled, intervalSeconds: adapter.intervalSeconds } });
}
console.log("Retailer configuration saved. No inventory observations or customer records fabricated.");
await prisma.$disconnect();
