import type { StockReading } from "./stock-finder";

const providers = {
  apple: { name: "Apple", host: "www.apple.com", connector: "apple-pickup", scope: "Pickup at the selected Apple Store" },
  playstation: { name: "PlayStation Direct", host: "direct.playstation.com", connector: "playstation-direct", scope: "US online store; shipping eligibility is confirmed at checkout" },
  nvidia: { name: "NVIDIA Marketplace", host: "marketplace.nvidia.com", connector: "nvidia-store", scope: "US online store; shipping eligibility is confirmed at checkout" },
} as const;
type Brand = keyof typeof providers;
type Source = StockReading & { productUrl: string };
const isBrand = (brand?: string): brand is Brand => !!brand && brand in providers;

export function isOfficialListing(brand: string | undefined, url: string) {
  if (!isBrand(brand)) return false;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && parsed.hostname === providers[brand].host; } catch { return false; }
}

export function officialConnection(brand: string | undefined, sources: Source[], fallbackUrl?: string) {
  if (!isBrand(brand)) return null;
  const provider = providers[brand];
  const connected = sources.filter(source => source.connector === provider.connector);
  const active = connected.filter(source => (source.approved && source.status === "active") || source.status === "on_demand");
  const verified = active.filter(source => !source.lastError && source.inStock !== null && source.lastCheckedAt && Date.now() - source.lastCheckedAt.getTime() <= (source.status === "on_demand" ? 60_000 : Math.max(source.pollSeconds * 3, 120) * 1000));
  const blocked = connected.some(source => source.status === "blocked");
  const state = verified.length ? "connected" : active.length ? "waiting" : blocked ? "blocked" : "pending";
  const onDemand = verified.length > 0 && verified.every(source => source.status === "on_demand");
  const message = state === "connected" ? `${provider.name} returned availability for ${verified.length} ${brand === "apple" ? "store(s)" : "listing(s)"}. ${onDemand ? "Checks run when you search; automatic alerts are not enabled." : "See each result’s latest observation."}`
    : state === "waiting" ? `${provider.name} tracking is awaiting a successful stock check.`
    : state === "blocked" ? `${provider.name} is not allowing automated availability checks. Check this configuration directly with the store.`
    : `Live ${provider.name} tracking is not active for this configuration. Check availability directly with the store.`;
  return { name: provider.name, state, onDemand, message, scope: provider.scope, url: sources.find(source => isOfficialListing(brand, source.productUrl))?.productUrl || fallbackUrl };
}
