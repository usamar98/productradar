export type StockReading = { id: string; locationId?: string | null; fulfillment?: string; approved: boolean; status: string; connector: string; inStock: boolean | null; lastCheckedAt: Date | null; lastError: string | null; pollSeconds: number };
export function stockReading(source?: StockReading, now = Date.now()) {
  if (!source || (source.status !== "on_demand" && (!source.approved || source.status !== "active"))) return { state: "unknown", label: "Availability unknown", alertable: false };
  const alertable = source.approved && source.status === "active";
  if (source.connector === "mock") return { state: "unknown", label: "Availability unknown", alertable: false };
  if (!source.lastCheckedAt || source.inStock === null) return { state: "unknown", label: "Awaiting first check", alertable };
  const freshness = source.status === "on_demand" ? 60_000 : Math.max(source.pollSeconds * 3, 120) * 1000;
  if (source.lastError || now - source.lastCheckedAt.getTime() > freshness) return { state: "stale", label: "Check again for current stock", alertable };
  return { state: source.inStock ? "in_stock" : "out_of_stock", label: source.inStock ? "In stock" : "Out of stock", alertable };
}
export function pickupSource<T extends StockReading>(sources: T[], locationId: string) { return sources.find(source => source.fulfillment === "pickup" && source.locationId === locationId); }

export function pickupStockReading(source: StockReading | undefined, options: { connected: boolean; blocked: boolean; omitted?: boolean }, now = Date.now()) {
  const reading = stockReading(source, now);
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
