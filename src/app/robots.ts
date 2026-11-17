import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/radar/catalog";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/alerts", "/account", "/dashboard", "/sign-in"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
