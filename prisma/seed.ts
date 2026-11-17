import "dotenv/config";
import { prisma } from "../src/lib/db";
import { PLANS } from "../src/config/pricing";
import { launchProducts, productItemId, productVariantId } from "../src/config/launch-catalog";
// Catalog metadata only. No stock, customer, delivery or financial activity is seeded.
await prisma.radarCategory.upsert({ where: { id: "consoles" }, create: { id: "consoles", slug: "consoles", name: "Consoles" }, update: {} });
await prisma.radarCategory.upsert({ where: { id: "graphics-cards" }, create: { id: "graphics-cards", slug: "graphics-cards", name: "Graphics cards" }, update: {} });
await prisma.radarCategory.upsert({ where: { id: "smartphones" }, create: { id: "smartphones", slug: "smartphones", name: "Smartphones" }, update: {} });
await prisma.radarItem.upsert({ where: { id: "ps5-pro" }, create: { id: "ps5-pro", categoryId: "consoles", slug: "playstation-5-pro", name: "PlayStation 5 Pro", msrpCents: null, imageUrl: "/images/products/ps5-pro-hero.jpg" }, update: { imageUrl: "/images/products/ps5-pro-hero.jpg" } });
await prisma.radarItem.upsert({ where: { id: "rtx-5090" }, create: { id: "rtx-5090", categoryId: "graphics-cards", slug: "rtx-5090", name: "NVIDIA GeForce RTX 5090", imageUrl: "/images/products/rtx-5090-hero.jpg", hidden: false }, update: { name: "NVIDIA GeForce RTX 5090", imageUrl: "/images/products/rtx-5090-hero.jpg", hidden: false } });
await prisma.radarItem.upsert({ where: { id: "iphone-duo" }, create: { id: "iphone-duo", categoryId: "smartphones", slug: "iphone-duo", name: "iPhone Duo", msrpCents: null, imageUrl: "/images/products/iphone-duo-hero.jpg" }, update: { imageUrl: "/images/products/iphone-duo-hero.jpg" } });
await prisma.radarVariant.upsert({ where: { id: "ps5-pro-standard" }, create: { id: "ps5-pro-standard", itemId: "ps5-pro", slug: "standard", label: "Standard edition" }, update: {} });
// Keep the original variant ID so existing references survive publication, while
// making its identity precise: partner graphics cards are separate configurations.
await prisma.radarVariant.upsert({ where: { id: "rtx-5090-standard" }, create: { id: "rtx-5090-standard", itemId: "rtx-5090", slug: "founders-edition", label: "Founders Edition · 32GB GDDR7" }, update: { slug: "founders-edition", label: "Founders Edition · 32GB GDDR7" } });
for (const source of [
  { id: "ps5-sony", retailer: "playstation-direct", label: "PlayStation Direct", productUrl: "https://direct.playstation.com/en-us/buy-consoles/playstation5-pro-console" },
  { id: "ps5-bestbuy", retailer: "best-buy", label: "Best Buy", productUrl: "https://www.bestbuy.com/" },
  { id: "ps5-walmart", retailer: "walmart", label: "Walmart", productUrl: "https://www.walmart.com/" },
  { id: "ps5-amazon", retailer: "amazon", label: "Amazon", productUrl: "https://www.amazon.com/" },
]) await prisma.radarSource.upsert({ where: { id: source.id }, create: { ...source, itemId: "ps5-pro", variantId: "ps5-pro-standard", connector: "jsonld", status: "paused", approved: false, pollSeconds: 15, lastError: "Placeholder: set the exact product URL and confirm retailer permission before enabling." }, update: {} });

// Official/public product links are for manual checks, not evidence of inventory.
// A later seed must preserve operator approval, URLs and collected observations.
for (const source of [
  { id: "rtx-5090-nvidia", retailer: "nvidia", label: "NVIDIA Marketplace", productUrl: "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/" },
  { id: "rtx-5090-bestbuy", retailer: "best-buy", label: "Best Buy", productUrl: "https://www.bestbuy.com/product/nvidia-geforce-rtx-5090-32gb-founders-edition/6614151" },
]) await prisma.radarSource.upsert({
  where: { id: source.id },
  create: { ...source, itemId: "rtx-5090", variantId: "rtx-5090-standard", connector: "jsonld", status: "paused", approved: false, pollSeconds: 300, lastError: "Catalog link only. An approved connector for this exact Founders Edition listing is required before monitoring can start." },
  update: {},
});

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
// The original three items above keep their IDs, variants and retailer settings.
// New launches register specifications only. A manufacturer's product page is
// not a variant-specific inventory feed and must not create a stock source.
const existingProducts = new Set(["iphone-duo", "playstation-5-pro", "rtx-5090"]);
const newProducts = launchProducts.filter(product => !existingProducts.has(product.slug));
const categoryIds = new Map<string, string>();
for (const category of new Map(newProducts.map(product => [product.category.slug, product.category])).values()) {
  const saved = await prisma.radarCategory.upsert({
    where: { slug: category.slug },
    create: { id: category.slug, ...category },
    update: { name: category.name },
  });
  categoryIds.set(category.slug, saved.id);
}
for (const product of newProducts) {
  const categoryId = categoryIds.get(product.category.slug)!;
  const item = await prisma.radarItem.upsert({
    where: { slug: product.slug },
    create: { id: productItemId(product.slug), categoryId, slug: product.slug, name: product.name, imageUrl: product.image.src },
    // Preserve operator visibility, price settings and every existing relation.
    update: { categoryId, name: product.name, imageUrl: product.image.src },
  });
  for (const variant of product.variants) {
    await prisma.radarVariant.upsert({
      where: { itemId_slug: { itemId: item.id, slug: variant.slug } },
      create: { id: productVariantId(product.slug, variant.slug), itemId: item.id, slug: variant.slug, label: variant.label },
      update: { label: variant.label },
    });
  }
}
for (const { description: _description, ...plan } of PLANS) await prisma.radarPlan.upsert({ where: { id: plan.id }, create: plan, update: plan });
console.log("Restock Radar catalog registered. New sources start paused; existing source settings are preserved. No activity was fabricated.");
await prisma.$disconnect();
