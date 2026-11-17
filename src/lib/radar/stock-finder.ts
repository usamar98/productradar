export type StockReading = { id: string; locationId?: string | null; fulfillment?: string; approved: boolean; status: string; connector: string; inStock: boolean | null; lastCheckedAt: Date | null; lastError: string | null; pollSeconds: number };
export function stockReading(source?: StockReading, now = Date.now()) {
  if (!source || !source.approved || source.status !== "active") return { state: "unknown", label: "Availability unknown", alertable: false };
  if (source.connector === "mock") return { state: "unknown", label: "Availability unknown", alertable: false };
  if (!source.lastCheckedAt || source.inStock === null) return { state: "unknown", label: "Awaiting first check", alertable: true };
  if (source.lastError || now - source.lastCheckedAt.getTime() > Math.max(source.pollSeconds * 3, 120) * 1000) return { state: "stale", label: "Check delayed", alertable: true };
  return { state: source.inStock ? "in_stock" : "out_of_stock", label: source.inStock ? "In stock" : "Out of stock", alertable: true };
}
export function pickupSource<T extends StockReading>(sources: T[], locationId: string) { return sources.find(source => source.fulfillment === "pickup" && source.locationId === locationId); }
