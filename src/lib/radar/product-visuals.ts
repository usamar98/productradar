import { launchProducts } from "@/config/launch-catalog";

/** Official imagery, with references in the launch catalog and docs/*-launch-research.md. */
export const productVisuals: Record<string, { src: string; alt: string; theme: string; description: string }> = {
  ...Object.fromEntries(launchProducts.map(product => [product.slug, {
    src: product.image.src,
    alt: product.image.alt,
    theme: product.brand,
    description: product.description,
  }])),
  "iphone-duo": {
    src: "/images/products/iphone-duo-star-white.png",
    alt: "iPhone Duo in Star White, shown folded and open",
    theme: "apple",
    description: "One foldable iPhone. Eight configurations. Find your finish and storage, then check the exact match.",
  },
  "playstation-5-pro": {
    src: "/images/products/ps5-pro-hero.jpg",
    alt: "PlayStation 5 Pro console and DualSense controller",
    theme: "playstation",
    description: "Find the Pro console for your setup. Compare retailers and see exactly what has been checked.",
  },
  "rtx-5090": {
    src: "/images/products/rtx-5090-hero.jpg",
    alt: "NVIDIA GeForce RTX 5090 Founders Edition graphics card",
    theme: "nvidia",
    description: "Build around Blackwell. Explore the 32GB Founders Edition and compare retailer availability.",
  },
};
