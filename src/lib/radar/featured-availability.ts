import { brands, getLaunchProduct, type ProductBrand } from "@/config/launch-catalog";
import type { Catalog, PublicItem } from "./catalog";
import type { FeaturedReport } from "./featured-report";
import { storeDirectory } from "./locations";
import { officialCatalogProduct } from "./official-catalog";
import { readingLifetimeMs, stockReading } from "./stock-finder";

const selection = [
  { brand: "apple", channel: "Apple Store pickup", products: [
    ["iphone-duo", "256gb-night-sky"],
    ["macbook-air-m5", "13-inch-sky-blue-16gb-512gb"],
    ["airpods-5", "usb-c-charging-case"],
  ] },
  { brand: "playstation", channel: "PlayStation Direct · US online", products: [
    ["playstation-5-pro", "standard"],
    ["playstation-portal", "white"],
    ["dualsense-edge", "white"],
  ] },
  { brand: "nvidia", channel: "NVIDIA Marketplace · US online", products: [
    ["rtx-5090", "founders-edition"],
    ["rtx-5080", "founders-edition"],
    ["rtx-5070", "founders-edition"],
  ] },
] as const;

const pickupStores = new Map(storeDirectory.stores.map(store => [store.id, store]));
const thumbnails: Record<string, string> = {
  "iphone-duo": "/images/products/iphone-duo-night-sky.png",
  "playstation-5-pro": "/images/hero/ps5-pro.webp",
  "rtx-5090": "/images/hero/rtx-5090.webp",
};

export type FeaturedProduct = {
  slug: string;
  name: string;
  variant: string;
  configuration: string;
  image: string;
  officialUrl: string;
  report: FeaturedReport | null;
};

export type FeaturedBrand = {
  brand: ProductBrand;
  name: string;
  channel: string;
  products: FeaturedProduct[];
};

function featuredReport(item: PublicItem, variantId: string, brand: ProductBrand, listing: NonNullable<ReturnType<typeof officialCatalogProduct>>, now: number) {
  const byStore = new Map<string, FeaturedReport>();
  for (const source of item.sources) {
    if (source.variantId !== variantId || source.productUrl !== listing.productUrl || source.fulfillment !== listing.fulfillment) continue;
    if (source.connector !== listing.connector && source.connector !== `inventory-${brand}`) continue;
    const checked = source.lastCheckedAt;
    if (!checked || checked.getTime() > now || source.inStock === null || stockReading(source, now).state === "unknown") continue;
    const store = source.locationId && pickupStores.get(source.locationId);
    if (listing.fulfillment === "pickup" && !store) continue;
    const observedAt = checked.toISOString();
    const storeKey = source.locationId ?? listing.productUrl;
    const latest = byStore.get(storeKey);
    if (latest && latest.observedAt >= observedAt) continue;
    byStore.set(storeKey, {
      inStock: source.inStock, observedAt,
      freshUntil: source.lastError ? 0 : checked.getTime() + readingLifetimeMs(source),
      location: store ? `${store.name} · ${store.postalCode}` : source.label,
      simulated: false,
    });
  }
  // Resolve competing reports for each store before looking for an available pickup location.
  const reports = [...byStore.values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const current = reports.filter(report => report.freshUntil > now);
  return current.find(report => report.inStock) ?? current[0] ?? reports[0] ?? null;
}

export function featuredAvailability(catalog: Catalog, now = Date.now()): FeaturedBrand[] {
  const items = new Map(catalog.items.map(item => [item.slug, item]));
  return selection.map(({ brand, channel, products }) => ({
    brand, name: brands[brand].name, channel,
    products: products.flatMap(([slug, variantSlug]) => {
      const item = items.get(slug);
      const variant = item?.variants.find(candidate => candidate.slug === variantSlug);
      const model = getLaunchProduct(slug);
      const listing = officialCatalogProduct(slug, variantSlug);
      if (!item || item.hidden || !variant || !model || !listing) return [];
      return [{
        slug, name: item.name.replace(/^NVIDIA /, ""), variant: variant.slug, configuration: variant.label,
        image: thumbnails[slug] ?? model.image.src, officialUrl: listing.productUrl,
        report: catalog.available && catalog.seeded ? featuredReport(item, variant.id, brand, listing, now) : null,
      }];
    }),
  }));
}
