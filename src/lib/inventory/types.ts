export const STOCK_STATES = ["IN_STOCK", "OUT_OF_STOCK", "PREORDER", "BACKORDER", "UNKNOWN", "CHECK_FAILED"] as const;
export type StockState = (typeof STOCK_STATES)[number];
export type RetailerId = "bestbuy" | "nvidia";
export type Evidence = Record<string, string | number | boolean | null>;

export interface InventoryObservation {
  retailerId: RetailerId;
  productIdentifier: string;
  sourceUrl: string;
  state: Exclude<StockState, "CHECK_FAILED">;
  priceCents: number | null;
  currency: "USD";
  checkedAt: Date;
  evidence: Evidence;
  shipping: string | null;
  pickup: string | null;
}

export type CheckResult =
  | { ok: true; observation: InventoryObservation }
  | { ok: false; retailerId: RetailerId; checkedAt: Date; errorCode: string; retryAfterSeconds?: number };

export interface InventoryAdapter {
  id: RetailerId;
  name: string;
  sourceUrl: string;
  enabled: boolean;
  disabledReason: string | null;
  intervalSeconds: number;
  check(): Promise<CheckResult>;
}

export const PRODUCT = {
  id: "rtx-5090-fe-us",
  name: "NVIDIA GeForce RTX 5090 Founders Edition",
  country: "US",
  bestBuySku: "6614151",
  bestBuyModel: "900-1G144-2530-000",
  nvidiaMpn: "NVGFT590",
  bestBuyUrl: "https://www.bestbuy.com/product/nvidia-geforce-rtx-5090-founders-edition-32gb-gddr7-pci-express-5-0-graphics-card-dark-gun-metal/J3GWYHGPCP/sku/6614151",
  nvidiaUrl: "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/",
} as const;
