import { sourceCanAlert } from "./inventory-feed-auth";

export type StockReading = { id: string; locationId?: string | null; retailer?: string; fulfillment?: string; approved: boolean; status: string; connector: string; inStock: boolean | null; lastCheckedAt: Date | null; lastError: string | null; pollSeconds: number };
export const readingLifetimeMs = (source: StockReading) => source.status === "on_demand" ? 60_000 : Math.max(source.pollSeconds * 3, 120) * 1000;
export function stockReading(source?: StockReading, now = Date.now()) {
  const alertable = !!source && sourceCanAlert(source);
  if (!source || (source.status !== "on_demand" && !alertable)) return { state: "unknown", label: "Availability unknown", alertable: false };
  if (source.connector === "mock") return { state: "unknown", label: "Availability unknown", alertable: false };
  if (!source.lastCheckedAt || source.inStock === null) return { state: "unknown", label: "Awaiting first check", alertable };
  const freshness = readingLifetimeMs(source);
  if (source.lastError || now - source.lastCheckedAt.getTime() > freshness) return { state: "stale", label: "Check again for current stock", alertable };
  return { state: source.inStock ? "in_stock" : "out_of_stock", label: source.inStock ? "In stock" : "Out of stock", alertable };
}
export function preferredSource<T extends StockReading>(matches: T[]): T | undefined {
  return matches.find(source => source.status === "feed" && sourceCanAlert(source)) || matches.find(sourceCanAlert) ||
    matches.find(source => source.status === "on_demand") || matches[0];
}
export function hasCurrentReading(source?: StockReading) {
  const { state } = stockReading(source);
  return state === "in_stock" || state === "out_of_stock";
}
/** An older feed can still accept subscriptions while a newer shopper lookup supplies the displayed stock. */
export function latestEvidence<T extends StockReading>(matches: T[], fallback?: T) {
  return matches.filter(hasCurrentReading).sort((a, b) => b.lastCheckedAt!.getTime() - a.lastCheckedAt!.getTime())[0] ?? fallback;
}
export function pickupSource<T extends StockReading>(sources: T[], locationId: string) {
  return preferredSource(sources.filter(source => source.fulfillment === "pickup" && source.locationId === locationId));
}

export function pickupStockReading(source: StockReading | undefined, options: { connected: boolean; blocked: boolean; omitted?: boolean }, now = Date.now()) {
  const reading = stockReading(source, now);
  if (source?.status === "feed" && reading.alertable) return { ...reading, canCheckStore: false, reason: reading.state === "stale" ? "Awaiting a fresh inventory update for this store." : null };
  const paused = source?.status === "paused";
  const blocked = options.blocked || source?.status === "blocked";
  const canCheckStore = options.connected && !paused && !blocked;
  if (blocked) return { ...reading, state: "unknown", alertable: false, label: "Check blocked", canCheckStore: false, reason: "Apple checks are stopped until the connection is reviewed." };
  if (paused) return { ...reading, state: "unknown", alertable: false, label: "Checks paused", canCheckStore: false, reason: "Checks for this store have been paused." };
  if (reading.state === "in_stock" || reading.state === "out_of_stock") return { ...reading, canCheckStore, reason: null };
  if (!options.connected) return { ...reading, label: "Configuration not connected", canCheckStore: false, reason: "This product configuration does not have a direct Apple inventory connection yet." };
  if (options.omitted) return { ...reading, label: "Not returned by Apple", canCheckStore, reason: "Apple did not provide this store's availability in the last lookup. You can check its ZIP directly." };
  if (reading.state === "unknown") return { ...reading, label: "Not checked yet", canCheckStore, reason: "This store was outside the results returned by the nearby checks. Check this store directly." };
  return { ...reading, canCheckStore, reason: source?.lastError ? "Apple could not confirm this store in the last check." : "This observation has expired. Check this store for a current result." };
}
