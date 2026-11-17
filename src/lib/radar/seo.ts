import type { Metadata } from "next";
import { BRAND, siteUrl, type Catalog, type PublicSource } from "@/lib/radar/catalog";

export function isCatalogPublished(catalog: Catalog): boolean {
  return catalog.available && catalog.seeded && catalog.items.some(item => !item.hidden);
}

/** A configured source is not evidence of a completed stock check. */
export function hasObservations(sources: PublicSource[]): boolean {
  return sources.some(source => source.connector !== "mock" && !source.id.startsWith("preview-") && (
    (source.lastCheckedAt !== null && Number.isFinite(source.lastCheckedAt.getTime()) && typeof source.inStock === "boolean") ||
    source.events.some(event => Number.isFinite(event.seenAt.getTime()))
  ));
}

export function pageMetadata({ title, description, path, indexable = true }: {
  title: string;
  description: string;
  path: string;
  indexable?: boolean;
}): Metadata {
  const canonical = new URL(path, `${siteUrl}/`).toString();
  const images = [{ url: `${siteUrl}/opengraph-image`, width: 1200, height: 630, alt: `${BRAND} — free stock checks and restock alerts` }];
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: indexable, follow: true },
    openGraph: { title, description, url: canonical, siteName: BRAND, type: "website", locale: "en_US", images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
