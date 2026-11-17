import type { StockCheck } from "./domain";

export type ConnectorSource = { id: string; productUrl: string; connector: string; approved: boolean; locationId?: string | null; fulfillment?: string; item?: { hidden: boolean } };
export interface Connector { check(source: ConnectorSource): Promise<StockCheck> }
