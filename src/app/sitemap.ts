import type { MetadataRoute } from "next";
import { getCatalog, siteUrl } from "@/lib/radar/catalog";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getCatalog();
  const routes = ["", "/proof", "/pricing", "/terms", "/privacy", "/refunds", "/contact"];
  if (catalog.available && catalog.seeded) for (const item of catalog.items) { routes.push(`/${item.slug}`, `/${item.slug}/restocks`, `/how-to-get-${item.slug}`); for (const retailer of new Set(item.sources.map(source => source.retailer))) routes.push(`/${item.slug}/at/${retailer}`); }
  return routes.map(path => ({url:`${siteUrl}${path}`,changeFrequency: path.includes("restocks") || path === "" ? "hourly" : "weekly",priority:path === "" ? 1 : .6}));
}
