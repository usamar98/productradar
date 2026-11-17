import "dotenv/config";
import { prisma } from "../src/lib/db";
import { PLANS } from "../src/config/pricing";
// Catalog metadata only. No stock, customer, delivery or financial activity is seeded.
await prisma.radarCategory.upsert({ where: { id: "consoles" }, create: { id: "consoles", slug: "consoles", name: "Consoles" }, update: {} });
await prisma.radarCategory.upsert({ where: { id: "graphics-cards" }, create: { id: "graphics-cards", slug: "graphics-cards", name: "Graphics cards" }, update: {} });
await prisma.radarCategory.upsert({ where: { id: "smartphones" }, create: { id: "smartphones", slug: "smartphones", name: "Smartphones" }, update: {} });
await prisma.radarItem.upsert({ where: { id: "ps5-pro" }, create: { id: "ps5-pro", categoryId: "consoles", slug: "playstation-5-pro", name: "PlayStation 5 Pro", msrpCents: null, imageUrl: null }, update: {} });
await prisma.radarItem.upsert({ where: { id: "rtx-5090" }, create: { id: "rtx-5090", categoryId: "graphics-cards", slug: "rtx-5090", name: "RTX 5090", hidden: true }, update: {} });
await prisma.radarItem.upsert({ where: { id: "iphone-duo" }, create: { id: "iphone-duo", categoryId: "smartphones", slug: "iphone-duo", name: "iPhone Duo", msrpCents: null, imageUrl: null }, update: {} });
await prisma.radarVariant.upsert({ where: { id: "ps5-pro-standard" }, create: { id: "ps5-pro-standard", itemId: "ps5-pro", slug: "standard", label: "Standard edition" }, update: {} });
await prisma.radarVariant.upsert({ where: { id: "rtx-5090-standard" }, create: { id: "rtx-5090-standard", itemId: "rtx-5090", slug: "standard", label: "Standard edition" }, update: {} });
for (const source of [
  { id: "ps5-sony", retailer: "playstation-direct", label: "PlayStation Direct", productUrl: "https://direct.playstation.com/" },
  { id: "ps5-bestbuy", retailer: "best-buy", label: "Best Buy", productUrl: "https://www.bestbuy.com/" },
  { id: "ps5-walmart", retailer: "walmart", label: "Walmart", productUrl: "https://www.walmart.com/" },
  { id: "ps5-amazon", retailer: "amazon", label: "Amazon", productUrl: "https://www.amazon.com/" },
]) await prisma.radarSource.upsert({ where: { id: source.id }, create: { ...source, itemId: "ps5-pro", variantId: "ps5-pro-standard", connector: "jsonld", status: "paused", approved: false, pollSeconds: 15, lastError: "Placeholder: set the exact product URL and confirm retailer permission before enabling." }, update: {} });

// Apple specifications and these eight US purchase links were reviewed on 2026-11-17.
// A catalog page is not evidence of local pickup availability. These sources stay
// paused until an approved connector can verify the exact variant and fulfillment.
for (const capacity of ["256GB", "512GB", "1TB", "2TB"]) {
  for (const color of ["Night Sky", "Star White"]) {
    const slug = `${capacity.toLowerCase()}-${color.toLowerCase().replaceAll(" ", "-")}`;
    const variantId = `iphone-duo-${slug}`;
    await prisma.radarVariant.upsert({
      where: { id: variantId },
      create: { id: variantId, itemId: "iphone-duo", slug, label: `${capacity} ${color}` },
      update: {},
    });
    await prisma.radarSource.upsert({
      where: { id: `iphone-duo-apple-${slug}` },
      create: {
        id: `iphone-duo-apple-${slug}`,
        itemId: "iphone-duo",
        variantId,
        retailer: "apple",
        label: "Apple",
        productUrl: `https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-${slug}-unlocked`,
        connector: "jsonld",
        status: "paused",
        approved: false,
        pollSeconds: 300,
        lastError: "Catalog link only. Apple pickup monitoring is not configured; an approved variant- and store-specific source is required before enabling.",
      },
      // Re-running the catalog seed must not overwrite an operator's settings,
      // approval decision, source URL, or previously collected observations.
      update: {},
    });
  }
}
for (const { description: _description, ...plan } of PLANS) await prisma.radarPlan.upsert({ where: { id: plan.id }, create: plan, update: plan });
console.log("Restock Radar catalog registered. New sources start paused; existing source settings are preserved. No activity was fabricated.");
await prisma.$disconnect();
