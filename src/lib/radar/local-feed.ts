import type { FeedBrand } from "./inventory-feed-auth";
import { feedSecret, signInventory } from "./inventory-feed-auth";
import { isLocalTestMode } from "./local-test";
import { isLocalMailboxEnabled } from "./local-mode";

type Sample = { brand: FeedBrand; item: string; variant: string; storeId?: string; priceCents: number };
export const localFeedSamples: readonly Sample[] = [
  { brand: "apple", item: "macbook-air-m5", variant: "13-inch-sky-blue-16gb-512gb", storeId: "apple-r095", priceCents: 109900 },
  { brand: "playstation", item: "playstation-5-pro", variant: "standard", priceCents: 74999 },
  { brand: "nvidia", item: "rtx-5090", variant: "founders-edition", priceCents: 199900 },
];

/** The lab sends the same wire format a supplier would send, to its own loopback server. */
export function localFeedRequest(sample: Sample, inStock: boolean, observedAt = new Date()) {
  if (!isLocalTestMode() || !isLocalMailboxEnabled()) throw new Error("Local inventory controls require the isolated lab and local inbox.");
  const key = feedSecret(sample.brand);
  if (!key) throw new Error("The lab needs a signing secret of at least 32 characters.");
  const origin = new URL(process.env.APP_URL!).origin;
  const url = new URL("/api/radar/inventory/" + sample.brand, origin);
  const body = JSON.stringify({ item: sample.item, variant: sample.variant, storeId: sample.storeId, inStock, priceCents: sample.priceCents, observedAt: observedAt.toISOString() });
  const time = String(Math.floor(Date.now() / 1000));
  return new Request(url, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json",
    "X-Radar-Timestamp": time, "X-Radar-Signature": signInventory(sample.brand, key, time, body) }, body });
}
