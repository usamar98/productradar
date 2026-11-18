import type { StockCheck } from "./domain";

export type ConnectorSource = { id: string; productUrl: string; connector: string; approved: boolean; locationId?: string | null; fulfillment?: string; item?: { hidden: boolean } };
export interface Connector { check(source: ConnectorSource): Promise<StockCheck> }

export function isInventoryFeedSource(source: { connector: string; retailer: string }) {
  return source.connector.startsWith("inventory-") || (source.connector === "local-test" && source.retailer.startsWith("feed-"));
}
