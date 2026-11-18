export type StockSearchReading = {
  sourceId: string | null;
  state: string;
  label: string;
  alertable: boolean;
  lastCheckedAt: string | null;
  expiresAt?: number | null;
  simulated: boolean;
  reason?: string | null;
  canCheckStore?: boolean;
  onDemand?: boolean;
};

export type StoreReading = StockSearchReading & {
  id: string;
  name: string;
  address: string;
  city: string;
  region: string;
  postalCode: string;
  distance: number | null;
  url: string;
  latitude: number;
  longitude: number;
};

export type StockSearchResult = {
  mode: "pickup" | "online";
  place?: { zip: string; city: string; region: string } | null;
  stores: StoreReading[];
  retailers?: (StockSearchReading & { name: string; url: string })[];
  total: number;
  coverage?: { total: number; checked: number };
  directoryCount?: number;
  officialUrl?: string;
  message?: string;
  configuration?: { checkable: boolean; label: string | null; reason: string | null; productUrl: string | null } | null;
  connection?: { onDemand?: boolean; name: string; state: string; message: string; scope: string; url?: string } | null;
  live?: { checkedAt: string; count: number; cached: boolean; lookups: number; warning?: string | null } | null;
  liveError?: string | null;
};
