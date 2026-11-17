import type { MetadataRoute } from "next";
import { getCatalog, siteUrl } from "@/lib/radar/catalog";
import { categoryContent, getProductContent } from "@/lib/radar/product-content";
import { hasObservations, isCatalogPublished } from "@/lib/radar/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getCatalog();
  const routes = new Set(["/methodology", "/pricing", "/terms", "/privacy", "/refunds", "/contact"]);

  if (isCatalogPublished(catalog)) {
    routes.add("/");
    const items = catalog.items.filter(item => !item.hidden && getProductContent(item.slug));
    if (items.length) {
      routes.add("/products");
      routes.add("/guides");
    }
    for (const item of items) {
      routes.add(`/${item.slug}`);
      routes.add(`/how-to-get-${item.slug}`);
      if (categoryContent[item.category.slug]) routes.add(`/categories/${item.category.slug}`);

      if (hasObservations(item.sources)) {
        routes.add(`/${item.slug}/restocks`);
        routes.add("/proof");
      }
      for (const retailer of new Set(item.sources.map(source => source.retailer))) {
        if (hasObservations(item.sources.filter(source => source.retailer === retailer))) routes.add(`/${item.slug}/at/${retailer}`);
      }
      for (const variant of item.variants) {
        if (hasObservations(item.sources.filter(source => source.variantId === variant.id))) routes.add(`/${item.slug}/variants/${variant.slug}`);
      }
    }
  }

  // Only emit dates when there is a persisted content update to report.
  return [...routes].map(path => ({ url: new URL(path, `${siteUrl}/`).toString() }));
}
