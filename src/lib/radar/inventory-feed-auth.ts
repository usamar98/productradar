import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "../security";
import { isLocalMailboxEnabled } from "./local-mode";
import { isLocalTestMode } from "./local-test";

export const feedBrands = ["apple", "playstation", "nvidia"] as const;
export type FeedBrand = typeof feedBrands[number];
export function isFeedBrand(value: string): value is FeedBrand {
  return feedBrands.some(brand => brand === value);
}

export function feedSecret(brand: FeedBrand): string | null {
  if (process.env.DEMO_MODE === "true") return null;
  if (process.env.RADAR_LOCAL_TEST_MODE === "true") {
    const labKey = process.env.RADAR_AUTH_SECRET;
    if (!isLocalTestMode() || !isLocalMailboxEnabled() || !labKey || labKey.length < 32) return null;
    return createHmac("sha256", labKey).update("local-inventory/" + brand).digest("hex");
  }
  const key = process.env["RADAR_" + brand.toUpperCase() + "_FEED_SECRET"];
  return key && key.length >= 32 ? key : null;
}

export function sourceCanAlert(source: { status: string; approved: boolean; connector: string; retailer?: string }) {
  if (source.connector === "mock") return false;
  if (source.connector === "local-test" && !isLocalTestMode()) return false;
  if (source.status !== "feed") return source.status === "active" && source.approved;
  const brand = source.connector === "local-test"
    ? feedBrands.find(value => source.retailer?.startsWith("feed-" + value + "-") || source.retailer === "feed-" + value)
    : feedBrands.find(value => source.connector === "inventory-" + value);
  return !!brand && !!feedSecret(brand);
}

export const maxFeedAgeMs = 5 * 60_000;
export function signInventory(brand: FeedBrand, key: string, timestamp: string, body: string) {
  return createHmac("sha256", key).update(["v1", brand, timestamp, body].join("\n")).digest("hex");
}

export function verifyInventory(brand: FeedBrand, key: string, headers: Headers, body: string, now = Date.now()) {
  const timestamp = headers.get("x-radar-timestamp") ?? "";
  const signature = headers.get("x-radar-signature") ?? "";
  const expected = signInventory(brand, key, timestamp, body);
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > maxFeedAgeMs ||
      !/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"))) {
    throw new HttpError(401, "Invalid or expired inventory signature.");
  }
}
