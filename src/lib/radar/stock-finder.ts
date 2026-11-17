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
