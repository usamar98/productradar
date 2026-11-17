import { isLocalTestMode, readLocalStock } from "./local-test";
import type { Connector } from "./source-types";
import { BlockedSourceError, fetchSourceText } from "./source-http";
import { parseJsonLd } from "./jsonld";
import { isOfficialConnector, officialConnectors } from "./official-connectors";
export type { Connector, ConnectorSource } from "./source-types";
export { BlockedSourceError, assertUnblockedResponse, publicAddress, validatePublicUrl, robotsAllows } from "./source-http";
export { parseJsonLd } from "./jsonld";

export const jsonldConnector: Connector = { async check(source) {
  if (!source.approved) throw new BlockedSourceError("Operator approval of retailer terms is required before polling.");
  if (source.fulfillment === "pickup") throw new BlockedSourceError("An online JSON-LD offer cannot verify store pickup. Use a store-specific connector.");
  return parseJsonLd(await fetchSourceText(source.productUrl), source.productUrl);
} };
export const mockConnector: Connector = { async check(source) {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_MOCK_CONNECTOR !== "true" || source.item?.hidden !== true) throw new BlockedSourceError("Mock checks require ALLOW_MOCK_CONNECTOR=true, development mode, and a hidden test item.");
  return { inStock: Math.random() > 0.5, raw: "development mock" };
} };
export const localTestConnector: Connector = { async check(source) {
  if (!isLocalTestMode() || !source.approved) throw new BlockedSourceError("Local-test inventory is restricted to the isolated local development lab.");
  return { inStock: await readLocalStock(source.id), raw: "LOCAL TEST — synthetic stock signal, not retailer inventory" };
} };
export function connectorFor(name: string): Connector {
  if (isOfficialConnector(name)) return officialConnectors[name];
  if (name === "jsonld") return jsonldConnector;
  if (name === "mock") return mockConnector;
  if (name === "local-test") return localTestConnector;
  throw new BlockedSourceError(`Unsupported connector: ${name}`);
}
