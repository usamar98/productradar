import type { PublicItem, PublicSource } from "@/lib/radar/catalog";
import { launchProducts, productItemId, productVariantId } from "./launch-catalog";

function source(itemId: string, variantId: string, retailer: string, label: string, productUrl: string): PublicSource {
  return {
    id: `preview-${itemId}-${variantId}-${retailer}`, itemId, variantId, retailer, label, productUrl,
    connector: "jsonld", pollSeconds: 300, status: "paused", approved: false,
    inStock: null, priceCents: null, lastCheckedAt: null, lastError: null, createdAt: null, events: [],
  };
}

const iphoneVariants = ["256GB", "512GB", "1TB", "2TB"].flatMap(capacity => ["Night Sky", "Star White"].map(color => {
  const slug = `${capacity.toLowerCase()}-${color.toLowerCase().replaceAll(" ", "-")}`;
  return { id: `iphone-duo-${slug}`, slug, label: `${capacity} ${color}` };
}));

/** Metadata-only preview. Never publish these entries as observed stock or offers. */
const existingCatalog: PublicItem[] = [
  {
    id: "ps5-pro", slug: "playstation-5-pro", name: "PlayStation 5 Pro", msrpCents: null, imageUrl: "/images/products/ps5-pro-hero.jpg", hidden: false,
    category: { name: "Consoles", slug: "consoles" },
    variants: [{ id: "ps5-pro-standard", slug: "standard", label: "Standard edition" }],
    sources: [
      ["playstation-direct", "PlayStation Direct", "https://direct.playstation.com/en-us/buy-consoles/playstation5-pro-console"],
      ["amazon", "Amazon", "https://www.amazon.com/"],
      ["best-buy", "Best Buy", "https://www.bestbuy.com/"],
      ["walmart", "Walmart", "https://www.walmart.com/"],
    ].map(([retailer, label, url]) => source("ps5-pro", "ps5-pro-standard", retailer, label, url)),
  },
  {
    id: "iphone-duo", slug: "iphone-duo", name: "iPhone Duo", msrpCents: null, imageUrl: "/images/products/iphone-duo-hero.jpg", hidden: false,
    category: { name: "Smartphones", slug: "smartphones" }, variants: iphoneVariants,
    sources: iphoneVariants.map(variant => source("iphone-duo", variant.id, "apple", "Apple", `https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-${variant.slug}-unlocked`)),
  },
  {
    id: "rtx-5090", slug: "rtx-5090", name: "NVIDIA GeForce RTX 5090", msrpCents: null, imageUrl: "/images/products/rtx-5090-hero.jpg", hidden: false,
    category: { name: "Graphics cards", slug: "graphics-cards" },
    variants: [{ id: "rtx-5090-standard", slug: "founders-edition", label: "Founders Edition · 32GB GDDR7" }],
    sources: [
      source("rtx-5090", "rtx-5090-standard", "nvidia", "NVIDIA Marketplace", "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/"),
      source("rtx-5090", "rtx-5090-standard", "best-buy", "Best Buy", "https://www.bestbuy.com/product/nvidia-geforce-rtx-5090-32gb-founders-edition/6614151"),
    ],
  },
];

/** New launch records supply browsing metadata, never synthetic inventory. */
export const previewCatalog: PublicItem[] = [
  ...existingCatalog,
  ...launchProducts.filter(product => !existingCatalog.some(item => item.slug === product.slug)).map(product => ({
    id: productItemId(product.slug),
    slug: product.slug,
    name: product.name,
    msrpCents: null,
    imageUrl: product.image.src,
    hidden: false,
    category: product.category,
    variants: product.variants.map(variant => ({
      id: productVariantId(product.slug, variant.slug), slug: variant.slug, label: variant.label,
    })),
    sources: [],
  })),
];
