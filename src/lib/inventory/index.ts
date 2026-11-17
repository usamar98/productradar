import { bestBuyAdapter } from "./bestbuy";
import { PRODUCT, type InventoryAdapter } from "./types";

export { PRODUCT, STOCK_STATES } from "./types";
export * from "./domain";
export type * from "./types";

export function inventoryAdapters(env: Record<string, string | undefined> = process.env): InventoryAdapter[] {
  return [bestBuyAdapter(env), {
    id: "nvidia", name: "NVIDIA Marketplace", sourceUrl: PRODUCT.nvidiaUrl, enabled: false,
    disabledReason: "No approved inventory feed. Automated collection is disabled pending NVIDIA permission.",
    intervalSeconds: 300,
    async check() { return { ok: false, retailerId: "nvidia", checkedAt: new Date(), errorCode: "SOURCE_DISABLED" }; },
  }];
}
