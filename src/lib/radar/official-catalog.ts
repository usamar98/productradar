import products from "@/config/official-products.json";

export const officialCatalog = [
  ...products.apple.map(product => ({ ...product, connector: "apple-pickup" as const, fulfillment: "pickup" as const })),
  ...products.playstation.map(product => ({ ...product, connector: "playstation-direct" as const, fulfillment: "online" as const })),
  ...products.nvidia.map(product => ({ ...product, connector: "nvidia-store" as const, fulfillment: "online" as const })),
];

/** Only reviewed exact configurations can become inventory requests. */
export function officialCatalogProduct(itemSlug: string, variantSlug: string) {
  return officialCatalog.find(product => product.itemSlug === itemSlug && product.variantSlug === variantSlug);
}

export function officialConfiguration(itemSlug: string, variantSlug: string) {
  const product = officialCatalogProduct(itemSlug, variantSlug);
  if (product) return { checkable: true, label: product.configurationLabel, productUrl: product.productUrl, reason: null };
  const custom = products.unsupportedApple.find(product => product.itemSlug === itemSlug && product.variantSlug === variantSlug);
  if (custom) return { checkable: false, label: custom.configurationLabel, productUrl: custom.productUrl, reason: custom.reason };
  if (/^rtx-(5070-ti|5060-ti|5060|5050)$/.test(itemSlug)) return {
    checkable: false, label: "Partner graphics card", productUrl: `https://marketplace.nvidia.com/en-us/consumer/graphics-cards/?gpu=${encodeURIComponent(itemSlug.replace("rtx-", "RTX ").replace("-ti", " Ti"))}`,
    reason: "NVIDIA does not sell a Founders Edition of this GPU. Choose an exact partner card on NVIDIA Marketplace; partner listings are not NVIDIA's own inventory.",
  };
  return { checkable: false, label: null, productUrl: null, reason: "This configuration does not yet have a verified official inventory listing." };
}
