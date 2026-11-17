import type { MetadataRoute } from "next";
import { getCatalog, siteUrl } from "@/lib/radar/catalog";
export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> { const catalog = await getCatalog(); return {rules:{userAgent:"*",allow:catalog.items.filter(item=>!item.hidden).map(item=>`/${item.slug}`).concat(["/"]),disallow:["/api/","/admin","/alerts/","/alerts","/account","/dashboard","/sign-in"]},sitemap:`${siteUrl}/sitemap.xml`}; }
