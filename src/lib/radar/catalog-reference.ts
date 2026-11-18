import { officialCatalog } from "./official-catalog";

type ReferenceSource = { connector: string; productUrl: string; approved: boolean; retailer: string };

const gpuReferences: Record<string, string> = {
  nvidia: "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/",
  "best-buy": "https://www.bestbuy.com/product/nvidia-geforce-rtx-5090-32gb-founders-edition/6614151",
};

/** A manual product reference never grants monitoring approval or reports stock. */
export function canVisitCatalogSource(itemSlug: string, source: ReferenceSource): boolean {
  if (source.connector === "mock") return false;
  let url: URL;
  try { url = new URL(source.productUrl); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (source.approved) return true;
  if (source.retailer.startsWith("feed-") && (source.connector.startsWith("inventory-") || source.connector === "local-test")) {
    return officialCatalog.some(product => product.itemSlug === itemSlug && product.productUrl === source.productUrl);
  }
  if (itemSlug === "iphone-duo" && source.retailer === "apple") {
    return source.productUrl.startsWith("https://www.apple.com/shop/buy-iphone/iphone-duo/");
  }
  return itemSlug === "rtx-5090" && Object.hasOwn(gpuReferences, source.retailer) && source.productUrl === gpuReferences[source.retailer];
}
