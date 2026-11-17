import "dotenv/config";
import { prisma } from "../src/lib/db";
import { PLANS } from "../src/config/pricing";
// Catalog metadata only. No stock, customer, delivery or financial activity is seeded.
await prisma.radarCategory.upsert({ where: { id: "consoles" }, create: { id: "consoles", slug: "consoles", name: "Consoles" }, update: {} });
await prisma.radarCategory.upsert({ where: { id: "graphics-cards" }, create: { id: "graphics-cards", slug: "graphics-cards", name: "Graphics cards" }, update: {} });
await prisma.radarItem.upsert({ where: { id: "ps5-pro" }, create: { id: "ps5-pro", categoryId: "consoles", slug: "playstation-5-pro", name: "PlayStation 5 Pro", msrpCents: null, imageUrl: null }, update: {} });
await prisma.radarItem.upsert({ where: { id: "rtx-5090" }, create: { id: "rtx-5090", categoryId: "graphics-cards", slug: "rtx-5090", name: "RTX 5090", hidden: true }, update: {} });
await prisma.radarVariant.upsert({ where: { id: "ps5-pro-standard" }, create: { id: "ps5-pro-standard", itemId: "ps5-pro", slug: "standard", label: "Standard edition" }, update: {} });
await prisma.radarVariant.upsert({ where: { id: "rtx-5090-standard" }, create: { id: "rtx-5090-standard", itemId: "rtx-5090", slug: "standard", label: "Standard edition" }, update: {} });
for (const source of [
  { id: "ps5-sony", retailer: "playstation-direct", label: "PlayStation Direct", productUrl: "https://direct.playstation.com/" },
  { id: "ps5-bestbuy", retailer: "best-buy", label: "Best Buy", productUrl: "https://www.bestbuy.com/" },
  { id: "ps5-walmart", retailer: "walmart", label: "Walmart", productUrl: "https://www.walmart.com/" },
  { id: "ps5-amazon", retailer: "amazon", label: "Amazon", productUrl: "https://www.amazon.com/" },
]) await prisma.radarSource.upsert({ where: { id: source.id }, create: { ...source, itemId: "ps5-pro", variantId: "ps5-pro-standard", connector: "jsonld", status: "paused", approved: false, pollSeconds: 15, lastError: "Placeholder: set the exact product URL and confirm retailer permission before enabling." }, update: {} });
for (const { description: _description, ...plan } of PLANS) await prisma.radarPlan.upsert({ where: { id: plan.id }, create: plan, update: plan });
console.log("Restock Radar catalog registered. Sources are paused placeholders; no activity was fabricated.");
await prisma.$disconnect();
