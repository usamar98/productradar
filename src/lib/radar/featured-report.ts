import type { StockSearchResult } from "./stock-search-result";

export type FeaturedReport = {
  inStock: boolean;
  observedAt: string;
  freshUntil: number;
  location: string;
  simulated: boolean;
};

export function availabilityLabel(report: FeaturedReport | null, now: number) {
  if (!report) return "No stock report";
  const current = report.freshUntil > now;
  const label = report.inStock
    ? (current ? "In stock" : "Was in stock")
    : (current ? "Out of stock" : "Was out of stock");
  return report.simulated ? `Test · ${label}` : label;
}

/** Pickup results are ordered by distance. Report one specific store, even for a partial lookup. */
export function reportFromSearch(result: StockSearchResult, now: number): FeaturedReport | null {
  const readings = result.mode === "pickup" ? result.stores : result.retailers ?? [];
  const current = readings.filter(reading => reading.lastCheckedAt && (reading.expiresAt ?? 0) > now);
  const reading = current.find(row => row.state === "in_stock") ?? current.find(row => row.state === "out_of_stock");
  if (!reading || !reading.lastCheckedAt || !reading.expiresAt) return null;
  return {
    inStock: reading.state === "in_stock",
    observedAt: reading.lastCheckedAt,
    freshUntil: reading.expiresAt,
    location: "postalCode" in reading ? `${reading.name} · ${reading.postalCode}` : reading.name,
    simulated: reading.simulated,
  };
}
