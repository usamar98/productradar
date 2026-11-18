import { parse } from "csv-parse/sync";
import { z } from "zod";
import products from "@/config/official-products.json";
import { maxFeedAgeMs } from "./inventory-feed-auth";
import { partnerizeAccess, type SonyFeedColumns } from "./partnerize-config";
import { assertUnblockedResponse, BlockedSourceError, safeFetch } from "./source-http";

const entry = z.object({ campaign_feeds_id: z.string(), campaign_id: z.string(), filename: z.string(), location: z.string(), last_processed: z.coerce.number().int().optional() });
const listing = z.object({ campaigns: z.array(z.object({ campaign: z.object({ campaign_id: z.string(), feeds: z.array(entry) }) })) });
type FeedEntry = z.infer<typeof entry>;
export class FeedFormatError extends Error {}

export async function listSonyFeeds(access: NonNullable<ReturnType<typeof partnerizeAccess>>) {
  const url = new URL("https://api.partnerize.com/user/publisher/" + access.publisher + "/feed");
  url.search = new URLSearchParams({ campaign_id: access.campaign, active: "y" }).toString();
  const response = await fetch(url, {
    headers: { Authorization: "Basic " + Buffer.from(access.application + ":" + access.userKey).toString("base64"),
      Accept: "application/json", "User-Agent": "RestockRadar/1.0" },
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
  });
  if ([401, 403, 429].includes(response.status)) { await response.body?.cancel(); throw new BlockedSourceError("Partnerize access stopped after HTTP " + response.status + "."); }
  if (!response.ok) { await response.body?.cancel(); throw new Error("Partnerize feed discovery failed."); }
  const body = await response.text();
  if (/^\s*</.test(body)) assertUnblockedResponse({ status: response.status, text: body });
  let decoded: unknown;
  try { decoded = JSON.parse(body); } catch { throw new FeedFormatError("Partnerize did not return a campaign feed list."); }
  const result = listing.safeParse(decoded);
  if (!result.success) throw new FeedFormatError("Unrecognized Partnerize campaign response.");
  return result.data.campaigns.filter(value => value.campaign.campaign_id === access.campaign)
    .flatMap(value => value.campaign.feeds).filter(feed => feed.campaign_id === access.campaign);
}

function canonicalDirectUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== "https://direct.playstation.com" || url.username || url.password || !url.pathname.startsWith("/en-us/") ||
        [...url.searchParams.keys()].some(key => !key.startsWith("utm_"))) return null;
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch { return null; }
}
const normalizeStock = (value: string) => value.trim().replace(/^https?:\/\/schema\.org\//i, "").replace(/[ _-]/g, "").toLowerCase();
const sonyCatalog = new Map(products.playstation.map(product => [product.productCode, product]));
type Observation = { item: string; variant: string; inStock: boolean; observedAt: string };

export function parseSonyFeed(text: string, filename: string, columns: SonyFeedColumns, now = Date.now()) {
  const delimiter = ({ csv: ",", tsv: "\t", psv: "|" } as Record<string, string>)[filename.split(".").pop()?.toLowerCase() ?? ""];
  if (!delimiter) throw new FeedFormatError("Choose an uncompressed CSV, TSV or PSV feed.");
  let records: string[][];
  try { records = parse(text, { delimiter, bom: true, skip_empty_lines: true, max_record_size: 128 * 1024 }); }
  catch { throw new FeedFormatError("The partner feed is not a readable delimited file."); }
  const headers = records.shift()?.map(value => value.trim()) ?? [];
  const fields = [columns.sku, columns.link, columns.availability, columns.observedAt];
  if (fields.some(field => headers.filter(header => header === field).length !== 1)) throw new FeedFormatError("The configured stock columns are missing or ambiguous in this feed.");
  const [sku, link, state, observed] = fields.map(field => headers.indexOf(field));
  const yes = normalizeStock(columns.inStock ?? "in stock"), no = normalizeStock(columns.outOfStock ?? "out of stock");
  if (!yes || !no || yes === no) throw new FeedFormatError("Choose two distinct merchant stock values.");
  const bySku = new Map<string, Observation>();
  for (const row of records) {
    const code = row[sku].trim(), product = sonyCatalog.get(code);
    if (!product || canonicalDirectUrl(row[link]) !== product.productUrl.replace(/\/$/, "")) continue;
    const raw = normalizeStock(row[state]);
    const iso = z.iso.datetime({ offset: true }).safeParse(row[observed].trim());
    if ((raw !== yes && raw !== no) || !iso.success) continue;
    const time = Date.parse(iso.data);
    if (time > now || now - time > maxFeedAgeMs) continue;
    const next = { item: product.itemSlug, variant: product.variantSlug, inStock: raw === yes, observedAt: new Date(time).toISOString() };
    const prior = bySku.get(code);
    if (prior && (prior.inStock !== next.inStock || prior.observedAt !== next.observedAt)) throw new FeedFormatError("The partner feed has conflicting observations for the same Sony SKU.");
    bySku.set(code, next);
  }
  return [...bySku.values()];
}

export async function downloadSonyFeed(feed: FeedEntry, columns: SonyFeedColumns) {
  // Download only the location supplied by the authenticated campaign. Never forward the API credentials.
  const response = await safeFetch(feed.location, 0, "publisher-file");
  if (response.status === 401) throw new BlockedSourceError("The partner feed download needs renewed access.");
  assertUnblockedResponse({ status: response.status, text: /^\s*</.test(response.text) ? response.text : "" });
  if (response.status !== 200) throw new Error("Partner feed download failed.");
  return parseSonyFeed(response.text, feed.filename, columns);
}
