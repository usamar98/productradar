import apple from "./launches/apple.json";
import nvidia from "./launches/nvidia.json";
import playstation from "./launches/playstation.json";
import type { Configuration } from "../lib/radar/configuration";

export type ProductBrand = "apple" | "nvidia" | "playstation";
export type LaunchProduct = {
  slug: string; name: string; brand: ProductBrand; family: string;
  category: { slug: string; name: string };
  launchDate: string; launchDatePrecision?: "day" | "month"; launchLabel?: string;
  tagline: string; description: string; officialUrl: string; launchSourceUrl: string;
  image: { src: string; alt: string; sourceUrl: string };
  features: { label: string; value: string; description: string }[];
  options: { key: string; label: string }[];
  variants: (Configuration & { image?: { src: string; alt: string; sourceUrl: string } })[];
};

export const launchWindow = { from: "2025-11-17", to: "2026-11-17", label: "Nov 17, 2025 – Nov 17, 2026" };
export const brands = {
  apple: { name: "Apple", heading: "Find your kind of extraordinary.", description: "iPhone. Mac. iPad. And everything around them. Explore the latest hardware, understand the differences, and make it yours.", image: "/images/products/iphone-duo-hero.jpg", imageAlt: "iPhone Duo unfolded in use" },
  playstation: { name: "PlayStation", heading: "Your next adventure starts here.", description: "Find your console, build your setup, and discover new ways to play. Explore hardware and accessories before choosing your configuration.", image: "/images/products/ps5-pro-hero.jpg", imageAlt: "PlayStation 5 Pro console and DualSense controller" },
  nvidia: { name: "NVIDIA", heading: "Build what comes next.", description: "Explore the GeForce RTX desktop lineup. Compare graphics, memory and architecture, then find the card for your next build.", image: "/images/products/rtx-5090-hero.jpg", imageAlt: "NVIDIA GeForce RTX 5090 Founders Edition" },
} satisfies Record<ProductBrand, { name: string; heading: string; description: string; image: string; imageAlt: string }>;

export const launchProducts = [...apple, ...nvidia, ...playstation] as LaunchProduct[];
export const getLaunchProduct = (slug: string) => launchProducts.find(product => product.slug === slug);
export const isRecentLaunch = (product: Pick<LaunchProduct, "launchDate">) => product.launchDate >= launchWindow.from && product.launchDate <= launchWindow.to;
export const launchDateLabel = (product: Pick<LaunchProduct, "launchDate" | "launchDatePrecision" | "launchLabel">) => product.launchLabel || new Intl.DateTimeFormat("en-US", { month: "short", ...(product.launchDatePrecision === "month" ? {} : { day: "numeric" as const }), year: "numeric", timeZone: "UTC" }).format(new Date(`${product.launchDate}T00:00:00Z`));
export const productItemId = (slug: string) => slug === "playstation-5-pro" ? "ps5-pro" : slug;
export const productVariantId = (slug: string, variant: string) => slug === "rtx-5090" && variant === "founders-edition" ? "rtx-5090-standard" : `${productItemId(slug)}-${variant}`;
