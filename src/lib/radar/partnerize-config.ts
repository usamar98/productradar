import { z } from "zod";

export const sonyPartnerRetailer = "feed-playstation-partnerize";
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const header = z.string().trim().min(1).max(160);
const columns = z.object({ sku: header, link: header, availability: header, observedAt: header,
  inStock: header.optional(), outOfStock: header.optional() }).strict();
export type SonyFeedColumns = z.infer<typeof columns>;

export function partnerizeAccess() {
  if (process.env.DEMO_MODE === "true" || process.env.RADAR_LOCAL_TEST_MODE === "true") return null;
  const publisher = identifier.safeParse(process.env.PARTNERIZE_PUBLISHER_ID);
  const campaign = identifier.safeParse(process.env.PARTNERIZE_PLAYSTATION_CAMPAIGN_ID);
  const application = process.env.PARTNERIZE_APPLICATION_KEY, userKey = process.env.PARTNERIZE_USER_API_KEY;
  return publisher.success && campaign.success && application && userKey ? { publisher: publisher.data, campaign: campaign.data, application, userKey } : null;
}

export function partnerizeStockConfig() {
  const access = partnerizeAccess();
  if (!access) return null;
  try {
    const feed = identifier.parse(process.env.PARTNERIZE_PLAYSTATION_FEED_ID);
    const mapped = columns.parse(JSON.parse(process.env.PARTNERIZE_STOCK_COLUMNS || ""));
    const normalize = (value: string) => value.trim().toLowerCase().replace(/[_\s-]/g, "");
    if (new Set([mapped.sku, mapped.link, mapped.availability, mapped.observedAt]).size !== 4 ||
        normalize(mapped.inStock ?? "in stock") === normalize(mapped.outOfStock ?? "out of stock")) return null;
    const interval = z.coerce.number().int().min(300).max(86400).parse(process.env.PARTNERIZE_CHECK_SECONDS || 300);
    return { ...access, feed, columns: mapped, interval };
  } catch { return null; }
}
